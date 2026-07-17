terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # State lives in the bootstrap-created bucket. Bucket + prefix are supplied per
  # environment via `-backend-config` (see the CI workflow), so this block stays
  # environment-agnostic.
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
