import { PGlite, type Transaction } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EntityManager, QueryRunner, Repository } from 'typeorm';
import { AddDurableEmbeddingJobs1790726400000 } from '../../../database/migrations/1790726400000-add-durable-embedding-jobs';
import { Product } from '../../products/entities/product.entity';
import { ProductVectorRepository } from '../../search/repositories/product-vector.repository';
import { PRODUCT_EMBEDDING_CONTENT_VERSION } from '../constants/ai.constants';
import { ProductEmbeddingJob } from '../entities/product-embedding-job.entity';
import { ProductEmbeddingRepository } from './product-embedding.repository';

describe('Durable embeddings against PostgreSQL + pgvector', () => {
  let db: PGlite;
  let manager: EntityManager;
  let storage: Repository<Product>;
  let jobs: ProductEmbeddingRepository;
  const migration = new AddDurableEmbeddingJobs1790726400000();
  const model = 'gemini-embedding-001';
  let productId: string;

  function configuration(value = model): ConfigService {
    return { getOrThrow: () => value } as unknown as ConfigService;
  }

  function executor(connection: PGlite | Transaction): EntityManager {
    return {
      query: async (sql: string, parameters?: unknown[]) =>
        (await connection.query(sql, parameters)).rows,
      transaction: async (
        work: (transactionManager: EntityManager) => Promise<unknown>,
      ) => db.transaction((transaction) => work(executor(transaction))),
    } as unknown as EntityManager;
  }

  async function seed(): Promise<void> {
    await manager.query(
      `INSERT INTO products (id, title, keywords, embedding, embedding_model, embedding_content_version)
       VALUES ($1, 'Original desk', ARRAY['office'], '[1,0,0]', $2, $3)`,
      [productId, model, PRODUCT_EMBEDDING_CONTENT_VERSION],
    );
    await manager.query(
      `INSERT INTO product_listings (product_id, market_code, is_active, price, stock, currency_code)
       VALUES ($1, 'BO', true, 100, 2, 'BOB')`,
      [productId],
    );
  }

  async function queue(): Promise<string> {
    const id = await manager.transaction((transaction) =>
      jobs.recordChange(transaction, productId),
    );
    if (!id) throw new Error('Expected a job');
    return id;
  }

  async function claim(id: string): Promise<ProductEmbeddingJob> {
    const result = await jobs.claimWork(id);
    if (result.kind !== 'claimed')
      throw new Error(`Unexpected claim: ${result.kind}`);
    return result.job;
  }

  async function edit(title: string): Promise<string | null> {
    return manager.transaction(async (transaction) => {
      await transaction.query(
        'SELECT id FROM products WHERE id = $1 FOR UPDATE',
        [productId],
      );
      const previous = await jobs.document(transaction, productId);
      await transaction.query('UPDATE products SET title = $2 WHERE id = $1', [
        productId,
        title,
      ]);
      return jobs.recordChange(transaction, productId, previous);
    });
  }

  beforeAll(async () => {
    db = new PGlite({ extensions: { vector } });
    await db.exec(`
      CREATE EXTENSION vector;
      CREATE TABLE categories (id uuid PRIMARY KEY, name text, code text);
      CREATE TABLE products (
        id uuid PRIMARY KEY, category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
        seller_id uuid, title text NOT NULL, description text, specifications jsonb,
        keywords text[] DEFAULT '{}', "createdAt" timestamptz DEFAULT now(),
        embedding vector(3), embedding_model varchar(100), embedding_content_version smallint
      );
      CREATE TABLE product_listings (
        product_id uuid REFERENCES products(id) ON DELETE CASCADE,
        market_code text, is_active boolean, price decimal, stock integer, currency_code text
      );
      CREATE TABLE product_assets (
        product_id uuid REFERENCES products(id) ON DELETE CASCADE, "isPrimary" boolean, url text
      );
    `);
    await migration.up({
      query: (sql: string) => db.exec(sql),
    } as unknown as QueryRunner);
    manager = executor(db);
    storage = {
      manager,
      query: (sql: string, parameters?: unknown[]) =>
        manager.query<unknown[]>(sql, parameters),
    } as unknown as Repository<Product>;
    jobs = new ProductEmbeddingRepository(storage, configuration());
  }, 30_000);

  beforeEach(async () => {
    await db.exec(
      'TRUNCATE products, categories, product_embedding_jobs, product_listings, product_assets CASCADE',
    );
    productId = randomUUID();
    await seed();
  });

  afterAll(async () => {
    if (!db) return;
    await migration.down({
      query: (sql: string) => db.exec(sql),
    } as unknown as QueryRunner);
    await db.close();
  });

  it('does not assume that an existing vector matches the new revision', async () => {
    const rows = await manager.query<
      Array<{ embedding_revision: number | null }>
    >('SELECT embedding_revision FROM products WHERE id = $1', [productId]);
    expect(rows[0].embedding_revision).toBeNull();
    expect(await jobs.reconcile(25)).toBe(1);
    expect(await jobs.reconcile(25)).toBe(0);
  });

  it('rolls back the product and its outbox record together', async () => {
    const newId = randomUUID();
    await expect(
      manager.transaction(async (transaction) => {
        await transaction.query(
          "INSERT INTO products (id, title) VALUES ($1, 'New desk')",
          [newId],
        );
        await jobs.recordChange(transaction, newId);
        throw new Error('asset transaction failed');
      }),
    ).rejects.toThrow('asset transaction failed');
    expect(
      await manager.query('SELECT id FROM products WHERE id = $1', [newId]),
    ).toEqual([]);
    expect(
      await manager.query(
        'SELECT id FROM product_embedding_jobs WHERE product_id = $1',
        [newId],
      ),
    ).toEqual([]);
  });

  it('rejects an older generation after the newer edit has completed', async () => {
    const old = await claim(await queue());
    const newId = await edit('Updated desk');
    const current = await claim(newId!);
    expect(current.revision).toBe(old.revision + 1);
    expect(await jobs.complete(current, '[0,1,0]')).toBe(true);
    expect(await jobs.complete(old, '[1,0,0]')).toBe(false);
    const rows = await manager.query<
      Array<{
        embedding: string;
        embedding_revision: number;
        search_revision: number;
      }>
    >(
      'SELECT embedding::text, embedding_revision, search_revision FROM products WHERE id = $1',
      [productId],
    );
    expect(rows[0]).toEqual({
      embedding: '[0,1,0]',
      embedding_revision: 2,
      search_revision: 2,
    });
  });

  it('claims duplicate deliveries once and skips completed jobs', async () => {
    const id = await queue();
    const claims = await Promise.all([jobs.claimWork(id), jobs.claimWork(id)]);
    expect(claims.map((item) => item.kind).sort()).toEqual(['busy', 'claimed']);
    const active = claims.find((item) => item.kind === 'claimed');
    if (active?.kind !== 'claimed') throw new Error('Missing claim');
    await jobs.complete(active.job, '[0,1,0]');
    expect(await jobs.claimWork(id)).toEqual({ kind: 'finished' });
  });

  it('recovers an expired lease and fences off its previous owner', async () => {
    const id = await queue();
    const previous = await claim(id);
    await manager.query(
      "UPDATE product_embedding_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    const replacement = await claim(id);
    expect(replacement.leaseToken).not.toBe(previous.leaseToken);
    expect(replacement.attempts).toBe(2);
    expect(await jobs.complete(previous, '[1,0,0]')).toBe(false);
    await jobs.fail(previous, 'late failure', false);
    expect(await jobs.complete(replacement, '[0,1,0]')).toBe(true);
  });

  it('publishes committed work and republishes a task lost by the queue', async () => {
    const id = await queue();
    const [first] = await jobs.claimDispatch(25);
    expect(first).toEqual({ id, dispatchVersion: 1 });
    expect(await jobs.claimDispatch(25)).toEqual([]);
    await jobs.markDispatched(first);
    await manager.query(
      "UPDATE product_embedding_jobs SET next_dispatch_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect(await jobs.claimDispatch(25)).toEqual([{ id, dispatchVersion: 2 }]);
  });

  it('keeps a failed publication recoverable without creating another product job', async () => {
    const id = await queue();
    const [dispatch] = await jobs.claimDispatch(25);
    await jobs.markDispatchFailed(dispatch, 'Cloud Tasks unavailable');
    expect(await jobs.reconcile(25)).toBe(0);
    await manager.query(
      "UPDATE product_embedding_jobs SET next_dispatch_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect(await jobs.claimDispatch(25)).toEqual([{ id, dispatchVersion: 2 }]);
  });

  it('does not regenerate equivalent specifications or an identical edit', async () => {
    await manager.query(
      'UPDATE products SET specifications = $2 WHERE id = $1',
      [productId, { material: 'wood', dimensions: { width: 100, height: 75 } }],
    );
    await queue();
    const previous = await jobs.document(manager, productId);
    await manager.query(
      'UPDATE products SET specifications = $2 WHERE id = $1',
      [productId, { dimensions: { height: 75, width: 100 }, material: 'wood' }],
    );
    expect(
      await manager.transaction((transaction) =>
        jobs.recordChange(transaction, productId, previous),
      ),
    ).toBeNull();
    expect(await edit('Original desk')).toBeNull();
    const rows = await manager.query<Array<{ count: number }>>(
      'SELECT count(*)::integer AS count FROM product_embedding_jobs',
    );
    expect(rows[0].count).toBe(1);
  });

  it('fences model migrations even when the product revision is unchanged', async () => {
    const old = await claim(await queue());
    const migrated = new ProductEmbeddingRepository(
      storage,
      configuration('new-model'),
    );
    expect(await migrated.reconcile(25)).toBe(1);
    expect(await jobs.complete(old, '[1,0,0]')).toBe(false);
    const rows = await manager.query<Array<{ id: string }>>(
      "SELECT id FROM product_embedding_jobs WHERE model = 'new-model'",
    );
    // An old deployment must leave the new model's active job retryable.
    expect(await jobs.claimWork(rows[0].id)).toEqual({ kind: 'busy' });
    const current = await migrated.claimWork(rows[0].id);
    if (current.kind !== 'claimed') throw new Error('Missing migrated job');
    expect(await migrated.complete(current.job, '[0,1,0]')).toBe(true);
    expect(await jobs.reconcile(25)).toBe(1); // Switching back still creates a new target.
  });

  it('persists bounded failures and only retries them when explicitly requested', async () => {
    const id = await queue();
    for (let attempt = 1; attempt <= 5; attempt++) {
      const active = await claim(id);
      expect(await jobs.fail(active, 'provider unavailable', false)).toBe(
        attempt === 5,
      );
    }
    expect(await jobs.claimWork(id)).toEqual({ kind: 'finished' });
    expect(await jobs.reconcile(25)).toBe(0);
    expect(await jobs.reconcile(25, true)).toBe(1);
  });

  it('bounds republications when deliveries never reach the worker', async () => {
    const id = await queue();
    for (let publication = 1; publication <= 5; publication++) {
      const [dispatch] = await jobs.claimDispatch(25);
      expect(dispatch.dispatchVersion).toBe(publication);
      await jobs.markDispatched(dispatch);
      if (publication < 5) {
        await manager.query(
          "UPDATE product_embedding_jobs SET next_dispatch_at = now() - interval '1 second' WHERE id = $1",
          [id],
        );
      }
    }
    expect(await jobs.claimDispatch(25)).toEqual([]);
    await jobs.failExhausted(25);
    const current = await claim(id); // Last delivery may still run before its recovery deadline.
    await jobs.fail(current, 'provider unavailable', false);
    await manager.query(
      "UPDATE product_embedding_jobs SET next_dispatch_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect(await jobs.claimWork(id)).toEqual({ kind: 'finished' });
    expect(await jobs.reconcile(25)).toBe(0);
    expect(await jobs.reconcile(25, true)).toBe(1);
  });

  it('closes a crashed final attempt instead of leaving it pending forever', async () => {
    const id = await queue();
    await manager.query(
      'UPDATE product_embedding_jobs SET attempts = 4 WHERE id = $1',
      [id],
    );
    await claim(id);
    await manager.query(
      "UPDATE product_embedding_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect(await jobs.claimWork(id)).toEqual({ kind: 'finished' });
    expect(await jobs.claimDispatch(25)).toEqual([]);
  });

  it('excludes unverified and outdated vectors from semantic results', async () => {
    const search = new ProductVectorRepository(storage, configuration());
    expect(await search.findBySimilarity('[1,0,0]', 5, 0.1)).toEqual([]);
    await jobs.complete(await claim(await queue()), '[1,0,0]');
    expect(await search.findBySimilarity('[1,0,0]', 5, 0.1)).toHaveLength(1);
    await edit('Changed desk');
    expect(await search.findBySimilarity('[1,0,0]', 5, 0.1)).toEqual([]);
  });

  it('bounds reconciliation batches and cascades jobs when a product is removed', async () => {
    for (let index = 0; index < 4; index++) {
      await manager.query(
        "INSERT INTO products (id, title) VALUES ($1, 'Desk')",
        [randomUUID()],
      );
    }
    expect(await jobs.reconcile(2)).toBe(2);
    expect(await jobs.reconcile(2)).toBe(2);
    expect(await jobs.reconcile(2)).toBe(1);
    await manager.query('DELETE FROM products WHERE id = $1', [productId]);
    expect(
      await manager.query(
        'SELECT id FROM product_embedding_jobs WHERE product_id = $1',
        [productId],
      ),
    ).toEqual([]);
  });
});
