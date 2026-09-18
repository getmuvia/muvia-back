import { ConfigService } from '@nestjs/config';
import { RetryService, ImageResolverService } from '../../core';
import { ROOM_ANALYSIS_PROMPT } from '../../prompts';
import { GeminiVisionProvider } from './gemini-vision.provider';

const mockGenerateContent = jest.fn();
const mockGoogleGenAIConstructor = jest.fn();

jest.mock('@google/genai', () => {
  const actual = jest.requireActual('@google/genai');

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

const validResponse = {
  roomType: 'living room',
  style: 'modern',
  emptyAreas: ['center'],
  suggestedFurniture: ['sofa'],
  colorPalette: ['beige'],
};

describe('GeminiVisionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(validResponse),
    });
  });

  it('uses the configured model and location with structured JSON output', async () => {
    const configuration: Record<string, string> = {
      GCP_PROJECT_ID: 'muvia-project',
      GCP_LOCATION: 'global',
      GCP_GEMINI_MODEL: 'gemini-3.5-flash-lite',
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
    const imageResolver = {
      validateSource: jest.fn(),
      toBase64: jest.fn().mockResolvedValue('base64-image'),
      inferMimeType: jest.fn().mockReturnValue('image/jpeg'),
    } as unknown as ImageResolverService;

    const provider = new GeminiVisionProvider(
      configService,
      retryService,
      imageResolver,
    );
    await expect(
      provider.analyzeRoom({ key: 'rooms/example.jpg' }),
    ).resolves.toEqual(validResponse);

    expect(mockGoogleGenAIConstructor).toHaveBeenCalledWith({
      vertexai: true,
      project: 'muvia-project',
      location: 'global',
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.5-flash-lite',
        config: {
          maxOutputTokens:
            ROOM_ANALYSIS_PROMPT.generationConfig.maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: ROOM_ANALYSIS_PROMPT.outputSchema,
        },
      }),
    );
    expect(mockGenerateContent.mock.calls[0][0].config).not.toHaveProperty(
      'temperature',
    );
  });
});
