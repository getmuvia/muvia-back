# Hybrid catalog search

The current flow, request/response contracts, retrieval rules, currency conversion,
AI caches and validation are maintained in [Catalog search](../../search/README.md).

Both the catalog and navigation search modal use `POST /ai/hybrid`.
`GET /products` keeps structured catalog filters and pagination, while
`POST /ai/search` keeps the semantic batch-search contract.
