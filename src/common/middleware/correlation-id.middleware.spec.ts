import { Request, Response } from 'express';
import { CORRELATION_ID_HEADER, CorrelationIdMiddleware } from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  const existingId = '3c6c26a6-783d-4fc0-93a3-10cb2f8ef949';

  it('preserves a valid client correlation ID and returns it in the response', () => {
    const request = {
      header: jest.fn().mockReturnValue(existingId),
      headers: {},
    } as unknown as Request;
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;
    const next = jest.fn();

    new CorrelationIdMiddleware().use(request, response, next);

    expect(request.headers['x-correlation-id']).toBe(existingId);
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, existingId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('replaces an invalid correlation value with a UUID', () => {
    const request = {
      header: jest.fn().mockReturnValue('not-a-valid-id'),
      headers: {},
    } as unknown as Request;
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;

    new CorrelationIdMiddleware().use(request, response, jest.fn());

    expect(request.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      request.headers['x-correlation-id'],
    );
  });
});
