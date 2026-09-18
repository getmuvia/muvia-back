import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductEmbeddingModel1789747200000 implements MigrationInterface {
  name = 'AddProductEmbeddingModel1789747200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD "embedding_model" varchar(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN "embedding_model"
    `);
  }
}
