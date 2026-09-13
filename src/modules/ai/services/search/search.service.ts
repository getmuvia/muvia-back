import { Injectable, Logger } from '@nestjs/common';
import { VectorService } from '../vector/vector.service';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';
import { ProductLexicalRepository } from '../../repositories/product-lexical.repository';
import { SearchQueryDto } from '../../dto/search-query.dto';
import { HybridSearchDto } from '../../dto/hybrid-search.dto';
import {
  SearchResult,
  SearchProductResult,
  HybridProductResult,
  HybridSearchResponse,
} from '../../interfaces/search-result.interface';
import { Product } from '../../../products/entities/product.entity';
import { SEARCH } from '../../constants';
import { evaluateProduct, SearchIntent } from './search-intent';
import type { SearchableProduct } from './search-intent';
import { CategoryTaxonomyService } from '../../../categories/category-taxonomy.service';
import { MarketsService } from '../../../markets/markets.service';
import { AssetType } from '../../../products/enums/asset-type.enum';

/**
 * Orchestrates semantic and hybrid search operations.
 * Single Responsibility: Coordinates embedding generation and similarity search.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly vectorService: VectorService,
    private readonly productVectorRepo: ProductVectorRepository,
    private readonly productLexicalRepo: ProductLexicalRepository,
    private readonly categoryTaxonomyService: CategoryTaxonomyService,
    private readonly marketsService: MarketsService,
  ) {}

  /**
   * Hybrid search: Combines semantic (AI) and lexical (text) search in parallel.
   * Uses a fetch multiplier to ensure the best results aren't missed.
   */
  async searchHybrid(dto: HybridSearchDto): Promise<HybridSearchResponse> {
    const {
      query,
      limit = SEARCH.DEFAULT_LIMIT,
      marketCode = 'BO',
      locale = 'es-BO',
    } = dto;
    await this.marketsService.requireActive(marketCode);
    const intent = await this.categoryTaxonomyService.createSearchIntent(
      query,
      locale,
    );
    if (!intent.terms.length && !intent.measurement) {
      return { query, results: [], relatedResults: [], count: 0 };
    }
    const fetchLimit = limit * SEARCH.FETCH_MULTIPLIER;
    const [semanticResults, lexicalResults] = await Promise.all([
      intent.text
        ? this.performSemanticSearch(
            intent.text,
            fetchLimit,
            marketCode,
            intent.measurement,
          )
        : Promise.resolve([]),
      this.productLexicalRepo.search(intent, fetchLimit, marketCode),
    ]);
    const { results, relatedResults } = this.mergeResults(
      semanticResults,
      lexicalResults,
      intent,
    );
    const selected = results.slice(0, limit);
    return {
      query,
      results: selected,
      count: selected.length,
      relatedResults: relatedResults.slice(
        0,
        Math.min(limit, SEARCH.RELATED_LIMIT),
      ),
    };
  }

  /**
   * Performs semantic search using vector embeddings.
   * Gracefully returns empty array if VectorService is unavailable.
   */
  private async performSemanticSearch(
    query: string,
    limit: number,
    marketCode: string,
    measurement?: SearchIntent['measurement'],
  ): Promise<SearchProductResult[]> {
    if (!this.vectorService.isAvailable()) {
      this.logger.warn('VectorService unavailable, skipping semantic search');
      return [];
    }

    try {
      const embedding = await this.createQueryEmbedding(query);
      return await this.productVectorRepo.findBySimilarity(
        embedding,
        limit,
        SEARCH.DEFAULT_SIMILARITY_THRESHOLD,
        marketCode,
        measurement,
      );
    } catch (error: unknown) {
      this.logger.error(`Semantic search failed: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private mergeResults(
    semantic: SearchProductResult[],
    lexical: Product[],
    intent: SearchIntent,
  ): { results: HybridProductResult[]; relatedResults: HybridProductResult[] } {
    const candidates = new Map<
      string,
      {
        product: SearchableProduct;
        result: HybridProductResult;
        similarity?: number;
      }
    >();
    for (const product of semantic) {
      candidates.set(product.id, {
        product,
        similarity: product.similarity,
        result: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(product.price),
          currencyCode: product.currencyCode,
          imageUrl: product.imageUrl,
          score: product.similarity,
          matchType: 'semantic',
        },
      });
    }
    for (const product of lexical) {
      const existing = candidates.get(product.id);
      if (existing) {
        existing.product = product;
        existing.result.matchType = 'hybrid';
        continue;
      }
      const primaryAsset =
        product.assets?.find(
          (asset) => asset.isPrimary && asset.type === AssetType.IMAGE,
        ) ?? product.assets?.find((asset) => asset.type === AssetType.IMAGE);
      const listing = product.listings?.[0];
      candidates.set(product.id, {
        product: { ...product, categoryCode: product.category?.code },
        result: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(listing?.price ?? product.price),
          currencyCode: listing?.currencyCode ?? 'BOB',
          imageUrl: primaryAsset?.url ?? null,
          score: 0,
          matchType: 'lexical',
        },
      });
    }

    const results: HybridProductResult[] = [];
    const relatedResults: HybridProductResult[] = [];
    for (const { product, result, similarity } of candidates.values()) {
      const relevance = evaluateProduct(product, intent);
      if (relevance.primary) {
        // Identity/text determines eligibility; AI contributes only to ordering.
        result.score =
          similarity === undefined
            ? relevance.score
            : relevance.score * (1 - SEARCH.SEMANTIC_RANK_WEIGHT) +
              similarity * SEARCH.SEMANTIC_RANK_WEIGHT;
        results.push(result);
      } else if (
        relevance.relatedType &&
        similarity !== undefined &&
        similarity >= SEARCH.RELATED_SIMILARITY_THRESHOLD
      ) {
        relatedResults.push(result);
      }
    }
    const rank = (a: HybridProductResult, b: HybridProductResult) =>
      b.score - a.score ||
      a.title.localeCompare(b.title, 'es') ||
      a.id.localeCompare(b.id);
    return {
      results: results.sort(rank),
      relatedResults: relatedResults.sort(rank),
    };
  }

  /**
   * Executes parallel semantic search for multiple queries.
   */
  async searchBatch(dto: SearchQueryDto): Promise<SearchResult[]> {
    this.ensureServiceAvailable();

    const { queries, limit = 5, threshold = 0.5 } = dto;

    return Promise.all(
      queries.map((query) => this.searchOne(query, limit, threshold)),
    );
  }

  private async searchOne(
    query: string,
    limit: number,
    threshold: number,
  ): Promise<SearchResult> {
    try {
      const products = await this.findSimilarProducts(query, limit, threshold);
      this.logger.debug(`"${query}": ${products.length} results`);
      return { query, products };
    } catch (error: unknown) {
      this.logger.error(
        `Search failed "${query}": ${this.errorMessage(error)}`,
      );
      return { query, products: [] };
    }
  }

  private async findSimilarProducts(
    query: string,
    limit: number,
    threshold: number,
  ): Promise<SearchProductResult[]> {
    const embedding = await this.createQueryEmbedding(query);
    return this.productVectorRepo.findBySimilarity(embedding, limit, threshold);
  }

  private async createQueryEmbedding(query: string): Promise<string> {
    const vector = await this.vectorService.generateEmbedding(
      query,
      'RETRIEVAL_QUERY',
    );
    return this.vectorService.toVectorString(vector);
  }

  private ensureServiceAvailable(): void {
    if (!this.vectorService.isAvailable()) {
      throw new Error('Semantic search unavailable. Configure GCP_PROJECT_ID.');
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
