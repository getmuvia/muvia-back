import { Test } from '@nestjs/testing';
import { FrontendErrorEventDto } from './dto/frontend-error-event.dto';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

describe('TelemetryController', () => {
  it('accepts a bounded frontend event and keeps its incident ID', async () => {
    const capture = jest.fn();
    const module = await Test.createTestingModule({
      controllers: [TelemetryController],
      providers: [{ provide: TelemetryService, useValue: { capture } }],
    }).compile();
    const controller = module.get(TelemetryController);
    const event = createEvent();

    expect(controller.captureFrontendError(event)).toEqual({
      accepted: true,
      incidentId: event.incidentId,
    });
    expect(capture).toHaveBeenCalledWith(event);
  });
});

function createEvent(): FrontendErrorEventDto {
  return {
    schemaVersion: 1,
    incidentId: '3c6c26a6-783d-4fc0-93a3-10cb2f8ef949',
    correlationId: '3c6c26a6-783d-4fc0-93a3-10cb2f8ef949',
    occurredAt: '2026-09-19T22:00:00.000Z',
    source: 'global',
    severity: 'fatal',
    message: 'Unexpected application error',
    errorName: 'Error',
    stack: null,
    route: '/products',
    environment: 'production',
    release: 'abc123',
    runtime: 'browser',
    context: 'Angular ErrorHandler',
    httpMethod: null,
    httpPath: null,
    httpStatus: null,
    errorKind: null,
    errorCode: null,
  };
}
