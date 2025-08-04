output "container_id" {
  description = "Proxmox container ID"
  value       = proxmox_lxc.n8n_tweet.vmid
}

output "container_ip" {
  description = "Container IP address"
  value       = proxmox_lxc.n8n_tweet.network[0].ip
}

output "n8n_url" {
  description = "n8n Web UI URL"
  value       = "http://${proxmox_lxc.n8n_tweet.network[0].ip}:5678"
}

output "api_url" {
  description = "Backend API URL"
  value       = "http://${proxmox_lxc.n8n_tweet.network[0].ip}:3001"
}

output "ssh_command" {
  description = "SSH command to access container"
  value       = "ssh root@${proxmox_lxc.n8n_tweet.network[0].ip}"
}