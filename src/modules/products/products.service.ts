import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In, SelectQueryBuilder } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Product } from './entities/product.entity';
import { ProductAsset } from './entities/product-asset.entity';
import { AssetType } from './enums/asset-type.enum';
import type { AssetMetadata } from './entities/product-asset.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import type {
  ProductCatalogPageDto,
  ProductSummaryDto,
} from './dto/product-summary.dto';
import { CreateProductAssetDto } from './dto/create-product-asset.dto';
import { UpdateProductAssetDto } from './dto/update-product-asset.dto';
import { SyncProductAssetDto } from './dto/sync-product-asset.dto';
import { EmbeddingService } from '../ai/services/embedding/embedding.service';
import { normalizeSearchText } from '../../common/search/search-text';
import { ProductListing } from './entities/product-listing.entity';
import { VendorLocation } from '../users/entities/vendor-location.entity';
import { Category } from '../categories/entities/category.entity';
import { MarketsService } from '../markets/markets.service';
import { Market } from '../markets/entities/market.entity';
import { FilesService } from '../files/files.service';
import { FileUploadPurpose } from '../files/file-upload-policy';
import {
  ProductDimension,
  VALID_PRODUCT_DIMENSION_PATTERN,
  parseProductMeasurementSearch,
  productDimensionCmSql,
} from '../../common/search/product-measurement';
import {
  createErrorPayload,
  ERROR_CODES,
} from '../../common/errors/error-code';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductAsset)
    private readonly assetRepository: Repository<ProductAsset>,
    private readonly embeddingService: EmbeddingService,
    private readonly marketsService: MarketsService,
    private readonly filesService: FilesService,
  ) {}

  async create(sellerId: string, dto: CreateProductDto): Promise<Product> {
    const { assets, ...productData } = dto;
    await this.verifyProductAssets(sellerId, assets ?? []);

    const savedProduct = await this.productRepository.manager.transaction(
      async (manager) => {
        const productRepository = manager.getRepository(Product);
        const assetRepository = manager.getRepository(ProductAsset);
        const categoryRepository = manager.getRepository(Category);

        await this.validateSelectableCategory(
          productData.categoryId,
          categoryRepository,
        );

        const product = productRepository.create({
          ...productData,
          sellerId,
        });
        const saved = await productRepository.save(product);

        await this.createDefaultListing(saved, sellerId, manager);

        if (assets?.length) {
          await this.createAssets(saved.id, assets, assetRepository);
        }

        const jobId = await this.embeddingService.recordChange(
          manager,
          saved.id,
        );
        return {
          product: await this.findOneWithRepository(
            saved.id,
            productRepository,
          ),
          jobId,
        };
      },
    );

    await this.embeddingService.dispatch(savedProduct.jobId);
    return savedProduct.product;
  }

  async findAll(filterDto: ProductFilterDto): Promise<ProductCatalogPageDto> {
    const {
      page = 1,
      limit = 20,
      marketCode = 'BO',
      ...requestedFilters
    } = filterDto;
    const filters = this.resolveMeasurementSearch(requestedFilters);
    const skip = (page - 1) * limit;
    await this.marketsService.requireActive(marketCode);

    const queryBuilder = this.createCatalogQuery(marketCode);
    this.applyFilters(queryBuilder, filters);

    const countQuery = queryBuilder.clone();
    queryBuilder
      .select('product.id', 'id')
      .addSelect('product.title', 'title')
      .addSelect('listing.price', 'price')
      .addSelect('listing.currencyCode', 'currencyCode')
      .addSelect('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .orderBy('product.createdAt', 'DESC')
      .addOrderBy('product.id', 'DESC')
      .offset(skip)
      .limit(limit);

    const [rows, total] = await Promise.all([
      queryBuilder.getRawMany<{
        id: string;
        title: string;
        price: string;
        currencyCode: string;
        categoryId: string | null;
        categoryName: string | null;
      }>(),
      countQuery.getCount(),
    ]);
    // Fetch one image per product in the page, without multiplying catalog rows.
    const images = rows.length
      ? await this.assetRepository
          .createQueryBuilder('image')
          .distinctOn(['image.productId'])
          .select('image.productId', 'productId')
          .addSelect('image.url', 'url')
          .addSelect("image.metadata ->> 'alt'", 'alt')
          .where('image.productId IN (:...productIds)', {
            productIds: rows.map((row) => row.id),
          })
          .andWhere('image.type = :imageType', { imageType: AssetType.IMAGE })
          .andWhere("image.url <> ''")
          .orderBy('image.productId', 'ASC')
          .addOrderBy('image.isPrimary', 'DESC')
          .addOrderBy('image.id', 'ASC')
          .getRawMany<{ productId: string; url: string; alt: string | null }>()
      : [];
    const imagesByProduct = new Map(
      images.map(({ productId, url, alt }) => [productId, { url, alt }]),
    );
    const data: ProductSummaryDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      price: Number(row.price),
      currencyCode: row.currencyCode,
      category: row.categoryId
        ? { id: row.categoryId, name: row.categoryName! }
        : null,
      primaryImage: imagesByProduct.get(row.id) ?? null,
    }));
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<Product> {
    return this.findOneWithRepository(id, this.productRepository);
  }

  async findBySeller(sellerId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { sellerId },
      relations: [
        'assets',
        'category',
        'listings',
        'listings.market',
        'listings.vendorLocation',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findByCategory(categoryId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { categoryId },
      relations: ['assets', 'seller'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByKeywords(keywords: string[]): Promise<Product[]> {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.assets', 'assets')
      .where('product.keywords && :keywords', { keywords })
      .orderBy('product.createdAt', 'DESC')
      .getMany();
  }

  async update(
    id: string,
    sellerId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const { assets, ...productData } = dto;
    if (assets !== undefined) {
      const product = await this.requireProduct(id, this.productRepository);
      this.validateOwnership(product, sellerId);
      const existing = await this.assetRepository.find({
        where: { productId: id },
      });
      await this.verifyProductAssets(sellerId, assets, existing);
    }

    const updatedProduct = await this.productRepository.manager.transaction(
      async (manager) => {
        const productRepository = manager.getRepository(Product);
        const listingRepository = manager.getRepository(ProductListing);
        const assetRepository = manager.getRepository(ProductAsset);
        const categoryRepository = manager.getRepository(Category);

        const product = await this.requireProduct(id, productRepository, true);
        this.validateOwnership(product, sellerId);
        const previousDocument = this.includesSearchFields(dto)
          ? await this.embeddingService.document(manager, id)
          : undefined;
        await this.validateSelectableCategory(
          productData.categoryId,
          categoryRepository,
        );

        Object.assign(product, productData);
        await productRepository.save(product);

        if (dto.price !== undefined || dto.stock !== undefined) {
          const listingUpdate = await listingRepository.update(
            { productId: id },
            {
              ...(dto.price !== undefined ? { price: dto.price } : {}),
              ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
            },
          );

          if (!listingUpdate.affected) {
            throw new NotFoundException(
              createErrorPayload(
                ERROR_CODES.PRODUCT_LISTING_NOT_FOUND,
                `Product listing for product ${id} not found`,
              ),
            );
          }
        }

        if (assets !== undefined) {
          await this.syncAssets(id, assets, assetRepository);
        }

        const jobId =
          previousDocument !== undefined
            ? await this.embeddingService.recordChange(
                manager,
                id,
                previousDocument,
              )
            : null;
        return {
          product: await this.findOneWithRepository(id, productRepository),
          jobId,
        };
      },
    );

    await this.embeddingService.dispatch(updatedProduct.jobId);
    return updatedProduct.product;
  }

  private async syncAssets(
    productId: string,
    assets: SyncProductAssetDto[],
    assetRepository: Repository<ProductAsset>,
  ): Promise<void> {
    const existingAssets = await assetRepository.find({
      where: { productId },
    });
    const existingIds = existingAssets.map((a) => a.id);
    const incomingIds = assets.flatMap((asset) => (asset.id ? [asset.id] : []));

    if (incomingIds.some((id) => !existingIds.includes(id))) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.PRODUCT_ASSET_MISMATCH,
          'One or more product assets do not belong to this product',
        ),
      );
    }

    const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));
    if (idsToDelete.length > 0) {
      await assetRepository.delete({ id: In(idsToDelete), productId });
    }

    for (let i = 0; i < assets.length; i++) {
      const assetDto = assets[i];
      if (assetDto.id) {
        const assetUpdate = await assetRepository.update(
          { id: assetDto.id, productId },
          {
            url: assetDto.url,
            type: assetDto.type,
            isPrimary: i === 0 ? true : (assetDto.isPrimary ?? false),
            metadata: assetDto.metadata as
              | QueryDeepPartialEntity<AssetMetadata>
              | undefined,
          },
        );

        if (!assetUpdate.affected) {
          throw new NotFoundException(
            createErrorPayload(
              ERROR_CODES.PRODUCT_ASSET_NOT_FOUND,
              `Product asset with ID ${assetDto.id} not found`,
            ),
          );
        }
      } else {
        const newAsset = assetRepository.create({
          ...assetDto,
          productId,
          isPrimary: i === 0 ? true : (assetDto.isPrimary ?? false),
        });
        await assetRepository.save(newAsset);
      }
    }
  }

  async remove(id: string, sellerId: string): Promise<void> {
    const product = await this.findOne(id);
    this.validateOwnership(product, sellerId);
    await this.productRepository.remove(product);
  }

  async addAsset(
    productId: string,
    sellerId: string,
    assetDto: CreateProductAssetDto,
  ): Promise<ProductAsset> {
    const product = await this.findOne(productId);
    this.validateOwnership(product, sellerId);
    await this.verifyProductAssets(sellerId, [assetDto]);

    const asset = this.assetRepository.create({ ...assetDto, productId });
    return this.assetRepository.save(asset);
  }

  async removeAsset(
    productId: string,
    assetId: string,
    sellerId: string,
  ): Promise<void> {
    const product = await this.findOne(productId);
    this.validateOwnership(product, sellerId);

    const asset = await this.assetRepository.findOne({
      where: { id: assetId, productId },
    });

    if (!asset) {
      throw new NotFoundException(
        createErrorPayload(
          ERROR_CODES.PRODUCT_ASSET_NOT_FOUND,
          `Asset with ID ${assetId} not found`,
        ),
      );
    }

    await this.assetRepository.remove(asset);
  }

  async updateAsset(
    productId: string,
    assetId: string,
    sellerId: string,
    dto: UpdateProductAssetDto,
  ): Promise<ProductAsset> {
    const product = await this.findOne(productId);
    this.validateOwnership(product, sellerId);

    const asset = await this.assetRepository.findOne({
      where: { id: assetId, productId },
    });

    if (!asset) {
      throw new NotFoundException(
        createErrorPayload(
          ERROR_CODES.PRODUCT_ASSET_NOT_FOUND,
          `Asset with ID ${assetId} not found`,
        ),
      );
    }

    if (
      (dto.url && dto.url !== asset.url) ||
      (dto.type && dto.type !== asset.type)
    ) {
      await this.verifyProductAssets(sellerId, [{ ...asset, ...dto }]);
    }

    Object.assign(asset, dto);
    return this.assetRepository.save(asset);
  }

  async setPrimaryAsset(
    productId: string,
    assetId: string,
    sellerId: string,
  ): Promise<void> {
    await this.productRepository.manager.transaction(async (manager) => {
      const productRepository = manager.getRepository(Product);
      const assetRepository = manager.getRepository(ProductAsset);
      const product = await this.requireProduct(productId, productRepository);
      this.validateOwnership(product, sellerId);

      const assetExists = await assetRepository.existsBy({
        id: assetId,
        productId,
      });
      if (!assetExists) {
        throw new NotFoundException(
          createErrorPayload(
            ERROR_CODES.PRODUCT_ASSET_NOT_FOUND,
            `Asset with ID ${assetId} not found`,
          ),
        );
      }

      await assetRepository.update({ productId }, { isPrimary: false });
      await assetRepository.update(
        { id: assetId, productId },
        { isPrimary: true },
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  private includesSearchFields(dto: UpdateProductDto): boolean {
    return [
      'title',
      'description',
      'keywords',
      'specifications',
      'categoryId',
    ].some((field) => Object.prototype.hasOwnProperty.call(dto, field));
  }

  private createCatalogQuery(marketCode: string) {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .innerJoin(
        'product.listings',
        'listing',
        'listing.marketCode = :marketCode AND listing.isActive = true',
        { marketCode },
      );
  }

  private async createAssets(
    productId: string,
    assets: CreateProductAssetDto[],
    assetRepository: Repository<ProductAsset>,
  ): Promise<ProductAsset[]> {
    const assetEntities = assets.map((asset, index) =>
      assetRepository.create({
        ...asset,
        productId,
        isPrimary: index === 0 ? true : (asset.isPrimary ?? false),
      }),
    );

    return assetRepository.save(assetEntities);
  }

  private async verifyProductAssets(
    sellerId: string,
    assets: (CreateProductAssetDto | SyncProductAssetDto)[],
    existing: ProductAsset[] = [],
  ): Promise<void> {
    await Promise.all(
      assets.map(async (asset) => {
        const previous =
          'id' in asset
            ? existing.find((item) => item.id === asset.id)
            : undefined;
        const type = asset.type ?? previous?.type ?? AssetType.IMAGE;
        if (previous?.url === asset.url && previous.type === type) return;
        await this.filesService.verifyAssetReference(
          sellerId,
          asset.url,
          type === AssetType.MODEL_3D
            ? FileUploadPurpose.PRODUCT_MODEL
            : FileUploadPurpose.PRODUCT_IMAGE,
        );
      }),
    );
  }

  private validateOwnership(product: Product, sellerId: string): void {
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(
        createErrorPayload(
          ERROR_CODES.PRODUCT_FORBIDDEN,
          'You do not have permission to modify this product',
        ),
      );
    }
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<Product>,
    filters: Partial<ProductFilterDto>,
  ): void {
    if (filters.search) {
      const search = normalizeSearchText(filters.search);
      queryBuilder.andWhere(
        search
          ? `(product.searchTitle LIKE :search
          OR product.searchDescription LIKE :search
          OR product.searchKeywords LIKE :search)`
          : '1 = 0',
        { search: `%${search}%` },
      );
    }

    if (filters.keywords?.length) {
      queryBuilder.andWhere('product.keywords && :keywords', {
        keywords: filters.keywords,
      });
    }

    if (filters.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: filters.categoryId,
      });
    }

    if (filters.sellerId) {
      queryBuilder.andWhere('product.sellerId = :sellerId', {
        sellerId: filters.sellerId,
      });
    }

    if (filters.minPrice !== undefined) {
      queryBuilder.andWhere('listing.price >= :minPrice', {
        minPrice: filters.minPrice,
      });
    }

    if (filters.maxPrice !== undefined) {
      queryBuilder.andWhere('listing.price <= :maxPrice', {
        maxPrice: filters.maxPrice,
      });
    }

    if (filters.dimension && filters.maxDimensionCm !== undefined) {
      this.applyDimensionFilter(
        queryBuilder,
        filters.dimension,
        filters.maxDimensionCm,
      );
    }
  }

  private applyDimensionFilter(
    queryBuilder: SelectQueryBuilder<Product>,
    dimension: ProductDimension,
    maxDimensionCm: number,
  ): void {
    queryBuilder.andWhere(
      `${productDimensionCmSql('product', dimension, ':validDimension')} <= :maxDimensionCm`,
      {
        validDimension: VALID_PRODUCT_DIMENSION_PATTERN,
        maxDimensionCm,
      },
    );
  }

  private resolveMeasurementSearch(
    filters: Partial<ProductFilterDto>,
  ): Partial<ProductFilterDto> {
    if (
      !filters.search ||
      (filters.dimension && filters.maxDimensionCm !== undefined)
    ) {
      return filters;
    }

    const parsedSearch = parseProductMeasurementSearch(filters.search);
    if (!parsedSearch.measurement) return filters;

    return {
      ...filters,
      search: parsedSearch.query || undefined,
      dimension: parsedSearch.measurement.dimension,
      maxDimensionCm: parsedSearch.measurement.maxDimensionCm,
    };
  }

  private async validateSelectableCategory(
    categoryId: string | null | undefined,
    categoryRepository: Repository<Category>,
  ): Promise<void> {
    if (!categoryId) return;
    const category = await categoryRepository.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        createErrorPayload(
          ERROR_CODES.CATEGORY_NOT_FOUND,
          `Category with ID ${categoryId} not found`,
        ),
      );
    }
    if (!category.isSelectable) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.CATEGORY_NOT_SELECTABLE,
          'Products must use a specific selectable category',
        ),
      );
    }
  }

  private async createDefaultListing(
    product: Product,
    sellerId: string,
    manager: EntityManager,
  ): Promise<void> {
    const location = await manager.getRepository(VendorLocation).findOne({
      where: {
        isPrimary: true,
        vendorProfile: { userId: sellerId },
      },
    });
    if (!location) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.VENDOR_LOCATION_REQUIRED,
          'Complete the vendor business location before creating products',
        ),
      );
    }

    const market = await manager.getRepository(Market).findOne({
      where: {
        code: location.countryCode.toUpperCase(),
        isActive: true,
      },
    });
    if (!market) {
      throw new NotFoundException(
        createErrorPayload(
          ERROR_CODES.MARKET_NOT_AVAILABLE,
          `Market ${location.countryCode} is not available`,
        ),
      );
    }

    const listingRepository = manager.getRepository(ProductListing);
    await listingRepository.save(
      listingRepository.create({
        productId: product.id,
        vendorLocationId: location.id,
        marketCode: market.code,
        price: product.price,
        currencyCode: market.currencyCode,
        stock: product.stock ?? 0,
        isActive: true,
      }),
    );
  }

  private async requireProduct(
    id: string,
    productRepository: Repository<Product>,
    lock = false,
  ): Promise<Product> {
    const product = await productRepository.findOne({
      where: { id },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!product) {
      throw new NotFoundException(
        createErrorPayload(
          ERROR_CODES.PRODUCT_NOT_FOUND,
          `Product with ID ${id} not found`,
        ),
      );
    }
    return product;
  }

  private async findOneWithRepository(
    id: string,
    productRepository: Repository<Product>,
  ): Promise<Product> {
    const product = await productRepository.findOne({
      where: { id },
      relations: [
        'assets',
        'category',
        'seller',
        'listings',
        'listings.market',
        'listings.vendorLocation',
      ],
    });

    if (!product) {
      throw new NotFoundException(
        createErrorPayload(
          ERROR_CODES.PRODUCT_NOT_FOUND,
          `Product with ID ${id} not found`,
        ),
      );
    }

    return product;
  }
}
