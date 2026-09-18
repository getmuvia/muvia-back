import { Modality } from '@google/genai';
import { ConfigService } from '@nestjs/config';
import { RetryService, ImageResolverService } from '../../core';
import type { VirtualStagingStorageService } from '../../services/virtual-staging/virtual-staging-storage.service';
import { GeminiImageProvider } from './gemini-image.provider';

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

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({})),
}));

jest.mock(
  '../../services/virtual-staging/virtual-staging-storage.service',
  () => ({
    VirtualStagingStorageService: class {},
  }),
);

const storedImage = {
  key: 'virtual-staging/results/user-1/result.png',
  url: 'https://storage.example/result.png',
  urlExpiresAt: '2026-09-18T20:00:00.000Z',
};

function createProvider() {
  const configuration: Record<string, string> = {
    GCP_PROJECT_ID: 'muvia-project',
    GCP_IMAGEN_LOCATION: 'global',
    GCP_IMAGEN_MODEL: 'gemini-3.1-flash-image',
    GOOGLE_AI_STORAGE_BUCKET: 'private-ai-media',
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
    toBase64: jest.fn().mockResolvedValue('input-base64'),
    inferMimeType: jest.fn().mockReturnValue('image/png'),
  } as unknown as ImageResolverService;
  const stagingStorage = {
    storeGeneratedImage: jest.fn().mockResolvedValue(storedImage),
  } as unknown as VirtualStagingStorageService;

  return {
    provider: new GeminiImageProvider(
      configService,
      retryService,
      imageResolver,
      stagingStorage,
    ),
    stagingStorage,
  };
}

describe('GeminiImageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Generated the staged room.' },
              {
                inlineData: { mimeType: 'image/png', data: 'generated-base64' },
              },
            ],
          },
        },
      ],
    });
  });

  it('uses the recommended model, location, and multimodal image configuration', async () => {
    const { provider, stagingStorage } = createProvider();

    await expect(
      provider.generate({
        ownerId: 'user-1',
        imageSource: { key: 'virtual-staging/uploads/user-1/room.png' },
        referenceImages: ['https://catalog.example/sofa.jpg'],
        prompt: 'Stage this room with the referenced sofa.',
        aspectRatio: '16:9',
      }),
    ).resolves.toMatchObject({
      imageUrl: storedImage.url,
      imageKey: storedImage.key,
      imageUrlExpiresAt: storedImage.urlExpiresAt,
      metadata: { model: 'gemini-3.1-flash-image' },
    });

    expect(mockGoogleGenAIConstructor).toHaveBeenCalledWith({
      vertexai: true,
      project: 'muvia-project',
      location: 'global',
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.1-flash-image',
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
          candidateCount: 1,
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '1K',
          },
        },
      }),
    );
    expect(mockGenerateContent.mock.calls[0][0].config).not.toHaveProperty(
      'temperature',
    );
    expect(stagingStorage.storeGeneratedImage).toHaveBeenCalledWith(
      'generated-base64',
      'user-1',
    );
  });

  it('returns a controlled error when the model does not include an image', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        { content: { parts: [{ text: 'No image was generated.' }] } },
      ],
    });
    const { provider } = createProvider();

    await expect(
      provider.generate({
        ownerId: 'user-1',
        imageSource: { url: 'https://uploads.example/room.jpg' },
        prompt: 'Stage this room.',
        aspectRatio: '4:3',
      }),
    ).rejects.toThrow(
      'Virtual Staging failed: Model response did not include an image',
    );
  });
});
