import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketsListingsAndTaxonomy1788880000000 implements MigrationInterface {
  name = 'AddMarketsListingsAndTaxonomy1788880000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "markets" (
        "code" char(2) NOT NULL,
        "name" varchar NOT NULL,
        "region_code" varchar(40) NOT NULL,
        "default_locale" varchar(35) NOT NULL,
        "supported_locales" text[] NOT NULL,
        "currency_code" char(3) NOT NULL,
        "flag_emoji" varchar(8) NOT NULL,
        "time_zones" text[] NOT NULL DEFAULT '{}',
        "is_active" boolean NOT NULL DEFAULT false,
        "is_default" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_markets" PRIMARY KEY ("code")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_markets_default" ON "markets" ("is_default")
      WHERE "is_default" = true
    `);
    await queryRunner.query(`
      INSERT INTO "markets" (
        "code", "name", "region_code", "default_locale", "supported_locales", "currency_code",
        "flag_emoji", "time_zones", "is_active", "is_default", "sort_order"
      ) VALUES (
        'BO', 'Bolivia', 'SOUTH_AMERICA', 'es-BO', ARRAY['es-BO'], 'BOB', '🇧🇴',
        ARRAY['America/La_Paz'], true, true, 10
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_locations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vendor_profile_id" uuid NOT NULL,
        "label" varchar(80),
        "country_code" char(2) NOT NULL,
        "region" varchar(120),
        "city" varchar(120),
        "is_primary" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_vendor_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_locations_profile" FOREIGN KEY ("vendor_profile_id")
          REFERENCES "vendor_profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_locations_market" FOREIGN KEY ("country_code")
          REFERENCES "markets"("code") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_vendor_locations_primary" ON "vendor_locations" ("vendor_profile_id")
      WHERE "is_primary" = true
    `);
    await queryRunner.query(`
      INSERT INTO "vendor_locations" (
        "vendor_profile_id", "label", "country_code", "is_primary"
      )
      SELECT "id", 'Principal', 'BO', true FROM "vendor_profiles"
    `);

    await queryRunner.query(`
      CREATE TABLE "product_listings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "vendor_location_id" uuid NOT NULL,
        "market_code" char(2) NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "currency_code" char(3) NOT NULL,
        "stock" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_product_listings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_listings_product_market" UNIQUE ("product_id", "market_code"),
        CONSTRAINT "CK_product_listings_price" CHECK ("price" > 0),
        CONSTRAINT "CK_product_listings_stock" CHECK ("stock" >= 0),
        CONSTRAINT "FK_product_listings_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_listings_location" FOREIGN KEY ("vendor_location_id")
          REFERENCES "vendor_locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_product_listings_market" FOREIGN KEY ("market_code")
          REFERENCES "markets"("code") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_product_listings_market" ON "product_listings" ("market_code", "is_active")`);
    await queryRunner.query(`CREATE INDEX "IDX_product_listings_location" ON "product_listings" ("vendor_location_id")`);
    await queryRunner.query(`
      INSERT INTO "product_listings" (
        "product_id", "vendor_location_id", "market_code", "price", "currency_code", "stock", "is_active"
      )
      SELECT p."id", vl."id", 'BO', p."price", 'BOB', p."stock", true
      FROM "products" p
      JOIN "vendor_profiles" vp ON vp."user_id" = p."seller_id"
      JOIN "vendor_locations" vl ON vl."vendor_profile_id" = vp."id" AND vl."is_primary" = true
    `);

    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN "code" varchar`);
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN "is_selectable" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`
      UPDATE "categories"
      SET "code" = CASE
        WHEN lower("name") IN ('muebles', 'furniture') THEN 'FURNITURE'
        WHEN lower("name") IN ('decoración', 'decoracion', 'decor') THEN 'DECOR'
        WHEN lower("name") IN ('iluminación', 'iluminacion', 'lighting') THEN 'LIGHTING'
        ELSE 'LEGACY_' || replace("id"::text, '-', '')
      END,
      "is_selectable" = false
    `);
    await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "code" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "UQ_categories_code" UNIQUE ("code")`);

    await queryRunner.query(`
      INSERT INTO "categories" ("id", "parent_id", "name", "code", "description", "level", "is_selectable")
      SELECT gen_random_uuid(), parent."id", seed.name, seed.code, seed.description, parent."level" + 1, true
      FROM (VALUES
        ('SOFA', 'Sofás', 'Asientos de varias plazas y sofás modulares.', 'FURNITURE'),
        ('ARMCHAIR', 'Sillones y butacas', 'Asientos individuales tapizados.', 'FURNITURE'),
        ('DIVAN', 'Divanes', 'Divanes, daybeds y asientos de descanso.', 'FURNITURE'),
        ('CHAIR', 'Sillas', 'Sillas para hogar, oficina y comedor.', 'FURNITURE'),
        ('TABLE', 'Mesas', 'Mesas y mesas auxiliares.', 'FURNITURE'),
        ('DESK', 'Escritorios', 'Escritorios y superficies de trabajo.', 'FURNITURE'),
        ('BED', 'Camas', 'Camas y estructuras de dormitorio.', 'FURNITURE'),
        ('MATTRESS', 'Colchones', 'Colchones y superficies de descanso.', 'FURNITURE'),
        ('WARDROBE', 'Armarios y roperos', 'Muebles para guardar ropa.', 'FURNITURE'),
        ('SHELF', 'Estanterías', 'Estantes, libreros y almacenamiento abierto.', 'FURNITURE'),
        ('DRESSER', 'Cómodas y aparadores', 'Muebles de almacenamiento bajo.', 'FURNITURE'),
        ('LAMP', 'Lámparas', 'Lámparas y luminarias.', 'LIGHTING'),
        ('RUG', 'Alfombras', 'Alfombras y tapetes.', 'DECOR'),
        ('CUSHION', 'Cojines', 'Cojines y almohadones decorativos.', 'DECOR'),
        ('CURTAIN', 'Cortinas', 'Cortinas y textiles para ventanas.', 'DECOR'),
        ('MIRROR', 'Espejos', 'Espejos decorativos y funcionales.', 'DECOR')
      ) AS seed(code, name, description, parent_code)
      JOIN "categories" parent ON parent."code" = seed.parent_code
    `);

    await queryRunner.query(`
      CREATE TABLE "category_translations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL,
        "locale" varchar(35) NOT NULL,
        "name" varchar NOT NULL,
        CONSTRAINT "PK_category_translations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_category_translations_category_locale" UNIQUE ("category_id", "locale"),
        CONSTRAINT "FK_category_translations_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      INSERT INTO "category_translations" ("category_id", "locale", "name")
      SELECT "id", 'es-BO', "name" FROM "categories"
    `);

    await queryRunner.query(`
      CREATE TABLE "category_aliases" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL,
        "locale" varchar(35) NOT NULL,
        "alias" varchar NOT NULL,
        "normalized_alias" varchar NOT NULL,
        CONSTRAINT "PK_category_aliases" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_category_aliases_locale_normalized" UNIQUE ("locale", "normalized_alias"),
        CONSTRAINT "FK_category_aliases_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_category_aliases_locale" ON "category_aliases" ("locale")`);
    await queryRunner.query(`
      INSERT INTO "category_aliases" ("category_id", "locale", "alias", "normalized_alias")
      SELECT c."id", seed.locale, seed.alias, seed.normalized
      FROM (VALUES
        ('SOFA','es-BO','sofá','sofa'), ('SOFA','es-BO','sofás','sofas'),
        ('SOFA','es-BO','futón','futon'), ('SOFA','es-BO','futones','futones'),
        ('SOFA','en','sofa','sofa'), ('SOFA','en','sofas','sofas'),
        ('SOFA','en','couch','couch'), ('SOFA','en','couches','couches'),
        ('ARMCHAIR','es-BO','sillón','sillon'), ('ARMCHAIR','es-BO','sillones','sillones'),
        ('ARMCHAIR','es-BO','butaca','butaca'), ('ARMCHAIR','es-BO','butacas','butacas'),
        ('ARMCHAIR','en','armchair','armchair'), ('ARMCHAIR','en','armchairs','armchairs'),
        ('DIVAN','es-BO','diván','divan'), ('DIVAN','es-BO','divanes','divanes'),
        ('DIVAN','en','daybed','daybed'), ('DIVAN','en','daybeds','daybeds'),
        ('CHAIR','es-BO','silla','silla'), ('CHAIR','es-BO','sillas','sillas'),
        ('CHAIR','en','chair','chair'), ('CHAIR','en','chairs','chairs'),
        ('TABLE','es-BO','mesa','mesa'), ('TABLE','es-BO','mesas','mesas'),
        ('TABLE','es-BO','mesita','mesita'), ('TABLE','es-BO','mesitas','mesitas'),
        ('TABLE','en','table','table'), ('TABLE','en','tables','tables'),
        ('DESK','es-BO','escritorio','escritorio'), ('DESK','es-BO','escritorios','escritorios'),
        ('DESK','en','desk','desk'), ('DESK','en','desks','desks'),
        ('BED','es-BO','cama','cama'), ('BED','es-BO','camas','camas'),
        ('BED','en','bed','bed'), ('BED','en','beds','beds'),
        ('MATTRESS','es-BO','colchón','colchon'), ('MATTRESS','es-BO','colchones','colchones'),
        ('MATTRESS','en','mattress','mattress'), ('MATTRESS','en','mattresses','mattresses'),
        ('WARDROBE','es-BO','armario','armario'), ('WARDROBE','es-BO','armarios','armarios'),
        ('WARDROBE','es-BO','ropero','ropero'), ('WARDROBE','es-BO','roperos','roperos'),
        ('WARDROBE','en','wardrobe','wardrobe'), ('WARDROBE','en','wardrobes','wardrobes'),
        ('SHELF','es-BO','estantería','estanteria'), ('SHELF','es-BO','estanterías','estanterias'),
        ('SHELF','es-BO','estante','estante'), ('SHELF','es-BO','estantes','estantes'),
        ('SHELF','es-BO','librero','librero'), ('SHELF','es-BO','libreros','libreros'),
        ('SHELF','en','shelf','shelf'), ('SHELF','en','shelves','shelves'),
        ('DRESSER','es-BO','cómoda','comoda'), ('DRESSER','es-BO','cómodas','comodas'),
        ('DRESSER','es-BO','aparador','aparador'), ('DRESSER','es-BO','aparadores','aparadores'),
        ('DRESSER','en','dresser','dresser'), ('DRESSER','en','dressers','dressers'),
        ('LAMP','es-BO','lámpara','lampara'), ('LAMP','es-BO','lámparas','lamparas'),
        ('LAMP','es-BO','luminaria','luminaria'), ('LAMP','es-BO','luminarias','luminarias'),
        ('LAMP','en','lamp','lamp'), ('LAMP','en','lamps','lamps'),
        ('RUG','es-BO','alfombra','alfombra'), ('RUG','es-BO','alfombras','alfombras'),
        ('RUG','es-BO','tapete','tapete'), ('RUG','es-BO','tapetes','tapetes'),
        ('RUG','en','rug','rug'), ('RUG','en','rugs','rugs'),
        ('CUSHION','es-BO','cojín','cojin'), ('CUSHION','es-BO','cojines','cojines'),
        ('CUSHION','es-BO','almohadón','almohadon'), ('CUSHION','es-BO','almohadones','almohadones'),
        ('CUSHION','en','cushion','cushion'), ('CUSHION','en','cushions','cushions'),
        ('CURTAIN','es-BO','cortina','cortina'), ('CURTAIN','es-BO','cortinas','cortinas'),
        ('CURTAIN','en','curtain','curtain'), ('CURTAIN','en','curtains','curtains'),
        ('MIRROR','es-BO','espejo','espejo'), ('MIRROR','es-BO','espejos','espejos'),
        ('MIRROR','en','mirror','mirror'), ('MIRROR','en','mirrors','mirrors')
      ) AS seed(code, locale, alias, normalized)
      JOIN "categories" c ON c."code" = seed.code
    `);

    await queryRunner.query(`
      CREATE TABLE "category_relations" (
        "source_category_id" uuid NOT NULL,
        "target_category_id" uuid NOT NULL,
        "kind" varchar NOT NULL DEFAULT 'related',
        CONSTRAINT "PK_category_relations" PRIMARY KEY ("source_category_id", "target_category_id"),
        CONSTRAINT "FK_category_relations_source" FOREIGN KEY ("source_category_id")
          REFERENCES "categories"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_category_relations_target" FOREIGN KEY ("target_category_id")
          REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      INSERT INTO "category_relations" ("source_category_id", "target_category_id", "kind")
      SELECT source."id", target."id", 'related'
      FROM (VALUES
        ('SOFA','ARMCHAIR'), ('SOFA','DIVAN'),
        ('ARMCHAIR','SOFA'), ('ARMCHAIR','DIVAN'),
        ('DIVAN','SOFA'), ('DIVAN','ARMCHAIR')
      ) AS relation(source_code, target_code)
      JOIN "categories" source ON source."code" = relation.source_code
      JOIN "categories" target ON target."code" = relation.target_code
    `);

    await queryRunner.query(`
      WITH classified AS (
        SELECT p."id",
          CASE
            WHEN searchable ~ '(^| )(sofa|sofas|futon|futones|couch|couches)( |$)' THEN 'SOFA'
            WHEN searchable ~ '(^| )(sillon|sillones|butaca|butacas|armchair|armchairs)( |$)' THEN 'ARMCHAIR'
            WHEN searchable ~ '(^| )(divan|divanes|daybed|daybeds)( |$)' THEN 'DIVAN'
            WHEN searchable ~ '(^| )(silla|sillas|chair|chairs)( |$)' THEN 'CHAIR'
            WHEN searchable ~ '(^| )(escritorio|escritorios|desk|desks)( |$)' THEN 'DESK'
            WHEN searchable ~ '(^| )(mesa|mesas|mesita|mesitas|table|tables)( |$)' THEN 'TABLE'
            WHEN searchable ~ '(^| )(colchon|colchones|mattress|mattresses)( |$)' THEN 'MATTRESS'
            WHEN searchable ~ '(^| )(cama|camas|bed|beds)( |$)' THEN 'BED'
            WHEN searchable ~ '(^| )(armario|armarios|ropero|roperos|wardrobe|wardrobes)( |$)' THEN 'WARDROBE'
            WHEN searchable ~ '(^| )(estanteria|estanterias|estante|estantes|librero|libreros|shelf|shelves)( |$)' THEN 'SHELF'
            WHEN searchable ~ '(^| )(comoda|comodas|aparador|aparadores|dresser|dressers)( |$)' THEN 'DRESSER'
            WHEN searchable ~ '(^| )(lampara|lamparas|luminaria|luminarias|lamp|lamps)( |$)' THEN 'LAMP'
            WHEN searchable ~ '(^| )(alfombra|alfombras|tapete|tapetes|rug|rugs)( |$)' THEN 'RUG'
            WHEN searchable ~ '(^| )(cojin|cojines|almohadon|almohadones|cushion|cushions)( |$)' THEN 'CUSHION'
            WHEN searchable ~ '(^| )(cortina|cortinas|curtain|curtains)( |$)' THEN 'CURTAIN'
            WHEN searchable ~ '(^| )(espejo|espejos|mirror|mirrors)( |$)' THEN 'MIRROR'
          END AS category_code
        FROM (
          SELECT "id", btrim(regexp_replace(
            regexp_replace(lower(normalize(COALESCE("title", '') || ' ' || array_to_string("keywords", ' '), NFD)), U&'[\\0300-\\036f]', '', 'g'),
            '[^[:alnum:]]+', ' ', 'g'
          )) AS searchable
          FROM "products"
        ) p
      )
      UPDATE "products" product SET "category_id" = category."id"
      FROM classified, "categories" category
      WHERE product."id" = classified."id" AND category."code" = classified.category_code
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" product SET "category_id" = parent."id"
      FROM "categories" child JOIN "categories" parent ON parent."id" = child."parent_id"
      WHERE product."category_id" = child."id" AND child."code" IN (
        'SOFA','ARMCHAIR','DIVAN','CHAIR','TABLE','DESK','BED','MATTRESS',
        'WARDROBE','SHELF','DRESSER','LAMP','RUG','CUSHION','CURTAIN','MIRROR'
      )
    `);
    await queryRunner.query(`DROP TABLE "category_relations"`);
    await queryRunner.query(`DROP TABLE "category_aliases"`);
    await queryRunner.query(`DROP TABLE "category_translations"`);
    await queryRunner.query(`
      DELETE FROM "categories" WHERE "code" IN (
        'SOFA','ARMCHAIR','DIVAN','CHAIR','TABLE','DESK','BED','MATTRESS',
        'WARDROBE','SHELF','DRESSER','LAMP','RUG','CUSHION','CURTAIN','MIRROR'
      )
    `);
    await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "UQ_categories_code"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "is_selectable"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "code"`);
    await queryRunner.query(`DROP TABLE "product_listings"`);
    await queryRunner.query(`DROP TABLE "vendor_locations"`);
    await queryRunner.query(`DROP INDEX "UQ_markets_default"`);
    await queryRunner.query(`DROP TABLE "markets"`);
  }
}
