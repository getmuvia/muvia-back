import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { SearchProductResult } from '../interfaces/search-result.interface';
import { AI_ENV_KEYS } from '../../../config/ai.config';
import {
  VALID_PRODUCT_DIMENSION_PATTERN,
  productDimensionCmSql,
} from '../../../common/search/product-measurement';
import type { ProductMeasurementFilter } from '../../../common/search/product-measurement';

type RawSearchProductResult = Omit<SearchProductResult, 'similarity'> & {
  similarity: string | number;
};

/**
 * Repository for vector-based product operations.
 * Encapsulates all pgvector SQL queries (Single Responsibility).
 */
@Injectable()
export class ProductVectorRepository {
  private readonly logger = new Logger(ProductVectorRepository.name);
  private readonly embeddingModel: string;

  constructor(
    @InjectRepository(Product)
    private readonly repository: Repository<Product>,
    configService: ConfigService,
  ) {
    this.embeddingModel = configService.getOrThrow<string>(
      AI_ENV_KEYS.embeddingModel,
    );
  }

  /**
   * Finds products similar to the given embedding vector.
   * Uses pgvector cosine distance operator for similarity ranking.
   */
  async findBySimilarity(
    embedding: string,
    limit: number,
    threshold: number,
    marketCode = 'BO',
    measurement?: ProductMeasurementFilter,
  ): Promise<SearchProductResult[]> {
    const raw = await this.repository.query<RawSearchProductResult[]>(
      this.getSimilarityQuery(measurement),
      measurement
        ? [
            embedding,
            threshold,
            marketCode,
            limit,
            this.embeddingModel,
            VALID_PRODUCT_DIMENSION_PATTERN,
            measurement.maxDimensionCm,
          ]
        : [embedding, threshold, marketCode, limit, this.embeddingModel],
    );

    return this.mapToResults(raw);
  }

  /**
   * Updates the embedding vector for a specific product.
   * Uses raw SQL to properly cast string to pgvector type.
   */
  async updateEmbedding(productId: string, embedding: string): Promise<void> {
    await this.repository.query(
      `UPDATE products
       SET embedding = $1::vector, embedding_model = $2
       WHERE id = $3`,
      [embedding, this.embeddingModel, productId],
    );
  }

  /**
   * Retrieves products whose embedding is missing or belongs to another model.
   */
  async findPendingEmbeddingRefresh(): Promise<Product[]> {
    return this.repository
      .createQueryBuilder('product')
      .where('product.embedding IS NULL')
      .orWhere('product.embedding_model IS DISTINCT FROM :embeddingModel', {
        embeddingModel: this.embeddingModel,
      })
      .getMany();
  }

  /**
   * Finds a single product by ID.
   */
  async findById(productId: string): Promise<Product | null> {
    return this.repository.findOne({ where: { id: productId } });
  }

  /**
   * SQL query using pgvector cosine distance.
   * Includes primary image via subquery for performance.
   */
  private getSimilarityQuery(measurement?: ProductMeasurementFilter): string {
    const dimensionFilter = measurement
      ? `AND ${productDimensionCmSql('p', measurement.dimension, '$6')} <= $7`
      : '';
    return `
            SELECT 
                p.id,
                p.title,
                p.description,
                p.keywords,
                p.specifications,
                listing.price,
                listing.stock,
                listing.currency_code as "currencyCode",
                p.seller_id as "sellerId",
                p.category_id as "categoryId",
                category.code as "categoryCode",
                p."createdAt",
                1 - (p.embedding <=> $1::vector) as similarity,
                (
                    SELECT pa.url 
                    FROM product_assets pa 
                    WHERE pa.product_id = p.id AND pa."isPrimary" = true 
                    LIMIT 1
                ) as "imageUrl"
            FROM products p
            INNER JOIN product_listings listing ON listing.product_id = p.id
              AND listing.market_code = $3 AND listing.is_active = true
            LEFT JOIN categories category ON category.id = p.category_id
            WHERE p.embedding IS NOT NULL
                AND 1 - (p.embedding <=> $1::vector) >= $2
                AND p.embedding_model = $5
                ${dimensionFilter}
            ORDER BY p.embedding <=> $1::vector ASC
            LIMIT $4
        `;
  }

  private mapToResults(raw: RawSearchProductResult[]): SearchProductResult[] {
    return raw.map((item) => ({
      ...item,
      similarity: Number(item.similarity),
    }));
  }
}
