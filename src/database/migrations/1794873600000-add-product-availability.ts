import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductAvailability1794873600000 implements MigrationInterface {
  name = 'AddProductAvailability1794873600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
        ADD COLUMN availability_mode varchar(20) NOT NULL DEFAULT 'IN_STOCK',
        ADD COLUMN lead_time_min_days integer,
        ADD COLUMN lead_time_max_days integer,
        ADD COLUMN accepts_custom_dimensions boolean NOT NULL DEFAULT false,
        ADD CONSTRAINT "CHK_product_availability" CHECK (
          (availability_mode = 'IN_STOCK' AND lead_time_min_days IS NULL AND lead_time_max_days IS NULL)
          OR (availability_mode = 'MADE_TO_ORDER'
            AND lead_time_min_days IS NOT NULL AND lead_time_max_days IS NOT NULL
            AND lead_time_min_days > 0 AND lead_time_max_days >= lead_time_min_days)
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE products
      DROP CONSTRAINT "CHK_product_availability",
      DROP COLUMN accepts_custom_dimensions,
      DROP COLUMN lead_time_max_days,
      DROP COLUMN lead_time_min_days,
      DROP COLUMN availability_mode`);
  }
}
