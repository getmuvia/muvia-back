import * as Joi from 'joi';
import { AI_DEVELOPMENT_DEFAULTS } from './ai.config';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  CORS_ALLOWED_ORIGINS: Joi.string().optional(),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRATION: Joi.string().default('24h'),
  JWT_ISSUER: Joi.string().default('muvia-api'),
  JWT_AUDIENCE: Joi.string().default('muvia-client'),

  GOOGLE_STORAGE_BUCKET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  GOOGLE_AI_STORAGE_BUCKET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // Google Cloud Platform - Vertex AI
  GCP_PROJECT_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  GCP_LOCATION: Joi.string().trim().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default(AI_DEVELOPMENT_DEFAULTS.visionLocation),
  }),
  GCP_GEMINI_MODEL: Joi.string().trim().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default(AI_DEVELOPMENT_DEFAULTS.visionModel),
  }),
  GCP_IMAGEN_LOCATION: Joi.string().trim().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default(AI_DEVELOPMENT_DEFAULTS.imageLocation),
  }),
  GCP_IMAGEN_MODEL: Joi.string().trim().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default(AI_DEVELOPMENT_DEFAULTS.imageModel),
  }),
  GCP_EMBEDDING_LOCATION: Joi.string().trim().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default(AI_DEVELOPMENT_DEFAULTS.embeddingLocation),
  }),
  GCP_EMBEDDING_MODEL: Joi.string().trim().min(1).when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default(AI_DEVELOPMENT_DEFAULTS.embeddingModel),
  }),
  GCP_3D_LOCATION: Joi.string().default('us-central1'),
  GCP_3D_WORKER_IMAGE_URI: Joi.string().optional(),
});

