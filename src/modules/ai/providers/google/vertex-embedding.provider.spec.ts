import { helpers } from '@google-cloud/aiplatform';
import { ConfigService } from '@nestjs/config';
import { AI_RUNTIME_SETTINGS } from '../../../../config/ai.config';
import { RetryService } from '../../core';
import { VertexEmbeddingProvider } from './vertex-embedding.provider';

const mockPredict = jest.fn();
const mockPredictionServiceClient = jest.fn();

jest.mock('@google-cloud/aiplatform', () => {
  const actual = jest.requireActual('@google-cloud/aiplatform');

  return {
    ...actual,
    PredictionServiceClient: class {
      readonly predict = mockPredict;

      constructor(options: unknown) {
        mockPredictionServiceClient(options);
      }
    },
  };
});

function createProvider(): VertexEmbeddingProvider {
  const configuration: Record<string, string> = {
    GCP_PROJECT_ID: 'muvia-project',
    GCP_EMBEDDING_LOCATION: 'us-central1',
    GCP_EMBEDDING_MODEL: 'gemini-embedding-001',
  };
  const configService = {
    get: jest.fn((key: string) => configuration[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = configuration[key];
      if (!value) throw new Error(`Missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
  const retryService = {
    withExponentialBackoff: jest.fn((operation: () => Promise<unknown>) =>
      operation(),
    ),
    isQuotaExceededError: jest.fn().mockReturnValue(false),
  } as unknown as RetryService;

  const provider = new VertexEmbeddingProvider(configService, retryService);
  provider.onModuleInit();
  return provider;
}

function predictionWith(values: number[]) {
  return {
    predictions: [helpers.toValue({ embeddings: { values } })!],
  };
}

describe('VertexEmbeddingProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests 768 dimensions and returns a normalized query embedding', async () => {
    const values = [3, 4, ...Array<number>(766).fill(0)];
    mockPredict.mockResolvedValue([predictionWith(values)]);
    const provider = createProvider();

    const result = await provider.generateEmbedding(
      '  sofa\nmoderno  ',
      'RETRIEVAL_QUERY',
    );

    expect(mockPredictionServiceClient).toHaveBeenCalledWith({
      apiEndpoint: 'us-central1-aiplatform.googleapis.com',
    });
    const request = mockPredict.mock.calls[0][0];
    expect(request.endpoint).toBe(
      'projects/muvia-project/locations/us-central1/publishers/google/models/gemini-embedding-001',
    );
    expect(helpers.fromValue(request.instances[0])).toEqual({
      content: 'sofa moderno',
      task_type: 'RETRIEVAL_QUERY',
    });
    expect(helpers.fromValue(request.parameters)).toEqual({
      autoTruncate: true,
      outputDimensionality: AI_RUNTIME_SETTINGS.embeddingDimensions,
    });
    expect(result.dimensions).toBe(768);
    expect(result.embedding.slice(0, 2)).toEqual([0.6, 0.8]);
    expect(
      Math.sqrt(
        result.embedding.reduce((sum, value) => sum + value * value, 0),
      ),
    ).toBeCloseTo(1);
  });

  it('rejects a vector that does not match the database dimensions', async () => {
    mockPredict.mockResolvedValue([predictionWith([1, 2, 3])]);
    const provider = createProvider();

    await expect(provider.generateEmbedding('sofa')).rejects.toThrow(
      'Embedding generation failed: Invalid embedding: expected 768 finite values',
    );
  });
});
