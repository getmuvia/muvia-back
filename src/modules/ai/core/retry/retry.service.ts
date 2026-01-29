import { Injectable, Logger } from '@nestjs/common';

/**
 * Configuration options for retry operations.
 */
export interface RetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Initial delay in milliseconds before first retry (default: 1000) */
    initialDelayMs?: number;
    /** Maximum delay cap in milliseconds (default: 30000) */
    maxDelayMs?: number;
    /** Multiplier for exponential backoff (default: 2) */
    backoffMultiplier?: number;
    /** Custom function to determine if error is retryable */
    isRetryable?: (error: unknown) => boolean;
    /** Operation name for logging */
    operationName?: string;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'isRetryable' | 'operationName'>> = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

/**
 * Retry Service
 *
 * Provides unified retry logic with exponential backoff for all AI providers.
 * Consolidates duplicate retry implementations across the codebase.
 *
 * Features:
 * - Exponential backoff with configurable multiplier
 * - Maximum delay cap to prevent excessive waits
 * - Customizable retry conditions
 * - Detailed logging for debugging
 *
 * @example
 * ```typescript
 * const result = await retryService.withExponentialBackoff(
 *   () => apiClient.call(),
 *   {
 *     maxRetries: 3,
 *     operationName: 'Gemini API call',
 *     isRetryable: (err) => err.code === 429,
 *   }
 * );
 * ```
 */
@Injectable()
export class RetryService {
    private readonly logger = new Logger(RetryService.name);

    /**
     * Executes an operation with exponential backoff retry logic.
     *
     * @param operation - Async function to execute
     * @param options - Retry configuration options
     * @returns Result of the operation
     * @throws Last error if all retries are exhausted
     */
    async withExponentialBackoff<T>(
        operation: () => Promise<T>,
        options: RetryOptions = {},
    ): Promise<T> {
        const config = this.mergeOptions(options);
        let lastError: unknown;
        let attempt = 0;

        while (attempt <= config.maxRetries) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                attempt++;

                if (!this.shouldRetry(error, attempt, config)) {
                    throw error;
                }

                const delay = this.calculateDelay(attempt, config);
                this.logRetry(error, attempt, delay, config);

                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Determines if an error is a quota/rate limit error (429).
     * Common across GCP services (Vertex AI, Gemini, etc.)
     */
    isQuotaExceededError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;

        const err = error as Record<string, unknown>;

        // gRPC code 8 = RESOURCE_EXHAUSTED
        if (err.code === 8 || err.code === 429) return true;

        // HTTP status
        if (err.status === 429 || err.status === 'RESOURCE_EXHAUSTED') return true;

        // Message-based detection
        const message = String(err.message || '');
        const quotaPatterns = [
            '429',
            'quota exceeded',
            'resource_exhausted',
            'rate limit',
            'too many requests',
        ];

        return quotaPatterns.some(pattern =>
            message.toLowerCase().includes(pattern.toLowerCase()),
        );
    }

    /**
     * Determines if an error is a transient/temporary error.
     * These errors may succeed on retry.
     */
    isTransientError(error: unknown): boolean {
        if (this.isQuotaExceededError(error)) return true;

        if (!error || typeof error !== 'object') return false;

        const err = error as Record<string, unknown>;

        // gRPC code 14 = UNAVAILABLE
        if (err.code === 14 || err.code === 503) return true;

        // HTTP status for server errors
        const status = err.status as number | undefined;
        if (status && status >= 500 && status < 600) return true;

        // Message patterns
        const message = String(err.message || '');
        const transientPatterns = [
            'timeout',
            'unavailable',
            'connection reset',
            'econnreset',
            'socket hang up',
        ];

        return transientPatterns.some(pattern =>
            message.toLowerCase().includes(pattern.toLowerCase()),
        );
    }

    /**
     * Merges user options with defaults.
     */
    private mergeOptions(options: RetryOptions): Required<Omit<RetryOptions, 'isRetryable' | 'operationName'>> & {
        isRetryable?: (error: unknown) => boolean;
        operationName: string;
    } {
        return {
            ...DEFAULT_RETRY_OPTIONS,
            ...options,
            operationName: options.operationName || 'operation',
        };
    }

    /**
     * Determines if a retry should be attempted.
     */
    private shouldRetry(
        error: unknown,
        attempt: number,
        config: RetryOptions & { maxRetries: number },
    ): boolean {
        if (attempt > config.maxRetries) return false;

        if (config.isRetryable) {
            return config.isRetryable(error);
        }

        // Default: retry on quota and transient errors
        return this.isTransientError(error);
    }

    /**
     * Calculates delay with exponential backoff.
     */
    private calculateDelay(
        attempt: number,
        config: { initialDelayMs: number; maxDelayMs: number; backoffMultiplier: number },
    ): number {
        const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
        // Add jitter (±10%) to prevent thundering herd
        const jitter = exponentialDelay * (0.9 + Math.random() * 0.2);
        return Math.min(jitter, config.maxDelayMs);
    }

    /**
     * Logs retry attempt.
     */
    private logRetry(
        error: unknown,
        attempt: number,
        delay: number,
        config: { maxRetries: number; operationName: string },
    ): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
            `[${config.operationName}] Attempt ${attempt}/${config.maxRetries} failed: ${errorMessage}. ` +
            `Retrying in ${Math.round(delay)}ms...`,
        );
    }

    /**
     * Sleep utility.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
