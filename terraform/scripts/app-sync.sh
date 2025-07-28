#!/bin/bash
# Script to sync application code from git repository

set -e

cd /opt/n8n-tweet

# Clone or update repository
if [ ! -d ".git" ]; then
    git clone https://github.com/takezou621/n8n-tweet.git .
else
    git pull origin main
fi

# Create required directories
mkdir -p logs cache workflows backups

# Set proper permissions
chown -R 1000:1000 n8n_data workflows backups
chmod -R 755 logs cache

# Copy application files to backend volume
if [ -d "src" ]; then
    cp -r src package.json package-lock.json /opt/n8n-tweet/app/ || true
fi

echo "Application sync completed"