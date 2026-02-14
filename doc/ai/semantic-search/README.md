# Semantic Search - Technical Documentation

## Overview

This document describes the implementation of **Semantic Search** for the Itera e-commerce platform. Unlike traditional keyword-based search, semantic search understands the *meaning* and *context* of user queries, enabling more intuitive and accurate product discovery.

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Technology Stack](#technology-stack)
4. [Implementation Details](#implementation-details)
5. [API Reference](#api-reference)
6. [Configuration](#configuration)
7. [Database Setup](#database-setup)
8. [Usage Examples](#usage-examples)
9. [Performance Considerations](#performance-considerations)
10. [Troubleshooting](#troubleshooting)

---

## Problem Statement

### Traditional Search Limitations

The previous search implementation used SQL `ILIKE` queries, which have several limitations:

| Issue | Example |
|-------|---------|
| **No semantic understanding** | Searching "furniture for sitting" won't find "chair" or "sofa" |
| **No typo tolerance** | "sofaa" won't match "sofa" |
| **Language barriers** | "couch" won't match "sofa" |
| **No context awareness** | "modern living room table" requires exact keyword matches |

### User Requirement

The user needed an intelligent search that accepts natural language descriptions like:
```json
[
  "light gray three-seat nordic-style sofa with wooden legs",
  "round glass coffee table with minimalist black metal frame",
  "large natural jute rug"
]
```

And returns semantically relevant products, even if they don't contain those exact words.

---

## Solution Architecture

```
┌─────────────────┐    ┌───────────────────────┐    ┌─────────────────┐
│   User Query    │───▶│VertexEmbeddingProvider│───▶│   Vertex AI     │
│ "nordic sofa"   │    │   (NestJS Provider)   │    │ text-embedding  │
└─────────────────┘    └───────────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Query Embedding │
                       │ [0.12, -0.34...] │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   PostgreSQL     │───▶│  Ranked Results │
                       │   pgvector       │    │  by Similarity  │
                       └──────────────────┘    └─────────────────┘
```

### Module Architecture

Following **Ports & Adapters** pattern and **NestJS best practices**:

```
src/modules/ai/
├── ai.module.ts
├── controllers/
│   ├── search.controller.ts
│   └── embedding.controller.ts
├── dto/
│   └── search-query.dto.ts
├── interfaces/
│   ├── search-result.interface.ts
│   └── embedding-provider.interface.ts
├── providers/
│   └── google/
│       └── vertex-embedding.provider.ts
├── repositories/
│   └── product-vector.repository.ts
└── services/
    ├── vector/
    │   └── vector.service.ts
    ├── embedding/
    │   └── embedding.service.ts
    └── search/
        └── search.service.ts
```

### Design Patterns Applied

| Pattern | Application |
|---------|-------------|
| **Ports & Adapters** | IEmbeddingProvider interface with VertexEmbeddingProvider adapter |
| **Single Responsibility** | Each service/repository has one reason to change |
| **Dependency Injection** | All dependencies injected via constructors |
| **Repository Pattern** | ProductVectorRepository encapsulates SQL queries |

---

## Technology Stack

### AI/ML: Google Vertex AI

| Aspect | Choice | Justification |
|--------|--------|---------------|
| **Provider** | Google Cloud Vertex AI | Consistent with existing GCP infrastructure |
| **Model** | `text-embedding-004` | State-of-the-art multilingual embedding model with 768 dimensions |
| **SDK** | `@google-cloud/aiplatform` | Official low-level Google Cloud AI Platform SDK for Node.js |

### Embedding Provider: VertexEmbeddingProvider

The `VertexEmbeddingProvider` implements `IEmbeddingProvider` interface:

```typescript
interface IEmbeddingProvider {
    generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<EmbeddingResult>;
    isAvailable(): boolean;
}

type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';

interface EmbeddingResult {
    embedding: number[];
    dimensions: number;
}
```

**Task Types:**
- `RETRIEVAL_DOCUMENT`: Used when generating embeddings for products (stored in DB)
- `RETRIEVAL_QUERY`: Used when generating embeddings for search queries

### Database: PostgreSQL + pgvector

| Component | Purpose |
|-----------|---------|
| **PostgreSQL** | Already used as the primary database |
| **pgvector** | Extension for storing and querying vector embeddings |
| **Cosine Distance** | Operator `<=>` for measuring similarity between vectors |

---

## Implementation Details

### Service Responsibilities

#### VertexEmbeddingProvider

Low-level Vertex AI client using `PredictionServiceClient`:

```typescript
@Injectable()
export class VertexEmbeddingProvider implements IEmbeddingProvider {
    async generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<EmbeddingResult>;
    isAvailable(): boolean;
}
```

Features:
- Uses regional API endpoint (e.g., `us-central1-aiplatform.googleapis.com`)
- Configurable via `GCP_EMBEDDING_LOCATION` and `GCP_EMBEDDING_MODEL`
- Automatic retry with exponential backoff
- Text sanitization

#### VectorService

Uses `IEmbeddingProvider` via dependency injection:

```typescript
@Injectable()
export class VectorService {
    constructor(
        @Inject(EMBEDDING_PROVIDER)
        private readonly embeddingProvider: IEmbeddingProvider
    ) {}

    async generateEmbedding(text: string, taskType?: string): Promise<number[]>;
    toVectorString(embedding: number[]): string;
    isAvailable(): boolean;
}
```

#### ProductVectorRepository

Encapsulates all pgvector SQL queries:

```typescript
async findBySimilarity(embedding: string, limit: number, threshold: number): Promise<SearchProductResult[]>
async updateEmbedding(productId: string, embedding: string): Promise<void>
async findWithoutEmbedding(): Promise<Product[]>
```

#### SearchService

Orchestrates semantic search:

```typescript
async searchBatch(dto: SearchQueryDto): Promise<SearchResult[]>
```

---

## API Reference

### POST `/ai/search`

Performs batch semantic search on products.

**Request Body:**
```json
{
  "queries": [
    "light gray three-seat nordic-style sofa",
    "round glass coffee table"
  ],
  "limit": 5,
  "threshold": 0.5
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `queries` | `string[]` | Yes | - | Natural language search queries (1-10 items) |
| `limit` | `number` | No | 5 | Max results per query (1-50) |
| `threshold` | `number` | No | 0.5 | Minimum similarity score (0-1) |

**Response:**
```json
[
  {
    "query": "light gray three-seat nordic-style sofa",
    "products": [
      {
        "id": "uuid-here",
        "title": "Scandinavian 3-Seater Sofa",
        "description": "...",
        "price": 1299.99,
        "similarity": 0.89,
        "imageUrl": "https://..."
      }
    ]
  }
]
```

### POST `/ai/embeddings/regenerate`

Regenerates embeddings for all products without one. Requires authentication.

**Response:**
```json
{
  "updated": 42,
  "failed": 0
}
```

---

## Configuration

### Environment Variables

```env
# Google Cloud Platform
GCP_PROJECT_ID=your-gcp-project-id

# Embedding-specific (separate from Vision/Image Generation)
GCP_EMBEDDING_LOCATION=us-central1
GCP_EMBEDDING_MODEL=text-embedding-004
```

> **Important:** Embedding models do NOT support the 'global' endpoint. Always use regional endpoints like `us-central1`.

### Authentication

Vertex AI uses **Application Default Credentials (ADC)**. Ensure:

1. **Local Development:** Run `gcloud auth application-default login`
2. **Cloud Run:** Service account has `Vertex AI User` role

---

## Database Setup

### Enable pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Verify Column Creation

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'embedding';
```

---

## Usage Examples

### Basic Search

```bash
curl -X POST http://localhost:3000/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "queries": ["ergonomic office chair"]
  }'
```

### Multiple Queries

```bash
curl -X POST http://localhost:3000/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      "storage cabinet for clothes",
      "modern floor lamp"
    ],
    "limit": 10,
    "threshold": 0.6
  }'
```

---

## Performance Considerations

### Embedding Dimensions

| Model | Dimensions | Storage per product |
|-------|------------|---------------------|
| text-embedding-004 | 768 | ~6 KB |

### Indexing (Recommended for Production)

For databases with >10,000 products:

```sql
CREATE INDEX ON products 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
```

---

## Troubleshooting

### "VertexEmbeddingProvider not ready"

**Cause:** Missing environment variable or initialization failed.

**Fix:** Check `GCP_PROJECT_ID` and `GCP_EMBEDDING_LOCATION` are set correctly.

### "404 Not Found" on embedding generation

**Cause:** Using `global` endpoint for embeddings.

**Fix:** Set `GCP_EMBEDDING_LOCATION=us-central1` (embedding models don't support global).

### "Permission denied for Vertex AI"

**Cause:** Service account lacks permissions.

**Fix:** Grant `roles/aiplatform.user` to your service account.

### Low-Quality Search Results

**Fixes:**
1. Lower the `threshold` parameter (e.g., 0.3)
2. Ensure products have detailed `description` and `keywords`
3. Run `/ai/embeddings/regenerate` after improving product data

---

## Future Enhancements

- [ ] **Hybrid Search:** Combine semantic + keyword search
- [ ] **Query Expansion:** Automatically expand queries with synonyms
- [ ] **Category Filtering:** Filter semantic results by category
- [ ] **Personalization:** Boost results based on user preferences
