locals {
  # Required secrets are always wired; optional ones only when a value is given.
  required_secrets = {
    SESSION_SECRET        = var.session_secret
    STRIPE_SECRET_KEY     = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
  }
  optional_secrets = {
    for k, v in {
      GOOGLE_CLIENT_ID     = var.google_client_id
      GOOGLE_CLIENT_SECRET = var.google_client_secret
    } : k => v if v != ""
  }
  # Only manage secrets that actually have a value provided.
  secret_values = { for k, v in merge(local.required_secrets, local.optional_secrets) : k => v if v != "" }

  apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}

# --- container registry --------------------------------------------------------
resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = var.service_name
  format        = "DOCKER"
  description   = "Container images for ${var.service_name}"
  depends_on    = [google_project_service.apis]
}

# --- data stores ---------------------------------------------------------------
resource "google_firestore_database" "database" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.apis]
}

resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-${var.environment}-files"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }
}

# --- runtime identity ----------------------------------------------------------
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-run"
  display_name = "${var.service_name} Cloud Run runtime"
}

resource "google_project_iam_member" "runtime_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_files" {
  bucket = google_storage_bucket.files.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# --- secrets -------------------------------------------------------------------
resource "google_secret_manager_secret" "app" {
  for_each  = local.secret_values
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "app" {
  for_each    = local.secret_values
  secret      = google_secret_manager_secret.app[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each  = local.secret_values
  secret_id = google_secret_manager_secret.app[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# --- the service ---------------------------------------------------------------
resource "google_cloud_run_v2_service" "app" {
  name                = var.service_name
  location            = var.region
  deletion_protection = false

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DATA_BACKEND"
        value = "firestore"
      }
      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "FILES_BUCKET"
        value = google_storage_bucket.files.name
      }
      env {
        name  = "PUBLIC_BASE_URL"
        value = var.public_base_url
      }
      env {
        name  = "STATIC_DIR"
        value = "/app/build"
      }

      dynamic "env" {
        for_each = local.secret_values
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app[env.key].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.app,
    google_secret_manager_secret_iam_member.runtime_access,
  ]
}

# Publicly invocable (the app itself gates access via sessions/licenses).
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- optional custom domain ----------------------------------------------------
resource "google_cloud_run_domain_mapping" "app" {
  count    = var.custom_domain == "" ? 0 : 1
  name     = var.custom_domain
  location = var.region
  metadata {
    namespace = var.project_id
  }
  spec {
    route_name = google_cloud_run_v2_service.app.name
  }
}
