#!/bin/bash
set -e

# PostgreSQL initialization script for n8n-tweet
echo "Initializing PostgreSQL for n8n-tweet..."

# Create additional configuration if needed
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable extensions if needed
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    
    -- Set timezone
    SET timezone = 'Asia/Tokyo';
    
    -- Grant permissions
    GRANT ALL PRIVILEGES ON DATABASE "$POSTGRES_DB" TO "$POSTGRES_USER";
    
    -- Log initialization completion
    SELECT 'PostgreSQL initialization completed for n8n-tweet' AS status;
EOSQL

echo "PostgreSQL initialization completed!"