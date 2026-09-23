import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createErrorPayload, ERROR_CODES } from '../errors/error-code';
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

    new HttpExceptionFilter().catch(
      new BadRequestException('Invalid request'),
      host,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      correlationId,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId,
        path: '/products',
        statusCode: 400,
      }),
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'access_token',
    );
  });

  it('preserves a known application error code in the HTTP response', () => {
    const loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation();
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          header: jest.fn(),
          path: '/auth/register',
          url: '/auth/register',
        }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new ConflictException(
        createErrorPayload(
          ERROR_CODES.EMAIL_ALREADY_REGISTERED,
          'Email has already been registered',
        ),
      ),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Email has already been registered',
      }),
    );
    expect(loggerWarn).not.toHaveBeenCalled();
  });
});
