import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { TelemetryModule } from './telemetry.module';
import { TelemetryService } from './telemetry.service';

describe('Telemetry rate limit', () => {
  let app: INestApplication;
  let server: Server;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [TelemetryModule],
    })
      .overrideProvider(TelemetryService)
      .useValue({ capture: jest.fn() })
      .compile();

    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects telemetry bursts after the endpoint budget is exhausted', async () => {
    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      await request(server)
        .post('/telemetry/frontend-errors')
        .send({ incidentId: `incident-${requestNumber}` })
        .expect(202);
    }

    await request(server)
      .post('/telemetry/frontend-errors')
      .send({ incidentId: 'incident-blocked' })
      .expect(429);
  });
});
