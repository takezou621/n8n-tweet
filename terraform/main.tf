resource "random_id" "container" {
  byte_length = 4
}

resource "random_password" "n8n_encryption_key" {
  length  = 32
  special = true
}

resource "proxmox_lxc" "n8n_tweet" {
  target_node  = var.proxmox_node
  hostname     = "n8n-tweet-${random_id.container.hex}"
  ostemplate   = var.template_name
  unprivileged = true
  onboot       = true
  start        = true

  cores  = var.container_cores
  memory = var.container_memory
  swap   = var.container_swap

  features {
    nesting = true
    keyctl  = true
  }

  rootfs {
    storage = var.storage_pool
    size    = var.root_disk_size
  }

  network {
    name   = "eth0"
    bridge = var.network_bridge
    ip     = "dhcp"
    ip6    = "dhcp"
  }

  ssh_public_keys = var.ssh_public_key

  nameserver = "8.8.8.8 8.8.4.4"

  connection {
    type        = "ssh"
    user        = "root"
    private_key = file("~/.ssh/id_rsa")
    host        = self.network[0].ip
  }

  provisioner "remote-exec" {
    inline = [
      "mkdir -p /opt/n8n-tweet",
    ]
  }

  provisioner "file" {
    source      = "${path.module}/scripts/setup.sh"
    destination = "/tmp/setup.sh"
  }

  provisioner "file" {
    source      = "${path.module}/scripts/docker-compose.yml"
    destination = "/opt/n8n-tweet/docker-compose.yml"
  }

  provisioner "file" {
    content = templatefile("${path.module}/scripts/.env.production", {
      N8N_BASIC_AUTH_USER         = var.n8n_basic_auth_user
      N8N_BASIC_AUTH_PASSWORD     = var.n8n_basic_auth_password
      N8N_ENCRYPTION_KEY          = random_password.n8n_encryption_key.result
      POSTGRES_PASSWORD           = var.postgres_password
      REDIS_PASSWORD              = var.redis_password
      TWITTER_API_KEY             = var.twitter_api_key
      TWITTER_API_SECRET          = var.twitter_api_secret
      TWITTER_ACCESS_TOKEN        = var.twitter_access_token
      TWITTER_ACCESS_TOKEN_SECRET = var.twitter_access_token_secret
      TWITTER_BEARER_TOKEN        = var.twitter_bearer_token
    })
    destination = "/opt/n8n-tweet/.env"
  }

  provisioner "remote-exec" {
    inline = [
      "chmod +x /tmp/setup.sh",
      "bash /tmp/setup.sh",
    ]
  }

  lifecycle {
    ignore_changes = [
      network[0].ip,
      network[0].ip6,
    ]
  }
}

resource "null_resource" "app_deployment" {
  depends_on = [proxmox_lxc.n8n_tweet]

  triggers = {
    always_run = timestamp()
  }

  connection {
    type        = "ssh"
    user        = "root"
    private_key = file("~/.ssh/id_rsa")
    host        = proxmox_lxc.n8n_tweet.network[0].ip
  }

  provisioner "remote-exec" {
    inline = [
      "cd /opt/n8n-tweet",
      "chmod +x /opt/n8n-tweet/scripts/app-sync.sh || true",
      "/opt/n8n-tweet/scripts/app-sync.sh || true",
      "cp -r src package*.json /opt/n8n-tweet/app/ || true",
      "docker compose down || true",
      "docker compose pull",
      "docker compose up -d",
      "sleep 30",
      "docker compose ps",
    ]
  }
}