# Terraform Version and Provider Requirements

terraform {
  required_version = ">= 1.5.0"
  
  # Remote State Backend Configuration
  # Uncomment and configure for production use
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "proxmox/n8n-tweet/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-state-lock"
  # }

  required_providers {
    proxmox = {
      source  = "telmate/proxmox"
      version = "~> 2.9.0"
    }
    
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5.0"
    }
    
    local = {
      source  = "hashicorp/local"
      version = "~> 2.4.0"
    }
    
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2.0"
    }
  }
}

# Provider Configuration
provider "proxmox" {
  pm_api_url          = var.proxmox_api_url
  pm_api_token_id     = var.proxmox_api_token_id
  pm_api_token_secret = var.proxmox_api_token_secret
  
  # Security Settings
  pm_tls_insecure = false
  
  # Connection Settings
  pm_timeout = 600
  
  # Logging (for debugging - disable in production)
  pm_log_enable = false
  pm_log_file   = "terraform-plugin-proxmox.log"
  pm_log_levels = {
    _default    = "debug"
    _capturelog = ""
  }
}