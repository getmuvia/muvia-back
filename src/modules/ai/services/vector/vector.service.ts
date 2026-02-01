import { Injectable, Inject, Logger } from '@nestjs/common';
import type { IEmbeddingProvider, EmbeddingTaskType } from '../../interfaces/embedding-provider.interface';
import { EMBEDDING_PROVIDER } from '../../interfaces/embedding-provider.interface';

/**
 * Vector Service
 * 
 * High-level service for embedding operations.
 * Uses the injected IEmbeddingProvider for actual embedding generation.
 * 
 * This service acts as an orchestrator and adds utility methods like:
 * - Vector string conversion for database storage
 * - Availability checking
 * 
 * The actual embedding generation is delegated to the provider,
 * allowing easy swapping of embedding backends.
 */
@Injectable()
export class VectorService {
    private readonly logger = new Logger(VectorService.name);

    constructor(
        @Inject(EMBEDDING_PROVIDER)
        private readonly embeddingProvider: IEmbeddingProvider,
    ) { }

    /**
     * Checks if the embedding provider is ready.
     */
    isAvailable(): boolean {
        return this.embeddingProvider.isAvailable();
    }

    /**
     * Generates an embedding vector for the given text.
     * 
     * @param text - Text to embed
     * @param taskType - Type of task (affects embedding optimization)
     * @returns Embedding vector as number array
     */
    async generateEmbedding(
        text: string,
        taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'
    ): Promise<number[]> {
        const result = await this.embeddingProvider.generateEmbedding(text, taskType);
        return result.embedding;
    }

    /**
     * Converts an embedding array to a JSON string for database storage.
     * 
     * @param embedding - Embedding vector
     * @returns JSON string representation
     */
    toVectorString(embedding: number[]): string {
        return JSON.stringify(embedding);
    }
}
