# n8n-tweet Production Dockerfile
# Multi-stage build for optimized production image

# =====================================
# Stage 1: Build Environment
# =====================================
FROM node:18-alpine AS builder

# Build arguments
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --only=production --silent && \
    npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p logs cache backups

# Remove development files
RUN rm -rf tests/ .git/ .github/ docs/ *.md

# =====================================
# Stage 2: Production Environment
# =====================================
FROM node:18-alpine AS production

# Labels for metadata
LABEL maintainer="takezou621@example.com" \
      org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.name="n8n-tweet" \
      org.label-schema.description="AI情報収集・配信システム" \
      org.label-schema.url="https://github.com/takezou621/n8n-tweet" \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.vcs-url="https://github.com/takezou621/n8n-tweet" \
      org.label-schema.vendor="takezou621" \
      org.label-schema.version=$VERSION \
      org.label-schema.schema-version="1.0"

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    tini \
    su-exec \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 n8n && \
    adduser -D -s /bin/sh -u 1000 -G n8n n8n

# Set working directory
WORKDIR /app

# Copy application from builder stage
COPY --from=builder --chown=n8n:n8n /app .

# Create required directories with proper permissions
RUN mkdir -p \
    /app/logs \
    /app/cache \
    /app/backups \
    /app/data \
    /home/n8n && \
    chown -R n8n:n8n /app /home/n8n

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=warn \
    ENABLE_CONSOLE_LOG=false \
    CACHE_DIR=/app/cache \
    LOGS_DIR=/app/logs \
    BACKUPS_DIR=/app/backups \
    DATA_DIR=/app/data

# Health check for dashboard API
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/v1/health || exit 1

# Switch to non-root user
USER n8n

# Expose port
EXPOSE 3000

# Volume for persistent data
VOLUME ["/app/data", "/app/logs", "/app/backups", "/app/cache"]

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start application (dashboard server by default)
CMD ["node", "src/dashboard/server.js"]

# =====================================
# Stage 3: Development Environment (Optional)
# =====================================
FROM node:18-alpine AS development

WORKDIR /app

# Install all dependencies including dev dependencies
COPY package*.json ./
RUN npm ci --silent

# Install development tools
RUN npm install -g nodemon jest

# Copy source code
COPY . .

# Create directories
RUN mkdir -p logs cache backups data

# Set development environment
ENV NODE_ENV=development \
    PORT=5678 \
    LOG_LEVEL=debug \
    ENABLE_CONSOLE_LOG=true

# Expose port and debugger port
EXPOSE 5678 9229

# Development command with hot reload
CMD ["npm", "run", "dev"]

# =====================================
# Stage 4: Testing Environment (Optional)
# =====================================
FROM node:18-alpine AS testing

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production --silent || npm install --only=production --silent

# Copy source code
COPY . .

# Create test directories
RUN mkdir -p tests/data coverage

# Set test environment
ENV NODE_ENV=test \
    CI=true

# Run tests
CMD ["npm", "test"]
