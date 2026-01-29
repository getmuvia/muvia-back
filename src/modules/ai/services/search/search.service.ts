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
import { SEARCH } from '../../constants';

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
        @Inject(forwardRef(() => ProductsService))
        private readonly productsService: ProductsService,
    ) { }

    /**
     * Hybrid search: Combines semantic (AI) and lexical (text) search in parallel.
     * Uses a fetch multiplier to ensure the best results aren't missed.
     */
    async searchHybrid(dto: HybridSearchDto): Promise<HybridSearchResponse> {
        const { query, limit = SEARCH.DEFAULT_LIMIT } = dto;
        const fetchLimit = limit * SEARCH.FETCH_MULTIPLIER;

        // Execute BOTH searches in PARALLEL
        const [semanticResults, lexicalResults] = await Promise.all([
            this.performSemanticSearch(query, fetchLimit),
            this.performLexicalSearch(query, fetchLimit),
        ]);

        // Merge and rank results
        const merged = this.mergeResults(semanticResults, lexicalResults, query);

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
            return this.productVectorRepo.findBySimilarity(embedding, limit, SEARCH.DEFAULT_SIMILARITY_THRESHOLD);
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

    private mergeResults(
        semantic: SearchProductResult[],
        lexical: Product[],
        query: string,
    ): HybridProductResult[] {
        const scoreMap = new Map<string, HybridProductResult>();

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

        lexical.forEach(p => {
            const primaryAsset = p.assets?.find(a => a.isPrimary);
            const existing = scoreMap.get(p.id);
            const lexicalScore = this.calculateLexicalScore(p, query);

            if (existing) {
                existing.score = Math.min(existing.score + SEARCH.SCORE_BOOSTS.HYBRID_MATCH, 1.0);
                existing.matchType = 'hybrid';
            } else {
                scoreMap.set(p.id, {
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    price: Number(p.price),
                    imageUrl: primaryAsset?.url ?? null,
                    score: lexicalScore,
                    matchType: 'lexical',
                });
            }
        });

        return Array.from(scoreMap.values())
            .sort((a, b) => b.score - a.score);
    }

/**
     * Calculates a lexical score (0.0 - 1.0) based on text matching quality.
     * * Scoring Algorithm:
     * - Exact Title Match: 1.0 (Immediate return)
     * - Keyword Density: Weighted (65% Title, 35% Description) using regex boundaries.
     * - Smart Boosters:
     * 1. Global Completeness (+0.2): All query words are present (split across title/desc).
     * 2. Phrase Match (+0.1): Exact phrase found in description.
     * 3. Partial Title (+0.15): Title contains the query as a continuous substring.
     * * @param product - The product to evaluate.
     * @param query - The search text from the user.
     * @returns Normalized score capped at 1.0 (Returns 0 if no keywords match).
     */
    private calculateLexicalScore(product: Product, query: string): number {
        const cleanQuery = query.toLowerCase().trim();
        const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);

        if (queryWords.length === 0) return 0;

        const lowerTitle = product.title.toLowerCase();
        const lowerDesc = product.description?.toLowerCase() ?? '';

        if (lowerTitle === cleanQuery) return 1.0;

        const uniqueQueryWords = [...new Set(queryWords)];
        const wordsFoundInTitle = new Set<string>();
        const wordsFoundInDesc = new Set<string>();

        uniqueQueryWords.forEach(word => {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');

            if (regex.test(lowerTitle)) wordsFoundInTitle.add(word);
            if (regex.test(lowerDesc)) wordsFoundInDesc.add(word);
        });

        const titleScore = (wordsFoundInTitle.size / uniqueQueryWords.length) * SEARCH.LEXICAL_WEIGHTS.TITLE;
        const descScore = (wordsFoundInDesc.size / uniqueQueryWords.length) * SEARCH.LEXICAL_WEIGHTS.DESCRIPTION;

        let totalScore = titleScore + descScore;

        const allWordsFound = uniqueQueryWords.every(w =>
            wordsFoundInTitle.has(w) || wordsFoundInDesc.has(w)
        );
        if (allWordsFound) {
            totalScore += SEARCH.SCORE_BOOSTS.ALL_WORDS_FOUND;
        }

        if (lowerDesc.includes(cleanQuery)) {
            totalScore += SEARCH.SCORE_BOOSTS.PHRASE_IN_DESCRIPTION;
        }

        if (lowerTitle.includes(cleanQuery)) {
            totalScore += SEARCH.SCORE_BOOSTS.PARTIAL_TITLE_MATCH;
        }

        return Math.min(parseFloat(totalScore.toFixed(2)), 1.0);
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
