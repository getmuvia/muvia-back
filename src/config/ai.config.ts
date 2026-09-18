/**
 * Environment keys consumed by the Google AI providers.
 *
 * Keep model and location defaults here so validation, providers and tests share
 * one source of truth. Production must provide these values explicitly.
 */
export const AI_ENV_KEYS = {
  projectId: 'GCP_PROJECT_ID',
  visionLocation: 'GCP_LOCATION',
  visionModel: 'GCP_GEMINI_MODEL',
  imageLocation: 'GCP_IMAGEN_LOCATION',
  imageModel: 'GCP_IMAGEN_MODEL',
  embeddingLocation: 'GCP_EMBEDDING_LOCATION',
  embeddingModel: 'GCP_EMBEDDING_MODEL',
} as const;

/**
 * Local and test defaults. Production values are managed by infrastructure and
 * are required by the environment validation schema.
 *
 * Model migrations are intentionally handled in their own user stories.
 */
export const AI_DEVELOPMENT_DEFAULTS = {
  visionLocation: 'global',
  visionModel: 'gemini-3.5-flash-lite',
  imageLocation: 'global',
  imageModel: 'gemini-2.5-flash-image',
  embeddingLocation: 'us-central1',
  embeddingModel: 'text-embedding-004',
} as const;
