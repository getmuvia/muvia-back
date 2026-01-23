import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductAsset } from './entities/product-asset.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import { CreateProductAssetDto } from './dto/create-product-asset.dto';
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

    this.triggerEmbeddingGeneration(savedProduct.id);

    if (assets?.length) {
      await this.createAssets(savedProduct.id, assets);
    }

    return this.findOne(savedProduct.id);
  }

  async findAll(filterDto: ProductFilterDto): Promise<{ data: Product[]; total: number }> {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.createBaseQuery();
    this.applyFilters(queryBuilder, filters);

    queryBuilder.orderBy('product.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
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

    Object.assign(product, dto);
    await this.productRepository.save(product);

    if (this.shouldRegenerateEmbedding(dto)) {
      this.triggerEmbeddingGeneration(id);
    }

    return this.findOne(id);
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
  private triggerEmbeddingGeneration(productId: string): void {
    this.embeddingService.updateForProduct(productId).catch(() => {
      // Silently fail - embedding is non-critical
    });
  }

  private shouldRegenerateEmbedding(dto: UpdateProductDto): boolean {
    return !!(dto.title || dto.description || dto.keywords);
  }

  private createBaseQuery() {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.assets', 'assets')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.seller', 'seller');
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
