#!/bin/bash
# Backup script for n8n-tweet

set -e

BACKUP_DIR="/opt/n8n-tweet/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="n8n-tweet-backup-${TIMESTAMP}"

cd /opt/n8n-tweet

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Backup PostgreSQL
echo "Backing up PostgreSQL database..."
docker compose exec -T postgres pg_dump -U n8n n8n > ${BACKUP_DIR}/${BACKUP_NAME}-postgres.sql

# Backup n8n data
echo "Backing up n8n data..."
tar -czf ${BACKUP_DIR}/${BACKUP_NAME}-n8n-data.tar.gz n8n_data/

# Backup Redis data
echo "Backing up Redis data..."
docker compose exec -T redis redis-cli --pass ${REDIS_PASSWORD} BGSAVE
sleep 5
tar -czf ${BACKUP_DIR}/${BACKUP_NAME}-redis-data.tar.gz redis_data/

# Backup configuration
echo "Backing up configuration..."
tar -czf ${BACKUP_DIR}/${BACKUP_NAME}-config.tar.gz .env docker-compose.yml

# Create combined archive
echo "Creating combined backup archive..."
cd ${BACKUP_DIR}
tar -czf ${BACKUP_NAME}.tar.gz \
    ${BACKUP_NAME}-postgres.sql \
    ${BACKUP_NAME}-n8n-data.tar.gz \
    ${BACKUP_NAME}-redis-data.tar.gz \
    ${BACKUP_NAME}-config.tar.gz

# Cleanup individual files
rm -f ${BACKUP_NAME}-*.sql ${BACKUP_NAME}-*.tar.gz

# Keep only last 7 backups
ls -t ${BACKUP_DIR}/*.tar.gz | tail -n +8 | xargs rm -f || true

echo "Backup completed: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"