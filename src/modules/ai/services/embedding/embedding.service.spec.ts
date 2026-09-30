import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { EMBEDDING_JOB_SETTINGS } from '../../../../config/embedding-jobs.config';
import { ProductEmbeddingJob } from '../../entities/product-embedding-job.entity';
import { ProductEmbeddingRepository } from '../../repositories/product-embedding.repository';
import { VectorService } from '../vector/vector.service';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const job = {
    id: 'job-id',
    document: 'Title: Escritorio',
    attempts: 1,
  } as ProductEmbeddingJob;
  const dispatch = { id: job.id, dispatchVersion: 1 };
  const vector = {
    isAvailable: jest.fn(),
    generateEmbedding: jest.fn(),
    toVectorString: jest.fn(),
  };
  const jobs = {
    claimWork: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
    reconcile: jest.fn(),
    claimDispatch: jest.fn(),
    markDispatched: jest.fn(),
    markDispatchFailed: jest.fn(),
    finishObsolete: jest.fn(),
    failExhausted: jest.fn(),
    cleanup: jest.fn(),
  };
  const queue = { isEnabled: jest.fn(), enqueue: jest.fn() };
  let service: EmbeddingService;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vector.isAvailable.mockReturnValue(true);
    vector.generateEmbedding.mockResolvedValue([1, 0, 0]);
    vector.toVectorString.mockReturnValue('[1,0,0]');
    jobs.claimWork.mockResolvedValue({ kind: 'claimed', job });
    jobs.complete.mockResolvedValue(true);
    jobs.fail.mockResolvedValue(false);
    jobs.claimDispatch.mockResolvedValue([dispatch]);
    jobs.reconcile.mockResolvedValue(1);
    queue.isEnabled.mockReturnValue(true);
    service = new EmbeddingService(
      vector as unknown as VectorService,
      jobs as unknown as ProductEmbeddingRepository,
      queue,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('processes the stored document and persists through the lease fence', async () => {
    await expect(service.process(job.id)).resolves.toEqual({
      status: 'completed',
    });
    expect(vector.generateEmbedding).toHaveBeenCalledWith(job.document);
    expect(jobs.complete).toHaveBeenCalledWith(job, '[1,0,0]');
  });

  it('acknowledges completed or obsolete deliveries without another provider call', async () => {
    jobs.claimWork.mockResolvedValue({ kind: 'finished' });
    await expect(service.process(job.id)).resolves.toEqual({
      status: 'skipped',
    });
    expect(vector.generateEmbedding).not.toHaveBeenCalled();
  });

  it('requests a retry while another delivery holds the lease', async () => {
    jobs.claimWork.mockResolvedValue({ kind: 'busy' });
    await expect(service.process(job.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(vector.generateEmbedding).not.toHaveBeenCalled();
  });

  it('reports superseded when the product changes during inference', async () => {
    jobs.complete.mockResolvedValue(false);
    await expect(service.process(job.id)).resolves.toEqual({
      status: 'superseded',
    });
  });

  it('releases a transient failure and responds with a retriable status', async () => {
    vector.generateEmbedding.mockRejectedValue(
      Object.assign(new Error('Unavailable'), { code: 14 }),
    );
    await expect(service.process(job.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(jobs.fail).toHaveBeenCalledWith(job, 'Unavailable', false);
  });

  it('records a permanent provider failure and acknowledges the delivery', async () => {
    vector.generateEmbedding.mockRejectedValue(
      Object.assign(new Error('Permission denied'), { code: 7 }),
    );
    jobs.fail.mockResolvedValue(true);
    await expect(service.process(job.id)).resolves.toEqual({
      status: 'failed',
    });
    expect(jobs.fail).toHaveBeenCalledWith(job, 'Permission denied', true);
  });

  it('keeps a publication failure recoverable without failing a committed product', async () => {
    queue.enqueue.mockRejectedValue(new Error('Queue unavailable'));
    await expect(service.dispatch(job.id)).resolves.toBeUndefined();
    expect(jobs.markDispatchFailed).toHaveBeenCalledWith(
      dispatch,
      'Queue unavailable',
    );
    expect(jobs.markDispatched).not.toHaveBeenCalled();
  });

  it('allows Scheduler to retry a recovery with publication failures', async () => {
    queue.enqueue.mockRejectedValue(new Error('Queue unavailable'));
    await expect(service.recover()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(jobs.reconcile).toHaveBeenCalledWith(
      EMBEDDING_JOB_SETTINGS.batchSize,
    );
    expect(jobs.cleanup).toHaveBeenCalledWith(EMBEDDING_JOB_SETTINGS.batchSize);
  });

  it('queues a bounded admin refresh including failed jobs', async () => {
    await expect(service.enqueueRefresh()).resolves.toEqual({
      queued: 1,
      dispatched: 1,
    });
    expect(jobs.reconcile).toHaveBeenCalledWith(
      EMBEDDING_JOB_SETTINGS.batchSize,
      true,
    );
  });

  it('does not publish when the integration is disabled', async () => {
    queue.isEnabled.mockReturnValue(false);
    await expect(service.dispatch(job.id)).resolves.toBeUndefined();
    expect(jobs.claimDispatch).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
