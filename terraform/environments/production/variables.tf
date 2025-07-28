# This file mirrors the variables from the root module
# to allow for environment-specific overrides

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
  description = "Disable TLS verification"
  type        = bool
  default     = false
}

variable "proxmox_node" {
  description = "Proxmox node name"
  type        = string
}

variable "template_name" {
  description = "LXC template name"
  type        = string
}

variable "storage_pool" {
  description = "Storage pool for container"
  type        = string
}

variable "network_bridge" {
  description = "Network bridge"
  type        = string
}

variable "container_cores" {
  description = "Number of CPU cores"
  type        = number
}

variable "container_memory" {
  description = "Memory in MB"
  type        = number
}

variable "container_swap" {
  description = "Swap in MB"
  type        = number
}

variable "root_disk_size" {
  description = "Root disk size"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key"
  type        = string
}

variable "domain_name" {
  description = "Domain name"
  type        = string
}

variable "twitter_bearer_token" {
  description = "Twitter Bearer Token"
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
}

variable "n8n_basic_auth_password" {
  description = "n8n Basic Auth Password"
  type        = string
  sensitive   = true
}

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis password"
  type        = string
  sensitive   = true
}