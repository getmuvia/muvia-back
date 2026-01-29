import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictionServiceClient, helpers, protos } from '@google-cloud/aiplatform';
import { RetryService } from '../../core/retry';

export type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';

@Injectable()
export class VectorService implements OnModuleInit {
    private readonly logger = new Logger(VectorService.name);
    private client: PredictionServiceClient;
    private initialized = false;

    private projectId: string;
    private location: string;
    private readonly EMBEDDING_MODEL = 'text-embedding-004';
    private readonly DEFAULT_LOCATION = 'us-central1';

    constructor(
        private readonly configService: ConfigService,
        private readonly retryService: RetryService,
    ) { }

    onModuleInit(): void {
        this.initialize();
    }

    isAvailable(): boolean {
        return this.initialized;
    }

    async generateEmbedding(text: string, taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
        this.ensureInitialized();
        const cleanText = this.sanitizeText(text);

        const endpointResourceName = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.EMBEDDING_MODEL}`;

        const instanceValue = this.buildPredictionInstance(cleanText, taskType);

        if (!instanceValue) {
            throw new InternalServerErrorException('Failed to convert input to Protobuf format');
        }

        try {
            // Apply retry logic for 429s using RetryService
            return await this.retryService.withExponentialBackoff(
                async () => {
                    const [response] = await this.client.predict({
                        endpoint: endpointResourceName,
                        instances: [instanceValue as any],
                    });
                    return this.extractEmbeddingFromResponse(response);
                },
                {
                    operationName: `Vertex AI Embeddings (${this.EMBEDDING_MODEL})`,
                    isRetryable: (err) => this.retryService.isQuotaExceededError(err),
                },
            );
        } catch (error) {
            this.logger.error(`Vertex AI Prediction failed: ${error.message}`);
            throw new InternalServerErrorException(`Embedding generation failed: ${error.message}`);
        }
    }

    toVectorString(embedding: number[]): string {
        return JSON.stringify(embedding);
    }

    private initialize(): void {
        this.projectId = this.configService.get<string>('GCP_PROJECT_ID') ?? '';
        this.location = this.configService.get<string>('GCP_LOCATION') ?? this.DEFAULT_LOCATION;

        if (!this.projectId) {
            this.logger.error('GCP_PROJECT_ID not configured. VectorService disabled.');
            return;
        }

        try {
            const apiEndpoint = `${this.location}-aiplatform.googleapis.com`;

            this.client = new PredictionServiceClient({
                apiEndpoint: apiEndpoint,
            });

            this.initialized = true;
            this.logger.log(`✅ VectorService initialized (Low-Level Client) on ${this.location}`);
        } catch (err) {
            this.logger.error(`Failed to initialize PredictionServiceClient: ${err.message}`);
        }
    }

    private buildPredictionInstance(text: string, taskType: EmbeddingTaskType) {
        const instance: Record<string, any> = {
            content: text,
            task_type: taskType
        };

        if (taskType === 'RETRIEVAL_DOCUMENT') {
            instance.title = 'Product Description';
        }

        return helpers.toValue(instance);
    }

    private extractEmbeddingFromResponse(response: protos.google.cloud.aiplatform.v1.IPredictResponse): number[] {
        const predictions = response.predictions;

        if (!predictions || predictions.length === 0) {
            throw new Error('No predictions returned from Vertex AI');
        }

        const predictionResult = helpers.fromValue(predictions[0] as any) as any;

        if (!predictionResult || !predictionResult.embeddings || !predictionResult.embeddings.values) {
            throw new Error('Invalid response structure: missing embeddings.values');
        }

        return predictionResult.embeddings.values as number[];
    }

    private ensureInitialized(): void {
        if (!this.initialized || !this.client) {
            throw new InternalServerErrorException('VectorService not ready. Check logs for initialization errors.');
        }
    }

    private sanitizeText(text: string): string {
        if (!text) throw new InternalServerErrorException('Cannot embed empty text');
        return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
}
