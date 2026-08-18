# Itera Back (NestJS)

Welcome! This is the backend API for Itera, built with NestJS, TypeORM, PostgreSQL, and Google AI services.

It includes:
- Authentication (JWT)
- Users, products, categories, and files modules
- AI features (semantic embeddings, vision, image generation, virtual staging)

## Quick Start

### 1) Prerequisites

Make sure you have:
- Node.js 20+
- npm 10+
- PostgreSQL 14+ (local) or Cloud SQL (Google Cloud)
- A Google Cloud project with required APIs enabled

### 2) Install dependencies

```bash
npm install
```

### 3) Create your `.env`

Create a `.env` file in the project root and start with this template:

```env
NODE_ENV=development
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=CHANGE_ME
DB_NAME=postgres

JWT_SECRET=CHANGE_ME_SUPER_SECRET
JWT_EXPIRATION=24h

GOOGLE_STORAGE_BUCKET=your-bucket-name

GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=global
GCP_GEMINI_MODEL=gemini-3-pro-preview

GCP_IMAGEN_LOCATION=global
GCP_IMAGEN_MODEL=gemini-3-pro-image-preview

GCP_EMBEDDING_LOCATION=us-central1
GCP_EMBEDDING_MODEL=text-embedding-004
```

### 4) Run in development

```bash
npm run start:dev
```

API default URL: `http://localhost:3000`

---

## Environment Variables Explained

This project validates core env vars with Nest Config + Joi and also reads additional AI/storage settings directly from the config service.

### Database

- `DB_HOST`
  - Local Postgres: `127.0.0.1`
  - Cloud Run + Cloud SQL socket: `/cloudsql/PROJECT_ID:REGION:INSTANCE`
- `DB_PORT`: usually `5432`
- `DB_USERNAME`: Postgres username
- `DB_PASSWORD`: Postgres password
- `DB_NAME`: database name

### Security

- `JWT_SECRET`: secret key used to sign access tokens
- `JWT_EXPIRATION`: token TTL (examples: `24h`, `12h`, `7d`)

### Google Cloud Storage

- `GOOGLE_STORAGE_BUCKET`: bucket name used by the files module

### AI / Vertex / Gemini

- `GCP_PROJECT_ID`: your Google Cloud project ID
- `GCP_LOCATION`: location for Gemini Vision calls (often `global`)
- `GCP_GEMINI_MODEL`: Gemini model for vision/analysis
- `GCP_IMAGEN_LOCATION`: location for image generation
- `GCP_IMAGEN_MODEL`: model for generated images / virtual staging
- `GCP_EMBEDDING_LOCATION`: embeddings location (recommended `us-central1`)
- `GCP_EMBEDDING_MODEL`: embedding model (recommended `text-embedding-004`)

Note: the project currently uses Google Cloud Storage by default in the files module.

---

## How to Get Variables in Google Cloud

### Cloud SQL values

- `DB_HOST`
  - Cloud SQL connection name is in Cloud SQL > Instance > **Connection name**
  - Use `/cloudsql/PROJECT_ID:REGION:INSTANCE` in Cloud Run
  - Use `127.0.0.1` locally (with Cloud SQL Auth Proxy)
- `DB_USERNAME`, `DB_PASSWORD`: Cloud SQL > **Users**
- `DB_NAME`: Cloud SQL > **Databases**

### Storage value

- `GOOGLE_STORAGE_BUCKET`: Cloud Storage > **Buckets**

### AI values

- `GCP_PROJECT_ID`: Project settings in Google Cloud Console
- Model/location variables: choose available models/regions in Vertex AI model catalog

---

## Google Authentication (No Runtime Prompts)

To use Google services without interactive auth prompts:

### In cloud (recommended)

Run with a Service Account and grant minimum required roles:
- `roles/aiplatform.user`
- `roles/storage.objectAdmin` (or narrower storage roles)
- `roles/cloudsql.client` (if connecting to Cloud SQL)

### In local development

Option A (ADC):

```bash
gcloud auth application-default login
```

Option B (Service Account key file):

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

If using Cloud SQL locally, start Cloud SQL Auth Proxy and set `DB_HOST=127.0.0.1`.

---

## Available Scripts

```bash
# Development (watch mode)
npm run start:dev

# Standard start
npm run start

# Build
npm run build

# Run built app
npm run start:prod

# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov

# Lint
npm run lint
```

---

## Deployment Notes

- Primary target: Google Cloud (Cloud Run + Cloud SQL + GCS + Vertex/Gemini)

---

## Troubleshooting

- `JWT_SECRET is not configured`
  - Add `JWT_SECRET` to `.env`.

- `GOOGLE_STORAGE_BUCKET is not configured`
  - Add `GOOGLE_STORAGE_BUCKET`.

- `GCP_PROJECT_ID not configured`
  - Add `GCP_PROJECT_ID` and confirm credentials.

- DB connection errors in local mode
  - Verify Postgres is running and env values are correct.
  - If using Cloud SQL locally, verify Cloud SQL Auth Proxy is running.

---
