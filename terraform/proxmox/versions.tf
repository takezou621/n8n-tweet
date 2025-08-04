# Terraform Version and Provider Requirements

terraform {
  required_version = ">= 1.5.0"
  
  # Remote State Backend Configuration
  # Configure via backend.tf file for production use

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
    
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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

# AWS Provider Configuration (for backend)
provider "aws" {
  region  = var.state_bucket_region
  profile = var.aws_profile
  
  # Default tags for all AWS resources
  default_tags {
    tags = {
      Project     = "n8n-tweet"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}