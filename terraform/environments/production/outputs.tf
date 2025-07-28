output "container_id" {
  description = "Proxmox container ID"
  value       = module.n8n_tweet.container_id
}

output "container_ip" {
  description = "Container IP address"
  value       = module.n8n_tweet.container_ip
}

output "n8n_url" {
  description = "n8n Web UI URL"
  value       = module.n8n_tweet.n8n_url
}

output "api_url" {
  description = "Backend API URL"
  value       = module.n8n_tweet.api_url
}

output "ssh_command" {
  description = "SSH command to access container"
  value       = module.n8n_tweet.ssh_command
}