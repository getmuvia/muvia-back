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
     */
    async searchBatch(dto: SearchQueryDto): Promise<SearchResult[]> {
        this.ensureServiceAvailable();

        const { queries, limit = 5, threshold = 0.5 } = dto;

        return Promise.all(
            queries.map((query) => this.searchOne(query, limit, threshold)),
        );
    }

    /**
     * Processes a single search query.
     * Returns empty results on error to avoid failing the entire batch.
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

    private async findSimilarProducts(
        query: string,
        limit: number,
        threshold: number,
    ): Promise<SearchProductResult[]> {
        const embedding = await this.createQueryEmbedding(query);
        return this.productVectorRepo.findBySimilarity(embedding, limit, threshold);
    }

    private async createQueryEmbedding(query: string): Promise<string> {
        const vector = await this.vectorService.generateEmbedding(query);
        return this.vectorService.toVectorString(vector);
    }

    private ensureServiceAvailable(): void {
        if (!this.vectorService.isAvailable()) {
            throw new BadRequestException(
                'Semantic search unavailable. Configure GCP_PROJECT_ID.',
            );
        }
    }
}
