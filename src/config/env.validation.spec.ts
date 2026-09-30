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
  const taskEnvironment = {
    EMBEDDING_TASKS_ENABLED: 'true',
    GCP_PROJECT_ID: 'muvia-test',
    EMBEDDING_TASKS_QUEUE: 'muvia-embeddings',
    EMBEDDING_TASKS_TARGET_URL: 'https://muvia-back-test.run.app',
    EMBEDDING_TASKS_SERVICE_ACCOUNT:
      'invoker@muvia-test.iam.gserviceaccount.com',
  };

  it('requires a complete queue configuration when enabled', () => {
    const { error } = envValidationSchema.validate(
      {
        ...baseEnvironment,
        EMBEDDING_TASKS_ENABLED: true,
      },
      { abortEarly: false },
    );
    expect(error?.details.map((detail) => detail.path.join('.'))).toEqual(
      expect.arrayContaining([
        'GCP_PROJECT_ID',
        'EMBEDDING_TASKS_QUEUE',
        'EMBEDDING_TASKS_TARGET_URL',
        'EMBEDDING_TASKS_SERVICE_ACCOUNT',
      ]),
    );
  });

  it('accepts a complete task configuration and converts its flag to a boolean', () => {
    const result = envValidationSchema.validate({
      ...baseEnvironment,
      ...taskEnvironment,
    });
    expect(result.error).toBeUndefined();
    expect(
      (result.value as Record<string, unknown>).EMBEDDING_TASKS_ENABLED,
    ).toBe(true);
  });

  it.each([
    'http://muvia-back-test.run.app',
    'https://muvia-back-test.run.app/internal',
  ])('rejects an unsafe or mismatched task audience: %s', (url) => {
    const result = envValidationSchema.validate({
      ...baseEnvironment,
      ...taskEnvironment,
      EMBEDDING_TASKS_TARGET_URL: url,
    });
    expect(result.error).toBeDefined();
  });

  it('rejects an ordinary email as the task service account', () => {
    const result = envValidationSchema.validate({
      ...baseEnvironment,
      ...taskEnvironment,
      EMBEDDING_TASKS_SERVICE_ACCOUNT: 'user@example.com',
    });
    expect(result.error).toBeDefined();
  });

  it('disables public registration by default', () => {
    const result = envValidationSchema.validate(baseEnvironment);
    const value = result.value as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(value.PUBLIC_REGISTRATION_ENABLED).toBe(false);
  });

  it('accepts an explicit public registration setting', () => {
    const result = envValidationSchema.validate({
      ...baseEnvironment,
      PUBLIC_REGISTRATION_ENABLED: 'true',
    });
    const value = result.value as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(value.PUBLIC_REGISTRATION_ENABLED).toBe(true);
  });

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
    const result = envValidationSchema.validate({
      ...baseEnvironment,
      NODE_ENV: 'development',
    });
    const value = result.value as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(value).toMatchObject({
      GCP_LOCATION: AI_DEVELOPMENT_DEFAULTS.visionLocation,
      GCP_GEMINI_MODEL: AI_DEVELOPMENT_DEFAULTS.visionModel,
      GCP_IMAGEN_LOCATION: AI_DEVELOPMENT_DEFAULTS.imageLocation,
      GCP_IMAGEN_MODEL: AI_DEVELOPMENT_DEFAULTS.imageModel,
      GCP_EMBEDDING_LOCATION: AI_DEVELOPMENT_DEFAULTS.embeddingLocation,
      GCP_EMBEDDING_MODEL: AI_DEVELOPMENT_DEFAULTS.embeddingModel,
      GCP_SEARCH_INTENT_LOCATION: AI_DEVELOPMENT_DEFAULTS.searchIntentLocation,
      GCP_SEARCH_INTENT_MODEL: AI_DEVELOPMENT_DEFAULTS.searchIntentModel,
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
      GCP_SEARCH_INTENT_LOCATION: 'global',
      GCP_SEARCH_INTENT_MODEL: 'custom-search-intent-model',
    };

    const result = envValidationSchema.validate({
      ...baseEnvironment,
      NODE_ENV: 'test',
      ...explicitConfiguration,
    });
    const value = result.value as Record<string, unknown>;

    expect(result.error).toBeUndefined();
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
        'GCP_SEARCH_INTENT_LOCATION',
        'GCP_SEARCH_INTENT_MODEL',
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
      GCP_SEARCH_INTENT_LOCATION: 'global',
      GCP_SEARCH_INTENT_MODEL: 'search-intent-model',
    });

    expect(error).toBeUndefined();
  });
});
