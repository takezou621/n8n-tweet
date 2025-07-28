module "n8n_tweet" {
  source = "../../"

  # Proxmox Configuration
  proxmox_api_url          = var.proxmox_api_url
  proxmox_api_token_id     = var.proxmox_api_token_id
  proxmox_api_token_secret = var.proxmox_api_token_secret
  proxmox_tls_insecure     = var.proxmox_tls_insecure
  proxmox_node             = var.proxmox_node

  # Container Configuration
  template_name    = var.template_name
  storage_pool     = var.storage_pool
  network_bridge   = var.network_bridge
  container_cores  = var.container_cores
  container_memory = var.container_memory
  container_swap   = var.container_swap
  root_disk_size   = var.root_disk_size

  # SSH Configuration
  ssh_public_key = var.ssh_public_key

  # Application Configuration
  domain_name                 = var.domain_name
  n8n_basic_auth_user        = var.n8n_basic_auth_user
  n8n_basic_auth_password    = var.n8n_basic_auth_password
  postgres_password          = var.postgres_password
  redis_password             = var.redis_password
  twitter_bearer_token       = var.twitter_bearer_token
  twitter_api_key           = var.twitter_api_key
  twitter_api_secret        = var.twitter_api_secret
  twitter_access_token      = var.twitter_access_token
  twitter_access_token_secret = var.twitter_access_token_secret
}