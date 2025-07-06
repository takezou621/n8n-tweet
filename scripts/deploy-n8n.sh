#!/bin/bash

# n8n-tweet デプロイスクリプト
# Docker環境でのn8nワークフロー自動デプロイ

set -e

# カラー出力設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 設定
PROJECT_NAME="n8n-tweet"
DOCKER_COMPOSE_FILE="./infrastructure/docker-compose.yml"
BACKUP_DIR="./backups"
ENV_FILE=".env"

log_info "🚀 n8n-tweet デプロイを開始します..."

# 前提条件チェック
log_info "📋 前提条件をチェック中..."

# Docker がインストールされているかチェック
if ! command -v docker &> /dev/null; then
    log_error "Docker がインストールされていません"
    exit 1
fi

# Docker Compose がインストールされているかチェック
if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose がインストールされていません"
    exit 1
fi

# 環境変数ファイルが存在するかチェック
if [ ! -f "$ENV_FILE" ]; then
    log_warning "環境変数ファイル '$ENV_FILE' が見つかりません"
    log_info "テンプレートから作成してください: cp config/template.env .env"
    exit 1
fi

log_success "前提条件チェック完了"

# バックアップディレクトリ作成
log_info "📁 バックアップディレクトリを作成中..."
mkdir -p "$BACKUP_DIR"

# 既存のワークフローをバックアップ（存在する場合）
if [ -d "./workflows" ] && [ "$(ls -A ./workflows)" ]; then
    log_info "💾 既存のワークフローをバックアップ中..."
    BACKUP_FILE="$BACKUP_DIR/workflows-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$BACKUP_FILE" workflows/
    log_success "ワークフローバックアップ完了: $BACKUP_FILE"
fi

# Docker Composeファイルが存在するかチェック
if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
    log_info "🐳 Docker Compose設定を作成中..."
    
    # Docker Compose設定を作成
    mkdir -p "./infrastructure"
    cat > "$DOCKER_COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: n8n-tweet-bot
    restart: unless-stopped
    environment:
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=${POSTGRES_DB:-n8n}
      - DB_POSTGRESDB_USER=${POSTGRES_USER:-n8n}
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD:-n8n}
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER:-admin}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD:-admin}
      - WEBHOOK_URL=${N8N_WEBHOOK_URL:-http://localhost:5678}
      - EXECUTIONS_PROCESS=main
      - EXECUTIONS_MODE=regular
      - N8N_LOG_LEVEL=${N8N_LOG_LEVEL:-info}
      - N8N_METRICS=true
      - QUEUE_BULL_REDIS_HOST=redis
    ports:
      - "5678:5678"
    volumes:
      - ./n8n_data:/home/node/.n8n
      - ./workflows:/home/node/.n8n/workflows
      - ./credentials:/home/node/.n8n/credentials
    depends_on:
      - postgres
      - redis
    networks:
      - n8n-network

  postgres:
    image: postgres:13
    container_name: n8n-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=${POSTGRES_DB:-n8n}
      - POSTGRES_USER=${POSTGRES_USER:-n8n}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-n8n}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - n8n-network

  redis:
    image: redis:7-alpine
    container_name: n8n-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - n8n-network

  ai-tweet-bot:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ai-tweet-bot-service
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - TWITTER_API_KEY=${TWITTER_API_KEY}
      - TWITTER_API_SECRET=${TWITTER_API_SECRET}
      - TWITTER_ACCESS_TOKEN=${TWITTER_ACCESS_TOKEN}
      - TWITTER_ACCESS_TOKEN_SECRET=${TWITTER_ACCESS_TOKEN_SECRET}
      - TWITTER_BEARER_TOKEN=${TWITTER_BEARER_TOKEN}
    volumes:
      - ./logs:/app/logs
      - ./cache:/app/cache
      - ./config:/app/config
    depends_on:
      - n8n
      - postgres
      - redis
    networks:
      - n8n-network

volumes:
  postgres_data:
  redis_data:

networks:
  n8n-network:
    driver: bridge
EOF

    log_success "Docker Compose設定を作成しました"
fi

# Dockerfileが存在するかチェック
if [ ! -f "./Dockerfile" ]; then
    log_info "🐳 Dockerfileを作成中..."
    
    cat > "./Dockerfile" << 'EOF'
FROM node:18-alpine

# 作業ディレクトリを作成
WORKDIR /app

# パッケージファイルをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production

# アプリケーションファイルをコピー
COPY src/ ./src/
COPY config/ ./config/

# ログとキャッシュディレクトリを作成
RUN mkdir -p logs cache

# 非rootユーザーを作成
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('./src/index.js').healthCheck()" || exit 1

# ポート公開
EXPOSE 3000

# アプリケーション起動
CMD ["node", "src/index.js"]
EOF

    log_success "Dockerfileを作成しました"
fi

# .dockerignoreファイルを作成
if [ ! -f "./.dockerignore" ]; then
    log_info "📄 .dockerignoreファイルを作成中..."
    
    cat > "./.dockerignore" << 'EOF'
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.nyc_output
coverage
.DS_Store
logs/*
cache/*
backups/*
test-*.js
*.test.js
.eslintrc*
jest.config*
EOF

    log_success ".dockerignoreファイルを作成しました"
fi

# 必要なディレクトリを作成
log_info "📁 必要なディレクトリを作成中..."
mkdir -p n8n_data workflows credentials logs cache

# 設定ファイルを確認
log_info "⚙️  設定ファイルを確認中..."

# Twitter API認証情報をチェック
source "$ENV_FILE"

if [ -z "$TWITTER_API_KEY" ] || [ -z "$TWITTER_API_SECRET" ]; then
    log_warning "Twitter API認証情報が設定されていません"
    log_info "本番運用には Twitter API 認証情報が必要です"
fi

# Docker イメージをビルド
log_info "🔨 Docker イメージをビルド中..."
docker-compose -f "$DOCKER_COMPOSE_FILE" build

# Docker コンテナを起動
log_info "🚀 Docker コンテナを起動中..."
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

# サービスの起動を待機
log_info "⏳ サービスの起動を待機中..."
sleep 10

# ヘルスチェック
log_info "🔍 ヘルスチェックを実行中..."

# PostgreSQL接続チェック
if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U "${POSTGRES_USER:-n8n}" > /dev/null 2>&1; then
    log_success "PostgreSQL が正常に起動しています"
else
    log_error "PostgreSQL の起動に失敗しました"
fi

# Redis接続チェック
if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null 2>&1; then
    log_success "Redis が正常に起動しています"
else
    log_error "Redis の起動に失敗しました"
fi

# n8n接続チェック
sleep 5
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5678 | grep -q "200\|401"; then
    log_success "n8n が正常に起動しています"
else
    log_warning "n8n の起動確認ができませんでした（認証が必要な可能性があります）"
fi

# AI Tweet Bot接続チェック
if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T ai-tweet-bot-service node -e "console.log('OK')" > /dev/null 2>&1; then
    log_success "AI Tweet Bot が正常に起動しています"
else
    log_warning "AI Tweet Bot の起動確認ができませんでした"
fi

# デプロイ完了メッセージ
log_success "🎉 デプロイが完了しました！"
echo ""
echo "📋 アクセス情報:"
echo "   n8n ダッシュボード: http://localhost:5678"
echo "   ユーザー名: ${N8N_BASIC_AUTH_USER:-admin}"
echo "   パスワード: ${N8N_BASIC_AUTH_PASSWORD:-admin}"
echo ""
echo "📊 管理コマンド:"
echo "   ログ確認: docker-compose -f $DOCKER_COMPOSE_FILE logs"
echo "   サービス停止: docker-compose -f $DOCKER_COMPOSE_FILE down"
echo "   サービス再起動: docker-compose -f $DOCKER_COMPOSE_FILE restart"
echo ""
echo "🔧 次のステップ:"
echo "   1. n8n ダッシュボードにアクセス"
echo "   2. Twitter API 認証情報を設定"
echo "   3. RSS フィードワークフローをインポート"
echo "   4. ワークフローをアクティブ化"
echo ""

log_info "ワークフローファイルは ./workflows ディレクトリに配置してください"
log_info "詳細な設定方法は README.md を参照してください"

log_success "デプロイスクリプトの実行が完了しました"
