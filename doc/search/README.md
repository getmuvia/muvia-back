# Search module

`SearchModule` owns buyer catalog search. It keeps the existing public routes,
adds a structured `interpretation` to hybrid responses, and isolates Gemini from
the deterministic taxonomy, retrieval and ranking rules.

## Structure

```text
src/modules/search/
├── dto/
├── interfaces/
├── providers/google/
├── repositories/
├── services/
├── tests/
├── search.constants.ts
├── search.controller.ts
└── search.module.ts
```

The module does not own an entity. A search is an operation over existing
`Product` records, not a persisted CRUD resource.

## Responsibilities

- `SearchController` owns HTTP transport and delegates to `SearchService`.
- `SearchService` orchestrates market validation, intent resolution, parallel
  lexical/vector retrieval and result selection.
- `SearchIntentService` combines deterministic taxonomy rules with the optional
  AI candidate, validates inferred category and measurement data, preserves new
  material vocabulary and builds the user-facing interpretation.
- `SearchRankingService` evaluates product identity, material relevance and
  semantic evidence without calling external services.
- `GeminiSearchIntentProvider` is the adapter behind
  `SEARCH_INTENT_PROVIDER`. It uses structured JSON output, minimal thinking and
  a short request timeout.
- `ProductLexicalRepository` and `ProductVectorRepository` contain search-only
  database access.

Product embedding persistence remains in `AiModule` through
`ProductEmbeddingRepository`; the search module only reads compatible vectors.

## Request flow

```text
POST /ai/hybrid
    -> SearchController
    -> SearchService
       -> SearchIntentService
          -> CategoryTaxonomyService
          -> GeminiSearchIntentProvider (optional)
       -> ProductLexicalRepository + ProductVectorRepository
       -> SearchRankingService
    -> response with interpretation, results and relatedResults
```

AI does not replace deterministic behavior. Explicit taxonomy and measurement
parsing has priority. Gemini can fill missing intent fields. Categories use the
stored Muvia taxonomy when they resolve; material expressions that do not belong
to a known family are preserved instead of discarded, so lexical and semantic
retrieval can still use them. If the model is disabled, unconfigured, times out
or returns invalid JSON, the request continues with the deterministic intent.

## Semantic retrieval

Product embeddings are built from title, category name/code, structured
specifications, keywords and description. This prevents semantic recall from
depending on a seller repeating material or category information in free-form
copy.

The hybrid ranker treats retrieval methods as complementary:

- lexical evidence remains strongest for exact names, brands and model terms;
- a semantic-only candidate with similarity `>= 0.45` can be a main result even
  when regional wording does not occur literally in the product;
- lower semantic candidates remain separate related suggestions;
- known structured category and material constraints are still enforced;
- an unknown AI material is evidence for retrieval, not a hard exclusion rule.

Pure semantic candidates retain their cosine similarity as their score. Only
candidates found by both retrieval paths blend lexical relevance and semantic
similarity.

### Embedding content versions

`products.embedding_content_version` identifies which product document format
produced a vector. Version 2 includes category and specifications. Existing
vectors remain available during deployment, but the regeneration endpoint
selects older or unversioned rows for refresh:

```text
POST /ai/embeddings/regenerate
```

Run the database migration before calling the endpoint. Product updates also
regenerate the vector when title, description, keywords, category or
specifications change.

## API

### Hybrid search

`POST /ai/hybrid`

```json
{
  "query": "quiero un escritorio de madera de 100 cm",
  "limit": 10,
  "marketCode": "BO",
  "locale": "es-BO"
}
```

The existing response fields remain compatible. `interpretation` is additive:

```json
{
  "query": "quiero un escritorio de madera de 100 cm",
  "interpretation": {
    "summary": "Escritorio · Madera · Máximo 100 cm de ancho",
    "source": "ai",
    "category": {
      "code": "DESK",
      "label": "Escritorio"
    },
    "material": {
      "code": "WOOD",
      "label": "Madera"
    },
    "measurement": {
      "dimension": "width",
      "maxDimensionCm": 100
    }
  },
  "results": [],
  "count": 0,
  "relatedResults": []
}
```

`source` reports whether Gemini produced a valid candidate or the deterministic
fallback was used. The visible summary is always constructed by Muvia from the
validated intent; it is not free-form model output.

The current measurement contract is a maximum dimension because the catalog SQL
filter uses `<= maxDimensionCm`. The summary says `Máximo` so the buyer sees the
constraint that was actually applied.

### Batch semantic search

`POST /ai/search` remains available with its previous request and response
contract. Both public search routes have a per-instance limit of 60 requests per
minute and return `Cache-Control: no-store`.

## Configuration

```env
GCP_SEARCH_INTENT_LOCATION=global
GCP_SEARCH_INTENT_MODEL=gemini-3.1-flash-lite
SEARCH_INTENT_AI_ENABLED=true
SEARCH_INTENT_TIMEOUT_MS=2500
```

- The intent model is separate from vision, image generation and embeddings.
- `SEARCH_INTENT_AI_ENABLED=false` disables only model interpretation.
- Missing `GCP_PROJECT_ID` also makes the provider unavailable without disabling
  deterministic search.
- The timeout accepts 500–10000 milliseconds.
- Production model and location values are supplied by `muvia-infra`.

The provider never logs the raw buyer query. It records only model and latency at
debug level. No search intent or conversation is persisted by this module.

## Tests

Unit tests live under `src/modules/search/tests/` and mirror production folders.
The focused suite covers:

- AI enrichment and deterministic fallback;
- preservation of previously unknown material vocabulary;
- preservation of hybrid material ranking;
- primary and related semantic-only regional matches;
- category and specifications in the product embedding document;
- the Gemini structured-output request contract;
- vector model, content version and measurement filtering.

Broader integration and end-to-end coverage can be added without changing the
module API.

## Extension points

- Swap the intent model by changing the provider registered for
  `SEARCH_INTENT_PROVIDER`.
- Add contextual refinements inside `SearchIntentService`; controllers and
  repositories do not need to know which provider resolved the context.
- Extend the response DTO when the buyer UI supports direct structured edits.
- Add another retrieval strategy behind `SearchService` without exposing it to
  the HTTP layer.
