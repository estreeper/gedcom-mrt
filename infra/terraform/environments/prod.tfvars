environment     = "prod"
region          = "us-central1"
min_instances   = 1
max_instances   = 8
# project_id, image, and public_base_url are passed by CI (-var) per deploy.
# Secret values come from TF_VAR_* environment variables in CI.
