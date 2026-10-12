import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorRepairs1791763200000 implements MigrationInterface {
  name = 'AddVendorRepairs1791763200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vendor_profiles
        ADD COLUMN offers_repairs boolean NOT NULL DEFAULT false,
        ADD COLUMN repair_scope varchar(160),
        ADD COLUMN repair_details varchar(500),
        ADD COLUMN repairs_external_products boolean NOT NULL DEFAULT false,
        ADD CONSTRAINT ck_vendor_repair_settings CHECK (
          (offers_repairs AND repair_scope IS NOT NULL AND length(btrim(repair_scope)) > 0)
          OR
          (NOT offers_repairs AND repair_scope IS NULL AND repair_details IS NULL
            AND NOT repairs_external_products)
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vendor_profiles
        DROP CONSTRAINT ck_vendor_repair_settings,
        DROP COLUMN repairs_external_products,
        DROP COLUMN repair_details,
        DROP COLUMN repair_scope,
        DROP COLUMN offers_repairs
    `);
  }
}
