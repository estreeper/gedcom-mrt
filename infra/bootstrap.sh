#!/usr/bin/env bash
#
# One-time-per-environment bootstrap for things Terraform can't cleanly own
# (the state bucket it stores state in, and the Workload Identity Federation
# that CI needs before it can authenticate to run Terraform at all).
#
# Run once per GCP project (dev, prod) by a human with Owner/Editor on the
# project, using their own gcloud auth:
#
#   ./infra/bootstrap.sh PROJECT_ID REGION GITHUB_REPO [BILLING_ACCOUNT_ID]
#
# e.g. ./infra/bootstrap.sh gedcom-mrt-dev us-central1 myorg/gedcom-mrt
#
# It prints the values to store as GitHub repo/environment secrets:
#   GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_DEPLOYER_SA, GCP_PROJECT, TF_STATE_BUCKET
set -euo pipefail

PROJECT_ID="${1:?PROJECT_ID required}"
REGION="${2:?REGION required}"
GITHUB_REPO="${3:?GITHUB_REPO (owner/repo) required}"
BILLING_ACCOUNT="${4:-}"

STATE_BUCKET="${PROJECT_ID}-tfstate"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
DEPLOYER_SA="tf-deployer"
DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Using project ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}" >/dev/null

if [[ -n "${BILLING_ACCOUNT}" ]]; then
  echo "==> Linking billing account"
  gcloud billing projects link "${PROJECT_ID}" --billing-account "${BILLING_ACCOUNT}" || true
fi

echo "==> Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  cloudbuild.googleapis.com

echo "==> Creating Terraform state bucket gs://${STATE_BUCKET}"
if ! gcloud storage buckets describe "gs://${STATE_BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --location="${REGION}" --uniform-bucket-level-access
  gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning
fi

echo "==> Creating deployer service account"
gcloud iam service-accounts create "${DEPLOYER_SA}" \
  --display-name="Terraform / CI deployer" 2>/dev/null || true

echo "==> Granting deployer roles"
for role in roles/run.admin roles/artifactregistry.admin roles/datastore.owner \
            roles/storage.admin roles/secretmanager.admin \
            roles/iam.serviceAccountAdmin roles/iam.serviceAccountUser \
            roles/resourcemanager.projectIamAdmin roles/serviceusage.serviceUsageAdmin; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOYER_EMAIL}" --role="${role}" \
    --condition=None >/dev/null
done

echo "==> Creating Workload Identity Federation pool + provider (keyless CI auth)"
gcloud iam workload-identity-pools create "${POOL_ID}" \
  --location=global --display-name="GitHub Actions pool" 2>/dev/null || true

POOL_NAME="$(gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --location=global --format='value(name)')"

gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --location=global --workload-identity-pool="${POOL_ID}" \
  --display-name="GitHub provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" 2>/dev/null || true

PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --location=global --workload-identity-pool="${POOL_ID}" --format='value(name)')"

echo "==> Allowing ${GITHUB_REPO} to impersonate the deployer SA"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_EMAIL}" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" >/dev/null

cat <<EOF

============================================================
Bootstrap complete for ${PROJECT_ID}. Add these as GitHub secrets:

  GCP_PROJECT                      = ${PROJECT_ID}
  GCP_REGION                       = ${REGION}
  TF_STATE_BUCKET                  = ${STATE_BUCKET}
  GCP_DEPLOYER_SA                  = ${DEPLOYER_EMAIL}
  GCP_WORKLOAD_IDENTITY_PROVIDER   = ${PROVIDER_NAME}

Then set the application secret values (never in Terraform state as plaintext
outputs) via TF_VAR_* in CI, or directly:
  gcloud secrets versions add <name> --data-file=-
============================================================
EOF
