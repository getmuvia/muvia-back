/**
 * Task type for embedding generation.
 * Different task types optimize the embedding for specific use cases.
 */
export type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';

/**
 * Result from embedding generation.
 */
export interface EmbeddingResult {
    /** The embedding vector */
    embedding: number[];
    /** Dimensionality of the embedding */
    dimensions: number;
}

/**
 * Port interface for embedding providers.
 *
 * Implements the Ports & Adapters (Hexagonal) pattern to allow
 * swapping embedding providers without changing business logic.
 *
 * Current implementations:
 * - VertexEmbeddingProvider (Google Vertex AI text-embedding-004)
 *
 * Future implementations could include:
 * - OpenAI Embeddings
 * - Cohere Embeddings
 * - Local models (sentence-transformers)
 *
 * @example
 * ```typescript
 * @Inject(EMBEDDING_PROVIDER)
 * private readonly embeddingProvider: IEmbeddingProvider
 * ```
 */
export interface IEmbeddingProvider {
    /**
     * Generates an embedding vector for the given text.
     *
     * @param text - Text to embed
     * @param taskType - Type of task (affects embedding optimization)
     * @returns Embedding result with vector and metadata
     */
    generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<EmbeddingResult>;

    /**
     * Checks if the provider is ready to generate embeddings.
     */
    isAvailable(): boolean;
}

/**
 * Injection token for EmbeddingProvider.
 * Use this token to inject the embedding provider in services.
 *
 * @example
 * ```typescript
 * constructor(@Inject(EMBEDDING_PROVIDER) private embeddings: IEmbeddingProvider) {}
 * ```
 */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
