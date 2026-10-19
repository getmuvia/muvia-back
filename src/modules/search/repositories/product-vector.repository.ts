import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { productPriceFiltersSql } from '../../../common/search/product-price';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { productMeasurementFiltersSql } from '../../../common/search/product-measurement';
import { searchPhrasePatterns } from '../../../common/search/search-text';
import { AI_ENV_KEYS } from '../../../config/ai.config';
import { Product } from '../../products/entities/product.entity';
import { PRODUCT_EMBEDDING_CONTENT_VERSION } from '../../ai/constants/ai.constants';
import type { SearchProductResult } from '../interfaces/search-result.interface';
import type { VectorSearchRequest } from '../search-query';

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

  async findBySimilarity({
    embedding,
    scope,
    threshold,
    filters = {},
  }: VectorSearchRequest): Promise<SearchProductResult[]> {
    const parameters: unknown[] = [
      embedding,
      threshold,
      scope.marketCode,
      scope.limit,
      this.embeddingModel,
    ];
    const constraints: string[] = [];
    const bind = (value: unknown): string => `$${parameters.push(value)}`;
    const { measurements, materialAliases, condition, categoryCode, price } =
      filters;
    constraints.push(
      ...productMeasurementFiltersSql('p', measurements ?? [], bind),
    );
    if (materialAliases?.length)
      constraints.push(
        `p.search_material LIKE ANY(${bind(searchPhrasePatterns(materialAliases))}::text[])`,
      );
    if (condition !== undefined)
      constraints.push(`p.condition = ${bind(condition)}`);
    if (categoryCode) constraints.push(`category.code = ${bind(categoryCode)}`);
    constraints.push(
      ...productPriceFiltersSql(
        price,
        { currency: 'listing.currency_code', amount: 'listing.price' },
        bind,
      ),
    );

    const raw = await this.repository.query<RawSearchProductResult[]>(
      this.getSimilarityQuery(constraints),
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
