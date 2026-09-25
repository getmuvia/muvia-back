import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VALID_PRODUCT_DIMENSION_PATTERN,
  type ProductMeasurementFilter,
  productDimensionCmSql,
} from '../../../common/search/product-measurement';
import { AI_ENV_KEYS } from '../../../config/ai.config';
import { Product } from '../../products/entities/product.entity';
import type { SearchProductResult } from '../interfaces/search-result.interface';

type RawSearchProductResult = Omit<SearchProductResult, 'similarity'> & {
  similarity: string | number;
};

/** Encapsulates pgvector retrieval for catalog searches. */
@Injectable()
export class ProductVectorRepository {
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

    return raw.map((item) => ({
      ...item,
      similarity: Number(item.similarity),
    }));
  }

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
}
