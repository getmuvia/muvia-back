# Demo Deployment

## Overview

`muvia-back` is deployed to a single Google Cloud demo environment. Infrastructure lives in the separate `muvia-infra` repository, while this repository owns application builds and releases.

The separation is intentionally small:

- Terraform creates and configures Google Cloud resources.
- GitHub Actions updates only the application image used by Cloud Run.
- The backend workflow never executes Terraform.
- Terraform ignores later changes to the service and migration-job image fields.

## Deployment Flow

```text
Pull request
  -> npm ci
  -> Nest build
  -> production dependency audit
  -> Docker build

Push to develop
  -> authenticate to Google Cloud with GitHub OIDC
  -> push image tagged with the commit SHA
  -> resolve the immutable image digest
  -> run database migrations with a Cloud Run job
  -> update the Cloud Run service image
  -> verify GET /health
```

No service-account JSON key or application secret is stored in GitHub.

## GitHub Environment

Create a GitHub Environment named `demo` and populate these variables from the `muvia-infra` Terraform output:

| Variable | Purpose |
|---|---|
| `GCP_PROJECT_ID` | Google Cloud project containing the demo |
| `GCP_REGION` | Artifact Registry and Cloud Run region |
| `GCP_ARTIFACT_REPOSITORY` | Docker repository name |
| `GCP_CLOUD_RUN_SERVICE` | Backend Cloud Run service name |
| `GCP_MIGRATION_JOB` | Cloud Run migration job name |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | GitHub OIDC provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Service account impersonated by GitHub Actions |

Runtime secrets such as `DB_PASSWORD` and `JWT_SECRET` come directly from Secret Manager.

## Database Migrations

Production disables TypeORM synchronization. The deployment workflow updates the migration job to the same image digest that will be deployed and runs:

```bash
npm run migration:run
```

The initial migration creates:

- `pgcrypto` and `vector` extensions;
- application enums and tables;
- foreign keys and basic lookup indexes;
- a cosine HNSW index for 768-dimensional product embeddings.

If migration execution fails, the workflow stops before updating the API service.

## Container

The Docker image uses multiple stages:

- dependencies and compilation remain in build stages;
- development dependencies are pruned before the runtime stage;
- the application runs as a non-root user;
- the runtime image contains only compiled output and production dependencies.

## Health Check

The public `GET /health` endpoint returns a small process-level status response. GitHub Actions calls it after deployment. It does not expose configuration, secrets, or database data.

## Demo Limitations

- Only `develop` deploys and there is no staging environment.
- The API is public; authentication remains enforced at endpoint level.
- The infrastructure uses a small Cloud SQL instance.
- Product assets may be publicly readable depending on the Terraform variable.
- The separate 3D worker image must exist before the 3D endpoint can start Vertex AI jobs.
