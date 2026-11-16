# HU 2 — Publish product availability and production settings

As a seller, I want to publish and update whether a product is available from stock or made to order, its production lead time and whether I accept custom dimensions, so that customers understand the offer before contacting me.

## Acceptance criteria

- Sellers can select stock availability or made-to-order availability during product creation and editing.
- Stock availability uses the selected market listing's inventory. Zero stock is unavailable and never implicitly becomes made to order.
- Made-to-order products require a positive whole-day minimum/maximum production range, with minimum no greater than maximum.
- Production time is explicitly distinguished from shipping time.
- Accepting custom dimensions is independent of the availability mode.
- The published price remains associated with the published dimensions. Customers are informed that different dimensions require confirmation and may change the price.
- Saving persists the settings. Reopening the editor restores them, and unrelated partial updates preserve them.
- Returning to stock availability clears obsolete production days while retaining the independent customization preference.
- Public catalog cards, seller/store cards, detail pages and lexical/semantic search responses expose consistent availability metadata.
- Only the owning seller can update a product. Invalid API input is rejected, and database constraints protect direct writes.
- Existing products remain in stock mode after migration, including products with zero inventory. Custom dimensions default to disabled.
- English/Spanish labels and validation, keyboard focus and mobile layouts are supported.

## Contract

The product stores `availabilityMode` (`IN_STOCK` or `MADE_TO_ORDER`), nullable `leadTimeMinDays`/`leadTimeMaxDays` and boolean `acceptsCustomDimensions`. Availability and production settings apply to the product; price, currency and stock continue to belong to its market listings.

Create/PATCH accept these fields. Omitted PATCH fields retain their current values. Production days are required in made-to-order mode and normalized to null in stock mode. Counts use positive PostgreSQL integers. Inventory is a nonnegative integer. Switching mode preserves inventory; made-to-order mode does not use or display it as a measure of availability.

## Rollout and local validation

Deploy the backend migration `1794873600000-add-product-availability` before releasing the frontend. The existing backend deployment workflow runs migrations before updating the API. Existing development databases created with synchronization need reconciled migration history as described in [product text search](product-text-search.md#migration-and-rollout).

For an existing local database with valid migration history:

```sh
npm run build
node --env-file=.env node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

The frontend can use a local API at port 3000 without changing the shared development/production endpoints:

```sh
npm start -- --configuration local --port 4300
```

Backend coverage includes DTO validation, merged PATCH state, ownership, the complete migration chain, real TypeORM creation/update/read queries and lexical/semantic result propagation against PostgreSQL in PGlite. Frontend coverage includes form validation, DTO mapping, restoring settings and bilingual customer-facing availability.

Customer-entered custom dimensions, quotation requests, seller responses and automatic price calculations belong to subsequent stories.
