# n8n-tweet Terraform Deployment for Proxmox LXC

This Terraform configuration deploys the n8n-tweet application to a Proxmox LXC container for production use.

## Prerequisites

1. **Proxmox VE** server (version 7.0+)
2. **Terraform** installed locally (version 1.0+)
3. **Proxmox API Token** with appropriate permissions
4. **Ubuntu LXC Template** downloaded on Proxmox
5. **Twitter API credentials**

## Setup Instructions

### 1. Create Proxmox API Token

```bash
# On your Proxmox server
pveum user token add terraform@pam terraform-token --privsep=0
```

### 2. Download Ubuntu Template

```bash
# On your Proxmox server
pveam update
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst
```

### 3. Configure Terraform Variables

```bash
cd terraform/environments/production
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your actual values
```

### 4. Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Review deployment plan
terraform plan

# Deploy to Proxmox
terraform apply
```

## Configuration Details

### Container Resources
- **CPU**: 4 cores (configurable)
- **Memory**: 8GB RAM (configurable)
- **Swap**: 4GB (configurable)
- **Storage**: 32GB root disk (configurable)

### Network Security
- UFW firewall enabled with specific port allowances
- Fail2ban configured for SSH protection
- Only required ports exposed:
  - 22 (SSH)
  - 3001 (Backend API)
  - 5678 (n8n UI)

### Services Deployed
- **n8n**: Workflow automation platform
- **PostgreSQL**: Database for n8n
- **Redis**: Caching and session management
- **Backend API**: Custom Node.js application

### Monitoring & Maintenance
- Health checks configured for all services
- Automatic restart on failure
- Log rotation configured
- Cron job for health monitoring every 5 minutes

## Post-Deployment Steps

1. **Access n8n UI**
   ```bash
   # Get the container IP
   terraform output container_ip
   
   # Access n8n at http://<container-ip>:5678
   # Login with configured credentials
   ```

2. **SSH Access**
   ```bash
   # Use the SSH command from outputs
   terraform output ssh_command
   ```

3. **Import n8n Workflows**
   ```bash
   # Copy workflow files to container
   scp -r workflows/ root@<container-ip>:/opt/n8n-tweet/
   ```

4. **Verify Services**
   ```bash
   # SSH into container
   ssh root@<container-ip>
   
   # Check service status
   docker compose ps
   
   # View logs
   docker compose logs -f
   ```

## Backup & Recovery

### Backup
```bash
# On the container
cd /opt/n8n-tweet
docker compose exec postgres pg_dump -U n8n n8n > backup.sql
tar -czf n8n-data-backup.tar.gz n8n_data/
```

### Restore
```bash
# On the container
cd /opt/n8n-tweet
docker compose exec -T postgres psql -U n8n n8n < backup.sql
tar -xzf n8n-data-backup.tar.gz
```

## Troubleshooting

### Container Won't Start
- Check Proxmox logs: `pct start <vmid> --debug`
- Verify template exists: `pveam list local`

### Services Not Running
- SSH into container and check logs: `docker compose logs`
- Restart services: `docker compose restart`

### Network Issues
- Verify firewall rules: `ufw status`
- Check container network: `ip addr show`

## Security Considerations

1. **Use strong passwords** for all services
2. **Keep API tokens secure** and rotate regularly
3. **Enable HTTPS** with reverse proxy (nginx/traefik)
4. **Regular security updates**: `apt update && apt upgrade`
5. **Monitor logs** for suspicious activity

## Maintenance

### Update Application
```bash
# SSH into container
cd /opt/n8n-tweet
git pull
docker compose pull
docker compose up -d
```

### Update Container OS
```bash
# SSH into container
apt update && apt upgrade -y
```

## Cleanup

To destroy the infrastructure:
```bash
terraform destroy
```

## Support

For issues or questions:
- Check container logs: `docker compose logs`
- Review Terraform state: `terraform show`
- Proxmox documentation: https://pve.proxmox.com/wiki/