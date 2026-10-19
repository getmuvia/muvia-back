import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProductPriceFilter } from '../../../common/search/product-price';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VALID_PRODUCT_DIMENSION_PATTERN,
  type ProductMeasurementFilter,
  productDimensionCmSql,
} from '../../../common/search/product-measurement';
import { AI_ENV_KEYS } from '../../../config/ai.config';
import { Product } from '../../products/entities/product.entity';
import { ProductCondition } from '../../products/enums/product-condition.enum';
import { PRODUCT_EMBEDDING_CONTENT_VERSION } from '../../ai/constants/ai.constants';
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
    condition?: ProductCondition,
    price?: ProductPriceFilter,
    categoryCode?: string,
  ): Promise<SearchProductResult[]> {
    const parameters: unknown[] = [
      embedding,
      threshold,
      marketCode,
      limit,
      this.embeddingModel,
    ];
    const filters: string[] = [];
    const bind = (value: unknown): string => `$${parameters.push(value)}`;
    if (measurement)
      filters.push(
        `${productDimensionCmSql('p', measurement.dimension, bind(VALID_PRODUCT_DIMENSION_PATTERN))} <= ${bind(measurement.maxDimensionCm)}`,
      );
    if (condition !== undefined)
      filters.push(`p.condition = ${bind(condition)}`);
    if (categoryCode) filters.push(`category.code = ${bind(categoryCode)}`);
    if (price) {
      filters.push(`listing.currency_code = ${bind(price.currencyCode)}`);
      if (price.minimum)
        filters.push(
          `listing.price ${price.minimum.inclusive ? '>=' : '>'} ${bind(price.minimum.amount.toFixed(2))}`,
        );
      if (price.maximum)
        filters.push(
          `listing.price ${price.maximum.inclusive ? '<=' : '<'} ${bind(price.maximum.amount.toFixed(2))}`,
        );
    }

    const raw = await this.repository.query<RawSearchProductResult[]>(
      this.getSimilarityQuery(filters),
      parameters,
    );

    return raw.map((item) => ({
      ...item,
      similarity: Number(item.similarity),
    }));
  }

  private getSimilarityQuery(filters: readonly string[]): string {
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
        AND p.embedding_revision = p.search_revision
        AND p.embedding_content_version = ${PRODUCT_EMBEDDING_CONTENT_VERSION}
        ${filters.map((filter) => `AND ${filter}`).join('\n        ')}
      ORDER BY p.embedding <=> $1::vector ASC
      LIMIT $4
    `;
  }
}
