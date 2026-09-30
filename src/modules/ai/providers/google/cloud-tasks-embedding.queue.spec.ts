import { CloudTasksClient } from '@google-cloud/tasks';
import { ConfigService } from '@nestjs/config';
import { CloudTasksEmbeddingQueue } from './cloud-tasks-embedding.queue';

jest.mock('@google-cloud/tasks', () => ({ CloudTasksClient: jest.fn() }));

describe('CloudTasksEmbeddingQueue', () => {
  const createTask = jest.fn();
  const close = jest.fn();
  const parent = 'projects/muvia-test/locations/us-central1/queues/embeddings';
  const configuration: Record<string, string | boolean> = {
    EMBEDDING_TASKS_ENABLED: true,
    GCP_PROJECT_ID: 'muvia-test',
    EMBEDDING_TASKS_LOCATION: 'us-central1',
    EMBEDDING_TASKS_QUEUE: 'embeddings',
    EMBEDDING_TASKS_TARGET_URL: 'https://muvia-back-test.run.app',
    EMBEDDING_TASKS_SERVICE_ACCOUNT:
      'invoker@muvia-test.iam.gserviceaccount.com',
  };
  let queue: CloudTasksEmbeddingQueue;

  beforeEach(() => {
    jest.resetAllMocks();
    configuration.EMBEDDING_TASKS_ENABLED = true;
    jest.mocked(CloudTasksClient).mockImplementation(
      () =>
        ({
          createTask,
          close,
          queuePath: () => parent,
        }) as unknown as CloudTasksClient,
    );
    queue = new CloudTasksEmbeddingQueue({
      get: (key: string) => configuration[key],
      getOrThrow: (key: string) => configuration[key],
    } as unknown as ConfigService);
  });

  it('publishes a small authenticated task with a deterministic delivery name', async () => {
    await queue.enqueue({ id: 'job-id', dispatchVersion: 2 });
    expect(createTask).toHaveBeenCalledWith(
      {
        parent,
        task: {
          name: `${parent}/tasks/embedding-job-id-2`,
          dispatchDeadline: { seconds: 180 },
          httpRequest: {
            httpMethod: 'POST',
            url: `${configuration.EMBEDDING_TASKS_TARGET_URL}/internal/embeddings/process`,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ jobId: 'job-id' })),
            oidcToken: {
              audience: configuration.EMBEDDING_TASKS_TARGET_URL,
              serviceAccountEmail:
                configuration.EMBEDDING_TASKS_SERVICE_ACCOUNT,
            },
          },
        },
      },
      { timeout: 3000, retry: null },
    );
    await queue.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('accepts a task already created after an ambiguous publication timeout', async () => {
    createTask.mockRejectedValue({ code: 6 });
    await expect(
      queue.enqueue({ id: 'job-id', dispatchVersion: 1 }),
    ).resolves.toBeUndefined();
  });

  it('propagates transient publication errors for outbox recovery', async () => {
    createTask.mockRejectedValue(new Error('Unavailable'));
    await expect(
      queue.enqueue({ id: 'job-id', dispatchVersion: 1 }),
    ).rejects.toThrow('Unavailable');
  });

  it('does not instantiate a Google client while disabled', async () => {
    configuration.EMBEDDING_TASKS_ENABLED = false;
    await expect(
      queue.enqueue({ id: 'job-id', dispatchVersion: 1 }),
    ).rejects.toThrow('disabled');
    expect(CloudTasksClient).not.toHaveBeenCalled();
  });
});
