# Hybrid Search

Technical documentation for the hybrid search feature that combines semantic (AI) and lexical (text) search strategies.

---

## Why Hybrid Search?

### The Problem with Pure Semantic Search
- Products **without embeddings** are invisible to semantic search
- New products take time to generate embeddings
- Some queries work better with exact text matching

### The Problem with Pure Lexical Search
- Doesn't understand **synonyms** or related concepts
- "comfortable chair" won't find "ergonomic seat"
- Limited to exact/partial string matches

### The Solution: Hybrid
Combine both approaches and let the best results rise to the top.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID SEARCH                                │
│                                                                 │
│  POST /ai/hybrid                                                │
│  Body: { "query": "wooden chair", "limit": 10 }                 │
├─────────────────────────┬───────────────────────────────────────┤
│   LEXICAL (Text)        │         SEMANTIC (AI)                 │
│                         │                                       │
│   ProductsService       │    ProductVectorRepository            │
│   └── findAll()         │    └── findBySimilarity()             │
│       └── ILIKE query   │        └── Cosine distance            │
│                         │            on pgvector                │
│   ✓ Works without       │    ✓ Understands meaning              │
│     embeddings          │    ✓ Finds related products           │
├─────────────────────────┴───────────────────────────────────────┤
│                    mergeResults()                               │
│                    Combines and ranks all results               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Business Rules

### Scoring System

| Match Type | Score Range | Description |
|------------|-------------|-------------|
| Exact title match | 1.0 | Query equals product title (case-insensitive) |
| Semantic match | 0.0 - 1.0 | Based on vector similarity from Vertex AI |
| Lexical match | 0.0 - 1.0 | Calculated from word matches in title/description |
| Hybrid match | Boosted +0.3 | Product found by BOTH methods |

### Lexical Scoring Algorithm

```typescript
Weight Distribution:
- Title:       70% (WEIGHT_TITLE = 0.7)
- Description: 30% (WEIGHT_DESC = 0.3)

Formula:
titleScore = (matchedWords / totalQueryWords) * 0.7
descScore  = (matchedWords / totalQueryWords) * 0.3
totalScore = titleScore + descScore

Bonus:
- If title CONTAINS the full query → +0.2 boost
```

### Word Matching Rules

1. **Stopwords filtered**: Words with ≤2 characters are ignored ("of", "an", "to")
2. **Word boundaries**: Uses regex `\b` to match complete words only
3. **Case insensitive**: "Chair" matches "chair"
4. **Duplicate prevention**: Repeated words in query count once

---

## API Reference

### Endpoint

```http
POST /ai/hybrid
Content-Type: application/json

{
  "query": "wooden chair",
  "limit": 10
}
```

### Response

```json
{
  "query": "wooden chair",
  "results": [
    {
      "id": "uuid",
      "title": "Wooden Chair",
      "description": "Rustic wooden chair...",
      "price": 100,
      "imageUrl": "https://...",
      "score": 1.0,
      "matchType": "lexical"
    },
    {
      "id": "uuid",
      "title": "Armchair",
      "description": "Comfortable armchair...",
      "price": 250,
      "imageUrl": "https://...",
      "score": 0.67,
      "matchType": "semantic"
    }
  ],
  "count": 2
}
```

### Match Types

| Value | Meaning |
|-------|---------|
| `semantic` | Found only by AI vector search |
| `lexical` | Found only by text search |
| `hybrid` | Found by BOTH methods (score boosted by +0.3) |

---

## Configuration

The hybrid search uses these weight constants defined in `search.service.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `FETCH_MULTIPLIER` | 3 | Fetches 3x the limit to ensure best results after merge |
| `WEIGHT_TITLE` | 0.7 | 70% weight for title matches |
| `WEIGHT_DESC` | 0.3 | 30% weight for description matches |
