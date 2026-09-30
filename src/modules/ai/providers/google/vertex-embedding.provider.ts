import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PredictionServiceClient,
  helpers,
  protos,
} from '@google-cloud/aiplatform';
import {
  IEmbeddingProvider,
  EmbeddingResult,
  EmbeddingTaskType,
} from '../../interfaces/embedding-provider.interface';
import { RetryService } from '../../core/retry';
import { AI_ENV_KEYS, AI_RUNTIME_SETTINGS } from '../../../../config/ai.config';

@Injectable()
export class VertexEmbeddingProvider
  implements IEmbeddingProvider, OnModuleInit
{
  private readonly logger = new Logger(VertexEmbeddingProvider.name);
  private client: PredictionServiceClient;
  private initialized = false;

  private readonly projectId: string;
  private readonly location: string;
  private readonly MODEL_NAME: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly retryService: RetryService,
  ) {
    this.projectId =
      this.configService.get<string>(AI_ENV_KEYS.projectId) ?? '';
    this.location = this.configService.getOrThrow<string>(
      AI_ENV_KEYS.embeddingLocation,
    );
    this.MODEL_NAME = this.configService.getOrThrow<string>(
      AI_ENV_KEYS.embeddingModel,
    );
  }

  onModuleInit(): void {
    this.initialize();
  }

  isAvailable(): boolean {
    return this.initialized;
  }

  async generateEmbedding(
    text: string,
    taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT',
  ): Promise<EmbeddingResult> {
    this.ensureInitialized();
    const cleanText = this.sanitizeText(text);
    const endpointResourceName = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.MODEL_NAME}`;
    const instanceValue = this.buildPredictionInstance(cleanText, taskType);
    const parameters = helpers.toValue({
      autoTruncate: true,
      outputDimensionality: AI_RUNTIME_SETTINGS.embeddingDimensions,
    });

    if (!instanceValue)
      throw new Error('Failed to convert input to Protobuf format');
    if (!parameters)
      throw new Error('Failed to convert parameters to Protobuf format');

    try {
      const embedding = await this.retryService.withExponentialBackoff(
        async () => {
          const [response] = await this.client.predict(
            {
              endpoint: endpointResourceName,
              instances: [instanceValue as protos.google.protobuf.IValue],
              parameters: parameters as protos.google.protobuf.IValue,
            },
            { timeout: 30_000, retry: null },
          );
          const values = this.extractEmbeddingFromResponse(response);
          return this.validateAndNormalizeEmbedding(values);
        },
        {
          operationName: `Vertex AI Embeddings (${this.MODEL_NAME})`,
          isRetryable: (err) => this.retryService.isQuotaExceededError(err),
        },
      );

      return { embedding, dimensions: embedding.length };
    } catch (error: unknown) {
      this.logger.error(
        `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Preserve the provider code so the durable worker can classify failures.
      throw error;
    }
  }

  private initialize(): void {
    if (!this.projectId) {
      this.logger.error('GCP_PROJECT_ID not configured');
      return;
    }

    try {
      this.client = new PredictionServiceClient({
        apiEndpoint: `${this.location}-aiplatform.googleapis.com`,
      });
      this.initialized = true;
      this.logger.log(
        `✅ VertexEmbeddingProvider initialized (${this.MODEL_NAME} @ ${this.location})`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildPredictionInstance(text: string, taskType: EmbeddingTaskType) {
    const instance: Record<string, string> = {
      content: text,
      task_type: taskType,
    };
    if (taskType === 'RETRIEVAL_DOCUMENT')
      instance.title = 'Product Description';
    return helpers.toValue(instance);
  }

  private extractEmbeddingFromResponse(
    response: protos.google.cloud.aiplatform.v1.IPredictResponse,
  ): number[] {
    const predictions = response.predictions;
    if (!predictions || predictions.length === 0)
      throw new Error('No predictions returned');

    const predictionResult: unknown = helpers.fromValue(
      predictions[0] as Parameters<typeof helpers.fromValue>[0],
    );
    if (
      !predictionResult ||
      typeof predictionResult !== 'object' ||
      !('embeddings' in predictionResult)
    ) {
      throw new Error('Invalid response structure');
    }
    const embeddings: unknown = predictionResult.embeddings;
    if (
      !embeddings ||
      typeof embeddings !== 'object' ||
      !('values' in embeddings)
    ) {
      throw new Error('Invalid response structure');
    }
    const values: unknown = embeddings.values;
    if (
      !Array.isArray(values) ||
      !values.every(
        (value: unknown): value is number => typeof value === 'number',
      )
    ) {
      throw new Error('Invalid response structure');
    }
    return values;
  }

  private validateAndNormalizeEmbedding(values: number[]): number[] {
    if (
      values.length !== AI_RUNTIME_SETTINGS.embeddingDimensions ||
      values.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Invalid embedding: expected ${AI_RUNTIME_SETTINGS.embeddingDimensions} finite values`,
      );
    }

    const magnitude = Math.sqrt(
      values.reduce((sum, value) => sum + value * value, 0),
    );
    if (!Number.isFinite(magnitude) || magnitude === 0) {
      throw new Error('Invalid embedding: zero or non-finite magnitude');
    }

    return values.map((value) => value / magnitude);
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('VertexEmbeddingProvider not ready');
    }
  }

  private sanitizeText(text: string): string {
    if (!text) throw new Error('Cannot embed empty text');
    return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
