variable "project_id" {
  type        = string
  description = "GCP project id (one project per environment)."
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "environment" {
  type        = string
  description = "Environment name (dev, prod). Used in resource names."
}

variable "service_name" {
  type    = string
  default = "gedcom-mrt"
}

variable "image" {
  type        = string
  description = "Fully-qualified container image (REGION-docker.pkg.dev/PROJECT/REPO/app:TAG)."
}

variable "public_base_url" {
  type        = string
  description = "Public URL of the service (for Stripe/OAuth redirects), e.g. https://app.example.com."
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 4
}

variable "custom_domain" {
  type        = string
  default     = ""
  description = "Optional custom domain to map to the service."
}

# --- application secret values (sensitive; supplied via TF_VAR_* in CI) --------
# Empty string means "don't manage a version" (set it out-of-band instead).
variable "session_secret" {
  type      = string
  sensitive = true
  default   = ""
}
variable "stripe_secret_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "stripe_webhook_secret" {
  type      = string
  sensitive = true
  default   = ""
}
variable "google_client_id" {
  type    = string
  default = ""
}
variable "google_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}
