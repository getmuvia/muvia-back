import { Injectable, Logger } from '@nestjs/common';
import { FrontendErrorEventDto } from './dto/frontend-error-event.dto';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger('FrontendTelemetry');

  capture(event: FrontendErrorEventDto): void {
    const record = {
      event: 'frontend_error',
      ...event,
      message: sanitizeForLog(event.message, 500),
      errorName: event.errorName ? sanitizeForLog(event.errorName, 100) : null,
      stack: event.stack ? sanitizeForLog(event.stack, 8000) : null,
      route: sanitizeForLog(event.route, 500),
      environment: sanitizeForLog(event.environment, 40),
      release: sanitizeForLog(event.release, 64),
      context: event.context ? sanitizeForLog(event.context, 100) : null,
      httpMethod: event.httpMethod
        ? sanitizeForLog(event.httpMethod, 10)
        : null,
      httpPath: event.httpPath ? sanitizeForLog(event.httpPath, 500) : null,
      errorKind: event.errorKind ? sanitizeForLog(event.errorKind, 40) : null,
      errorCode: event.errorCode ? sanitizeForLog(event.errorCode, 80) : null,
    };

    if (event.severity === 'warning') {
      this.logger.warn(record);
      return;
    }

    this.logger.error(record);
  }
}

function sanitizeForLog(value: string, maxLength: number): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[redacted-token]',
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/https?:\/\/[^\s)\]}]+/gi, stripUrlDetails)
    .trim()
    .slice(0, maxLength);
}

function stripUrlDetails(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}
