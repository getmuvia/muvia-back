import { Injectable, Logger } from '@nestjs/common';
import type { ProductMeasurementFilter } from '../../../common/search/product-measurement';
import type { ProductPriceFilter } from '../../../common/search/product-price';
import { VectorService } from '../../ai/services/vector/vector.service';
import { MarketsService } from '../../markets/markets.service';
import { ProductCondition } from '../../products/enums/product-condition.enum';
import { HybridSearchDto } from '../dto/hybrid-search.dto';
import { SearchQueryDto } from '../dto/search-query.dto';
import type { HybridSearchResponseDto } from '../dto/search-response.dto';
import type {
  SearchProductResult,
  SearchResult,
} from '../interfaces/search-result.interface';
import { ProductLexicalRepository } from '../repositories/product-lexical.repository';
import { ProductVectorRepository } from '../repositories/product-vector.repository';
import { SEARCH } from '../search.constants';
import { SearchIntentService } from './search-intent.service';
import { SearchRankingService } from './search-ranking.service';

/** Orchestrates buyer catalog searches and keeps providers/repositories isolated. */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly vectorService: VectorService,
    private readonly productVectorRepository: ProductVectorRepository,
    private readonly productLexicalRepository: ProductLexicalRepository,
    private readonly searchIntentService: SearchIntentService,
    private readonly searchRankingService: SearchRankingService,
    private readonly marketsService: MarketsService,
  ) {}

  async searchHybrid(dto: HybridSearchDto): Promise<HybridSearchResponseDto> {
    const {
      query,
      limit = SEARCH.DEFAULT_LIMIT,
      marketCode = 'BO',
      locale = 'es-BO',
    } = dto;
    const market = await this.marketsService.requireActive(marketCode);
    const { intent, interpretation } = await this.searchIntentService.resolve(
      query,
      locale,
      market,
      dto,
    );

    if (
      !intent.text &&
      !intent.terms.length &&
      !intent.measurement &&
      !intent.price &&
      !intent.categoryCode &&
      !intent.condition
    ) {
      return {
        query,
        interpretation,
        results: [],
        relatedResults: [],
        count: 0,
      };
    }

    const fetchLimit = limit * SEARCH.FETCH_MULTIPLIER;
    const [semanticResults, lexicalResults] = await Promise.all([
      intent.text
        ? this.performSemanticSearch(
            intent.text,
            fetchLimit,
            marketCode,
            intent.measurement,
            intent.condition,
            intent.price,
            intent.categoryCode,
          )
        : Promise.resolve([]),
      this.productLexicalRepository.search(
        intent,
        fetchLimit,
        marketCode,
        intent.condition,
        intent.categoryCode,
      ),
    ]);
    const { results, relatedResults } = this.searchRankingService.rank(
      semanticResults,
      lexicalResults,
      intent,
    );
    const selected = results.slice(0, limit);
    const suggestionLimit = Math.min(
      Math.max(limit - selected.length, 0),
      SEARCH.RELATED_LIMIT,
    );

    return {
      query,
      interpretation,
      results: selected,
      count: selected.length,
      relatedResults: relatedResults.slice(0, suggestionLimit),
    };
  }

  async searchBatch(dto: SearchQueryDto): Promise<SearchResult[]> {
    this.ensureSemanticSearchAvailable();
    const { queries, limit = 5, threshold = 0.5 } = dto;
    return Promise.all(
      queries.map((query) => this.searchOne(query, limit, threshold)),
    );
  }

  private async performSemanticSearch(
    query: string,
    limit: number,
    marketCode: string,
    measurement?: ProductMeasurementFilter,
    condition?: ProductCondition,
    price?: ProductPriceFilter,
    categoryCode?: string,
  ): Promise<SearchProductResult[]> {
    if (!this.vectorService.isAvailable()) {
      this.logger.warn('VectorService unavailable, skipping semantic search');
      return [];
    }

    try {
      const embedding = await this.createQueryEmbedding(query);
      return await this.productVectorRepository.findBySimilarity(
        embedding,
        limit,
        SEARCH.DEFAULT_SIMILARITY_THRESHOLD,
        marketCode,
        measurement,
        condition,
        price,
        categoryCode,
      );
    } catch (error: unknown) {
      this.logger.error(`Semantic search failed: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private async searchOne(
    query: string,
    limit: number,
    threshold: number,
  ): Promise<SearchResult> {
    try {
      const embedding = await this.createQueryEmbedding(query);
      const products = await this.productVectorRepository.findBySimilarity(
        embedding,
        limit,
        threshold,
      );
      return { query, products };
    } catch (error: unknown) {
      this.logger.error(`Batch search failed: ${this.errorMessage(error)}`);
      return { query, products: [] };
    }
  }

  private async createQueryEmbedding(query: string): Promise<string> {
    const vector = await this.vectorService.generateEmbedding(
      query,
      'RETRIEVAL_QUERY',
    );
    return this.vectorService.toVectorString(vector);
  }

  private ensureSemanticSearchAvailable(): void {
    if (!this.vectorService.isAvailable()) {
      throw new Error('Semantic search unavailable. Configure GCP_PROJECT_ID.');
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
