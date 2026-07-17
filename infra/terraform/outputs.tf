output "service_url" {
  description = "The Cloud Run service URL."
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repo" {
  description = "Docker repo path for pushing images."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "files_bucket" {
  value = google_storage_bucket.files.name
}
