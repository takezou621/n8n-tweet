# Terraform Backend Configuration File
# Use with: terraform init -backend-config=backend.hcl

# S3 Backend Configuration
bucket         = "n8n-tweet-terraform-state"
key            = "n8n-tweet/proxmox/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "terraform-state-lock"
kms_key_id     = "alias/terraform-state-key"

# Profile for AWS authentication
profile = "default"

# Workspace management
workspace_key_prefix = "workspaces"

# Force path style for S3 compatibility
force_path_style = false

# Skip credentials validation (if needed)
skip_credentials_validation = false
skip_metadata_api_check    = false
skip_region_validation     = false

# Configuration Notes:
# 1. Customize bucket name, region, and other values for your environment
# 2. Ensure S3 bucket and DynamoDB table exist before running terraform init
# 3. Run setup-backend.sh script to create required AWS resources
# 4. Use environment variables or AWS profiles for authentication