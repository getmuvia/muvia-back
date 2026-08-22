import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductAsset } from './entities/product-asset.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import { CreateProductAssetDto } from './dto/create-product-asset.dto';
import { UpdateProductAssetDto } from './dto/update-product-asset.dto';
import { SyncProductAssetDto } from './dto/sync-product-asset.dto';
import { EmbeddingService } from '../ai/services/embedding/embedding.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductAsset)
    private readonly assetRepository: Repository<ProductAsset>,
    private readonly embeddingService: EmbeddingService,
  ) { }

  async create(sellerId: string, dto: CreateProductDto): Promise<Product> {
    const { assets, ...productData } = dto;

    const product = this.productRepository.create({ ...productData, sellerId });
    const savedProduct = await this.productRepository.save(product);

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
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.createBaseQuery();
    this.applyFilters(queryBuilder, filters);

    queryBuilder.orderBy('product.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
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
      relations: ['assets', 'category', 'seller'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  async findBySeller(sellerId: string): Promise<Product[]> {
    return this.productRepository.find({
      where: { sellerId },
      relations: ['assets', 'category'],
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

    Object.assign(product, productData);
    await this.productRepository.save(product);

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

  private createBaseQuery() {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.assets', 'assets')
      .leftJoinAndSelect('product.category', 'category');
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

  private applyFilters(queryBuilder: any, filters: Partial<ProductFilterDto>): void {
    if (filters.search) {
      queryBuilder.andWhere(
        '(product.title ILIKE :search OR product.description ILIKE :search)',
        { search: `%${filters.search}%` },
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
      queryBuilder.andWhere('product.price >= :minPrice', {
        minPrice: filters.minPrice,
      });
    }

    if (filters.maxPrice !== undefined) {
      queryBuilder.andWhere('product.price <= :maxPrice', {
        maxPrice: filters.maxPrice,
      });
    }
  }
}
