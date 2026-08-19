import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1787070000000 implements MigrationInterface {
  name = 'InitialSchema1787070000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "vector"');

    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('admin', 'vendor', 'consumer')`,
    );
    await queryRunner.query(
      `CREATE TYPE "product_assets_type_enum" AS ENUM ('image', 'model_3d')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'consumer',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "businessName" character varying NOT NULL,
        "description" text,
        "logoUrl" character varying,
        "coverImage" character varying,
        "aboutMe" character varying(150),
        "socialLinks" jsonb,
        "businessHours" jsonb,
        "isVerified" boolean NOT NULL DEFAULT false,
        CONSTRAINT "UQ_vendor_profiles_user" UNIQUE ("user_id"),
        CONSTRAINT "PK_vendor_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_profiles_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "parent_id" uuid,
        "name" character varying NOT NULL,
        "description" text,
        "imageUrl" character varying,
        "level" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categories_parent" FOREIGN KEY ("parent_id")
          REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "seller_id" uuid NOT NULL,
        "category_id" uuid,
        "title" character varying NOT NULL,
        "description" text,
        "price" numeric(10,2) NOT NULL,
        "stock" integer NOT NULL DEFAULT 0,
        "specifications" jsonb,
        "keywords" text array NOT NULL DEFAULT '{}',
        "embedding" vector(768),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_seller" FOREIGN KEY ("seller_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "url" character varying NOT NULL,
        "type" "product_assets_type_enum" NOT NULL DEFAULT 'image',
        "isPrimary" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        CONSTRAINT "PK_product_assets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_assets_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_products_seller" ON "products" ("seller_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_category" ON "products" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_assets_product" ON "product_assets" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_embedding_cosine" ON "products" USING hnsw ("embedding" vector_cosine_ops)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "product_assets"');
    await queryRunner.query('DROP TABLE IF EXISTS "products"');
    await queryRunner.query('DROP TABLE IF EXISTS "categories"');
    await queryRunner.query('DROP TABLE IF EXISTS "vendor_profiles"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
    await queryRunner.query('DROP TYPE IF EXISTS "product_assets_type_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "users_role_enum"');
  }
}
