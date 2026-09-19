import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the request correlation ID and excludes query parameters from the error path', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const correlationId = '3c6c26a6-783d-4fc0-93a3-10cb2f8ef949';
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = {
      header: jest.fn().mockReturnValue(correlationId),
      path: '/products',
      url: '/products?access_token=private',
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(new BadRequestException('Invalid request'), host);

    expect(response.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, correlationId);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      correlationId,
      path: '/products',
      statusCode: 400,
    }));
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('access_token');
  });
});
