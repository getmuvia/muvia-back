import { MigrationInterface, QueryRunner } from 'typeorm';

// Keep historical generation expressions independent of application helpers.
function searchText(expression: string): string {
  const unaccented = `regexp_replace(lower(normalize(COALESCE(${expression}, ''), NFD)), U&'[\\0300-\\036f]', '', 'g')`;
  return `(' ' || btrim(regexp_replace(${unaccented}, '[^[:alnum:]]+', ' ', 'g')) || ' ')`;
}

export class AddProductSearchText1790726401000 implements MigrationInterface {
  name = 'AddProductSearchText1790726401000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    // array_to_string(anyarray, text) is STABLE because element rendering can
    // depend on settings. This text-only join uses immutable text operations.
    await queryRunner.query(`
      CREATE FUNCTION muvia_join_search_keywords(items text[]) RETURNS text
      LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
      DECLARE
        item text;
        joined text := '';
        separator text := '';
      BEGIN
        IF items IS NULL THEN RETURN joined; END IF;
        FOREACH item IN ARRAY items LOOP
          IF item IS NOT NULL THEN
            joined := joined || separator || item;
            separator := ' ';
          END IF;
        END LOOP;
        RETURN joined;
      END;
      $$;

      ALTER TABLE products
        ADD search_title text GENERATED ALWAYS AS (${searchText('title')}) STORED NOT NULL,
        ADD search_description text GENERATED ALWAYS AS (${searchText('description')}) STORED NOT NULL,
        ADD search_keywords text GENERATED ALWAYS AS (${searchText('muvia_join_search_keywords(keywords)')}) STORED NOT NULL,
        ADD search_material text GENERATED ALWAYS AS (${searchText("specifications ->> 'material'")}) STORED NOT NULL;

      CREATE INDEX "IDX_products_search_title_trgm" ON products USING gin (search_title gin_trgm_ops);
      CREATE INDEX "IDX_products_search_description_trgm" ON products USING gin (search_description gin_trgm_ops);
      CREATE INDEX "IDX_products_search_keywords_trgm" ON products USING gin (search_keywords gin_trgm_ops);
      CREATE INDEX "IDX_products_search_material_trgm" ON products USING gin (search_material gin_trgm_ops);
      ANALYZE products;
    `);

    // TypeORM reads generation expressions from its metadata table, not from
    // PostgreSQL's reformatted expression. Preserve development synchronization.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS typeorm_metadata (
        "type" varchar NOT NULL, "database" varchar, "schema" varchar,
        "table" varchar, "name" varchar, "value" text
      );
    `);
    for (const [name, expression] of [
      ['search_title', 'title'],
      ['search_description', 'description'],
      ['search_keywords', 'muvia_join_search_keywords(keywords)'],
      ['search_material', "specifications ->> 'material'"],
    ]) {
      await queryRunner.query(
        `INSERT INTO typeorm_metadata ("type", "database", "schema", "table", "name", "value")
         VALUES ('GENERATED_COLUMN', current_database(), current_schema(), 'products', $1, $2)`,
        [name, searchText(expression)],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
        DROP COLUMN search_title,
        DROP COLUMN search_description,
        DROP COLUMN search_keywords,
        DROP COLUMN search_material;
      DROP FUNCTION muvia_join_search_keywords(text[]);
      DELETE FROM typeorm_metadata WHERE "type" = 'GENERATED_COLUMN'
        AND "database" = current_database() AND "schema" = current_schema()
        AND "table" = 'products'
        AND "name" IN ('search_title', 'search_description', 'search_keywords', 'search_material');
    `);
    // pg_trgm may be shared by other tables; never remove it on rollback.
  }
}
