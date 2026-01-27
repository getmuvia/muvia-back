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
| **No typo tolerance** | "sofá" won't match "sofa" |
| **Language barriers** | "couch" won't match "sofá" |
| **No context awareness** | "modern living room table" requires exact keyword matches |

### User Requirement

The user needed an intelligent search that accepts natural language descriptions like:
```json
[
  "sofá de tres plazas estilo nórdico color gris claro con patas de madera",
  "mesa de centro redonda de vidrio y metal negro minimalista",
  "alfombra grande de yute textura natural"
]
```

And returns semantically relevant products, even if they don't contain those exact words.

---

## Solution Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Query    │───▶│   VectorService  │───▶│   Vertex AI     │
│ "sofá nórdico"  │    │  (NestJS Service)│    │ text-embedding  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
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

Following **SOLID principles** and **NestJS best practices**:

```
src/modules/ai/
├── ai.module.ts                           # Module registration
├── controllers/
│   ├── search.controller.ts               # Search API endpoints
│   └── embedding.controller.ts            # Admin embedding endpoints
├── dto/
│   └── search-query.dto.ts                # Request validation
├── interfaces/
│   └── search-result.interface.ts         # Response types
├── repositories/
│   └── product-vector.repository.ts       # pgvector SQL queries (SRP)
└── services/
    ├── vector/
    │   └── vector.service.ts              # Vertex AI client (SRP)
    ├── embedding/
    │   └── embedding.service.ts           # Embedding orchestration (SRP)
    └── search/
        └── search.service.ts              # Search orchestration (SRP)
```

### Design Patterns Applied

| Pattern | Application |
|---------|-------------|
| **Single Responsibility** | Each service/repository has one reason to change |
| **Dependency Injection** | All dependencies injected via constructors |
| **Repository Pattern** | ProductVectorRepository encapsulates SQL queries |
| **Layered Architecture** | Controller → Service → Repository |

---

## Technology Stack

### AI/ML: Google Vertex AI

| Aspect | Choice | Justification |
|--------|--------|---------------|
| **Provider** | Google Cloud Vertex AI | Consistent with existing GCP infrastructure (Cloud Run, Cloud SQL) |
| **Model** | `text-embedding-004` | State-of-the-art multilingual embedding model with 768 dimensions |
| **SDK** | `@google-cloud/aiplatform` | Official low-level Google Cloud AI Platform SDK for Node.js |

**Why Vertex AI over alternatives?**

| Option | Pros | Cons |
|--------|------|------|
| **OpenAI** | Excellent quality | Additional vendor, separate billing |
| **Gemini API** | Easy to use | Less enterprise features |
| **Vertex AI** ✓ | GCP-native, IAM integration, no separate API key needed | Slightly more complex setup |

### Database: PostgreSQL + pgvector

| Component | Purpose |
|-----------|---------|
| **PostgreSQL** | Already used as the primary database |
| **pgvector** | Extension for storing and querying vector embeddings |
| **Cosine Distance** | Operator `<=>` for measuring similarity between vectors |

**Why pgvector over dedicated vector databases?**

| Option | Pros | Cons |
|--------|------|------|
| **Pinecone** | Managed, fast | Additional service, data sync complexity |
| **Milvus** | Feature-rich | Operational overhead |
| **pgvector** ✓ | No infrastructure changes, ACID transactions, joins with product data | Slightly slower at very large scale |

---

## Implementation Details

### Service Responsibilities

#### VectorService
Low-level Vertex AI client using `PredictionServiceClient` from `@google-cloud/aiplatform`:
- Connecting to Vertex AI via regional API endpoint
- Generating embeddings with configurable task types
- Using `helpers.toValue()` and `helpers.fromValue()` for Protobuf conversion
- Text sanitization

```typescript
// vector.service.ts
type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';

async generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<number[]>
toVectorString(embedding: number[]): string
isAvailable(): boolean
```

> **Task Types:**
> - `RETRIEVAL_DOCUMENT`: Used when generating embeddings for products (stored in DB)
> - `RETRIEVAL_QUERY`: Used when generating embeddings for search queries

#### ProductVectorRepository
Encapsulates all pgvector SQL queries:
- Similarity search with cosine distance
- Embedding CRUD operations

```typescript
// product-vector.repository.ts
async findBySimilarity(embedding: string, limit: number, threshold: number): Promise<SearchProductResult[]>
async updateEmbedding(productId: string, embedding: string): Promise<void>
async findWithoutEmbedding(): Promise<Product[]>
```

#### EmbeddingService
Orchestrates embedding generation:
- Combines product text fields
- Delegates to VectorService and Repository

```typescript
// embedding.service.ts
async createForProduct(product: Partial<Product>): Promise<string | null>
async updateForProduct(productId: string): Promise<void>
async regenerateAll(): Promise<{ updated: number; failed: number }>
```

#### SearchService
Orchestrates semantic search:
- Batch query processing with parallel execution
- Uses `RETRIEVAL_QUERY` task type for query embeddings
- Error isolation per query (failed queries return empty results)

```typescript
// search.service.ts
async searchBatch(dto: SearchQueryDto): Promise<SearchResult[]>  // Parallel processing
private async searchOne(query, limit, threshold): Promise<SearchResult>  // Single query
private async findSimilarProducts(query, limit, threshold): Promise<SearchProductResult[]>
private async createQueryEmbedding(query): Promise<string>  // Uses 'RETRIEVAL_QUERY'
```

### Embedding Generation

Embeddings are automatically generated when:
1. A new product is **created**
2. A product's **title**, **description**, or **keywords** are **updated**

The embedding generation is **non-blocking** - the product CRUD operation completes immediately, and embedding is generated in the background.

```typescript
// products.service.ts
private triggerEmbeddingGeneration(productId: string): void {
    this.embeddingService.updateForProduct(productId).catch(() => {
        // Silently fail - embedding is non-critical
    });
}
```

### Similarity Calculation

We use **Cosine Similarity** because:
- It measures the *angle* between vectors, not magnitude
- Works well for semantic comparison regardless of text length
- Standard in NLP applications

```sql
SELECT 
    p.*,
    1 - (p.embedding <=> $1::vector) as similarity
FROM products p
WHERE p.embedding IS NOT NULL
  AND 1 - (p.embedding <=> $1::vector) >= $2
ORDER BY p.embedding <=> $1::vector ASC
LIMIT $3
```

---

## API Reference

### POST `/ai/search`

Performs batch semantic search on products.

**Request Body:**
```json
{
  "queries": [
    "sofá de tres plazas estilo nórdico color gris claro",
    "mesa de centro redonda de vidrio"
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
    "query": "sofá de tres plazas estilo nórdico color gris claro",
    "products": [
      {
        "id": "uuid-here",
        "title": "Sofá Escandinavo 3 Puestos",
        "description": "...",
        "price": 1299.99,
        "similarity": 0.89,
        "imageUrl": "https://...",
        ...
      }
    ]
  }
]
```

### POST `/ai/embeddings/regenerate`

Regenerates embeddings for all products without one. Requires authentication (Vendor role).

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

Add to your `.env` file:

```env
# Google Cloud Platform - Vertex AI
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1
```

### Authentication

Vertex AI uses **Application Default Credentials (ADC)**. Ensure:

1. **Local Development:** Run `gcloud auth application-default login`
2. **Cloud Run:** Service account has `Vertex AI User` role

---

## Database Setup

### Enable pgvector Extension

Run this SQL on your PostgreSQL database:

```sql
-- Enable the vector extension (requires superuser or rds_superuser)
CREATE EXTENSION IF NOT EXISTS vector;
```

> **Note for Cloud SQL:** The extension is pre-installed. Just run `CREATE EXTENSION`.

### Verify Column Creation

After starting the application with `synchronize: true`, verify:

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
    "queries": ["silla de oficina ergonómica"]
  }'
```

### Multiple Queries with Custom Settings

```bash
curl -X POST http://localhost:3000/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      "mueble para guardar ropa",
      "lámpara de pie moderna"
    ],
    "limit": 10,
    "threshold": 0.6
  }'
```

### Backfill Existing Products

```bash
curl -X POST http://localhost:3000/ai/embeddings/regenerate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Performance Considerations

### Embedding Dimensions

| Model | Dimensions | Storage per product |
|-------|------------|---------------------|
| text-embedding-004 | 768 | ~6 KB |

### Indexing (Recommended for Production)

For databases with >10,000 products, add an IVFFlat index:

```sql
-- Create index for faster similarity search
CREATE INDEX ON products 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
```

### Caching Considerations

- Query embeddings can be cached if the same query is repeated
- Product embeddings are generated once and stored persistently

---

## Troubleshooting

### "VectorService not initialized"

**Cause:** Missing `GCP_PROJECT_ID` environment variable.

**Fix:** Add `GCP_PROJECT_ID` to your `.env` file.

### "Column 'embedding' of type 'vector' does not exist"

**Cause:** pgvector extension not enabled.

**Fix:** Run `CREATE EXTENSION IF NOT EXISTS vector;` on your database.

### "Permission denied for Vertex AI"

**Cause:** Service account lacks permissions.

**Fix:** Grant `roles/aiplatform.user` to your service account:
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SA_EMAIL" \
  --role="roles/aiplatform.user"
```

### Low-Quality Search Results

**Cause:** Threshold too high or product descriptions too short.

**Fixes:**
1. Lower the `threshold` parameter (e.g., 0.3)
2. Ensure products have detailed `description` and `keywords`
3. Run `/ai/regenerate-embeddings` after improving product data

---

## Future Enhancements

- [ ] **Hybrid Search:** Combine semantic + keyword search for best of both
- [ ] **Query Expansion:** Automatically expand queries with synonyms
- [ ] **Category Filtering:** Filter semantic results by category
- [ ] **Personalization:** Boost results based on user preferences
- [ ] **A/B Testing:** Compare semantic vs. keyword search performance
