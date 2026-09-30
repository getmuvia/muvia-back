import { CloudTasksClient } from '@google-cloud/tasks';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDING_JOB_SETTINGS } from '../../../../config/embedding-jobs.config';
import type {
  EmbeddingDispatch,
  EmbeddingTaskQueue,
} from '../../interfaces/embedding-task-queue.interface';

@Injectable()
export class CloudTasksEmbeddingQueue
  implements EmbeddingTaskQueue, OnModuleDestroy
{
  private client?: CloudTasksClient;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('EMBEDDING_TASKS_ENABLED', false);
  }

  async enqueue({ id, dispatchVersion }: EmbeddingDispatch): Promise<void> {
    if (!this.isEnabled()) throw new Error('Embedding task queue is disabled');
    const client = (this.client ??= new CloudTasksClient({
      projectId: this.config.getOrThrow<string>('GCP_PROJECT_ID'),
    }));
    const parent = client.queuePath(
      this.config.getOrThrow<string>('GCP_PROJECT_ID'),
      this.config.getOrThrow<string>('EMBEDDING_TASKS_LOCATION'),
      this.config.getOrThrow<string>('EMBEDDING_TASKS_QUEUE'),
    );
    const audience = this.config.getOrThrow<string>(
      'EMBEDDING_TASKS_TARGET_URL',
    );
    try {
      await client.createTask(
        {
          parent,
          task: {
            name: `${parent}/tasks/embedding-${id}-${dispatchVersion}`,
            dispatchDeadline: { seconds: EMBEDDING_JOB_SETTINGS.leaseSeconds },
            httpRequest: {
              httpMethod: 'POST',
              url: `${audience}/internal/embeddings/process`,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(JSON.stringify({ jobId: id })),
              oidcToken: {
                serviceAccountEmail: this.config.getOrThrow<string>(
                  'EMBEDDING_TASKS_SERVICE_ACCOUNT',
                ),
                audience,
              },
            },
          },
        },
        { timeout: 3000, retry: null },
      );
    } catch (error: unknown) {
      // A timed-out publication may already have created this named task.
      if (
        !error ||
        typeof error !== 'object' ||
        (error as { code?: unknown }).code !== 6
      )
        throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }
}
