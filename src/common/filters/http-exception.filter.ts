import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  CORRELATION_ID_HEADER,
  isCorrelationId,
} from '../middleware/correlation-id.middleware';
import { ErrorCode, isErrorCode } from '../errors/error-code';

interface ErrorResponse {
  statusCode: number;
  code?: ErrorCode;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  correlationId: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, error } =
      this.extractErrorDetails(exception);
    const suppliedCorrelationId = request.header(CORRELATION_ID_HEADER);
    const correlationId = isCorrelationId(suppliedCorrelationId)
      ? suppliedCorrelationId
      : randomUUID();

    const errorResponse: ErrorResponse = {
      statusCode: status,
      ...(code ? { code } : {}),
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.path || request.url.split('?', 1)[0],
      correlationId,
    };

    this.logError(exception, errorResponse);

    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    response.status(status).json(errorResponse);
  }

  private extractErrorDetails(exception: unknown): {
    status: number;
    code?: ErrorCode;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const response = exceptionResponse as Record<string, unknown>;
        return {
          status,
          code: isErrorCode(response.code) ? response.code : undefined,
          message: (response.message as string | string[]) || exception.message,
          error: (response.error as string) || exception.name,
        };
      }

      return {
        status,
        message: exception.message,
        error: exception.name,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
    };
  }

  private logError(exception: unknown, errorResponse: ErrorResponse): void {
    const errorMessage = Array.isArray(errorResponse.message)
      ? errorResponse.message.join(', ')
      : errorResponse.message;

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        `${errorResponse.path} - ${errorMessage}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${errorResponse.path} - ${errorMessage}`);
    }
  }
}
