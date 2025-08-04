=== n8n-tweet Deployment Connection Details ===
Generated: ${timestamp()}

CONTAINER INFORMATION:
  Container ID: ${container_id}
  IP Address:   ${container_ip}
  Status:       Running

ACCESS INFORMATION:
  n8n URL:       https://${n8n_subdomain}.${domain}
  Dashboard URL: https://${dashboard_subdomain}.${domain}

SSH CONNECTION (Non-Root User):
  Command: ssh n8n-user@${container_ip}
  Note: Root SSH access has been disabled for security

GENERATED CREDENTIALS:
  Database Password:    ${db_password}
  Redis Password:       ${redis_password}
  n8n Admin Password:   ${n8n_admin_password}
  Encryption Key:       ${encryption_key}
  JWT Secret:          ${jwt_secret}

SECURITY NOTES:
  - Root SSH login is disabled
  - Only n8n-user has SSH access
  - Firewall is enabled (ports 22, 80, 443 open)
  - Fail2ban is active for SSH protection
  - All services run in unprivileged containers

IMPORTANT:
  - Store these credentials securely
  - Do not commit this file to version control
  - Change default passwords after first login
  - Enable MFA where possible

=== END ===