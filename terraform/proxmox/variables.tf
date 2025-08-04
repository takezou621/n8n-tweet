# Terraform Variables for n8n-tweet Proxmox Deployment

# Proxmox Provider Configuration
variable "proxmox_api_url" {
  description = "Proxmox API URL (e.g., https://proxmox.example.com:8006/api2/json)"
  type        = string
  validation {
    condition     = can(regex("^https?://", var.proxmox_api_url))
    error_message = "Proxmox API URL must be a valid HTTP/HTTPS URL."
  }
}

variable "proxmox_api_token_id" {
  description = "Proxmox API token ID"
  type        = string
  sensitive   = true
}

variable "proxmox_api_token_secret" {
  description = "Proxmox API token secret"
  type        = string  
  sensitive   = true
}

# Container Configuration
variable "container_cores" {
  description = "Number of CPU cores for the container"
  type        = number
  default     = 2
  validation {
    condition     = var.container_cores >= 1 && var.container_cores <= 8
    error_message = "Container cores must be between 1 and 8."
  }
}

variable "container_memory" {
  description = "Memory allocation for the container in MB"
  type        = number
  default     = 4096
  validation {
    condition     = var.container_memory >= 1024 && var.container_memory <= 16384
    error_message = "Container memory must be between 1024 and 16384 MB."
  }
}

variable "container_storage" {
  description = "Storage allocation for the container in GB"
  type        = number
  default     = 32
  validation {
    condition     = var.container_storage >= 16 && var.container_storage <= 128
    error_message = "Container storage must be between 16 and 128 GB."
  }
}

# Network Configuration
variable "container_ip" {
  description = "Static IP address for the container (optional, uses DHCP if empty)"
  type        = string
  default     = ""
  validation {
    condition = var.container_ip == "" || can(cidrhost("${var.container_ip}/24", 0))
    error_message = "Container IP must be a valid IPv4 address or empty for DHCP."
  }
}

variable "network_gateway" {
  description = "Network gateway IP address"
  type        = string
  default     = "192.168.1.1"
  validation {
    condition     = can(cidrhost("${var.network_gateway}/24", 0))
    error_message = "Network gateway must be a valid IPv4 address."
  }
}

variable "network_bridge" {
  description = "Network bridge to use for container"
  type        = string
  default     = "vmbr0"
}

variable "network_cidr" {
  description = "Network CIDR notation (e.g., 24 for /24)"
  type        = number
  default     = 24
  validation {
    condition     = var.network_cidr >= 8 && var.network_cidr <= 30
    error_message = "Network CIDR must be between 8 and 30."
  }
}

# Container Template and OS
variable "container_template" {
  description = "LXC container template to use"
  type        = string
  default     = "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
}

variable "container_ostype" {
  description = "Operating system type for the container"
  type        = string
  default     = "ubuntu"
  validation {
    condition = contains(["ubuntu", "debian", "centos", "fedora"], var.container_ostype)
    error_message = "Container OS type must be one of: ubuntu, debian, centos, fedora."
  }
}

# Proxmox Cluster Configuration
variable "target_node" {
  description = "Proxmox node to deploy the container on"
  type        = string
  default     = "proxmox"
}

variable "storage_pool" {
  description = "Storage pool for container disk"
  type        = string
  default     = "local-lvm"
}

# SSH Configuration
variable "ssh_public_key_path" {
  description = "Path to SSH public key file for container access"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "ssh_private_key_path" {
  description = "Path to SSH private key file for provisioning"
  type        = string
  default     = "~/.ssh/id_rsa"
  sensitive   = true
}

# Application Configuration
variable "domain_name" {
  description = "Domain name for the n8n-tweet application"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\\.[a-zA-Z]{2,}$", var.domain_name))
    error_message = "Domain name must be a valid FQDN."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Tags and Metadata
variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
  default     = "n8n-tweet"
}

variable "owner_email" {
  description = "Owner email for resource tagging"
  type        = string
  validation {
    condition     = can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.owner_email))
    error_message = "Owner email must be a valid email address."
  }
}

variable "cost_center" {
  description = "Cost center for billing and tracking"
  type        = string
  default     = "infrastructure"
}

# Security Configuration
variable "container_unprivileged" {
  description = "Run container in unprivileged mode for security"
  type        = bool
  default     = true
}

variable "container_protection" {
  description = "Enable container protection against accidental deletion"
  type        = bool
  default     = true
}