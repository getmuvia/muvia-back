import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductEmbeddingContentVersion1790380800000 implements MigrationInterface {
  name = 'AddProductEmbeddingContentVersion1790380800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD "embedding_content_version" smallint
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN "embedding_content_version"
    `);
  }
}
