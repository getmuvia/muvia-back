import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';

export type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';

@Injectable()
export class VectorService implements OnModuleInit {
    private readonly logger = new Logger(VectorService.name);
    private model: any;
    private initialized = false;

    private readonly EMBEDDING_MODEL = 'text-embedding-004';
    private readonly DEFAULT_LOCATION = 'us-central1';

    constructor(private readonly configService: ConfigService) { }

    onModuleInit(): void {
        this.initialize();
    }

    isAvailable(): boolean {
        return this.initialized;
    }

    /**
     * Genera un embedding.
     * IMPORTANTE: Usa 'RETRIEVAL_DOCUMENT' cuando guardes en BD (hidratación).
     * Usa 'RETRIEVAL_QUERY' cuando el usuario busque en el frontend.
     */
    async generateEmbedding(text: string, taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
        this.ensureInitialized();
        const cleanText = this.sanitizeText(text);

        try {
            const result = await this.model.embedContent({
                content: { role: 'user', parts: [{ text: cleanText }] },
                taskType: taskType, 
                title: taskType === 'RETRIEVAL_DOCUMENT' ? 'Product Description' : undefined
            });

            if (!result.embedding || !result.embedding.values) {
                throw new Error('Vertex AI returned empty embedding');
            }

            return result.embedding.values;
        } catch (error) {
            this.logger.error(`API call failed for text: "${cleanText.substring(0, 20)}..." - ${error.message}`);
            throw new InternalServerErrorException(`Embedding failed: ${error.message}`);
        }
    }

    /**
     * Helper para convertir arrays al formato string de pgvector '[1,2,3]'
     */
    toVectorString(embedding: number[]): string {
        return JSON.stringify(embedding);
    }

    private initialize(): void {
        const projectId = this.configService.get<string>('GCP_PROJECT_ID');
        const location = this.configService.get<string>('GCP_LOCATION') || this.DEFAULT_LOCATION;

        if (!projectId) {
            this.logger.error('GCP_PROJECT_ID not configured. VectorService disabled.');
            return;
        }

        try {
            const vertexAI = new VertexAI({ project: projectId, location });
            this.model = vertexAI.getGenerativeModel({ model: this.EMBEDDING_MODEL });
            this.initialized = true;
            this.logger.log(`✅ VectorService initialized with model ${this.EMBEDDING_MODEL}`);
        } catch (err) {
            this.logger.error(`Failed to initialize Vertex AI: ${err.message}`);
        }
    }

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new InternalServerErrorException('VectorService not ready. Check logs for initialization errors.');
        }
    }

    private sanitizeText(text: string): string {
        if (!text) throw new InternalServerErrorException('Cannot embed empty text');

        return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
}
