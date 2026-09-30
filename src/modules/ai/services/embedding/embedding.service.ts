import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EMBEDDING_JOB_SETTINGS } from '../../../../config/embedding-jobs.config';
import {
  EMBEDDING_TASK_QUEUE,
  type EmbeddingTaskQueue,
} from '../../interfaces/embedding-task-queue.interface';
import { ProductEmbeddingRepository } from '../../repositories/product-embedding.repository';
import { VectorService } from '../vector/vector.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly vectorService: VectorService,
    private readonly jobs: ProductEmbeddingRepository,
    @Inject(EMBEDDING_TASK_QUEUE) private readonly queue: EmbeddingTaskQueue,
  ) {}

  document(manager: EntityManager, productId: string): Promise<string> {
    return this.jobs.document(manager, productId);
  }

  recordChange(
    manager: EntityManager,
    productId: string,
    previousDocument?: string,
  ): Promise<string | null> {
    return this.jobs.recordChange(manager, productId, previousDocument);
  }

  /** Best effort after commit; the outbox survives even if publishing fails. */
  async dispatch(jobId: string | null): Promise<void> {
    if (!jobId || !this.queue.isEnabled()) return;
    try {
      await this.dispatchPending(1, jobId);
    } catch (error: unknown) {
      this.logger.warn(
        `Embedding job ${jobId} remains pending: ${this.message(error)}`,
      );
    }
  }

  async enqueueRefresh(): Promise<{ queued: number; dispatched: number }> {
    const queued = await this.jobs.reconcile(
      EMBEDDING_JOB_SETTINGS.batchSize,
      true,
    );
    const { dispatched } = await this.dispatchPending(
      EMBEDDING_JOB_SETTINGS.batchSize,
    );
    return { queued, dispatched };
  }

  async recover(): Promise<{ queued: number; dispatched: number }> {
    await this.jobs.finishObsolete(EMBEDDING_JOB_SETTINGS.batchSize);
    await this.jobs.failExhausted(EMBEDDING_JOB_SETTINGS.batchSize);
    const queued = await this.jobs.reconcile(EMBEDDING_JOB_SETTINGS.batchSize);
    const { dispatched, failed } = await this.dispatchPending(
      EMBEDDING_JOB_SETTINGS.batchSize,
    );
    await this.jobs.cleanup(EMBEDDING_JOB_SETTINGS.batchSize);
    if (failed)
      throw new ServiceUnavailableException(
        'Embedding queue temporarily unavailable',
      );
    return { queued, dispatched };
  }

  async process(
    jobId: string,
  ): Promise<{ status: 'completed' | 'superseded' | 'skipped' | 'failed' }> {
    const claim = await this.jobs.claimWork(jobId);
    if (claim.kind === 'finished') return { status: 'skipped' };
    if (claim.kind === 'busy')
      throw new ServiceUnavailableException(
        'Embedding job is already processing',
      );
    const { job } = claim;
    try {
      if (!this.vectorService.isAvailable())
        throw new ServiceUnavailableException('Embedding provider unavailable');
      const vector = await this.vectorService.generateEmbedding(job.document);
      const stored = await this.jobs.complete(
        job,
        this.vectorService.toVectorString(vector),
      );
      return { status: stored ? 'completed' : 'superseded' };
    } catch (error: unknown) {
      const message = this.message(error);
      const terminal = await this.jobs.fail(
        job,
        message,
        this.isPermanent(error),
      );
      this.logger.error(
        `Embedding job ${job.id} attempt ${job.attempts}: ${message}`,
      );
      if (terminal) return { status: 'failed' };
      throw new ServiceUnavailableException(
        'Embedding processing temporarily unavailable',
      );
    }
  }

  private async dispatchPending(
    limit: number,
    jobId?: string,
  ): Promise<{ dispatched: number; failed: number }> {
    if (!this.queue.isEnabled()) return { dispatched: 0, failed: 0 };
    const pending = await this.jobs.claimDispatch(limit, jobId);
    let dispatched = 0;
    let failed = 0;
    for (const dispatch of pending) {
      try {
        await this.queue.enqueue(dispatch);
        await this.jobs.markDispatched(dispatch);
        dispatched++;
      } catch (error: unknown) {
        failed++;
        const message = this.message(error);
        await this.jobs.markDispatchFailed(dispatch, message);
        this.logger.warn(
          `Publishing embedding job ${dispatch.id} failed: ${message}`,
        );
      }
    }
    return { dispatched, failed };
  }

  private isPermanent(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const { code } = error as { code?: unknown };
    return (
      typeof code === 'number' &&
      [3, 5, 7, 9, 16, 400, 401, 403, 404].includes(code)
    );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
