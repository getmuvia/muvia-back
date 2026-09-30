import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import { AI_ENV_KEYS } from '../../../config/ai.config';
import { EMBEDDING_JOB_SETTINGS } from '../../../config/embedding-jobs.config';
import type { EmbeddingDispatch } from '../interfaces/embedding-task-queue.interface';
import { Product } from '../../products/entities/product.entity';
import { PRODUCT_EMBEDDING_CONTENT_VERSION } from '../constants/ai.constants';
import {
  type EmbeddingJobStatus,
  ProductEmbeddingJob,
} from '../entities/product-embedding-job.entity';
import { buildProductSearchDocument } from '../services/embedding/product-search-document';

export type EmbeddingClaim =
  | { kind: 'claimed'; job: ProductEmbeddingJob }
  | { kind: 'finished' }
  | { kind: 'busy' };

/** Transactional outbox and fenced persistence for product embeddings. */
@Injectable()
export class ProductEmbeddingRepository {
  readonly model: string;
  readonly contentVersion = PRODUCT_EMBEDDING_CONTENT_VERSION;

  constructor(
    @InjectRepository(Product) private readonly repository: Repository<Product>,
    configService: ConfigService,
  ) {
    this.model = configService.getOrThrow<string>(AI_ENV_KEYS.embeddingModel);
  }

  async document(manager: EntityManager, productId: string): Promise<string> {
    const product = await this.snapshot(manager, productId);
    return product ? buildProductSearchDocument(product) : '';
  }

  /** Caller owns the product transaction; its row lock serializes edits. */
  async recordChange(
    manager: EntityManager,
    productId: string,
    previousDocument?: string,
  ): Promise<string | null> {
    const product = await this.snapshot(manager, productId, true);
    if (!product) return null;
    const document = buildProductSearchDocument(product);
    if (previousDocument !== undefined && document === previousDocument)
      return null;
    return this.insertJob(
      manager,
      product,
      document,
      product.searchRevision + (previousDocument === undefined ? 0 : 1),
    );
  }

  /** Bounded reconciliation also discovers model/version migrations. */
  async reconcile(limit: number, retryFailed = false): Promise<number> {
    return this.repository.manager.transaction(async (manager) => {
      const products = await manager.query<Array<{ id: string }>>(
        `SELECT p.id FROM products p
         LEFT JOIN product_embedding_jobs j ON j.id = p.embedding_target_id
         WHERE (p.embedding IS NULL
           OR p.embedding_revision IS DISTINCT FROM p.search_revision
           OR p.embedding_model IS DISTINCT FROM $1
           OR p.embedding_content_version IS DISTINCT FROM $2)
           AND (j.id IS NULL OR j.revision <> p.search_revision
             OR j.model <> $1 OR j.content_version <> $2
             OR j.status IN ('completed', 'superseded')
             OR ($4 AND j.status = 'failed'))
         ORDER BY p.id LIMIT $3 FOR UPDATE OF p SKIP LOCKED`,
        [this.model, this.contentVersion, limit, retryFailed],
      );
      for (const { id } of products) await this.recordChange(manager, id);
      return products.length;
    });
  }

  async claimDispatch(
    limit: number,
    jobId?: string,
  ): Promise<EmbeddingDispatch[]> {
    return this.repository.query<EmbeddingDispatch[]>(
      `WITH candidates AS (
         SELECT j.id FROM product_embedding_jobs j
         JOIN products p ON p.embedding_target_id = j.id AND p.search_revision = j.revision
         WHERE j.status IN ('pending', 'queued', 'processing')
           AND j.model = $1 AND j.content_version = $2
           AND j.attempts < $3 AND j.dispatch_version < $7 AND j.next_dispatch_at <= now()
           AND (j.lease_expires_at IS NULL OR j.lease_expires_at <= now())
           AND ($4::uuid IS NULL OR j.id = $4)
         ORDER BY j.next_dispatch_at, j.id LIMIT $5 FOR UPDATE OF j SKIP LOCKED
       ), claimed AS (
         UPDATE product_embedding_jobs j
         SET dispatch_version = dispatch_version + 1,
             next_dispatch_at = now() + $6 * interval '1 second', updated_at = now()
         FROM candidates c WHERE j.id = c.id
         RETURNING j.id, j.dispatch_version AS "dispatchVersion"
       ) SELECT * FROM claimed`,
      [
        this.model,
        this.contentVersion,
        EMBEDDING_JOB_SETTINGS.maxAttempts,
        jobId ?? null,
        limit,
        EMBEDDING_JOB_SETTINGS.dispatchLeaseSeconds,
        EMBEDDING_JOB_SETTINGS.maxDispatchAttempts,
      ],
    );
  }

  async markDispatched(dispatch: EmbeddingDispatch): Promise<void> {
    await this.repository.query(
      `UPDATE product_embedding_jobs
       SET status = CASE WHEN status = 'pending' THEN 'queued' ELSE status END,
           next_dispatch_at = now() + $3 * interval '1 second', updated_at = now()
       WHERE id = $1 AND dispatch_version = $2
         AND status IN ('pending', 'queued', 'processing')`,
      [
        dispatch.id,
        dispatch.dispatchVersion,
        EMBEDDING_JOB_SETTINGS.recoverySeconds,
      ],
    );
  }

  async markDispatchFailed(
    dispatch: EmbeddingDispatch,
    message: string,
  ): Promise<void> {
    await this.repository.query(
      `UPDATE product_embedding_jobs SET last_error = $3, updated_at = now()
       WHERE id = $1 AND dispatch_version = $2
         AND status IN ('pending', 'queued', 'processing')`,
      [dispatch.id, dispatch.dispatchVersion, message.slice(0, 500)],
    );
  }

  async claimWork(jobId: string): Promise<EmbeddingClaim> {
    await this.finishObsolete(1, jobId);
    await this.failExhausted(1, jobId);
    const rows = await this.repository.query<ProductEmbeddingJob[]>(
      `WITH claimed AS (
         UPDATE product_embedding_jobs j
         SET status = 'processing', attempts = attempts + 1, lease_token = $2,
             lease_expires_at = now() + $3 * interval '1 second', updated_at = now()
         FROM products p
         WHERE j.id = $1 AND p.id = j.product_id
           AND p.search_revision = j.revision AND p.embedding_target_id = j.id
           AND j.model = $4 AND j.content_version = $5
           AND j.status IN ('pending', 'queued', 'processing') AND j.attempts < $6
           AND (j.lease_expires_at IS NULL OR j.lease_expires_at <= now())
         RETURNING j.id, j.product_id AS "productId", j.revision, j.model,
           j.content_version AS "contentVersion", j.document, j.attempts,
           j.lease_token AS "leaseToken"
       ) SELECT * FROM claimed`,
      [
        jobId,
        randomUUID(),
        EMBEDDING_JOB_SETTINGS.leaseSeconds,
        this.model,
        this.contentVersion,
        EMBEDDING_JOB_SETTINGS.maxAttempts,
      ],
    );
    if (rows[0]) return { kind: 'claimed', job: rows[0] };
    const statuses = await this.repository.query<
      Array<{ status: EmbeddingJobStatus }>
    >('SELECT status FROM product_embedding_jobs WHERE id = $1', [jobId]);
    return !statuses[0] ||
      ['completed', 'superseded', 'failed'].includes(statuses[0].status)
      ? { kind: 'finished' }
      : { kind: 'busy' };
  }

  /** Job lock + lease token fence prevent an expired worker from writing. */
  async complete(
    job: ProductEmbeddingJob,
    embedding: string,
  ): Promise<boolean> {
    return this.repository.manager.transaction(async (manager) => {
      const owned = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM product_embedding_jobs
         WHERE id = $1 AND lease_token = $2 AND status = 'processing' FOR UPDATE`,
        [job.id, job.leaseToken],
      );
      if (!owned.length) return false;
      const stored = await manager.query<Array<{ id: string }>>(
        `WITH stored AS (
           UPDATE products SET embedding = $1::vector, embedding_model = $2,
             embedding_content_version = $3, embedding_revision = $4
           WHERE id = $5 AND search_revision = $4 AND embedding_target_id = $6
           RETURNING id
         ) SELECT id FROM stored`,
        [
          embedding,
          job.model,
          job.contentVersion,
          job.revision,
          job.productId,
          job.id,
        ],
      );
      await manager.query(
        `UPDATE product_embedding_jobs SET status = $3, lease_token = NULL,
           lease_expires_at = NULL, last_error = NULL, updated_at = now()
         WHERE id = $1 AND lease_token = $2`,
        [job.id, job.leaseToken, stored.length ? 'completed' : 'superseded'],
      );
      return stored.length > 0;
    });
  }

  async fail(
    job: ProductEmbeddingJob,
    message: string,
    permanent: boolean,
  ): Promise<boolean> {
    const terminal =
      permanent || job.attempts >= EMBEDDING_JOB_SETTINGS.maxAttempts;
    await this.repository.query(
      `UPDATE product_embedding_jobs SET status = $3, last_error = $4,
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = $1 AND lease_token = $2 AND status = 'processing'`,
      [
        job.id,
        job.leaseToken,
        terminal ? 'failed' : 'queued',
        message.slice(0, 500),
      ],
    );
    return terminal;
  }

  async finishObsolete(limit: number, jobId?: string): Promise<void> {
    await this.repository.query(
      `UPDATE product_embedding_jobs SET status = 'superseded',
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id IN (
         SELECT j.id FROM product_embedding_jobs j JOIN products p ON p.id = j.product_id
         WHERE j.status IN ('pending', 'queued', 'processing')
           AND (p.embedding_target_id IS DISTINCT FROM j.id OR p.search_revision <> j.revision)
           AND ($1::uuid IS NULL OR j.id = $1) LIMIT $2
       )`,
      [jobId ?? null, limit],
    );
  }

  async failExhausted(limit: number, jobId?: string): Promise<void> {
    await this.repository.query(
      `UPDATE product_embedding_jobs SET status = 'failed', lease_token = NULL,
         lease_expires_at = NULL,
         last_error = CASE WHEN attempts >= $1 THEN 'Processing attempts exhausted'
           ELSE COALESCE(last_error, 'Task publication attempts exhausted') END, updated_at = now()
       WHERE status IN ('pending', 'queued', 'processing')
         AND (attempts >= $1 OR (dispatch_version >= $4 AND next_dispatch_at <= now()))
         AND (lease_expires_at IS NULL OR lease_expires_at <= now())
         AND id IN (
         SELECT id FROM product_embedding_jobs
         WHERE status IN ('pending', 'queued', 'processing')
           AND (attempts >= $1 OR (dispatch_version >= $4 AND next_dispatch_at <= now()))
           AND (lease_expires_at IS NULL OR lease_expires_at <= now())
           AND ($2::uuid IS NULL OR id = $2) LIMIT $3
       )`,
      [
        EMBEDDING_JOB_SETTINGS.maxAttempts,
        jobId ?? null,
        limit,
        EMBEDDING_JOB_SETTINGS.maxDispatchAttempts,
      ],
    );
  }

  async cleanup(limit: number): Promise<void> {
    await this.repository.query(
      `DELETE FROM product_embedding_jobs WHERE id IN (
         SELECT id FROM product_embedding_jobs WHERE status IN ('completed', 'superseded')
           AND updated_at < now() - $1 * interval '1 day' LIMIT $2
       )`,
      [EMBEDDING_JOB_SETTINGS.retentionDays, limit],
    );
  }

  private async snapshot(
    manager: EntityManager,
    id: string,
    lock = false,
  ): Promise<Product | null> {
    const products = await manager.query<Product[]>(
      `SELECT p.id, p.title, p.description, p.specifications, p.keywords,
         p.search_revision AS "searchRevision",
         CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('name', c.name, 'code', c.code) END AS category
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 ${lock ? 'FOR UPDATE OF p' : ''}`,
      [id],
    );
    return products[0] ?? null;
  }

  private async insertJob(
    manager: EntityManager,
    product: Product,
    document: string,
    revision: number,
  ): Promise<string> {
    const id = randomUUID();
    await manager.query(
      `UPDATE products SET search_revision = $2, embedding_target_id = $3 WHERE id = $1`,
      [product.id, revision, id],
    );
    await manager.query(
      `INSERT INTO product_embedding_jobs (id, product_id, revision, model, content_version, document)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, product.id, revision, this.model, this.contentVersion, document],
    );
    return id;
  }
}
