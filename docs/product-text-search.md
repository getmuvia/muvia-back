# Persisted product text search

Catalog filtering and lexical retrieval now read four PostgreSQL `STORED`
generated columns: `search_title`, `search_description`, `search_keywords`, and
`search_material`. Each has a GIN index with `gin_trgm_ops`. Normalization runs
when source fields are written instead of repeatedly during filtering and
ranking. PostgreSQL maintains the derived values in the same transaction,
including writes made outside TypeORM. No worker or embedding regeneration is
needed for textual search.

## Search behavior

- Normalization preserves the previous PostgreSQL expression: lowercase, NFD
  decomposition, removal of combining accents, punctuation converted to spaces,
  and trimming. Each stored value has one leading and trailing space.
- Catalog search still uses `%query%` against title, description, and keywords.
  For example, `illón` can match `Sillón`, and punctuation in a query is normalized.
- Lexical retrieval keeps complete-word/phrase matching and the existing
  single-term prefix rule. `sil` can match `silla` and `sillas`; with a category
  intent, the complete word `silla` does not match `sillas`.
- Title, keyword, description, material, and alias ranking weights are unchanged.
  Market, active-listing, measurement, price, pagination, and asset behavior are
  unchanged. Stored columns are excluded from ordinary entity reads.

Keyword joining uses the migration-owned immutable function
`muvia_join_search_keywords(text[])`. PostgreSQL's generic
`array_to_string(anyarray, text)` is `STABLE` and cannot appear directly in a
generated expression. The dedicated text-only function concatenates text values
in array order and skips null elements, using immutable operations. It preserves
the previous join behavior without declaring the generic function immutable.

## Migration and rollout

`AddProductSearchText1790726401000` enables `pg_trgm`, creates the helper, adds all
four generated columns in one `ALTER TABLE`, builds the indexes, and runs
`ANALYZE products`. Adding stored columns populates existing rows immediately.
The existing deployment workflow already runs migrations before deploying the
Cloud Run revision. The old application can continue reading the expanded
schema, so keep this order.

For a local database, run migrations before starting development as well:

```bash
npm run build
node --env-file=.env node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
npm run start:dev
```

The migration CLI reads process environment variables; `--env-file` supplies the
local settings. Use PostgreSQL 16 or later, UTF-8 encoding, and the extensions
required by the earlier migrations. A development database previously created
with `synchronize` must have its migration history reconciled before running the
full migration chain; do not rerun the initial schema blindly. `synchronize`
alone cannot create the custom function or the GIN operator-class indexes. The
entity marks those indexes with `synchronize: false` so TypeORM preserves them.
The migration also records the generated expressions in `typeorm_metadata`,
preventing development synchronization from rebuilding the columns and losing
their dependent indexes. Rollback removes only these metadata entries.

This migration rewrites product rows and builds regular indexes inside the
migration transaction. It takes locks that can block writes. Schedule its first
production execution during a low-traffic window and check available storage.
For a large catalog, use a separately planned staged backfill and concurrent
index build instead. No infrastructure or new Google Cloud service is required;
the stored text and indexes consume space and add work to product writes in the
existing database.

To roll back, first deploy code that uses the previous text expressions, then
revert this migration. Its `down` removes the columns, their dependent indexes,
and its helper; products and the shared `pg_trgm` extension remain intact.

## Validation and practical limits

The integration suite runs the complete migration chain and the actual TypeORM
catalog and lexical queries against PGlite PostgreSQL with `pg_trgm` and
`pgvector`. It checks existing-row population, SQL and ORM writes, internal field
visibility, accents, punctuation, nullable fields, keyword arrays, ranking,
prefixes, price and measurement filters, active markets, joined assets,
pagination, and migration rollback/reapplication.

With 12,001 locally generated products, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
selects all four GIN indexes through `BitmapOr` for selective substring,
complete-word, and prefix predicates. Sequential scans are left enabled.
PGlite currently runs PostgreSQL 18.3; this checks SQL behavior and plan
eligibility, not Cloud SQL 16 latency or production capacity.

Indexes are not a guarantee that every search avoids a scan. Very short patterns
may contain no useful trigrams; common terms can match much of the catalog; small
tables can legitimately be cheaper to scan. Ranking, relation loading, and exact
counts still cost work. Check representative catalog and lexical queries with
`EXPLAIN (ANALYZE, BUFFERS)` on the target database after deployment, and measure
latency and database load before deciding whether further changes are needed.

References: [PostgreSQL generated columns](https://www.postgresql.org/docs/16/ddl-generated-columns.html)
and [PostgreSQL pg_trgm](https://www.postgresql.org/docs/16/pgtrgm.html).
