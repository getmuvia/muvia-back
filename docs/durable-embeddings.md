# Durable Product Embeddings

The product and its pending job are saved in the same transaction. The job
includes the exact document, product revision, model, and content format version.
After the transaction commits, the application attempts to publish the job to
Cloud Tasks. If publication fails, the pending job remains in PostgreSQL and
Scheduler recovers it.

## Components

- `ProductsService` preserves catalog transactions and locks the product row
  during an edit. It compares canonical documents; price, stock, images, and
  equivalent specification changes do not regenerate the vector.
- `ProductEmbeddingRepository` manages the outbox, leases, and conditional
  writes. Each lease has a token and expires after 180 seconds. A replaced worker
  cannot save a result or release its replacement's lease.
- `EmbeddingService` coordinates the existing provider and the publication port.
- `CloudTasksEmbeddingQueue` uses the official SDK. Messages contain only `jobId`.
- Internal endpoints verify the signature, expiration, and audience of Google's
  OIDC token, along with the verified email of the permitted service account.
  User JWTs and `X-CloudTasks-*` headers do not grant access.

Processing returns 2xx for completed, superseded, or permanently failed jobs;
temporary errors and occupied leases return 503. A persistent limit of five
processing attempts per job applies independently of repeated deliveries. A task
that disappears from the queue is republished after 20 minutes, provided its
lease has expired and attempts remain.

Each job is also limited to five publication attempts. If the job has not
completed when the final publication's recovery deadline expires, it is marked
as failed. This prevents indefinite republication caused by incorrect permissions
or prolonged outages. After correcting the cause, an administrator can enqueue
the job again through the regeneration endpoint.

The provider retains its existing retries for 429 errors and limits each RPC call
to 30 seconds. The maximum duration of these retries fits within the lease.
An interruption after obtaining the vector but before saving it may repeat the
Vertex call: delivery and external billing do not have exactly-once guarantees.

## Deployment and Activation

1. Deploy the backend first with `EMBEDDING_TASKS_ENABLED=false`. The existing
   workflow runs the new migration before updating Cloud Run.
2. In `muvia-infra`, obtain the current URL with `terraform output -raw cloud_run_url`.
3. Configure the local variables file:

   ```hcl
   embedding_tasks_enabled    = true
   embedding_tasks_target_url = "https://EXISTING-BACKEND-URL.run.app"
   ```

4. Review `terraform plan` and apply the infrastructure: one queue, one schedule
   running every 15 minutes, one caller identity, and scoped permissions.
   The existing Cloud Run service and Cloud SQL capacity are preserved.
5. To start the first batch immediately, an administrator can call
   `POST /ai/embeddings/regenerate`. It now returns HTTP 202 with
   `{ queued, dispatched }`, rather than keeping a request open while generating
   embeddings for the entire catalog. Each call enqueues up to 25 pending products
   and allows failed jobs to be retried after their cause has been corrected.

Scheduler continues migration batches, processes category changes, and recovers
publication failures. Existing products have a null `embedding_revision`: their
vectors are not assumed to be correct. While vectors are rebuilt, these products
remain available in the catalog and lexical search. Semantic search uses only
vectors matching the current revision, model, and content format.

In development, the outbox also works with TypeORM synchronization. Without a
configured queue, pending jobs remain stored and no background AI processing
runs inside the application process. Activation requires an explicit project,
region, queue name, HTTPS origin, and service account.

## Operations and Costs

Cloud Run retains zero minimum instances and request-based billing. The queue
dispatches one job at a time, with five attempts per task and backoff ranging from
30 to 300 seconds. The outbox persists permanent failures for review rather than
retrying indefinitely. Completed and superseded jobs older than seven days are
deleted in batches. Pending and failed jobs are not deleted automatically.

The Tasks/Scheduler free allowances are independent of usage in other products.
Cloud Run's free allowance is shared across the billing account. Enabling the
queue does not make Vertex processing, SQL, logging, or traffic free.

Inspect failures without reading document contents:

```sql
SELECT id, product_id, revision, model, status, attempts, last_error, updated_at
FROM product_embedding_jobs
WHERE status = 'failed'
ORDER BY updated_at DESC;
```

All content writes must go through catalog transactions. If external maintenance
changes products through SQL, it must increment `search_revision` and invalidate
`embedding_target_id` in the same transaction.

## Local Verification

`npm test -- --runInBand` also runs the migration and outbox queries against
in-memory PostgreSQL with pgvector (PGlite). It covers rollback, stale versions,
publication failures, duplicate deliveries, expired leases, and attempt limits.
The guard is verified using signed RSA tokens without requesting credentials or
calling Google Cloud. PGlite dependencies are installed only for development
and testing.

These tests do not simulate multiple independent Cloud SQL sessions or verify
IAM, Cloud Tasks delivery, or actual Cloud Run load. After activating the
services, verify product creation, an edit, and Scheduler recovery in the
deployed environment.
