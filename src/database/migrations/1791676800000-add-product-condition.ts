import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductCondition1791676800000 implements MigrationInterface {
  name = 'AddProductCondition1791676800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE product_condition_enum AS ENUM ('NEW', 'USED')`,
    );
    // Existing products are new; future inserts also default to NEW.
    await queryRunner.query(
      `ALTER TABLE products ADD COLUMN condition product_condition_enum NOT NULL DEFAULT 'NEW'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE products DROP COLUMN condition');
    await queryRunner.query('DROP TYPE product_condition_enum');
  }
}
