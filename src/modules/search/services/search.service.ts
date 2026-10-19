import { Injectable, Logger } from '@nestjs/common';
import { VectorService } from '../../ai/services/vector/vector.service';
import { MarketsService } from '../../markets/markets.service';
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
import { SearchQuery } from '../search-query';
import { SearchIntentService } from './search-intent.service';
import { SearchRankingService } from './search-ranking.service';
import { SearchQueryCache } from './search-query-cache';

/** Orchestrates buyer catalog searches and keeps providers/repositories isolated. */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  // The configured embedding provider/model is fixed for this service instance.
  private readonly embeddings = new SearchQueryCache<string>();

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

    const searchQuery = SearchQuery.fromIntent({
      scope: { marketCode, limit: limit * SEARCH.FETCH_MULTIPLIER },
      intent,
    });
    if (!searchQuery.hasSearchCriteria()) {
      return {
        query,
        interpretation,
        results: [],
        relatedResults: [],
        count: 0,
      };
    }

    const embedding =
      searchQuery.criteria.text && this.vectorService.isAvailable()
        ? this.createQueryEmbedding(searchQuery.criteria.text)
        : undefined;
    const candidates = await this.retrieveCandidates(searchQuery, embedding);
    let ranked = this.searchRankingService.rank(
      candidates.semantic,
      candidates.lexical,
      intent,
    );
    const broaderQuery = searchQuery.broaden(dto.categoryCode);
    const shouldBroadenSearch =
      broaderQuery !== undefined && ranked.results.length < limit;
    if (shouldBroadenSearch) {
      const broader = await this.retrieveCandidates(broaderQuery, embedding);
      ranked = this.searchRankingService.rank(
        [...candidates.semantic, ...broader.semantic],
        [...candidates.lexical, ...broader.lexical],
        intent,
      );
    }
    const { results, relatedResults } = ranked;
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

  private async retrieveCandidates(
    query: SearchQuery,
    embedding?: Promise<string>,
  ) {
    const [semantic, lexical] = await Promise.all([
      this.performSemanticSearch(query, embedding),
      this.productLexicalRepository.search(query),
    ]);
    return { semantic, lexical };
  }

  private async performSemanticSearch(
    query: SearchQuery,
    embedding?: Promise<string>,
  ): Promise<SearchProductResult[]> {
    if (!embedding) return [];
    try {
      return await this.productVectorRepository.findBySimilarity({
        embedding: await embedding,
        scope: query.scope,
        filters: query.filters,
        threshold: SEARCH.DEFAULT_SIMILARITY_THRESHOLD,
      });
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
      const products = await this.productVectorRepository.findBySimilarity({
        embedding,
        scope: { marketCode: 'BO', limit },
        threshold,
      });
      return { query, products };
    } catch (error: unknown) {
      this.logger.error(`Batch search failed: ${this.errorMessage(error)}`);
      return { query, products: [] };
    }
  }

  private async createQueryEmbedding(query: string): Promise<string> {
    return this.embeddings.getOrCreate(query, async () => {
      const vector = await this.vectorService.generateEmbedding(
        query,
        'RETRIEVAL_QUERY',
      );
      return this.vectorService.toVectorString(vector);
    });
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
