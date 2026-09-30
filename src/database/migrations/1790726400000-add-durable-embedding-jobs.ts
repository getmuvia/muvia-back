import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDurableEmbeddingJobs1790726400000 implements MigrationInterface {
  name = 'AddDurableEmbeddingJobs1790726400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing vectors are intentionally unverified until rebuilt by the queue.
    await queryRunner.query(`
      ALTER TABLE products
        ADD search_revision integer NOT NULL DEFAULT 1,
        ADD embedding_revision integer,
        ADD embedding_target_id uuid;

      CREATE TABLE product_embedding_jobs (
        id uuid PRIMARY KEY,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        revision integer NOT NULL,
        model varchar(100) NOT NULL,
        content_version smallint NOT NULL,
        document text NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending'
          CONSTRAINT "CHK_embedding_jobs_status"
          CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'superseded', 'failed')),
        attempts integer NOT NULL DEFAULT 0,
        dispatch_version integer NOT NULL DEFAULT 0,
        lease_token uuid,
        lease_expires_at timestamptz,
        next_dispatch_at timestamptz NOT NULL DEFAULT now(),
        last_error varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX "IDX_embedding_jobs_product" ON product_embedding_jobs(product_id);
      CREATE INDEX "IDX_embedding_jobs_dispatch" ON product_embedding_jobs(next_dispatch_at)
        WHERE status IN ('pending', 'queued', 'processing');
      CREATE INDEX "IDX_embedding_jobs_cleanup" ON product_embedding_jobs(updated_at)
        WHERE status IN ('completed', 'superseded');
      CREATE INDEX "IDX_products_pending_embedding" ON products(id)
        WHERE embedding_revision IS DISTINCT FROM search_revision;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE product_embedding_jobs;
      DROP INDEX "IDX_products_pending_embedding";
      ALTER TABLE products
        DROP COLUMN embedding_target_id,
        DROP COLUMN embedding_revision,
        DROP COLUMN search_revision;
    `);
  }
}
