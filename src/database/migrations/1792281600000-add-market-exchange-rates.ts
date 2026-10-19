import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketExchangeRates1792281600000 implements MigrationInterface {
  name = 'AddMarketExchangeRates1792281600000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      "ALTER TABLE markets ADD COLUMN exchange_rates jsonb NOT NULL DEFAULT '{}'::jsonb",
    );
    // Initial BCB reference checked on 2026-10-18; administrators own subsequent updates.
    await runner.query(
      `UPDATE markets SET exchange_rates = '{"USD":{"rate":11.69,"updatedAt":"2026-10-18T00:00:00.000Z"}}'::jsonb WHERE code = 'BO'`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE markets DROP COLUMN exchange_rates');
  }
}
