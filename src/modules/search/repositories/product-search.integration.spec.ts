import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { vector } from '@electric-sql/pglite-pgvector';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { normalizedSearchSql } from '../../../common/search/search-text';
import { ProductDimension } from '../../../common/search/product-measurement';
import configuredSource from '../../../database/data-source';
import { AddProductSearchText1790726401000 } from '../../../database/migrations/1790726401000-add-product-search-text';
import { AddProductCondition1791676800000 } from '../../../database/migrations/1791676800000-add-product-condition';
import { ProductCondition } from '../../products/enums/product-condition.enum';
import { ProductVectorRepository } from './product-vector.repository';
import { ConfigService } from '@nestjs/config';
import { PRODUCT_EMBEDDING_CONTENT_VERSION } from '../../ai/constants/ai.constants';
import { EmbeddingService } from '../../ai/services/embedding/embedding.service';
import { FilesService } from '../../files/files.service';
import { Category } from '../../categories/entities/category.entity';
import { Market } from '../../markets/entities/market.entity';
import { MarketsService } from '../../markets/markets.service';
import { ProductAsset } from '../../products/entities/product-asset.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductsService } from '../../products/products.service';
import type { SearchIntent } from '../interfaces/search-intent.interface';
import { ProductLexicalRepository } from './product-lexical.repository';

class TestDataSource extends DataSource {
  async connectTo(db: PGlite): Promise<void> {
    await this.buildMetadatas();
    // Only the pg transport is replaced. TypeORM still builds and executes its
    // real pagination, joins, parameter binding and entity hydration queries.
    const client = Object.assign(new EventEmitter(), {
      query: async (sql: string, parameters?: unknown[]) => {
        const result = await db.query(sql, parameters);
        return {
          rows: result.rows,
          rowCount: result.affectedRows,
          command: sql.trim().split(/\s+/)[0].toUpperCase(),
        };
      },
    });
    const driver = this.driver as PostgresDriver;
    driver.obtainMasterConnection = () =>
      Promise.resolve([client, () => undefined]);
    Object.assign(this, { isInitialized: true });
  }
}

type SearchColumns = {
  search_title: string;
  search_description: string;
  search_keywords: string;
  search_material: string;
};

describe('Persisted product search against PostgreSQL + pg_trgm', () => {
  let db: PGlite;
  let source: TestDataSource;
  let products: Repository<Product>;
  let catalog: ProductsService;
  let lexical: ProductLexicalRepository;
  let runner: QueryRunner;
  let backfilled: SearchColumns;
  const sellerId = randomUUID();
  const locationId = randomUUID();
  const migration = new AddProductSearchText1790726401000();

  const intent = (
    terms: string[],
    extra: Partial<SearchIntent> = {},
  ): SearchIntent => ({
    text: terms.join(' '),
    terms,
    ...extra,
  });

  async function seed(
    title: string,
    extra: {
      description?: string;
      keywords?: string[];
      material?: string;
      width?: number;
      depth?: number;
      height?: number;
      unit?: string;
      active?: boolean;
      market?: string;
      price?: number;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await db.query(
      `
      INSERT INTO products (id, seller_id, title, description, keywords, specifications, price, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, 999, '2026-09-29')`,
      [
        id,
        sellerId,
        title,
        extra.description ?? null,
        extra.keywords ?? [],
        {
          material: extra.material,
          dimensions: {
            width: extra.width ?? 100,
            depth: extra.depth ?? 60,
            height: extra.height ?? 75,
            unit: extra.unit ?? 'cm',
          },
        },
      ],
    );
    await db.query(
      `
      INSERT INTO product_listings (id, product_id, vendor_location_id, market_code, price, currency_code, stock, is_active)
      VALUES ($1, $2, $3, $4, $5, 'BOB', 3, $6)`,
      [
        randomUUID(),
        id,
        locationId,
        extra.market ?? 'BO',
        extra.price ?? 400,
        extra.active ?? true,
      ],
    );
    return id;
  }

  beforeAll(async () => {
    db = new PGlite({ extensions: { vector, pg_trgm, pgcrypto } });
    source = new TestDataSource({
      ...configuredSource.options,
      logging: false,
    });
    await source.connectTo(db);
    runner = {
      query: (sql: string, parameters?: unknown[]) =>
        parameters ? db.query(sql, parameters) : db.exec(sql),
    } as unknown as QueryRunner;
    for (const previous of source.migrations) {
      if (previous.name !== migration.name) await previous.up(runner);
    }
    await db.query(
      `INSERT INTO users (id, email, "passwordHash", role) VALUES ($1, 'search@example.com', 'test', 'vendor')`,
      [sellerId],
    );
    const profileId = randomUUID();
    await db.query(
      `INSERT INTO vendor_profiles (id, user_id, "businessName") VALUES ($1, $2, 'Search fixture')`,
      [profileId, sellerId],
    );
    await db.query(
      `INSERT INTO vendor_locations (id, vendor_profile_id, country_code) VALUES ($1, $2, 'BO')`,
      [locationId, profileId],
    );
    const existing = await seed('SILLÓN — Niño', {
      description: 'OFICÍNA',
      keywords: ['ergonómico', 'azul-marino'],
      material: 'MADERÁ',
    });
    await migration.up(runner);
    backfilled = (
      await db.query<SearchColumns>(
        'SELECT search_title, search_description, search_keywords, search_material FROM products WHERE id = $1',
        [existing],
      )
    ).rows[0];
    products = source.getRepository(Product);
    lexical = new ProductLexicalRepository(products);
    catalog = new ProductsService(
      products,
      source.getRepository(ProductAsset),
      {} as EmbeddingService,
      new MarketsService(source.getRepository(Market)),
      {} as FilesService,
    );
  }, 30_000);

  beforeEach(async () => {
    await db.exec('TRUNCATE products CASCADE');
  });
  afterAll(async () => {
    if (db) await db.close();
  });

  it('persists independent currency rates and preserves other keys when an admin updates one', async () => {
    const markets = new MarketsService(source.getRepository(Market));
    expect((await markets.requireActive('BO')).exchangeRates.USD.rate).toBe(
      11.69,
    );
    await markets.updateExchangeRate('BO', { currencyCode: 'EUR', rate: 12 });
    await markets.updateExchangeRate('BO', { currencyCode: 'USD', rate: 10 });
    const refreshed = await markets.requireActive('BO');
    expect(refreshed.exchangeRates.USD.rate).toBe(10);
    expect(refreshed.exchangeRates.EUR.rate).toBe(12);
    await expect(
      markets.updateExchangeRate('BO', { currencyCode: 'BOB', rate: 2 }),
    ).rejects.toThrow();
    await expect(
      markets.updateExchangeRate('ZZ', { currencyCode: 'USD', rate: 2 }),
    ).rejects.toThrow();
  });

  it('backfills existing products with accents, case and punctuation normalized', () => {
    expect(backfilled).toEqual({
      search_title: ' sillon nino ',
      search_description: ' oficina ',
      search_keywords: ' ergonomico azul marino ',
      search_material: ' madera ',
    });
  });

  it('enforces listing budgets before lexical/vector limits and catalog pagination', async () => {
    const below = await seed('Escritorio madera', { price: 1599.99 });
    const boundary = await seed('Escritorio madera', { price: 2000 });
    const above = await seed('Escritorio madera', { price: 3999 });
    const price = {
      currencyCode: 'BOB',
      maximum: { amount: 2000, inclusive: false },
    };
    expect(
      (await lexical.search(intent(['escritorio'], { price }), 1, 'BO')).map(
        (product) => product.id,
      ),
    ).toEqual([below]);
    expect(
      (await lexical.search(intent([], { price }), 5, 'BO')).map(
        (product) => product.id,
      ),
    ).toEqual([below]);

    const vector = JSON.stringify([1, ...Array<number>(767).fill(0)]);
    for (const id of [above, boundary, below]) {
      await db.query(
        `UPDATE products SET embedding = $2::vector, embedding_model = 'price-test', embedding_revision = search_revision, embedding_content_version = $3 WHERE id = $1`,
        [id, vector, PRODUCT_EMBEDDING_CONTENT_VERSION],
      );
    }
    const vectors = new ProductVectorRepository(products, {
      getOrThrow: () => 'price-test',
    } as unknown as ConfigService);
    expect(
      (
        await vectors.findBySimilarity(
          vector,
          1,
          0.3,
          'BO',
          undefined,
          undefined,
          price,
        )
      ).map((product) => product.id),
    ).toEqual([below]);
    const inclusive = {
      currencyCode: 'BOB',
      maximum: { amount: 2000, inclusive: true },
    };
    expect(
      (
        await vectors.findBySimilarity(
          vector,
          10,
          0.3,
          'BO',
          undefined,
          undefined,
          inclusive,
        )
      )
        .map((product) => product.id)
        .sort(),
    ).toEqual([below, boundary].sort());

    const catalogPage = await catalog.findAll({
      search: 'escritorio',
      maxPrice: 1999.99,
      limit: 1,
    });
    expect(catalogPage.data.map((product) => product.id)).toEqual([below]);
    expect(catalogPage).toMatchObject({
      total: 1,
      totalPages: 1,
    });
    const range = { minPrice: 1000, maxPrice: 2000, limit: 1 };
    const first = await catalog.findAll({ ...range, page: 1 });
    const second = await catalog.findAll({ ...range, page: 2 });
    expect(first).toMatchObject({ total: 2, totalPages: 2 });
    expect(
      new Set([...first.data, ...second.data].map((product) => product.id)),
    ).toEqual(new Set([below, boundary]));

    await db.query('UPDATE products SET condition = $2 WHERE id = $1', [
      below,
      ProductCondition.USED,
    ]);
    const measured = { dimension: ProductDimension.WIDTH, maxDimensionCm: 100 };
    expect(
      (
        await vectors.findBySimilarity(
          vector,
          1,
          0.3,
          'BO',
          [
            {
              dimension: measured.dimension,
              maximum: { valueCm: measured.maxDimensionCm, inclusive: true },
            },
          ],
          ProductCondition.USED,
          inclusive,
        )
      ).map((product) => product.id),
    ).toEqual([below]);
    expect(
      (
        await lexical.search(
          intent(['escritorio'], {
            price: inclusive,
            measurements: [
              {
                dimension: measured.dimension,
                maximum: { valueCm: measured.maxDimensionCm, inclusive: true },
              },
            ],
          }),
          1,
          'BO',
          ProductCondition.USED,
        )
      ).map((product) => product.id),
    ).toEqual([below]);
    const combined = await catalog.findAll({
      search: 'escritorio',
      maxPrice: 2000,
      ...measured,
      condition: ProductCondition.USED,
    });
    expect(combined.data.map((product) => product.id)).toEqual([below]);
  });

  it('combines a selected category and a validated budget', async () => {
    const category = await source
      .getRepository(Category)
      .save({ name: 'Budget desks', code: 'PRICE_DESK', isSelectable: true });
    const affordable = await seed('Escritorio', { price: 799 });
    const expensive = await seed('Escritorio', { price: 2000 });
    await seed('Escritorio without the selected category', { price: 500 });
    await db.query(
      'UPDATE products SET category_id = $1 WHERE id = ANY($2::uuid[])',
      [category.id, [affordable, expensive]],
    );
    const response = await lexical.search(
      intent(['escritorio'], {
        price: {
          currencyCode: 'BOB',
          maximum: { amount: 1000, inclusive: true },
        },
      }),
      10,
      'BO',
      undefined,
      category.code,
    );
    expect(response.map((product) => product.id)).toEqual([affordable]);
  });

  it('migrates existing products to NEW and enforces valid, non-null conditions', async () => {
    const conditionMigration = new AddProductCondition1791676800000();
    await conditionMigration.down(runner);
    const existing = await seed('Existing desk');
    await conditionMigration.up(runner);
    expect((await products.findOneByOrFail({ id: existing })).condition).toBe(
      ProductCondition.NEW,
    );
    const created = await seed('New desk');
    expect((await products.findOneByOrFail({ id: created })).condition).toBe(
      ProductCondition.NEW,
    );
    await expect(
      db.query('UPDATE products SET condition = NULL WHERE id = $1', [created]),
    ).rejects.toMatchObject({ code: '23502' });
    await expect(
      db.query("UPDATE products SET condition = 'SEMINUEVO' WHERE id = $1", [
        created,
      ]),
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('filters condition before catalog pagination and lexical or vector retrieval limits', async () => {
    const fresh = await seed('Silla nueva', { width: 60 });
    const used = await seed('Silla usada', { width: 60 });
    const wideUsed = await seed('Silla usada ancha', { width: 150 });
    await products.update([used, wideUsed], {
      condition: ProductCondition.USED,
    });
    const pages = await Promise.all(
      [1, 2].map((page) =>
        catalog.findAll({
          condition: ProductCondition.USED,
          page,
          limit: 1,
        }),
      ),
    );
    expect(
      pages.every((page) => page.total === 2 && page.totalPages === 2),
    ).toBe(true);
    expect(
      new Set(pages.flatMap((page) => page.data.map((product) => product.id))),
    ).toEqual(new Set([used, wideUsed]));
    expect((await catalog.findAll({})).total).toBe(3);
    expect(
      await lexical.search(intent(['silla']), 1, 'BO', ProductCondition.USED),
    ).toHaveLength(1);
    expect(
      (await lexical.search(intent(['silla']), 5, 'BO', ProductCondition.USED))
        .map((product) => product.id)
        .sort(),
    ).toEqual([used, wideUsed].sort());

    const queryVector = JSON.stringify([1, ...Array<number>(767).fill(0)]);
    const usedVector = JSON.stringify([
      0.9,
      0.1,
      ...Array<number>(766).fill(0),
    ]);
    for (const id of [fresh, used, wideUsed]) {
      await db.query(
        `UPDATE products SET embedding = $2::vector,
        embedding_model = 'condition-test', embedding_revision = search_revision,
        embedding_content_version = $3 WHERE id = $1`,
        [
          id,
          id === fresh ? queryVector : usedVector,
          PRODUCT_EMBEDDING_CONTENT_VERSION,
        ],
      );
    }
    const vectorRepository = new ProductVectorRepository(products, {
      getOrThrow: () => 'condition-test',
    } as unknown as ConfigService);
    const limited = await vectorRepository.findBySimilarity(
      queryVector,
      1,
      0.1,
      'BO',
      undefined,
      ProductCondition.USED,
    );
    expect(limited).toHaveLength(1);
    expect([used, wideUsed]).toContain(limited[0].id);
    const measured = await vectorRepository.findBySimilarity(
      queryVector,
      5,
      0.1,
      'BO',
      [
        {
          dimension: ProductDimension.WIDTH,
          maximum: { valueCm: 70, inclusive: true },
        },
      ],
      ProductCondition.USED,
    );
    expect(measured.map((product) => product.id)).toEqual([used]);
  });

  it('preserves generated columns and GIN indexes during development schema synchronization', async () => {
    const changes = await source.driver.createSchemaBuilder().log();
    const searchChanges = changes.upQueries.filter(({ query }) =>
      /(?:ADD|DROP|ALTER) COLUMN "search_|DROP INDEX.*IDX_products_search_/.test(
        query,
      ),
    );
    expect(searchChanges).toEqual([]);
  });

  it('matches the previous SQL normalization, including null and unusual keyword arrays', async () => {
    const id = await seed('¡SILLÓN! Café 800', {
      description: 'Niño / OFICÍNA',
      material: 'Ácero-inoxidable',
    });
    for (const keywords of [
      null,
      [],
      [null, '', 'a"b', 'c\\d', 'Ñandú', '800'],
      [
        ['a', null],
        ['b', 'c'],
      ],
    ]) {
      await db.query(
        'UPDATE products SET keywords = COALESCE($2::text[], ARRAY[]::text[]) WHERE id = $1',
        [id, keywords],
      );
      const columns = [
        ['search_title', 'title'],
        ['search_description', 'description'],
        ['search_keywords', "array_to_string(keywords, ' ')"],
        ['search_material', "specifications ->> 'material'"],
      ];
      const comparison = columns
        .map(
          ([column, expression]) =>
            `${column} = (' ' || ${normalizedSearchSql(expression)} || ' ')`,
        )
        .join(' AND ');
      expect(
        (
          await db.query<{ matches: boolean }>(
            `SELECT ${comparison} AS matches FROM products WHERE id = $1`,
            [id],
          )
        ).rows[0].matches,
      ).toBe(true);
    }
  });

  it('updates searchable fields through direct SQL and ORM writes without an embedding job', async () => {
    const id = await seed('Mesa');
    await products.update(id, {
      title: 'Escritorio',
      description: 'Ergonómico',
      keywords: ['OFICÍNA'],
      specifications: { material: 'Ácero' },
    });
    expect(
      (await catalog.findAll({ search: 'escritorio' })).data.map((p) => p.id),
    ).toEqual([id]);
    expect((await catalog.findAll({ search: 'mesa' })).total).toBe(0);
    await db.query(
      "UPDATE products SET title = 'Sillón', description = NULL, keywords = '{}', specifications = NULL WHERE id = $1",
      [id],
    );
    expect(
      (await lexical.search(intent(['sillon']), 10, 'BO')).map((p) => p.id),
    ).toEqual([id]);
    expect(await lexical.search(intent(['oficina']), 10, 'BO')).toEqual([]);
    const rows = await db.query<SearchColumns>(
      'SELECT search_description, search_keywords, search_material FROM products WHERE id = $1',
      [id],
    );
    expect(rows.rows[0]).toEqual({
      search_description: '  ',
      search_keywords: '  ',
      search_material: '  ',
    });
    expect(
      (
        await db.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM product_embedding_jobs',
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it('supports ORM inserts and hides internal columns in API reads', async () => {
    const saved = await products.save(
      products.create({
        sellerId,
        title: 'Sillón',
        price: 100,
        stock: 1,
        keywords: ['Niño'],
      }),
    );
    const loaded = await products.findOneByOrFail({ id: saved.id });
    expect(loaded.title).toBe('Sillón');
    expect(loaded.searchTitle).toBeUndefined();
    expect(loaded.searchDescription).toBeUndefined();
    expect(loaded.searchKeywords).toBeUndefined();
    expect(loaded.searchMaterial).toBeUndefined();
    expect(
      (
        await db.query<{ text: string }>(
          'SELECT search_title AS text FROM products WHERE id = $1',
          [saved.id],
        )
      ).rows[0].text,
    ).toBe(' sillon ');
    await expect(
      db.query("UPDATE products SET search_title = 'override' WHERE id = $1", [
        saved.id,
      ]),
    ).rejects.toMatchObject({ code: '428C9' });
  });

  it('preserves catalog substrings, normalized phrases, price filters and pagination', async () => {
    const a = await seed('SILLÓN de oficina', { price: 400 });
    const b = await seed('Mesa', {
      description: 'Sillón de oficina',
      price: 600,
    });
    await seed('Mesa', { keywords: ['sillón', 'de oficina'], price: 900 });
    await seed('Sillón de oficina', { active: false });
    const first = await catalog.findAll({
      search: 'SILLÓN---de OFICINA',
      maxPrice: 800,
      page: 1,
      limit: 1,
    });
    const second = await catalog.findAll({
      search: 'sillón de oficina',
      maxPrice: 800,
      page: 2,
      limit: 1,
    });
    expect(first.total).toBe(2);
    expect(first.totalPages).toBe(2);
    expect(new Set([...first.data, ...second.data].map((p) => p.id))).toEqual(
      new Set([a, b]),
    );
    expect(first.data[0].price).toBeLessThanOrEqual(800);
    expect(first.data[0].currencyCode).toBe('BOB');
    expect((await catalog.findAll({ search: 'illón' })).total).toBe(3);
    expect((await catalog.findAll({ search: '---' })).total).toBe(0);
  });

  it('preserves lexical prefixes, relevance and a stable limit with joined assets', async () => {
    const title = await seed('Silla cómoda');
    const keyword = await seed('Asiento', { keywords: ['silla'] });
    const description = await seed('Asiento', {
      description: 'Silla de oficina',
    });
    const plural = await seed('Sillas de madera');
    await seed('Resilla');
    await db.query(
      `INSERT INTO product_assets (product_id, url) VALUES ($1, 'a.webp'), ($1, 'b.webp')`,
      [title],
    );
    const prefix = await lexical.search(intent(['sil']), 10, 'BO');
    expect(new Set(prefix.map((p) => p.id))).toEqual(
      new Set([title, keyword, description, plural]),
    );
    const aliases = await lexical.search(intent(['silla']), 2, 'BO');
    expect(aliases.map((p) => p.id)).toEqual([title, plural]);
    expect(aliases[0].assets).toHaveLength(2);
    expect(Number(aliases[0].listings[0].price)).toBe(400);
    expect(aliases[0].searchTitle).toBeUndefined();
  });

  it('returns a market-priced catalog summary while preserving full product details', async () => {
    const id = await seed('Catalog desk', { price: 725 });
    const category = await source.getRepository(Category).save({
      code: 'CATALOG_TEST',
      name: 'Catalog desks',
    });
    await products.update(id, { categoryId: category.id });
    await db.query(
      `INSERT INTO product_assets (product_id, url, type, "isPrimary", metadata)
       VALUES ($1, 'https://example.com/secondary.webp', 'image', false, '{}'),
              ($1, 'https://example.com/cover.webp', 'image', true, '{"alt":"Desk cover","width":2400}'),
              ($1, 'https://example.com/desk.glb', 'model_3d', true, '{}')`,
      [id],
    );
    const page = await catalog.findAll({ page: 1, limit: 10 });
    expect(page.data).toEqual([
      {
        id,
        title: 'Catalog desk',
        price: 725,
        currencyCode: 'BOB',
        category: { id: category.id, name: 'Catalog desks' },
        primaryImage: {
          url: 'https://example.com/cover.webp',
          alt: 'Desk cover',
        },
      },
    ]);
    expect(page.total).toBe(1);
    const detail = await catalog.findOne(id);
    expect(detail.assets).toHaveLength(3);
    expect(detail.specifications).toBeDefined();
    expect(detail.sellerId).toBe(sellerId);
  });

  it('paginates products independently of asset counts and falls back to a non-primary image', async () => {
    const firstId = await seed('Desk');
    const secondId = await seed('Chair');
    const noImageId = await seed('Table');
    await db.query(
      `INSERT INTO product_assets (product_id, url, type, "isPrimary")
       VALUES ($1, 'https://example.com/desk.glb', 'model_3d', true),
              ($1, 'https://example.com/desk.webp', 'image', false),
              ($2, '', 'image', true),
              ($2, 'https://example.com/chair.webp', 'image', false)`,
      [firstId, secondId],
    );
    const pages = await Promise.all(
      [1, 2, 3].map((page) => catalog.findAll({ page, limit: 1 })),
    );
    expect(
      pages.every((page) => page.total === 3 && page.totalPages === 3),
    ).toBe(true);
    const summaries = pages.flatMap((page) => page.data);
    expect(new Set(summaries.map((product) => product.id))).toEqual(
      new Set([firstId, secondId, noImageId]),
    );
    expect(
      summaries.find((product) => product.id === firstId)?.primaryImage?.url,
    ).toBe('https://example.com/desk.webp');
    expect(
      summaries.find((product) => product.id === secondId)?.primaryImage?.url,
    ).toBe('https://example.com/chair.webp');
    expect(
      summaries.find((product) => product.id === noImageId)?.primaryImage,
    ).toBeNull();
    const empty = await catalog.findAll({ page: 4, limit: 1 });
    expect(empty.data).toEqual([]);
    expect(empty.total).toBe(3);
  });

  it('keeps material and measurement retrieval constrained to active listings in the requested market', async () => {
    const small = await seed('Mesa', { material: 'MADERÁ', width: 80 });
    await seed('Mesa', { material: 'Madera', width: 180 });
    await seed('Mesa', { material: 'Madera', width: 80, active: false });
    await db.exec(
      `INSERT INTO markets (code, name, currency_code, default_locale, region_code, supported_locales, flag_emoji)
       VALUES ('PE', 'Peru', 'PEN', 'es-PE', 'SOUTH_AMERICA', ARRAY['es-PE'], 'PE')`,
    );
    await seed('Mesa', { material: 'Madera', width: 80, market: 'PE' });
    const measurements = [
      {
        dimension: ProductDimension.WIDTH,
        maximum: { valueCm: 90, inclusive: true },
      },
    ];
    expect(
      (
        await lexical.search(intent(['madera'], { measurements }), 10, 'BO')
      ).map((p) => p.id),
    ).toEqual([small]);
    expect(
      (await lexical.search(intent([], { measurements }), 10, 'BO')).map(
        (p) => p.id,
      ),
    ).toEqual([small]);
  });

  it('requires a product term and ranks attribute coverage before the lexical limit', async () => {
    await seed('Mesa azul cómoda');
    await seed('Silla azul');
    const best = await seed('Asiento de oficina', {
      keywords: ['azul', 'cómoda'],
    });
    const response = await lexical.search(
      intent(['azul', 'cómoda'], { productTerms: ['silla', 'asiento'] }),
      1,
      'BO',
    );
    expect(response.map((product) => product.id)).toEqual([best]);
  });

  it('uses material aliases before lexical and vector limits', async () => {
    const metal = await seed('Escritorio', { material: 'Metal' });
    const wood = await seed('Modelo de oficina', {
      keywords: ['escritorio'],
      material: 'MADERÁ',
    });
    const material = { label: 'Wood', aliases: ['wood', 'madera'] };
    expect(
      (await lexical.search(intent(['escritorio'], { material }), 1, 'BO')).map(
        (product) => product.id,
      ),
    ).toEqual([wood]);

    const queryVector = JSON.stringify([1, ...Array<number>(767).fill(0)]);
    const woodVector = JSON.stringify([
      0.8,
      0.2,
      ...Array<number>(766).fill(0),
    ]);
    for (const [id, embedding] of [
      [metal, queryVector],
      [wood, woodVector],
    ]) {
      await db.query(
        `UPDATE products SET embedding = $2::vector, embedding_model = 'material-test', embedding_revision = search_revision, embedding_content_version = $3 WHERE id = $1`,
        [id, embedding, PRODUCT_EMBEDDING_CONTENT_VERSION],
      );
    }
    const vectors = new ProductVectorRepository(products, {
      getOrThrow: () => 'material-test',
    } as unknown as ConfigService);
    const response = await vectors.findBySimilarity(
      queryVector,
      1,
      0.3,
      'BO',
      [],
      undefined,
      undefined,
      undefined,
      material.aliases,
    );
    expect(response.map((product) => product.id)).toEqual([wood]);
  });

  it('applies all measurement bounds in centimeters before both retrieval limits', async () => {
    const valid = await seed('Mesa cm', {
      width: 160,
      depth: 75,
      height: 76.2,
    });
    const metric = await seed('Mesa m', {
      width: 1.6,
      depth: 0.75,
      height: 0.762,
      unit: 'm',
    });
    const inches = await seed('Mesa in', {
      width: 60,
      depth: 30,
      height: 30,
      unit: 'in',
    });
    const boundary = await seed('Mesa al límite', {
      width: 180,
      depth: 75,
      height: 76.2,
    });
    const narrow = await seed('Mesa estrecha', {
      width: 149,
      depth: 75,
      height: 76.2,
    });
    const deep = await seed('Mesa profunda', {
      width: 160,
      depth: 81,
      height: 76.2,
    });
    const tall = await seed('Mesa alta', { width: 160, depth: 75, height: 77 });
    const measurements = [
      {
        dimension: ProductDimension.WIDTH,
        minimum: { valueCm: 150, inclusive: true },
        maximum: { valueCm: 180, inclusive: false },
      },
      {
        dimension: ProductDimension.DEPTH,
        maximum: { valueCm: 80, inclusive: true },
      },
      {
        dimension: ProductDimension.HEIGHT,
        minimum: { valueCm: 76.2, inclusive: true },
        maximum: { valueCm: 76.2, inclusive: true },
      },
    ];
    const expected = [valid, metric, inches].sort();
    expect(
      (await lexical.search(intent([], { measurements }), 10, 'BO'))
        .map((product) => product.id)
        .sort(),
    ).toEqual(expected);
    const queryVector = JSON.stringify([1, ...Array<number>(767).fill(0)]);
    for (const id of [...expected, boundary, narrow, deep, tall]) {
      await db.query(
        `UPDATE products SET embedding = $2::vector, embedding_model = 'measurement-test', embedding_revision = search_revision, embedding_content_version = $3 WHERE id = $1`,
        [id, queryVector, PRODUCT_EMBEDDING_CONTENT_VERSION],
      );
    }
    const vectors = new ProductVectorRepository(products, {
      getOrThrow: () => 'measurement-test',
    } as unknown as ConfigService);
    expect(
      (await vectors.findBySimilarity(queryVector, 10, 0.3, 'BO', measurements))
        .map((product) => product.id)
        .sort(),
    ).toEqual(expected);
    const [literal] = await lexical.search(
      intent([], { measurements }),
      1,
      'BO',
    );
    const [semantic] = await vectors.findBySimilarity(
      queryVector,
      1,
      0.3,
      'BO',
      measurements,
    );
    expect(expected).toContain(literal.id);
    expect(expected).toContain(semantic.id);
  });

  it('uses GIN indexes for selective substring and word searches without disabling sequential scans', async () => {
    await db.query(
      `INSERT INTO products (seller_id, title, description, keywords, specifications, price)
      SELECT $1::uuid, 'Producto genérico ' || n, 'Catálogo de oficina ' || n, ARRAY['catalogo'], '{"material":"madera"}', 100
      FROM generate_series(1, 12000) n`,
      [sellerId],
    );
    await seed('Quásar', {
      description: 'Quásar',
      keywords: ['Quásar'],
      material: 'Quásar',
    });
    await db.exec('VACUUM ANALYZE products');
    for (const pattern of ['%quasar%', '% quasar %', '% quas%']) {
      const plan = await db.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id FROM products WHERE search_title LIKE $1 OR search_description LIKE $1 OR search_keywords LIKE $1 OR search_material LIKE $1`,
        [pattern],
      );
      const serialized = JSON.stringify(plan.rows);
      for (const field of ['title', 'description', 'keywords', 'material']) {
        expect(serialized).toContain(`IDX_products_search_${field}_trgm`);
      }
      expect(serialized).toContain('BitmapOr');
    }
  }, 30_000);

  it('rolls back only its columns, indexes and helper, preserving products and the shared extension', async () => {
    const id = await seed('Escritorio');
    await migration.down(runner);
    expect(
      (await db.query('SELECT id FROM products WHERE id = $1', [id])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'"))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "SELECT 1 FROM pg_indexes WHERE indexname LIKE 'IDX_products_search_%'",
        )
      ).rows,
    ).toHaveLength(0);
    await migration.up(runner);
    expect(
      (await lexical.search(intent(['escritorio']), 10, 'BO')).map((p) => p.id),
    ).toEqual([id]);
  });
});
