import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRATION: Joi.string().default('24h'),
  JWT_ISSUER: Joi.string().default('muvia-api'),
  JWT_AUDIENCE: Joi.string().default('muvia-client'),

  // Google Cloud Platform - Vertex AI
  GCP_PROJECT_ID: Joi.string().optional(),
  GCP_LOCATION: Joi.string().default('us-central1'),
});

