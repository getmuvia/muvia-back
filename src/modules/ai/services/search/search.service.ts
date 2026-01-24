import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { VectorService } from '../vector/vector.service';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';
import { SearchQueryDto } from '../../dto/search-query.dto';
import { SearchResult, SearchProductResult } from '../../interfaces/search-result.interface';

/**
 * Orchestrates semantic search operations.
 * Single Responsibility: Coordinates embedding generation and similarity search.
 */
@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);

    constructor(
        private readonly vectorService: VectorService,
        private readonly productVectorRepo: ProductVectorRepository,
    ) { }

    /**
     * Executes parallel semantic search for multiple queries.
     * Each query is processed concurrently for optimal performance.
     * * @param dto - Contains the list of queries and search parameters (limit, threshold).
     * @returns A promise resolving to an array of search results corresponding to each query.
     */
    async searchBatch(dto: SearchQueryDto): Promise<SearchResult[]> {
        this.ensureServiceAvailable();

        const { queries, limit = 5, threshold = 0.5 } = dto;

        return Promise.all(
            queries.map((query) => this.searchOne(query, limit, threshold)),
        );
    }

    /**
     * Processes a single search query safely.
     * Wraps the operation in a try-catch block to ensure that a failure in one query
     * does not crash the entire batch request.
     * * @param query - The text string to search for.
     * @param limit - Maximum number of results to return.
     * @param threshold - Minimum similarity score (0 to 1) required.
     * @returns The search result object (returns empty product list on error).
     */
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

    /**
     * Orchestrates the core search logic: converting text to vector and querying the DB.
     * * @param query - The search term.
     * @param limit - Max results.
     * @param threshold - Similarity cutoff.
     * @returns Array of products matching the semantic criteria.
     */
    private async findSimilarProducts(
        query: string,
        limit: number,
        threshold: number,
    ): Promise<SearchProductResult[]> {
        const embedding = await this.createQueryEmbedding(query);
        return this.productVectorRepo.findBySimilarity(embedding, limit, threshold);
    }

    /**
     * Generates the embedding specifically tailored for search queries.
     * Uses 'RETRIEVAL_QUERY' task type to align the vector space with the
     * 'RETRIEVAL_DOCUMENT' vectors stored in the database.
     * * @param query - The user's input text.
     * @returns The stringified vector ready for SQL operations.
     */
    private async createQueryEmbedding(query: string): Promise<string> {
        const vector = await this.vectorService.generateEmbedding(query, 'RETRIEVAL_QUERY');
        return this.vectorService.toVectorString(vector);
    }

    /**
     * Guard clause to ensure the underlying AI service is configured and ready.
     * * @throws BadRequestException if the VectorService is not initialized.
     */
    private ensureServiceAvailable(): void {
        if (!this.vectorService.isAvailable()) {
            throw new BadRequestException(
                'Semantic search unavailable. Configure GCP_PROJECT_ID.',
            );
        }
    }
}
