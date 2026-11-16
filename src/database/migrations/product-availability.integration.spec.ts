import { PGlite } from '@electric-sql/pglite';
import type { QueryRunner } from 'typeorm';
import { AddProductAvailability1794873600000 } from './1794873600000-add-product-availability';

describe('Product availability migration', () => {
  let db: PGlite;
  let runner: QueryRunner;
  const migration = new AddProductAvailability1794873600000();
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "CREATE TABLE products (id text PRIMARY KEY, stock integer NOT NULL); INSERT INTO products VALUES ('existing', 0)",
    );
    runner = { query: (sql: string) => db.exec(sql) } as unknown as QueryRunner;
    await migration.up(runner);
  });
  afterAll(async () => db.close());
  it('keeps existing zero-stock products in stock mode and defaults future products safely', async () => {
    await db.exec("INSERT INTO products (id, stock) VALUES ('future', 3)");
    const { rows } = await db.query(
      'SELECT availability_mode, lead_time_min_days, lead_time_max_days, accepts_custom_dimensions FROM products ORDER BY id',
    );
    expect(rows).toEqual(
      Array(2).fill({
        availability_mode: 'IN_STOCK',
        lead_time_min_days: null,
        lead_time_max_days: null,
        accepts_custom_dimensions: false,
      }),
    );
  });
  it('enforces production range constraints for direct SQL writes', async () => {
    await expect(
      db.exec(
        "UPDATE products SET availability_mode = 'MADE_TO_ORDER' WHERE id = 'existing'",
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        "UPDATE products SET availability_mode = 'MADE_TO_ORDER', lead_time_min_days = 10, lead_time_max_days = 5 WHERE id = 'existing'",
      ),
    ).rejects.toThrow();
    await db.exec(
      "UPDATE products SET availability_mode = 'MADE_TO_ORDER', lead_time_min_days = 10, lead_time_max_days = 15, accepts_custom_dimensions = true WHERE id = 'existing'",
    );
  });
  it('reverts the schema without deleting product inventory', async () => {
    await migration.down(runner);
    expect((await db.query('SELECT * FROM products ORDER BY id')).rows).toEqual(
      [
        { id: 'existing', stock: 0 },
        { id: 'future', stock: 3 },
      ],
    );
  });
});
