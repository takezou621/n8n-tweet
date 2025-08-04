# Terraform Remote State Backend Configuration
# Note: Backend configuration moved to separate files for proper initialization
# Use backend.hcl file with 'terraform init -backend-config=backend.hcl'

# Data sources for backend validation (only used after backend is configured)
data "aws_s3_bucket" "state_bucket" {
  count  = var.validate_backend ? 1 : 0
  bucket = var.state_bucket_name
}

data "aws_dynamodb_table" "state_lock" {
  count = var.validate_backend ? 1 : 0
  name  = var.state_lock_table_name
}

# Validate that backend resources exist (optional validation)
resource "null_resource" "backend_validation" {
  count = var.validate_backend ? 1 : 0
  
  triggers = {
    bucket_exists = data.aws_s3_bucket.state_bucket[0].id
    table_exists  = data.aws_dynamodb_table.state_lock[0].id
  }
  
  lifecycle {
    precondition {
      condition     = data.aws_s3_bucket.state_bucket[0].server_side_encryption_configuration[0].rule[0].apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"
      error_message = "S3 bucket must have KMS encryption enabled."
    }
    
    precondition {
      condition     = data.aws_s3_bucket.state_bucket[0].versioning[0].enabled == true
      error_message = "S3 bucket must have versioning enabled."
    }
    
    precondition {
      condition     = data.aws_dynamodb_table.state_lock[0].billing_mode == "PAY_PER_REQUEST" || data.aws_dynamodb_table.state_lock[0].billing_mode == "PROVISIONED"
      error_message = "DynamoDB table must exist and be properly configured."
    }
  }
}