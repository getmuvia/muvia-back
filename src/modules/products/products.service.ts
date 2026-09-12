import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, SelectQueryBuilder } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductAsset } from './entities/product-asset.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductDimension, ProductFilterDto } from './dto/product-filter.dto';
import { CreateProductAssetDto } from './dto/create-product-asset.dto';
import { UpdateProductAssetDto } from './dto/update-product-asset.dto';
import { SyncProductAssetDto } from './dto/sync-product-asset.dto';
import { EmbeddingService } from '../ai/services/embedding/embedding.service';
import { normalizedSearchSql, normalizeSearchText } from '../../common/search/search-text';
import { ProductListing } from './entities/product-listing.entity';
import { VendorLocation } from '../users/entities/vendor-location.entity';
import { Category } from '../categories/entities/category.entity';
import { MarketsService } from '../markets/markets.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductAsset)
    private readonly assetRepository: Repository<ProductAsset>,
    @InjectRepository(ProductListing)
    private readonly listingRepository: Repository<ProductListing>,
    @InjectRepository(VendorLocation)
    private readonly vendorLocationRepository: Repository<VendorLocation>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly embeddingService: EmbeddingService,
    private readonly marketsService: MarketsService,
  ) { }

  async create(sellerId: string, dto: CreateProductDto): Promise<Product> {
    const { assets, ...productData } = dto;
    await this.validateSelectableCategory(productData.categoryId);

    const product = this.productRepository.create({ ...productData, sellerId });
    const savedProduct = await this.productRepository.save(product);
    try {
      await this.createDefaultListing(savedProduct, sellerId);
    } catch (error) {
      await this.productRepository.remove(savedProduct);
      throw error;
    }

    try {
      console.log(`🧠 Generating embedding for product ${savedProduct.id}...`);
      await this.triggerEmbeddingGeneration(savedProduct.id);
      console.log(`✅ Embedding generated successfully.`);
    } catch (error) {
      console.error(`❌ AI failed, but the product was saved:`, error);
    }

    if (assets?.length) {
      await this.createAssets(savedProduct.id, assets);
    }

    return this.findOne(savedProduct.id);
  }

  async findAll(filterDto: ProductFilterDto): Promise<{
    data: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, marketCode = 'BO', ...filters } = filterDto;
    const skip = (page - 1) * limit;
    await this.marketsService.requireActive(marketCode);

    const queryBuilder = this.createBaseQuery(marketCode);
    this.applyFilters(queryBuilder, filters);

    queryBuilder.orderBy('product.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    data.forEach(product => this.applyListingSnapshot(product));
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['assets', 'category', 'seller', 'listings', 'listings.market', 'listings.vendorLocation'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  async findBySeller(sellerId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { sellerId },
      relations: ['assets', 'category', 'listings', 'listings.market', 'listings.vendorLocation'],
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

  async update(id: string, sellerId: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    this.validateOwnership(product, sellerId);

    const { assets, ...productData } = dto;
    await this.validateSelectableCategory(productData.categoryId);

    Object.assign(product, productData);
    await this.productRepository.save(product);
    if (dto.price !== undefined || dto.stock !== undefined) {
      await this.listingRepository.update(
        { productId: id },
        {
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
        },
      );
    }

    if (assets !== undefined) {
      await this.syncAssets(id, assets);
    }

    if (this.shouldRegenerateEmbedding(dto)) {
      this.triggerEmbeddingGeneration(id);
    }

    return this.findOne(id);
  }

  private async syncAssets(productId: string, assets: SyncProductAssetDto[]): Promise<void> {
    const existingAssets = await this.assetRepository.find({ where: { productId } });
    const existingIds = existingAssets.map(a => a.id);
    const incomingIds = assets.filter(a => a.id).map(a => a.id);

    const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));
    if (idsToDelete.length > 0) {
      await this.assetRepository.delete({ id: In(idsToDelete), productId });
    }

    for (let i = 0; i < assets.length; i++) {
      const assetDto = assets[i];
      if (assetDto.id) {
        await this.assetRepository.update(
          { id: assetDto.id, productId },
          {
            url: assetDto.url,
            type: assetDto.type,
            isPrimary: i === 0 ? true : assetDto.isPrimary ?? false,
            metadata: assetDto.metadata as any,
          },
        );
      } else {
        const newAsset = this.assetRepository.create({
          ...assetDto,
          productId,
          isPrimary: i === 0 ? true : assetDto.isPrimary ?? false,
        });
        await this.assetRepository.save(newAsset);
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

    const asset = this.assetRepository.create({ ...assetDto, productId });
    return this.assetRepository.save(asset);
  }

  async removeAsset(productId: string, assetId: string, sellerId: string): Promise<void> {
    const product = await this.findOne(productId);
    this.validateOwnership(product, sellerId);

    const asset = await this.assetRepository.findOne({
      where: { id: assetId, productId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset with ID ${assetId} not found`);
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
      throw new NotFoundException(`Asset with ID ${assetId} not found`);
    }

    Object.assign(asset, dto);
    return this.assetRepository.save(asset);
  }

  async setPrimaryAsset(productId: string, assetId: string, sellerId: string): Promise<void> {
    const product = await this.findOne(productId);
    this.validateOwnership(product, sellerId);

    await this.assetRepository.update({ productId }, { isPrimary: false });
    await this.assetRepository.update({ id: assetId, productId }, { isPrimary: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Triggers async embedding generation without blocking.
   */
  private async triggerEmbeddingGeneration(productId: string): Promise<void> {
    await this.embeddingService.updateForProduct(productId);
  }

  private shouldRegenerateEmbedding(dto: UpdateProductDto): boolean {
    return !!(dto.title || dto.description || dto.keywords);
  }

  private createBaseQuery(marketCode: string) {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.assets', 'assets')
      .leftJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect(
        'product.listings',
        'listing',
        'listing.marketCode = :marketCode AND listing.isActive = true',
        { marketCode },
      )
      .leftJoinAndSelect('listing.market', 'market')
      .leftJoinAndSelect('listing.vendorLocation', 'vendorLocation');
  }

  private async createAssets(
    productId: string,
    assets: CreateProductAssetDto[],
  ): Promise<ProductAsset[]> {
    const assetEntities = assets.map((asset, index) =>
      this.assetRepository.create({
        ...asset,
        productId,
        isPrimary: index === 0 ? true : asset.isPrimary ?? false,
      }),
    );

    return this.assetRepository.save(assetEntities);
  }

  private validateOwnership(product: Product, sellerId: string): void {
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('You do not have permission to modify this product');
    }
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<Product>,
    filters: Partial<ProductFilterDto>,
  ): void {
    if (filters.search) {
      const search = normalizeSearchText(filters.search);
      queryBuilder.andWhere(
        search ? `(${normalizedSearchSql('product.title')} LIKE :search
          OR ${normalizedSearchSql('product.description')} LIKE :search
          OR ${normalizedSearchSql("array_to_string(product.keywords, ' ')")} LIKE :search)` : '1 = 0',
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
    const dimensionValue = `product.specifications -> 'dimensions' ->> '${dimension}'`;
    const dimensionUnit = `LOWER(COALESCE(product.specifications -> 'dimensions' ->> 'unit', 'cm'))`;

    queryBuilder.andWhere(
      `(CASE
        WHEN (${dimensionValue}) ~ :validDimension THEN
          CASE ${dimensionUnit}
            WHEN 'cm' THEN (${dimensionValue})::numeric
            WHEN 'm' THEN (${dimensionValue})::numeric * 100
            WHEN 'in' THEN (${dimensionValue})::numeric * 2.54
            ELSE NULL
          END
        ELSE NULL
      END) <= :maxDimensionCm`,
      {
        validDimension: '^\\d+(\\.\\d+)?$',
        maxDimensionCm,
      },
    );
  }

  private async validateSelectableCategory(categoryId?: string | null): Promise<void> {
    if (!categoryId) return;
    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Category with ID ${categoryId} not found`);
    if (!category.isSelectable) {
      throw new BadRequestException('Products must use a specific selectable category');
    }
  }

  private async createDefaultListing(product: Product, sellerId: string): Promise<void> {
    const location = await this.vendorLocationRepository
      .createQueryBuilder('location')
      .innerJoin('location.vendorProfile', 'profile', 'profile.userId = :sellerId', { sellerId })
      .where('location.isPrimary = true')
      .getOne();
    if (!location) {
      throw new BadRequestException('Complete the vendor business location before creating products');
    }
    const market = await this.marketsService.requireActive(location.countryCode);
    await this.listingRepository.save(this.listingRepository.create({
      productId: product.id,
      vendorLocationId: location.id,
      marketCode: market.code,
      price: product.price,
      currencyCode: market.currencyCode,
      stock: product.stock ?? 0,
      isActive: true,
    }));
  }

  private applyListingSnapshot(product: Product): void {
    const listing = product.listings?.[0];
    if (!listing) return;
    product.price = Number(listing.price);
    product.stock = listing.stock;
  }
}
