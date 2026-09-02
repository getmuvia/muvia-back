import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVirtualStagingQuota1788321600000
  implements MigrationInterface
{
  name = 'AddVirtualStagingQuota1788321600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD "virtualStagingQuotaRemaining" smallint NOT NULL DEFAULT 10
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD "virtualStagingQuotaDay" date
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CK_users_virtual_staging_quota_remaining"
      CHECK ("virtualStagingQuotaRemaining" BETWEEN 0 AND 10)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "CK_users_virtual_staging_quota_remaining"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "virtualStagingQuotaDay"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "virtualStagingQuotaRemaining"
    `);
  }
}
