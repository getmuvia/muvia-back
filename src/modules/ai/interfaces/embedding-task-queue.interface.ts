export const EMBEDDING_TASK_QUEUE = Symbol('EMBEDDING_TASK_QUEUE');

export interface EmbeddingDispatch {
  id: string;
  dispatchVersion: number;
}

export interface EmbeddingTaskQueue {
  isEnabled(): boolean;
  enqueue(dispatch: EmbeddingDispatch): Promise<void>;
}
