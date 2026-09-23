import { Logger } from '@nestjs/common';
import { FrontendErrorEventDto } from './dto/frontend-error-event.dto';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('re-sanitizes sensitive values before writing structured logs', () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const service = new TelemetryService();
    const event = createEvent();
    event.message = [
      'seller@example.com used Bearer private-token',
      'eyJhbGciOiJIUzI1NiJ9.c2VjcmV0.c2lnbmF0dXJl',
      'at https://api.example.com/products?access_token=private#details',
    ].join(' ');

    service.capture(event);

    expect(loggerError).toHaveBeenCalledTimes(1);
    const record = loggerError.mock.calls[0][0] as Record<string, unknown>;
    const serializedRecord = JSON.stringify(record);
    expect(record.event).toBe('frontend_error');
    expect(record.incidentId).toBe(event.incidentId);
    expect(serializedRecord).toContain('[redacted-email]');
    expect(serializedRecord).toContain('Bearer [redacted]');
    expect(serializedRecord).not.toContain('seller@example.com');
    expect(serializedRecord).not.toContain('private-token');
    expect(serializedRecord).not.toContain('c2VjcmV0');
    expect(serializedRecord).not.toContain('access_token');
    expect(serializedRecord).toContain('https://api.example.com/products');
  });
});

function createEvent(): FrontendErrorEventDto {
  return {
    schemaVersion: 1,
    incidentId: '3c6c26a6-783d-4fc0-93a3-10cb2f8ef949',
    correlationId: '3c6c26a6-783d-4fc0-93a3-10cb2f8ef949',
    occurredAt: '2026-09-19T22:00:00.000Z',
    source: 'application',
    severity: 'error',
    message: 'Failed to render product',
    errorName: 'Error',
    stack: null,
    route: '/products',
    environment: 'production',
    release: 'abc123',
    runtime: 'browser',
    context: 'ProductCard',
    httpMethod: null,
    httpPath: null,
    httpStatus: null,
    errorKind: null,
    errorCode: null,
  };
}
