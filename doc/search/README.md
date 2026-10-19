# Catalog search

## Flow

POST /ai/hybrid reads the active market once (including its exchange rates),
asks Gemini once for a structured interpretation, runs literal and vector
retrieval in parallel, and merges their results.

Gemini receives the complete original query, locale, market currency, supported
currencies and cached catalog vocabulary. It returns cleanQuery, literal terms,
a catalog category, material vocabulary, an optional maximum dimension in
centimeters, monetary bounds and product condition. The backend validates all
values and applies SQL constraints before retrieval limits. It never executes
model-generated SQL.

Natural-language extraction is centralized in Gemini. Category aliases stored
in the catalog are vocabulary supplied to the model, not a second interpreter.
Product text normalization remains necessary for database matching; stored
product dimensions are converted with deterministic arithmetic in SQL.

Selected category, condition and measurement controls take precedence over
inferred values. Searching with a selected category uses the same hybrid route.
Browsing without search text retains normal catalog pagination and explicit
structured filters through GET /products. That endpoint no longer interprets
natural-language numeric constraints.

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
