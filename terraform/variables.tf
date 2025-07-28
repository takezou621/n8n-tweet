variable "proxmox_api_url" {
  description = "Proxmox API URL"
  type        = string
}

variable "proxmox_api_token_id" {
  description = "Proxmox API Token ID"
  type        = string
}

variable "proxmox_api_token_secret" {
  description = "Proxmox API Token Secret"
  type        = string
  sensitive   = true
}

variable "proxmox_tls_insecure" {
  description = "Disable TLS verification (use with caution)"
  type        = bool
  default     = false
}

variable "proxmox_node" {
  description = "Proxmox node name"
  type        = string
}

variable "template_name" {
  description = "LXC template name (e.g., ubuntu-22.04-standard_22.04-1_amd64.tar.zst)"
  type        = string
  default     = "ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
}

variable "storage_pool" {
  description = "Storage pool for container root filesystem"
  type        = string
  default     = "local-lvm"
}

variable "network_bridge" {
  description = "Network bridge for container"
  type        = string
  default     = "vmbr0"
}

variable "container_cores" {
  description = "Number of CPU cores"
  type        = number
  default     = 4
}

variable "container_memory" {
  description = "Memory in MB"
  type        = number
  default     = 8192
}

variable "container_swap" {
  description = "Swap in MB"
  type        = number
  default     = 4096
}

variable "root_disk_size" {
  description = "Root disk size (e.g., 32G)"
  type        = string
  default     = "32G"
}

variable "ssh_public_key" {
  description = "SSH public key for container access"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

variable "twitter_bearer_token" {
  description = "Twitter API Bearer Token"
  type        = string
  sensitive   = true
}

variable "twitter_api_key" {
  description = "Twitter API Key"
  type        = string
  sensitive   = true
}

variable "twitter_api_secret" {
  description = "Twitter API Secret"
  type        = string
  sensitive   = true
}

variable "twitter_access_token" {
  description = "Twitter Access Token"
  type        = string
  sensitive   = true
}

variable "twitter_access_token_secret" {
  description = "Twitter Access Token Secret"
  type        = string
  sensitive   = true
}

variable "n8n_basic_auth_user" {
  description = "n8n Basic Auth Username"
  type        = string
  default     = "admin"
}

variable "n8n_basic_auth_password" {
  description = "n8n Basic Auth Password"
  type        = string
  sensitive   = true
}

variable "postgres_password" {
  description = "PostgreSQL password for n8n"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis password"
  type        = string
  sensitive   = true
}