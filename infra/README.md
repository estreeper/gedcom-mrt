# Infrastructure

CI/CD and infrastructure for GEDCOM Repair. One **GCP project per environment**
(dev, prod); each runs the app as a **single Cloud Run service** (the Fastify
server serves both the API and the built SPA). State lives in a per-project GCS
bucket. CI authenticates to GCP with **Workload Identity Federation** — no
long-lived service-account keys.

## Layout

```
infra/
  bootstrap.sh            run once per project (things Terraform can't own)
  terraform/
    versions.tf           providers + gcs backend (partial config)
    variables.tf
    main.tf               Artifact Registry, Firestore, GCS, Secret Manager,
                          Cloud Run service, runtime SA + IAM, domain mapping
    outputs.tf
    environments/
      dev.tfvars
      prod.tfvars
```

## First-time setup (per environment)

1. Create the GCP project (or let bootstrap link billing to an existing one).
2. Run the bootstrap for that project — it enables APIs, creates the Terraform
   state bucket, a deployer service account, and the Workload Identity
   Federation pool/provider that GitHub Actions uses:

   ```sh
   ./infra/bootstrap.sh gedcom-mrt-dev us-central1 <owner>/<repo> [BILLING_ACCOUNT_ID]
   ```

3. Add the printed values as **GitHub Environment secrets** (one environment per
   env, so prod can require reviewers):

   | Secret | From |
   |---|---|
   | `GCP_PROJECT`, `GCP_REGION`, `TF_STATE_BUCKET` | bootstrap output |
   | `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOYER_SA` | bootstrap output |
   | `PUBLIC_BASE_URL` | the service's public URL |
   | `SESSION_SECRET` | a long random string |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe dashboard |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | (optional) Google OAuth |

## Deploys

- **CI** (`.github/workflows/ci.yml`) runs on every PR/push: typecheck + tests +
  build for the frontend and backend, plus a Docker build.
- **Deploy** (`.github/workflows/deploy.yml`): a push to `main` deploys **dev**;
  `workflow_dispatch` with `environment: prod` deploys **prod** (gated by the
  GitHub Environment's required reviewers). Each deploy builds and pushes the
  image to Artifact Registry and runs `terraform apply`.

## Notes

- Application secret values are stored in **Secret Manager** (created by
  Terraform, values injected from `TF_VAR_*` in CI) and mounted into Cloud Run as
  env vars — never baked into the image or committed.
- Ciphertext GEDCOM blobs live in a per-env GCS bucket; account/license/keybag
  data lives in Firestore. The server never holds decryption keys.
- Terraform is not installed in this repo's dev container; validate with
  `terraform fmt -check` and `terraform validate` in CI or locally before apply.
