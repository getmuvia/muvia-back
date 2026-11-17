import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import request, { type Response } from 'supertest';
import type { Server } from 'node:http';
import { DataSource, QueryRunner } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import configuredSource from '../../database/data-source';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserRole } from '../../common/enums/user-role.enum';
import { MarketsService } from '../markets/markets.service';
import { Market } from '../markets/entities/market.entity';
import { Product } from '../products/entities/product.entity';
import { Quotation } from './entities/quotation.entity';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { QuotationStatus } from './quotation.constants';
import { AddProductQuotations1794956400000 } from '../../database/migrations/1794956400000-add-product-quotations';

type QuotationJson = Omit<
  Quotation,
  'createdAt' | 'respondedAt' | 'sellerViewedAt' | 'customerViewedAt'
> & {
  createdAt: string;
  respondedAt: string | null;
  sellerViewedAt: string | null;
  customerViewedAt: string | null;
};
type QuotationPage = { data: QuotationJson[]; total: number };
function json<T>(response: Response): Omit<Response, 'body'> & { body: T } {
  return response as Omit<Response, 'body'> & { body: T };
}

class QuotationTestSource extends DataSource {
  async connectTo(db: PGlite): Promise<void> {
    await this.buildMetadatas();
    const client = Object.assign(new EventEmitter(), {
      query: async (sql: string, parameters?: unknown[]) => {
        const result = await db.query(sql, parameters);
        return {
          rows: result.rows,
          rowCount: result.affectedRows,
          command: sql.trim().split(/\s+/)[0].toUpperCase(),
        };
      },
    });
    (this.driver as PostgresDriver).obtainMasterConnection = () =>
      Promise.resolve([client, () => undefined]);
    Object.assign(this, { isInitialized: true });
  }
}

describe('Quotation request → seller response → customer read (real PostgreSQL)', () => {
  let db: PGlite;
  let source: QuotationTestSource;
  let app: INestApplication<Server>;
  let runner: QueryRunner;
  const sellerId = randomUUID();
  const customerId = randomUUID();
  const strangerId = randomUUID();
  const productId = randomUUID();
  const profileId = randomUUID();
  const locationId = randomUUID();
  const actors = {
    seller: {
      id: sellerId,
      email: 'seller@example.test',
      role: UserRole.VENDOR,
    },
    customer: {
      id: customerId,
      email: 'customer@example.test',
      role: UserRole.CONSUMER,
    },
    stranger: {
      id: strangerId,
      email: 'stranger@example.test',
      role: UserRole.VENDOR,
    },
  };
  const body = () => ({
    requestId: randomUUID(),
    productId,
    marketCode: 'BO',
    dimensions: { width: 160, depth: 70, height: 75, unit: 'cm' },
    notes: 'Necesito más espacio de trabajo.',
  });
  const quoted = {
    status: QuotationStatus.QUOTED,
    price: 2850.5,
    leadTimeMinDays: 12,
    leadTimeMaxDays: 18,
    message: 'Podemos realizarlo en roble.',
  };
  const create = (payload = body()) =>
    request(app.getHttpServer())
      .post('/quotations')
      .set('x-test-actor', 'customer')
      .send(payload);

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto, pg_trgm, vector } });
    source = new QuotationTestSource({
      ...configuredSource.options,
      logging: false,
    });
    await source.connectTo(db);
    runner = {
      query: (sql: string, parameters?: unknown[]) =>
        parameters ? db.query(sql, parameters) : db.exec(sql),
    } as unknown as QueryRunner;
    for (const migration of source.migrations) await migration.up(runner);
    for (const actor of Object.values(actors))
      await db.query(
        'INSERT INTO users(id, email, "passwordHash", role) VALUES($1,$2,\'test\',$3)',
        [actor.id, actor.email, actor.role],
      );
    await db.query(
      'INSERT INTO vendor_profiles(id,user_id,"businessName") VALUES($1,$2,\'Estudio Roble\')',
      [profileId, sellerId],
    );
    await db.query(
      "INSERT INTO vendor_locations(id,vendor_profile_id,country_code) VALUES($1,$2,'BO')",
      [locationId, profileId],
    );
    await db.query(
      "INSERT INTO products(id,seller_id,title,price,accepts_custom_dimensions,specifications) VALUES($1,$2,'Escritorio Roble',999,true,$3)",
      [
        productId,
        sellerId,
        { dimensions: { width: 140, depth: 60, height: 75, unit: 'cm' } },
      ],
    );
    await db.query(
      "INSERT INTO product_listings(id,product_id,vendor_location_id,market_code,price,currency_code,stock,is_active) VALUES($1,$2,$3,'BO',2450,'BOB',0,true)",
      [randomUUID(), productId, locationId],
    );
    const module = await Test.createTestingModule({
      controllers: [QuotationsController],
      providers: [
        QuotationsService,
        {
          provide: getRepositoryToken(Quotation),
          useValue: source.getRepository(Quotation),
        },
        {
          provide: getRepositoryToken(Product),
          useValue: source.getRepository(Product),
        },
        {
          provide: MarketsService,
          useValue: new MarketsService(source.getRepository(Market)),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user?: unknown }>();
          const actor =
            actors[req.headers['x-test-actor'] as keyof typeof actors];
          if (!actor) throw new UnauthorizedException();
          req.user = actor;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 30000);
  beforeEach(async () => {
    await db.exec('TRUNCATE quotations');
    await db.query(
      "UPDATE products SET accepts_custom_dimensions=true,title='Escritorio Roble' WHERE id=$1",
      [productId],
    );
    await db.exec('UPDATE product_listings SET price=2450,is_active=true');
  });
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.close();
  });

  it('saves authoritative market pricing, dimensions, seller and contact, then restores both inboxes', async () => {
    const saved = await create()
      .expect(201)
      .then(json<QuotationJson>);
    expect(saved.body).toMatchObject({
      productId,
      sellerId,
      customerId,
      customerEmail: actors.customer.email,
      sellerName: 'Estudio Roble',
      currencyCode: 'BOB',
      publishedPrice: '2450.00',
      status: 'PENDING',
      requestedDimensions: body().dimensions,
    });
    expect(saved.body.publishedDimensions).toEqual({
      width: 140,
      depth: 60,
      height: 75,
      unit: 'cm',
    });
    for (const [actor, view] of [
      ['customer', 'sent'],
      ['seller', 'received'],
    ]) {
      const inbox = await request(app.getHttpServer())
        .get(`/quotations?view=${view}`)
        .set('x-test-actor', actor)
        .expect(200)
        .then(json<QuotationPage>);
      expect(inbox.body.total).toBe(1);
      expect(inbox.body.data[0].id).toBe(saved.body.id);
    }
    await db.exec('UPDATE product_listings SET price=9000');
    await db.query("UPDATE products SET title='Changed' WHERE id=$1", [
      productId,
    ]);
    const restored = await request(app.getHttpServer())
      .get(`/quotations/${saved.body.id}`)
      .set('x-test-actor', 'customer')
      .expect(200)
      .then(json<QuotationJson>);
    expect(restored.body).toMatchObject({
      publishedPrice: '2450.00',
      productTitle: 'Escritorio Roble',
    });
  });

  it('records a seller quote in the original currency and makes it visible to the customer', async () => {
    const { body: saved } = await create()
      .expect(201)
      .then(json<QuotationJson>);
    const { body: response } = await request(app.getHttpServer())
      .patch(`/quotations/${saved.id}/response`)
      .set('x-test-actor', 'seller')
      .send(quoted)
      .expect(200)
      .then(json<QuotationJson>);
    expect(response).toMatchObject({
      status: 'QUOTED',
      quotedPrice: '2850.50',
      currencyCode: 'BOB',
      leadTimeMinDays: 12,
      leadTimeMaxDays: 18,
    });
    expect(response.respondedAt).toBeTruthy();
    const customer = await request(app.getHttpServer())
      .get(`/quotations/${saved.id}`)
      .set('x-test-actor', 'customer')
      .expect(200)
      .then(json<QuotationJson>);
    expect(customer.body.responseMessage).toBe(quoted.message);
    await request(app.getHttpServer())
      .post(`/quotations/${saved.id}/read`)
      .set('x-test-actor', 'customer')
      .send({ respondedAt: null })
      .expect(204);
    expect(
      (await source.getRepository(Quotation).findOneByOrFail({ id: saved.id }))
        .customerViewedAt,
    ).toBeNull();
    await request(app.getHttpServer())
      .post(`/quotations/${saved.id}/read`)
      .set('x-test-actor', 'customer')
      .send({ respondedAt: response.respondedAt })
      .expect(204);
    expect(
      (
        await source.getRepository(Quotation).findOneByOrFail({ id: saved.id })
      ).customerViewedAt?.toISOString(),
    ).toBe(response.respondedAt);
  });

  it('records a declined request with a reason and no invented price or production time', async () => {
    const { body: saved } = await create()
      .expect(201)
      .then(json<QuotationJson>);
    const result = await request(app.getHttpServer())
      .patch(`/quotations/${saved.id}/response`)
      .set('x-test-actor', 'seller')
      .send({ status: 'DECLINED', message: 'No fabricamos ese ancho.' })
      .expect(200)
      .then(json<QuotationJson>);
    expect(result.body).toMatchObject({
      status: 'DECLINED',
      quotedPrice: null,
      leadTimeMinDays: null,
      leadTimeMaxDays: null,
      responseMessage: 'No fabricamos ese ancho.',
    });
  });

  it('isolates contact details and prevents responses by customers or other sellers', async () => {
    const { body: saved } = await create()
      .expect(201)
      .then(json<QuotationJson>);
    await request(app.getHttpServer()).get('/quotations').expect(401);
    await request(app.getHttpServer())
      .get(`/quotations/${saved.id}`)
      .set('x-test-actor', 'stranger')
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/quotations/${saved.id}/response`)
      .set('x-test-actor', 'stranger')
      .send(quoted)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/quotations/${saved.id}/response`)
      .set('x-test-actor', 'customer')
      .send(quoted)
      .expect(403);
    await request(app.getHttpServer())
      .get('/quotations?view=received')
      .set('x-test-actor', 'customer')
      .expect(403);
    const strangerInbox = await request(app.getHttpServer())
      .get('/quotations?view=received')
      .set('x-test-actor', 'stranger')
      .expect(200)
      .then(json<QuotationPage>);
    expect(strangerInbox.body.data).toEqual([]);
    await request(app.getHttpServer())
      .post('/quotations')
      .set('x-test-actor', 'seller')
      .send(body())
      .expect(400);
  });

  it('retries safely after a lost response without creating duplicate requests', async () => {
    const payload = body();
    const first = await create(payload)
      .expect(201)
      .then(json<QuotationJson>);
    const retry = await create(payload)
      .expect(201)
      .then(json<QuotationJson>);
    expect(retry.body.id).toBe(first.body.id);
    expect(await source.getRepository(Quotation).count()).toBe(1);
    await create({ ...payload, notes: 'Different request' }).expect(409);
  });

  it.each([
    { dimensions: null },
    { dimensions: { width: 0, depth: 60, height: 75, unit: 'cm' } },
    { dimensions: { width: 10, depth: 60, height: 75, unit: 'px' } },
    { dimensions: { width: 10, depth: 60, height: 75, unit: 'm' } },
    { dimensions: { width: 10001, depth: 60, height: 75, unit: 'cm' } },
    { dimensions: { width: 100.0001, depth: 60, height: 75, unit: 'cm' } },
    { notes: 'x'.repeat(2001) },
    { sellerId: randomUUID() },
    { publishedPrice: 1 },
  ])('rejects invalid or forged request data (case %#)', async (changes) => {
    await create({ ...body(), ...changes }).expect(400);
  });

  it('rechecks customization and market availability at submission time', async () => {
    await db.query(
      'UPDATE products SET accepts_custom_dimensions=false WHERE id=$1',
      [productId],
    );
    await create().expect(409);
    await db.query(
      'UPDATE products SET accepts_custom_dimensions=true WHERE id=$1',
      [productId],
    );
    await db.exec('UPDATE product_listings SET is_active=false');
    await create().expect(409);
    expect(await source.getRepository(Quotation).count()).toBe(0);
  });

  it.each([
    { ...quoted, price: 0 },
    { ...quoted, price: 1.001 },
    { ...quoted, leadTimeMinDays: 20, leadTimeMaxDays: 10 },
    { ...quoted, leadTimeMinDays: 1.5 },
    { ...quoted, message: '   ' },
    { ...quoted, status: 'PENDING' },
  ])('rejects invalid seller responses: %j', async (payload) => {
    const { body: saved } = await create()
      .expect(201)
      .then(json<QuotationJson>);
    await request(app.getHttpServer())
      .patch(`/quotations/${saved.id}/response`)
      .set('x-test-actor', 'seller')
      .send(payload)
      .expect(400);
    expect(
      (await source.getRepository(Quotation).findOneByOrFail({ id: saved.id }))
        .status,
    ).toBe('PENDING');
  });

  it('accepts only one response when two seller submissions race', async () => {
    const { body: saved } = await create()
      .expect(201)
      .then(json<QuotationJson>);
    const replies = await Promise.all(
      [quoted, { ...quoted, price: 3000 }].map((payload) =>
        request(app.getHttpServer())
          .patch(`/quotations/${saved.id}/response`)
          .set('x-test-actor', 'seller')
          .send(payload),
      ),
    );
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409]);
  });

  it('enforces database constraints and preserves request snapshots when a product is removed', async () => {
    const { body: saved } = await create()
      .expect(201)
      .then(json<QuotationJson>);
    await expect(
      db.query(
        "UPDATE quotations SET status='QUOTED',responded_at=now(),response_message='Yes' WHERE id=$1",
        [saved.id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE quotations SET status='UNKNOWN' WHERE id=$1", [
        saved.id,
      ]),
    ).rejects.toThrow();
    const disposable = await source
      .getRepository(Product)
      .save({ sellerId, title: 'Disposable', price: 1, stock: 0 });
    await source
      .getRepository(Quotation)
      .update(saved.id, { productId: disposable.id });
    await source.getRepository(Product).delete(disposable.id);
    const restored = await source
      .getRepository(Quotation)
      .findOneByOrFail({ id: saved.id });
    expect(restored.productId).toBeNull();
    expect(restored.productTitle).toBe('Escritorio Roble');
  });

  it('can reverse and reapply the migration without changing catalog products', async () => {
    const migration = new AddProductQuotations1794956400000();
    await migration.down(runner);
    expect(await source.getRepository(Product).count()).toBe(1);
    await migration.up(runner);
    expect(await source.getRepository(Quotation).count()).toBe(0);
  });
});
