environment     = "dev"
region          = "us-central1"
min_instances   = 0
max_instances   = 2
# project_id, image, and public_base_url are passed by CI (-var) per deploy.
# Secret values come from TF_VAR_* environment variables in CI.
