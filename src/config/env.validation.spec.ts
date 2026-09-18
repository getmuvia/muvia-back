import { AI_DEVELOPMENT_DEFAULTS } from './ai.config';
import { envValidationSchema } from './env.validation';

const baseEnvironment = {
  DB_HOST: 'localhost',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_NAME: 'postgres',
  JWT_SECRET: 'a'.repeat(32),
};

describe('envValidationSchema AI configuration', () => {
  it('uses the HU2 Gemini model and supported global location by default', () => {
    expect(AI_DEVELOPMENT_DEFAULTS.visionModel).toBe('gemini-3.5-flash-lite');
    expect(AI_DEVELOPMENT_DEFAULTS.visionLocation).toBe('global');
  });

  it('uses the recommended HU3 image model and global location by default', () => {
    expect(AI_DEVELOPMENT_DEFAULTS.imageModel).toBe('gemini-3.1-flash-image');
    expect(AI_DEVELOPMENT_DEFAULTS.imageLocation).toBe('global');
  });

  it('uses the recommended HU4 text embedding model and regional endpoint', () => {
    expect(AI_DEVELOPMENT_DEFAULTS.embeddingModel).toBe('gemini-embedding-001');
    expect(AI_DEVELOPMENT_DEFAULTS.embeddingLocation).toBe('us-central1');
  });

  it('applies the centralized defaults outside production', () => {
    const { error, value } = envValidationSchema.validate({
      ...baseEnvironment,
      NODE_ENV: 'development',
    });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      GCP_LOCATION: AI_DEVELOPMENT_DEFAULTS.visionLocation,
      GCP_GEMINI_MODEL: AI_DEVELOPMENT_DEFAULTS.visionModel,
      GCP_IMAGEN_LOCATION: AI_DEVELOPMENT_DEFAULTS.imageLocation,
      GCP_IMAGEN_MODEL: AI_DEVELOPMENT_DEFAULTS.imageModel,
      GCP_EMBEDDING_LOCATION: AI_DEVELOPMENT_DEFAULTS.embeddingLocation,
      GCP_EMBEDDING_MODEL: AI_DEVELOPMENT_DEFAULTS.embeddingModel,
    });
  });

  it('keeps explicit AI configuration instead of applying defaults', () => {
    const explicitConfiguration = {
      GCP_LOCATION: 'global',
      GCP_GEMINI_MODEL: 'custom-vision-model',
      GCP_IMAGEN_LOCATION: 'eu',
      GCP_IMAGEN_MODEL: 'custom-image-model',
      GCP_EMBEDDING_LOCATION: 'europe-west4',
      GCP_EMBEDDING_MODEL: 'custom-embedding-model',
    };

    const { error, value } = envValidationSchema.validate({
      ...baseEnvironment,
      NODE_ENV: 'test',
      ...explicitConfiguration,
    });

    expect(error).toBeUndefined();
    expect(value).toMatchObject(explicitConfiguration);
  });

  it('requires every AI model and location in production', () => {
    const { error } = envValidationSchema.validate(
      {
        ...baseEnvironment,
        NODE_ENV: 'production',
        GOOGLE_STORAGE_BUCKET: 'assets',
        GOOGLE_AI_STORAGE_BUCKET: 'ai-media',
        GCP_PROJECT_ID: 'muvia-project',
      },
      { abortEarly: false },
    );

    expect(error).toBeDefined();
    expect(error?.details.map((detail) => detail.path.join('.'))).toEqual(
      expect.arrayContaining([
        'GCP_LOCATION',
        'GCP_GEMINI_MODEL',
        'GCP_IMAGEN_LOCATION',
        'GCP_IMAGEN_MODEL',
        'GCP_EMBEDDING_LOCATION',
        'GCP_EMBEDDING_MODEL',
      ]),
    );
  });

  it('accepts an explicit production AI configuration', () => {
    const { error } = envValidationSchema.validate({
      ...baseEnvironment,
      NODE_ENV: 'production',
      GOOGLE_STORAGE_BUCKET: 'assets',
      GOOGLE_AI_STORAGE_BUCKET: 'ai-media',
      GCP_PROJECT_ID: 'muvia-project',
      GCP_LOCATION: 'us',
      GCP_GEMINI_MODEL: 'vision-model',
      GCP_IMAGEN_LOCATION: 'global',
      GCP_IMAGEN_MODEL: 'image-model',
      GCP_EMBEDDING_LOCATION: 'us-central1',
      GCP_EMBEDDING_MODEL: 'embedding-model',
    });

    expect(error).toBeUndefined();
  });
});
