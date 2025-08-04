# Terraform Outputs for n8n-tweet Proxmox Deployment

output "container_id" {
  description = "The ID of the created LXC container"
  value       = proxmox_lxc.n8n_tweet_production.vmid
}

output "container_name" {
  description = "The hostname of the created container"
  value       = proxmox_lxc.n8n_tweet_production.hostname
}

output "container_ip_address" {
  description = "The IP address of the container"
  value       = proxmox_lxc.n8n_tweet_production.network[0].ip
}

output "container_status" {
  description = "The current status of the container"
  value       = proxmox_lxc.n8n_tweet_production.status
}

output "ssh_connection_command" {
  description = "SSH command to connect to the container"
  value       = "ssh root@${split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]}"
}

output "n8n_url" {
  description = "URL to access the n8n workflow interface"
  value       = "https://${var.domain_name}:5678"
}

output "dashboard_url" {
  description = "URL to access the n8n-tweet dashboard"
  value       = "https://${var.domain_name}:3000"
}

output "deployment_summary" {
  description = "Summary of the deployed infrastructure"
  value = {
    container_id     = proxmox_lxc.n8n_tweet_production.vmid
    hostname        = proxmox_lxc.n8n_tweet_production.hostname
    ip_address      = split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]
    cores          = proxmox_lxc.n8n_tweet_production.cores
    memory         = proxmox_lxc.n8n_tweet_production.memory
    storage        = "${proxmox_lxc.n8n_tweet_production.rootfs[0].size}G"
    environment    = var.environment
    project        = var.project_name
    deployed_at    = timestamp()
  }
}

output "resource_tags" {
  description = "Resource tags applied to the infrastructure"
  value = {
    Environment = var.environment
    Project     = var.project_name
    Owner       = var.owner_email
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
  }
}

output "monitoring_endpoints" {
  description = "Endpoints for monitoring and health checks"
  value = {
    n8n_health      = "https://${var.domain_name}:5678/healthz"
    dashboard_health = "https://${var.domain_name}:3000/api/v1/health"
    ssh_check       = "ssh root@${split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]} 'systemctl status docker'"
  }
}

output "backup_information" {
  description = "Information for backup and disaster recovery"
  value = {
    container_id    = proxmox_lxc.n8n_tweet_production.vmid
    backup_schedule = "Daily at 2:00 AM"
    retention_days  = 30
    backup_location = "/var/lib/vz/dump/"
  }
}

output "security_information" {
  description = "Security configuration summary"
  value = {
    unprivileged_mode = var.container_unprivileged
    protection_enabled = var.container_protection
    ssh_key_auth      = "enabled"
    firewall_status   = "configured"
  }
}

output "next_steps" {
  description = "Next steps after deployment"
  value = [
    "1. SSH to container: ssh root@${split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]}",
    "2. Verify Docker services: docker-compose ps",
    "3. Check n8n status: systemctl status n8n-tweet",
    "4. Configure DNS: Point ${var.domain_name} to ${split("/", proxmox_lxc.n8n_tweet_production.network[0].ip)[0]}",
    "5. Setup SSL certificates: Run setup-ssl.sh script",
    "6. Configure monitoring: Setup health check endpoints"
  ]
}