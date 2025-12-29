import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
    statusCode: number;
    message: string | string[];
    error: string;
    timestamp: string;
    path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const { status, message, error } = this.extractErrorDetails(exception);

        const errorResponse: ErrorResponse = {
            statusCode: status,
            message,
            error,
            timestamp: new Date().toISOString(),
            path: request.url,
        };

        this.logError(exception, errorResponse);

        response.status(status).json(errorResponse);
    }

    private extractErrorDetails(exception: unknown): {
        status: number;
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
