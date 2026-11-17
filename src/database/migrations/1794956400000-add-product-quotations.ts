import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductQuotations1794956400000 implements MigrationInterface {
  name = 'AddProductQuotations1794956400000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE quotations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL,
      product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_email varchar NOT NULL, seller_name varchar, product_title varchar NOT NULL,
      product_image_url text, market_code char(2) NOT NULL, currency_code char(3) NOT NULL,
      published_price numeric(10,2) NOT NULL,
      published_dimensions jsonb NOT NULL, requested_dimensions jsonb NOT NULL,
      notes text NOT NULL DEFAULT '', status varchar(20) NOT NULL DEFAULT 'PENDING',
      quoted_price numeric(10,2), lead_time_min_days integer, lead_time_max_days integer,
      response_message text, responded_at timestamptz, seller_viewed_at timestamptz,
      customer_viewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_quotations_customer_request" UNIQUE(customer_id, request_id),
      CONSTRAINT "CHK_quotations_participants" CHECK(customer_id <> seller_id),
      CONSTRAINT "CHK_quotations_response" CHECK (
        (status = 'PENDING' AND responded_at IS NULL AND response_message IS NULL AND quoted_price IS NULL AND lead_time_min_days IS NULL AND lead_time_max_days IS NULL)
        OR (status = 'DECLINED' AND responded_at IS NOT NULL AND response_message IS NOT NULL AND length(btrim(response_message)) > 0 AND quoted_price IS NULL AND lead_time_min_days IS NULL AND lead_time_max_days IS NULL)
        OR (status = 'QUOTED' AND responded_at IS NOT NULL AND response_message IS NOT NULL AND length(btrim(response_message)) > 0 AND quoted_price IS NOT NULL AND quoted_price > 0 AND lead_time_min_days IS NOT NULL AND lead_time_max_days IS NOT NULL AND lead_time_min_days > 0 AND lead_time_max_days >= lead_time_min_days)
      )
    )`);
    await runner.query(
      'CREATE INDEX "IDX_quotations_customer_created" ON quotations(customer_id, created_at)',
    );
    await runner.query(
      'CREATE INDEX "IDX_quotations_seller_created" ON quotations(seller_id, created_at)',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE quotations');
  }
}
