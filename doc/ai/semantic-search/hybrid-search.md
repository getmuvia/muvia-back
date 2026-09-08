# Hybrid catalog search

POST /ai/hybrid retrieves text and vector candidates, validates their relevance,
and returns main results separately from broader suggestions. The catalog and the
navigation search modal use the same response contract.

## Relevance rules

- Normalize accents, case, punctuation and repeated spaces before SQL matching,
  word scoring and query embedding generation. sofa, sofá and SOFÁ use the same
  normalized query. PostgreSQL 16 normalization requires no extra extension or migration.
- Match meaningful words across title, keywords and description instead of requiring
  the complete query to occur as one substring. A single unfinished word with at least
  three characters can match a word prefix when no product type is recognized.
- For a recognized product type, require evidence of that identity. The first type
  named in the query is the target: cojin para sofa requests a cushion.
- The first type named in the title establishes product identity; keywords are a
  fallback when the title does not identify a type. Thus Mesa para sofá is a table.
- Descriptions can establish identity at their start when the title/keywords do not,
  or explicitly state a second function (utilizarse como sofá, convertible en cama).
  A casual mention of another product is insufficient.
- Product identities, translated aliases and related categories live in the category
  taxonomy tables. Sofa/couch aliases are separate from office chairs; Muebles is too
  broad to establish product identity. Language-specific stop words and identity phrases
  live in small locale resource files under common/search/locales.
- Queries without a recognized type need textual support: at least half of their
  meaningful words in the title or keywords, or all in the description. Semantically
  similar products without that support can only appear as related suggestions.
- Eligible main results use text relevance (75%) and vector similarity (25%) when
  embeddings are available. Text-only candidates keep their lexical score. Text
  coverage weights are title 65%, keywords 20%, description 15%, with phrase and
  completeness bonuses capped at 1. Similarity is a ranking score, not a probability.
- Related suggestions need similarity >= 0.45 and, for a recognized type, an explicitly
  compatible type. Sofas can suggest armchairs/divans, but not office chairs. Suggestions
  never duplicate main results and are capped at six (or the requested limit if smaller).
- AI failure falls back to text retrieval. Text retrieval failure returns an error so
  the UI can offer retry instead of claiming there are no matching products.

## Response contract

Request: { "query": "sofa", "limit": 20, "marketCode": "BO", "locale": "es-BO" }

Response example (scores are illustrative):

~~~json
{
  "query": "sofa",
  "results": [
    {
      "id": "product-id",
      "title": "Sofá Nube",
      "description": "Sofá modular",
      "price": 4999,
      "currencyCode": "BOB",
      "imageUrl": null,
      "score": 0.9,
      "matchType": "hybrid"
    }
  ],
  "count": 1,
  "relatedResults": []
}
~~~

results contains only main matches; count is the number of main results returned,
not an exhaustive catalog total. relatedResults is a separate array with the same
product fields. matchType identifies the retrieval source, not the relevance group.
The query accepts 2–200 characters after trimming; limit accepts 1–50. marketCode
restricts both lexical and vector candidates to an active product listing in that market.
The service retrieves up to three times the requested limit per retrieval method.

## Frontend and rollout

The catalog renders main matches first and relatedResults under Productos relacionados.
When only suggestions exist, it explicitly says there are no direct matches. The modal
uses the same grouping and keeps keyboard navigation across both groups. Both groups
are cleared when a new query starts, the query is cleared or an error occurs.

Deploy the backend before the frontend. Existing clients continue consuming results;
the new frontend tolerates an absent relatedResults during rollout. Both releases are
needed to display the new suggestions section. GET /products also normalizes accents
for its text filter. POST /ai/search remains a semantic batch endpoint.

## Review scenarios

- sofa / sofá / SOFÁ: equivalent normalized retrieval and ranking.
- Sofa Siena and Sofa Nube: main results for sofa.
- Diván Nórdico described as utilizarse como sofá de día: main result for sofa.
- Sillón Verona and Butaca Moderna: related only, subject to semantic threshold.
- Silla ergonómica with oficina/silla tags: excluded from both groups for sofa.
- Cojín para sofá / Mesa junto al sofá: excluded from sofa main results.
- sofa comodo para una sala pequena: type stays sofa; AI helps order eligible sofas.
- Product without an embedding: still eligible through normalized text/keywords.
- Empty results, AI outage, request errors, rapid query changes and clearing the search:
  preserve group boundaries and show an honest empty/error state.

These are review scenarios, not a record of executed tests. Unit, integration and e2e
suites were deliberately not run for this change. Validation uses compilation and diff review.
