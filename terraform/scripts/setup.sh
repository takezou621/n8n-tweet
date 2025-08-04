#!/bin/bash
set -e

echo "=== Starting n8n-tweet LXC Container Setup ==="

# Update system
apt-get update
apt-get upgrade -y

# Install required packages
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    ufw \
    fail2ban \
    htop \
    vim \
    net-tools

# Install Docker
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable Docker service
systemctl enable docker
systemctl start docker

# Install Docker Compose v2
apt-get install -y docker-compose-plugin

# Create application directory
mkdir -p /opt/n8n-tweet
cd /opt/n8n-tweet

# Clone repository or update if exists
if [ ! -d ".git" ]; then
    git clone https://github.com/takezou621/n8n-tweet.git .
else
    git pull origin main
fi

# Create app directory for backend source
mkdir -p /opt/n8n-tweet/app

# Create necessary directories
mkdir -p n8n_data postgres_data redis_data logs

# Set permissions
chmod -R 755 /opt/n8n-tweet

# Configure firewall
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 3001/tcp  # Backend API
ufw allow 5678/tcp  # n8n UI
ufw allow 8080/tcp  # Redis Commander (optional, remove in production)
ufw reload

# Configure fail2ban
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl enable fail2ban
systemctl start fail2ban

# Setup log rotation
cat > /etc/logrotate.d/n8n-tweet <<EOF
/opt/n8n-tweet/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
EOF

# Create systemd service for auto-start
cat > /etc/systemd/system/n8n-tweet.service <<EOF
[Unit]
Description=n8n-tweet Docker Compose Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/n8n-tweet
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable n8n-tweet.service

# Setup monitoring script
cat > /opt/n8n-tweet/health-check.sh <<'EOF'
#!/bin/bash
# Health check script
SERVICES=("n8n" "backend" "postgres" "redis")
WEBHOOK_URL="" # Set your monitoring webhook URL here

for service in "${SERVICES[@]}"; do
    if ! docker compose ps | grep -q "$service.*Up"; then
        echo "Service $service is down! Attempting restart..."
        docker compose restart $service
        
        # Send alert if webhook is configured
        if [ ! -z "$WEBHOOK_URL" ]; then
            curl -X POST $WEBHOOK_URL \
                -H "Content-Type: application/json" \
                -d "{\"text\":\"Alert: Service $service is down on $(hostname)\"}"
        fi
    fi
done
EOF

chmod +x /opt/n8n-tweet/health-check.sh

# Add health check to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/n8n-tweet/health-check.sh") | crontab -

echo "=== Setup completed successfully ==="