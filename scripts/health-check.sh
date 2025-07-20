#!/bin/bash

# Health Check Script for n8n-tweet Application
# Checks system health and reports status

set -e

echo "🔍 Running n8n-tweet health check..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Health check results
health_status=0

# Check Node.js process
echo "📋 Checking Node.js application..."
if pgrep -f "node" > /dev/null; then
    echo -e "${GREEN}✅ Node.js process is running${NC}"
else
    echo -e "${RED}❌ Node.js process is not running${NC}"
    health_status=1
fi

# Check n8n service
echo "📋 Checking n8n service..."
if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
    echo -e "${GREEN}✅ n8n service is responding${NC}"
else
    echo -e "${RED}❌ n8n service is not responding${NC}"
    health_status=1
fi

# Check database connection (if using PostgreSQL)
if [ -n "$DB_HOST" ]; then
    echo "📋 Checking database connection..."
    if pg_isready -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Database is accessible${NC}"
    else
        echo -e "${RED}❌ Database is not accessible${NC}"
        health_status=1
    fi
fi

# Check Redis connection (if using Redis)
if [ -n "$REDIS_HOST" ]; then
    echo "📋 Checking Redis connection..."
    # Check if redis-cli is available
    if command -v redis-cli > /dev/null; then
        if redis-cli -h ${REDIS_HOST:-localhost} -p ${REDIS_PORT:-6379} ping > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Redis is accessible${NC}"
        else
            echo -e "${RED}❌ Redis is not accessible${NC}"
            health_status=1
        fi
    else
        echo -e "${YELLOW}⚠️  redis-cli not available, skipping Redis check${NC}"
    fi
fi

# Check disk space
echo "📋 Checking disk space..."
disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$disk_usage" -lt 90 ]; then
    echo -e "${GREEN}✅ Disk space is sufficient (${disk_usage}% used)${NC}"
else
    echo -e "${YELLOW}⚠️  Disk space is running low (${disk_usage}% used)${NC}"
fi

# Check memory usage
echo "📋 Checking memory usage..."
if command -v free > /dev/null; then
    memory_usage=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
    if [ "${memory_usage%.*}" -lt 90 ]; then
        echo -e "${GREEN}✅ Memory usage is normal (${memory_usage}% used)${NC}"
    else
        echo -e "${YELLOW}⚠️  Memory usage is high (${memory_usage}% used)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Cannot check memory usage (free command not available)${NC}"
fi

# Check log files
echo "📋 Checking log files..."
if [ -d "logs" ]; then
    log_count=$(find logs -name "*.log" -mtime -1 | wc -l)
    if [ "$log_count" -gt 0 ]; then
        echo -e "${GREEN}✅ Recent log files found (${log_count} files)${NC}"
    else
        echo -e "${YELLOW}⚠️  No recent log files found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Logs directory not found${NC}"
fi

# Check Twitter API connectivity
echo "📋 Checking Twitter API connectivity..."
if [ -n "$TWITTER_BEARER_TOKEN" ]; then
    if curl -s -H "Authorization: Bearer $TWITTER_BEARER_TOKEN" \
        "https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Twitter API is accessible${NC}"
    else
        echo -e "${RED}❌ Twitter API is not accessible${NC}"
        health_status=1
    fi
else
    echo -e "${YELLOW}⚠️  Twitter API credentials not configured${NC}"
fi

# Check RSS feed accessibility
echo "📋 Checking RSS feed accessibility..."
test_rss="https://arxiv.org/rss/cs.AI"
if curl -s --head "$test_rss" | head -n 1 | grep -q "200 OK"; then
    echo -e "${GREEN}✅ RSS feeds are accessible${NC}"
else
    echo -e "${RED}❌ RSS feeds are not accessible${NC}"
    health_status=1
fi

# Final health status
echo ""
if [ $health_status -eq 0 ]; then
    echo -e "${GREEN}🎉 Overall health status: HEALTHY${NC}"
    exit 0
else
    echo -e "${RED}❌ Overall health status: UNHEALTHY${NC}"
    exit 1
fi
