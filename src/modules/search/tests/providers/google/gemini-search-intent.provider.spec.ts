import { ThinkingLevel } from '@google/genai';
import { ConfigService } from '@nestjs/config';
import { ProductDimension } from '../../../../../common/search/product-measurement';
import { GeminiSearchIntentProvider } from '../../../providers/google/gemini-search-intent.provider';

const mockGenerateContent = jest.fn();
const mockGoogleGenAIConstructor = jest.fn();

jest.mock('@google/genai', () => {
  const actual =
    jest.requireActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: class {
      readonly models = { generateContent: mockGenerateContent };

      constructor(options: unknown) {
        mockGoogleGenAIConstructor(options);
      }
    },
  };
});

describe('GeminiSearchIntentProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        category: 'escritorio',
        measurement: {
          dimension: ProductDimension.WIDTH,
          maxDimensionCm: 100,
        },
      }),
    });
  });

  it('uses the dedicated low-cost model with structured output and minimal thinking', async () => {
    const configuration: Record<string, string | number | boolean> = {
      GCP_PROJECT_ID: 'muvia-project',
      GCP_SEARCH_INTENT_LOCATION: 'global',
      GCP_SEARCH_INTENT_MODEL: 'gemini-3.1-flash-lite',
      SEARCH_INTENT_AI_ENABLED: true,
      SEARCH_INTENT_TIMEOUT_MS: 2500,
    };
    const configService = {
      get: jest.fn(
        (key: string, fallback?: unknown) => configuration[key] ?? fallback,
      ),
      getOrThrow: jest.fn((key: string) => {
        const value = configuration[key];
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      }),
    } as unknown as ConfigService;

    const provider = new GeminiSearchIntentProvider(configService);
    await expect(
      provider.interpret({ query: 'escritorio de 100 cm', locale: 'es-BO' }),
    ).resolves.toEqual({
      category: 'escritorio',
      measurement: {
        dimension: ProductDimension.WIDTH,
        maxDimensionCm: 100,
      },
    });

    expect(mockGoogleGenAIConstructor).toHaveBeenCalledWith({
      vertexai: true,
      project: 'muvia-project',
      location: 'global',
    });
    const calls = mockGenerateContent.mock.calls as unknown[][];
    const request = calls[0]?.[0] as {
      model: string;
      config: {
        maxOutputTokens: number;
        responseMimeType: string;
        thinkingConfig: { thinkingLevel: ThinkingLevel };
        httpOptions: { timeout: number };
      };
    };
    expect(request.model).toBe('gemini-3.1-flash-lite');
    expect(request.config).toMatchObject({
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      httpOptions: { timeout: 2500 },
    });
  });
});
