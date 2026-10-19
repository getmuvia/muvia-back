# Catalog search

## Flow

POST /ai/hybrid reads the active market once (including its exchange rates),
resolves a structured Gemini interpretation, runs literal and vector
retrieval in parallel, and merges their results.

Gemini receives the complete original query, locale, market, currency, supported
currencies, catalog vocabulary and selected category, condition and size filters.
It returns cleanQuery, literal terms, equivalent product-type names, a catalog
category, material vocabulary, dimension bounds in centimeters, monetary bounds
and product condition. The backend validates all
values and applies SQL constraints before retrieval limits. It never executes
model-generated SQL.

Natural-language extraction is centralized in Gemini. Category aliases stored
in the catalog are vocabulary supplied to the model, not a second interpreter.
Product text normalization remains necessary for database matching; stored
product dimensions are converted with deterministic arithmetic in SQL.

Selected category, condition and measurement controls take precedence over
inferred values; a selected size replaces only bounds for that dimension.
Searching with a selected category uses the same hybrid route.
Browsing without search text retains normal catalog pagination and explicit
structured filters through GET /products. That endpoint no longer interprets
natural-language numeric constraints.

Product-type terms prevent generic attributes from admitting unrelated literal
candidates. Literal candidates are ordered by term coverage, then title similarity.
Material aliases constrain both retrieval paths before limits. An inferred
category scopes the first retrieval; when too few primary matches remain, a second
retrieval broadens inferred category/material preferences for related suggestions.
Selected categories, conditions, prices and measurements remain mandatory.
Both retrieval passes share the same query embedding.

Measurements support up to three distinct dimensions, each with minimum/maximum
and inclusive/exclusive bounds. Exact sizes use equal inclusive bounds. SQL
compares all dimensions after converting stored cm/m/in units to centimeters.

## Reusing AI calls

Successful interpretations and query embeddings use bounded process-local caches
(200 entries each, 60-second TTL after completion), sharing identical calls in
flight. Failures are removed immediately. Interpretation keys include query,
locale, market, supported currencies, selected filters and full catalog vocabulary.
The model and prompt are fixed for each provider instance. Different result limits
can reuse AI work while retrieving current products from the database.

Rates and converted prices are never cached: conversion uses the market snapshot
read for each search. Product result sets are not cached. No extra database table,
cache service or dependency is required. Multiple backend instances keep separate
caches; this optimization does not promise one AI call across all instances.

## Interpretation failure

When Gemini is disabled, unavailable, times out or returns invalid values, the
request continues with normalized literal terms and the available retrieval
methods. If embedding generation also fails, literal retrieval remains active.
The response uses interpretation.source = deterministic.

The catalog and search modal show only the localized short-search hint:
"Prueba buscando por nombre o categorÃ­a con hasta 3 palabras, por ejemplo:
Â«silla de maderaÂ»."

The original query remains editable. Three words is guidance, not an input
limit. Normal interpretation responses use source = ai. Related suggestions
obey the same SQL price, dimension, selected-category and condition constraints.

## Currency conversion

Each market declares its product currency and an exchangeRates object. A key
identifies the source currency; its rate is local-currency units per one unit
of that source currency. Each quote also stores updatedAt.

- A price without an explicit currency uses the selected market currency.
- Gemini preserves an explicitly named foreign currency and never supplies a rate.
- Supported foreign bounds are converted using the market's stored rate.
- Unsupported currencies return SEARCH_PRICE_CURRENCY_MISMATCH, with localized
  guidance to enter the amount in the country's local currency.
- Conversion uses integer arithmetic and directional cent rounding so strict
  and inclusive bounds retain their meaning for stored two-decimal prices.
- Prices displayed on products retain the listing's currency.

Rates are returned by the existing market query; conversion adds no database
lookup per search and makes no web-search or exchange-provider request.

## Administration and migration

Apply migration AddMarketExchangeRates1792281600000 before deploying the backend.
It adds the market exchange_rates JSONB field and seeds Bolivia's USD reference
at 11.69 BOB per USD, from the BCB publication checked on 2026-10-18. This is an
initial manually maintained reference, not an automatically refreshed quotation:
https://www.bcb.gob.bo/

PATCH /markets/:code/exchange-rates requires a valid JWT and the ADMIN role.

Example request body:

    { "currencyCode": "USD", "rate": 11.69 }

The source currency must be an ISO 4217 code, and the rate must be positive,
at most 1000000, and have at most six decimal places. The local currency always
has an implicit rate of one. The update changes only the requested JSON key,
preserving other currencies during concurrent edits.

A new currency is added through this endpoint, without changing the schema or
interpreter instructions. Another country uses its own market currency and
quotes. A future rate provider can update the same configuration independently
of search. Existing product embeddings do not require regeneration.

## Configuration and validation

GCP_SEARCH_INTENT_LOCATION and GCP_SEARCH_INTENT_MODEL select the interpreter.
SEARCH_INTENT_AI_ENABLED controls interpretation independently of embeddings.
SEARCH_INTENT_TIMEOUT_MS bounds the request timeout. The provider requests JSON
output with minimal thinking and does not enable Google Search.

POST /ai/search keeps its existing batch semantic-search contract. Public search
routes retain their existing throttling and no-store response policy.

Unit tests cover structured-output validation, the single-call contract,
currency conversion and rounding, interpretation/embedding failure and ranking.
PostgreSQL/pgvector integration tests exercise migrations, persisted rate
updates, literal matching and SQL constraints before result limits. Admin tests
verify authentication, role restrictions and rate validation.
