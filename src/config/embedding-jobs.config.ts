export const EMBEDDING_JOB_SETTINGS = {
  batchSize: 25,
  maxAttempts: 5,
  maxDispatchAttempts: 5,
  leaseSeconds: 180,
  dispatchLeaseSeconds: 60,
  recoverySeconds: 1200,
  retentionDays: 7,
} as const;
