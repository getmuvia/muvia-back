import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { VectorService } from '../vector/vector.service';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';
import { ProductsService } from '../../../products/products.service';
import { SearchQueryDto } from '../../dto/search-query.dto';
import { HybridSearchDto } from '../../dto/hybrid-search.dto';
import {
    SearchResult,
    SearchProductResult,
    HybridProductResult,
    HybridSearchResponse,
} from '../../interfaces/search-result.interface';
import { Product } from '../../../products/entities/product.entity';

/**
 * Orchestrates semantic and hybrid search operations.
 * Single Responsibility: Coordinates embedding generation and similarity search.
 */
@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);

    /** Fetch multiplier to ensure best results aren't missed during merge */
    private readonly FETCH_MULTIPLIER = 3;

    constructor(
        private readonly vectorService: VectorService,
        private readonly productVectorRepo: ProductVectorRepository,
        @Inject(forwardRef(() => ProductsService))
        private readonly productsService: ProductsService,
    ) { }

    // ─────────────────────────────────────────────────────────────────────────
    // Hybrid Search (NEW)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Hybrid search: Combines semantic (AI) and lexical (text) search in parallel.
     * Uses a fetch multiplier to ensure the best results aren't missed.
     */
    async searchHybrid(dto: HybridSearchDto): Promise<HybridSearchResponse> {
        const { query, limit = 10 } = dto;
        const fetchLimit = limit * this.FETCH_MULTIPLIER;

        // Execute BOTH searches in PARALLEL
        const [semanticResults, lexicalResults] = await Promise.all([
            this.performSemanticSearch(query, fetchLimit),
            this.performLexicalSearch(query, fetchLimit),
        ]);

        // Merge and rank results
        const merged = this.mergeResults(semanticResults, lexicalResults);

        this.logger.debug(
            `Hybrid search "${query}": ${semanticResults.length} semantic, ${lexicalResults.length} lexical, ${merged.length} merged`,
        );

        return {
            query,
            results: merged.slice(0, limit),
            count: merged.length,
        };
    }

    /**
     * Performs semantic search using vector embeddings.
     * Gracefully returns empty array if VectorService is unavailable.
     */
    private async performSemanticSearch(query: string, limit: number): Promise<SearchProductResult[]> {
        if (!this.vectorService.isAvailable()) {
            this.logger.warn('VectorService unavailable, skipping semantic search');
            return [];
        }

        try {
            const embedding = await this.createQueryEmbedding(query);
            return this.productVectorRepo.findBySimilarity(embedding, limit, 0.3);
        } catch (error) {
            this.logger.error(`Semantic search failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Performs lexical search using ProductsService (ILIKE on title/description).
     */
    private async performLexicalSearch(query: string, limit: number): Promise<Product[]> {
        try {
            const result = await this.productsService.findAll({
                search: query,
                limit,
                page: 1,
            });
            return result.data;
        } catch (error) {
            this.logger.error(`Lexical search failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Merges semantic and lexical results with scoring.
     * Products appearing in both get a boost.
     */
    private mergeResults(
        semantic: SearchProductResult[],
        lexical: Product[],
    ): HybridProductResult[] {
        const scoreMap = new Map<string, HybridProductResult>();

        // Process semantic results (score = similarity 0.0 - 1.0)
        semantic.forEach(p => {
            scoreMap.set(p.id, {
                id: p.id,
                title: p.title,
                description: p.description,
                price: Number(p.price),
                imageUrl: p.imageUrl,
                score: p.similarity,
                matchType: 'semantic',
            });
        });

        // Process lexical results
        lexical.forEach(p => {
            const primaryAsset = p.assets?.find(a => a.isPrimary);
            const existing = scoreMap.get(p.id);

            if (existing) {
                // Boost: appears in both searches
                existing.score = Math.min(existing.score + 0.3, 1.0);
                existing.matchType = 'hybrid';
            } else {
                scoreMap.set(p.id, {
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    price: Number(p.price),
                    imageUrl: primaryAsset?.url ?? null,
                    score: 0.5, // Base score for lexical-only matches
                    matchType: 'lexical',
                });
            }
        });

        // Sort by score descending
        return Array.from(scoreMap.values())
            .sort((a, b) => b.score - a.score);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Batch Semantic Search (existing)
    // ─────────────────────────────────────────────────────────────────────────

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
        } catch (error) {
            this.logger.error(`Search failed "${query}": ${error.message}`);
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
        const vector = await this.vectorService.generateEmbedding(query, 'RETRIEVAL_QUERY');
        return this.vectorService.toVectorString(vector);
    }

    private ensureServiceAvailable(): void {
        if (!this.vectorService.isAvailable()) {
            throw new Error('Semantic search unavailable. Configure GCP_PROJECT_ID.');
        }
    }
}
