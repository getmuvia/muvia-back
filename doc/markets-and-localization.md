# Mercados, ubicación y localización

Muvia separates four concepts that can evolve independently:

- `markets`: storefront country, supported locales, currency, flag, time zones and region.
- `vendor_locations`: confirmed physical business locations owned by a vendor profile.
- `product_listings`: product availability, price, currency and stock for a delivery market.
- category taxonomy: stable category codes, translated names, search aliases and related categories.

## Storefront resolution

`GET /markets/context` resolves the storefront in this order:

1. A country explicitly selected by the user.
2. A country header set by trusted edge infrastructure.
3. An exact IANA browser time-zone match.
4. The active default market.

The frontend stores an explicit selection under `muvia.market`. It does not request precise
browser geolocation. Market selection filters catalog and search results; it is not an
authorization or fraud-control boundary.

## Product availability

Creating a vendor profile creates its primary business location. When no location is sent,
the active default market is used; while the pilot only supports Bolivia, that is `BO`.

Creating a product automatically creates a listing using that primary vendor location and
market. `GET /products` and `POST /ai/hybrid` only return products with an active listing for
the requested `marketCode`. A product can later be delivered to another country by creating
another listing for that market; the product itself does not need to be duplicated.

## Adding a country

1. Insert a `markets` row with its ISO country code, region, locales, currency, flag and time zones.
2. Add or confirm vendor business locations in that country.
3. Create product listings for every market where each vendor delivers.
4. Activate the market when its catalog and delivery coverage are ready.

## Adding a language

1. Add category names to `category_translations`.
2. Add normalized search vocabulary to `category_aliases`.
3. Add one language resource under `src/common/search/locales` for stop words and phrases,
   then register its language code in that folder's `index.ts`.
4. Add the locale to each market that supports it and translate the frontend UI with the
   normal application i18n resources.

Product types and their relationships are data, so adding languages does not grow a
`PRODUCT_TYPES` constant. Language grammar stays in small isolated resources instead of one
global `STOP_WORDS` list.
