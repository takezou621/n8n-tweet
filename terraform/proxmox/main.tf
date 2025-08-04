# n8n-tweet Proxmox Infrastructure Configuration

# Backend and provider configuration moved to versions.tf
# This improves separation of concerns and maintainability

# Common local values for resource naming and tagging
locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Owner       = var.owner_email
    CostCenter  = var.cost_center
    CreatedAt   = timestamp()
  }
  
  container_name = "${var.project_name}-${var.environment}"
}

# Random password generation
resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "random_password" "redis_password" {
  length  = 32
  special = true
}

resource "random_password" "n8n_admin_password" {
  length  = 16
  special = false
}

resource "random_id" "encryption_key" {
  byte_length = 32
}

resource "random_id" "jwt_secret" {
  byte_length = 32
}

# LXC Container for n8n-tweet Production
resource "proxmox_lxc" "n8n_tweet_production" {
  target_node     = var.proxmox_target_node
  hostname        = var.container_hostname
  ostemplate      = var.container_template
  password        = var.container_root_password
  unprivileged    = true
  start           = true
  onboot          = true
  protection      = false
  
  # Container Resources
  cores  = var.container_cores
  memory = var.container_memory
  swap   = var.container_swap
  
  # Root Filesystem
  rootfs {
    storage = var.storage_pool
    size    = var.container_disk_size
  }
  
  # Network Configuration
  network {
    name   = "eth0"
    bridge = var.network_bridge
    ip     = var.container_ip != "" ? "${var.container_ip}/${var.network_cidr}" : "dhcp"
    gw     = var.network_gateway
  }
  
  # DNS Configuration
  nameserver = var.dns_servers
  searchdomain = var.search_domain
  
  # Container Features
  features {
    nesting = true
    mount   = "nfs;cifs"
  }
  
  # SSH Keys
  ssh_public_keys = var.ssh_public_keys
  
  # Startup Configuration
  startup = "order=1,up=30,down=60"
  
  # Tags
  tags = "production,n8n,tweet,automation"
  
  # Mount points for persistent data
  dynamic "mountpoint" {
    for_each = var.enable_shared_storage ? [1] : []
    content {
      key     = "0"
      slot    = 0
      storage = var.shared_storage_pool
      size    = var.shared_storage_size
      mp      = "/opt/n8n-tweet"
    }
  }
  
  # SSH key for secure access
  ssh_public_keys = file(var.ssh_public_key_path)
  
  # Secure SSH connection using key-based authentication
  connection {
    type        = "ssh"
    host        = split("/", self.network[0].ip)[0]
    user        = "root"
    private_key = file(var.ssh_private_key_path)
    timeout     = "5m"
  }
  
  # Initial system setup
  provisioner "remote-exec" {
    inline = [
      "apt update && apt upgrade -y",
      "apt install -y curl wget git",
      "mkdir -p /opt/n8n-tweet",
      "echo 'Container provisioned successfully' > /opt/n8n-tweet/provisioned.txt"
    ]
  }
  
  # Copy setup scripts
  provisioner "file" {
    source      = "${path.module}/../../scripts/deployment/setup-production.sh"
    destination = "/opt/n8n-tweet/setup-production.sh"
  }
  
  provisioner "file" {
    source      = "${path.module}/../../scripts/deployment/quick-docker-setup.sh"
    destination = "/opt/n8n-tweet/quick-docker-setup.sh"
  }
  
  # Copy only necessary application files (exclude sensitive files)
  provisioner "file" {
    source      = "${path.module}/../../docker-compose.production.yml"
    destination = "/opt/n8n-tweet/docker-compose.yml"
  }
  
  provisioner "file" {
    source      = "${path.module}/../../.env.production.template"
    destination = "/opt/n8n-tweet/.env.template"
  }
  
  provisioner "file" {
    source      = "${path.module}/../../src/"
    destination = "/opt/n8n-tweet/src/"
  }
  
  provisioner "file" {
    source      = "${path.module}/../../config/"
    destination = "/opt/n8n-tweet/config/"
  }
  
  # Execute setup script
  provisioner "remote-exec" {
    inline = [
      "chmod +x /opt/n8n-tweet/*.sh",
      "cd /opt/n8n-tweet/app",
      
      # Set environment variables for setup
      "export DOMAIN=${var.domain}",
      "export N8N_SUBDOMAIN=${var.n8n_subdomain}",
      "export DASHBOARD_SUBDOMAIN=${var.dashboard_subdomain}",
      "export DB_PASSWORD='${random_password.db_password.result}'",
      "export REDIS_PASSWORD='${random_password.redis_password.result}'",
      "export ENCRYPTION_KEY='${random_id.encryption_key.hex}'",
      "export JWT_SECRET='${random_id.jwt_secret.b64_std}'",
      
      # Run setup based on deployment method
      var.deployment_method == "docker" ? "/opt/n8n-tweet/quick-docker-setup.sh" : "/opt/n8n-tweet/setup-production.sh"
    ]
  }
}

# Output important information
output "container_ip" {
  description = "IP address of the n8n-tweet container"
  value       = proxmox_lxc.n8n_tweet_production.network[0].ip
}

output "container_id" {
  description = "Container ID"
  value       = proxmox_lxc.n8n_tweet_production.vmid
}

output "access_urls" {
  description = "Access URLs for the services"
  value = {
    n8n_url       = "https://${var.n8n_subdomain}.${var.domain}"
    dashboard_url = "https://${var.dashboard_subdomain}.${var.domain}"
  }
}

output "database_password" {
  description = "Generated database password"
  value       = random_password.db_password.result
  sensitive   = true
}

output "redis_password" {
  description = "Generated Redis password"
  value       = random_password.redis_password.result
  sensitive   = true
}

output "n8n_admin_password" {
  description = "Generated n8n admin password"
  value       = random_password.n8n_admin_password.result
  sensitive   = true
}

output "encryption_key" {
  description = "Generated encryption key"
  value       = random_id.encryption_key.hex
  sensitive   = true
}

output "ssh_connection" {
  description = "SSH connection command"
  value       = "ssh root@${proxmox_lxc.n8n_tweet_production.network[0].ip}"
}

# Create local file with connection details
resource "local_file" "connection_details" {
  filename = "${path.module}/connection-details.txt"
  content = templatefile("${path.module}/templates/connection-details.tpl", {
    container_ip          = proxmox_lxc.n8n_tweet_production.network[0].ip
    container_id         = proxmox_lxc.n8n_tweet_production.vmid
    domain               = var.domain
    n8n_subdomain        = var.n8n_subdomain
    dashboard_subdomain  = var.dashboard_subdomain
    db_password          = random_password.db_password.result
    redis_password       = random_password.redis_password.result
    n8n_admin_password   = random_password.n8n_admin_password.result
    encryption_key       = random_id.encryption_key.hex
    jwt_secret          = random_id.jwt_secret.b64_std
  })
  
  file_permission = "0600"
}

# Optional: DNS records (if using external DNS provider)
# Uncomment and configure for your DNS provider

# resource "cloudflare_record" "n8n" {
#   count   = var.dns_provider == "cloudflare" ? 1 : 0
#   zone_id = var.cloudflare_zone_id
#   name    = var.n8n_subdomain
#   value   = proxmox_lxc.n8n_tweet_production.network[0].ip
#   type    = "A"
#   ttl     = 300
# }

# resource "cloudflare_record" "dashboard" {
#   count   = var.dns_provider == "cloudflare" ? 1 : 0
#   zone_id = var.cloudflare_zone_id
#   name    = var.dashboard_subdomain
#   value   = proxmox_lxc.n8n_tweet_production.network[0].ip
#   type    = "A"
#   ttl     = 300
# }