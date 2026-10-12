import { PGlite } from '@electric-sql/pglite';
import type { QueryRunner } from 'typeorm';
import { AddVendorRepairs1791763200000 } from './1791763200000-add-vendor-repairs';

describe('Vendor repair migration against PostgreSQL', () => {
  let db: PGlite;
  let runner: QueryRunner;
  const migration = new AddVendorRepairs1791763200000();

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE TABLE vendor_profiles (id text PRIMARY KEY, "businessName" text NOT NULL);
      INSERT INTO vendor_profiles VALUES ('existing', 'Existing store');
    `);
    runner = { query: (sql: string) => db.exec(sql) } as unknown as QueryRunner;
    await migration.up(runner);
  });

  afterAll(async () => db.close());

  it('backfills existing profiles and defaults future profiles to disabled', async () => {
    await db.exec(
      `INSERT INTO vendor_profiles (id, "businessName") VALUES ('future', 'New store')`,
    );
    const { rows } = await db.query(`
      SELECT offers_repairs, repair_scope, repair_details, repairs_external_products
      FROM vendor_profiles ORDER BY id
    `);
    expect(rows).toEqual(
      Array(2).fill({
        offers_repairs: false,
        repair_scope: null,
        repair_details: null,
        repairs_external_products: false,
      }),
    );
  });

  it('enforces a nonblank scope for active repairs and consistent disabled settings', async () => {
    await expect(
      db.exec(
        `UPDATE vendor_profiles SET offers_repairs = true WHERE id = 'existing'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `UPDATE vendor_profiles SET offers_repairs = true, repair_scope = '   ' WHERE id = 'existing'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `UPDATE vendor_profiles SET repairs_external_products = true WHERE id = 'existing'`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `UPDATE vendor_profiles SET offers_repairs = true, repair_scope = 'Upholstery', repairs_external_products = true WHERE id = 'existing'`,
    );
    expect(
      (
        await db.query(
          `SELECT repair_scope FROM vendor_profiles WHERE id = 'existing'`,
        )
      ).rows,
    ).toEqual([{ repair_scope: 'Upholstery' }]);
  });

  it('reverts the schema without deleting profiles', async () => {
    await migration.down(runner);
    const { rows } = await db.query(
      `SELECT * FROM vendor_profiles ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: 'existing', businessName: 'Existing store' },
      { id: 'future', businessName: 'New store' },
    ]);
  });
});
