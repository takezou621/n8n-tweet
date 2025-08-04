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

# SSH Key Validation before any operations
resource "null_resource" "ssh_key_validation" {
  triggers = {
    public_key_path  = var.ssh_public_key_path
    private_key_path = var.ssh_private_key_path
    always_check     = timestamp()
  }
  
  provisioner "local-exec" {
    command = "${path.module}/../../scripts/terraform/validate-ssh-keys.sh"
    environment = {
      TF_VAR_ssh_public_key_path  = var.ssh_public_key_path
      TF_VAR_ssh_private_key_path = var.ssh_private_key_path
    }
  }
}

# Random password generation
resource "random_password" "db_password" {
  length  = 32
  special = true
  
  depends_on = [null_resource.ssh_key_validation]
}

resource "random_password" "redis_password" {
  length  = 32
  special = true
  
  depends_on = [null_resource.ssh_key_validation]
}

resource "random_password" "n8n_admin_password" {
  length  = 16
  special = false
  
  depends_on = [null_resource.ssh_key_validation]
}

resource "random_id" "encryption_key" {
  byte_length = 32
  
  depends_on = [null_resource.ssh_key_validation]
}

resource "random_id" "jwt_secret" {
  byte_length = 32
  
  depends_on = [null_resource.ssh_key_validation]
}

resource "random_password" "container_root_password" {
  length  = 32
  special = true
  
  depends_on = [null_resource.ssh_key_validation]
}

# LXC Container for n8n-tweet Production
resource "proxmox_lxc" "n8n_tweet_production" {
  target_node     = var.proxmox_target_node
  hostname        = var.container_hostname
  ostemplate      = var.container_template
  password        = random_password.container_root_password.result
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
  
  # Initial system setup with security hardening
  provisioner "remote-exec" {
    inline = [
      # System updates
      "apt update && apt upgrade -y",
      "apt install -y curl wget git sudo ufw fail2ban",
      
      # Create non-root user for application
      "useradd -m -s /bin/bash -G sudo n8n-user",
      "echo 'n8n-user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/n8n-user",
      
      # Setup SSH keys for non-root user
      "mkdir -p /home/n8n-user/.ssh",
      "cp /root/.ssh/authorized_keys /home/n8n-user/.ssh/authorized_keys",
      "chown -R n8n-user:n8n-user /home/n8n-user/.ssh",
      "chmod 700 /home/n8n-user/.ssh",
      "chmod 600 /home/n8n-user/.ssh/authorized_keys",
      
      # Create application directory with proper ownership
      "mkdir -p /opt/n8n-tweet",
      "chown -R n8n-user:n8n-user /opt/n8n-tweet",
      
      # Disable root SSH login
      "sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config",
      "sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config",
      
      # Configure SSH security
      "echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config",
      "echo 'PubkeyAuthentication yes' >> /etc/ssh/sshd_config",
      "echo 'Protocol 2' >> /etc/ssh/sshd_config",
      "echo 'AllowUsers n8n-user' >> /etc/ssh/sshd_config",
      
      # Configure firewall
      "ufw --force enable",
      "ufw default deny incoming",
      "ufw default allow outgoing",
      "ufw allow ssh",
      "ufw allow 80/tcp",
      "ufw allow 443/tcp",
      
      # Configure fail2ban
      "systemctl enable fail2ban",
      "systemctl start fail2ban",
      
      # Restart SSH service
      "systemctl restart sshd",
      
      "echo 'Container provisioned successfully with security hardening' > /opt/n8n-tweet/provisioned.txt"
    ]
  }
  
  # Copy setup scripts using non-root user
  provisioner "file" {
    source      = "${path.module}/../../scripts/deployment/setup-production.sh"
    destination = "/opt/n8n-tweet/setup-production.sh"
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
  }
  
  provisioner "file" {
    source      = "${path.module}/../../scripts/deployment/quick-docker-setup.sh"
    destination = "/opt/n8n-tweet/quick-docker-setup.sh"
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
  }
  
  # Copy only necessary application files (exclude sensitive files)
  provisioner "file" {
    source      = "${path.module}/../../docker-compose.production.yml"
    destination = "/opt/n8n-tweet/docker-compose.yml"
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
  }
  
  provisioner "file" {
    source      = "${path.module}/../../.env.production.template"
    destination = "/opt/n8n-tweet/.env.template"
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
  }
  
  provisioner "file" {
    source      = "${path.module}/../../src/"
    destination = "/opt/n8n-tweet/src/"
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
  }
  
  provisioner "file" {
    source      = "${path.module}/../../config/"
    destination = "/opt/n8n-tweet/config/"
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
  }
  
  # Create secure credential files
  provisioner "file" {
    content = templatefile("${path.module}/templates/secure-env.tpl", {
      domain               = var.domain
      n8n_subdomain        = var.n8n_subdomain
      dashboard_subdomain  = var.dashboard_subdomain
      db_password          = random_password.db_password.result
      redis_password       = random_password.redis_password.result
      encryption_key       = random_id.encryption_key.hex
      jwt_secret          = random_id.jwt_secret.b64_std
    })
    destination = "/tmp/secure-credentials.env"
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
  }

  # Execute setup script as non-root user with secure credential handling
  provisioner "remote-exec" {
    inline = [
      "chmod +x /opt/n8n-tweet/*.sh",
      
      # Secure the credential file
      "chmod 600 /tmp/secure-credentials.env",
      
      # Source credentials and run setup
      "cd /opt/n8n-tweet",
      "source /tmp/secure-credentials.env",
      
      # Run setup based on deployment method (using sudo for privileged operations)
      var.deployment_method == "docker" ? "sudo -E /opt/n8n-tweet/quick-docker-setup.sh" : "sudo -E /opt/n8n-tweet/setup-production.sh",
      
      # Securely remove credential file
      "shred -vfz -n 3 /tmp/secure-credentials.env || rm -f /tmp/secure-credentials.env"
    ]
    
    connection {
      type        = "ssh"
      host        = split("/", self.network[0].ip)[0]
      user        = "n8n-user"
      private_key = file(var.ssh_private_key_path)
      timeout     = "5m"
    }
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

output "container_root_password" {
  description = "Generated container root password"
  value       = random_password.container_root_password.result
  sensitive   = true
}

output "encryption_key" {
  description = "Generated encryption key"
  value       = random_id.encryption_key.hex
  sensitive   = true
}

output "ssh_connection" {
  description = "SSH connection command (non-root user)"
  value       = "ssh n8n-user@${split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]}"
}

output "ssh_connection_root" {
  description = "SSH connection command (root user - disabled for security)"
  value       = "Root SSH access has been disabled for security. Use: ssh n8n-user@${split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]}"
}

# Create local file with connection details
resource "local_file" "connection_details" {
  filename = "${path.module}/connection-details.txt"
  content = templatefile("${path.module}/templates/connection-details.tpl", {
    container_ip          = split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]
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