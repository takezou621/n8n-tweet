#!/bin/bash

# n8n-tweet Quick Docker Setup for Proxmox LXC
# Docker Composeを使用した簡易セットアップスクリプト

set -e

# 色付きログ出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 設定変数
DOMAIN=${DOMAIN:-"localhost"}
N8N_SUBDOMAIN=${N8N_SUBDOMAIN:-"n8n"}
DASHBOARD_SUBDOMAIN=${DASHBOARD_SUBDOMAIN:-"dashboard"}

# 関数: Docker インストール
install_docker() {
    log_info "Dockerをインストールしています..."
    
    # 古いDockerを削除
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # 依存関係インストール
    apt update
    apt install -y ca-certificates curl gnupg lsb-release
    
    # Docker GPGキー追加
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Dockerリポジトリ追加
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Docker インストール
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Docker サービス開始
    systemctl start docker
    systemctl enable docker
    
    # Dockerグループ作成
    groupadd -f docker
    
    log_success "Docker インストール完了"
}

# 関数: Docker Compose インストール
install_docker_compose() {
    log_info "Docker Composeをインストールしています..."
    
    # 最新バージョンを取得
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
    
    # Docker Compose バイナリダウンロード
    curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    
    # 実行権限付与
    chmod +x /usr/local/bin/docker-compose
    
    # シンボリックリンク作成
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    
    log_success "Docker Compose インストール完了"
}

# 関数: 環境設定
setup_environment() {
    log_info "環境設定を行っています..."
    
    # データディレクトリ作成
    mkdir -p /opt/n8n-tweet/{data,logs,ssl,config}/{postgres,redis,n8n,dashboard,nginx,prometheus,grafana}
    
    # 権限設定
    chown -R 1000:1000 /opt/n8n-tweet
    
    # 環境変数ファイル作成
    if [ ! -f .env.production ]; then
        log_info "環境設定ファイルを作成しています..."
        
        # パスワード生成
        DB_PASSWORD=$(openssl rand -base64 32)
        REDIS_PASSWORD=$(openssl rand -base64 32)
        ENCRYPTION_KEY=$(openssl rand -hex 32)
        JWT_SECRET=$(openssl rand -base64 64)
        N8N_BASIC_AUTH_PASSWORD=$(openssl rand -base64 16)
        GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16)
        
        cat > .env.production << EOF
# 基本設定
NODE_ENV=production
LOG_LEVEL=info

# ドメイン設定
DOMAIN=$DOMAIN
N8N_SUBDOMAIN=$N8N_SUBDOMAIN
DASHBOARD_SUBDOMAIN=$DASHBOARD_SUBDOMAIN

# データベース設定
DB_PASSWORD=$DB_PASSWORD

# Redis設定
REDIS_PASSWORD=$REDIS_PASSWORD

# n8n認証設定
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=$N8N_BASIC_AUTH_PASSWORD

# セキュリティ設定
ENCRYPTION_KEY=$ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET

# Grafana設定
GRAFANA_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD

# Twitter API設定（手動で設定してください）
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here
EOF
        
        log_success "環境設定ファイル (.env.production) を作成しました"
        log_warning "Twitter API設定を手動で編集してください: .env.production"
        
        # パスワード情報を保存
        cat > /opt/n8n-tweet/passwords.txt << EOF
=== n8n-tweet Generated Passwords ===
作成日時: $(date)

PostgreSQL Password: $DB_PASSWORD
Redis Password: $REDIS_PASSWORD
n8n Admin Password: $N8N_BASIC_AUTH_PASSWORD
Grafana Admin Password: $GRAFANA_ADMIN_PASSWORD

Encryption Key: $ENCRYPTION_KEY
JWT Secret: $JWT_SECRET

重要: このファイルを安全な場所に保存してください！
EOF
        
        chmod 600 /opt/n8n-tweet/passwords.txt
        
    else
        log_info "既存の環境設定ファイルを使用します"
    fi
    
    log_success "環境設定完了"
}

# 関数: Nginx設定
setup_nginx_config() {
    log_info "Nginx設定を作成しています..."
    
    mkdir -p config/nginx/sites
    
    cat > config/nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/m;
    
    # Status endpoint for health checks
    server {
        listen 80;
        server_name localhost;
        
        location /nginx_status {
            stub_status on;
            access_log off;
            allow 127.0.0.1;
            allow 172.20.0.0/16;
            deny all;
        }
    }

    # Include site configurations
    include /etc/nginx/conf.d/*.conf;
}
EOF

    cat > config/nginx/sites/default.conf << EOF
# n8n Workflow Engine
upstream n8n_backend {
    server n8n:5678;
}

# Dashboard Backend
upstream dashboard_backend {
    server dashboard:3000;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $N8N_SUBDOMAIN.$DOMAIN $DASHBOARD_SUBDOMAIN.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# n8n HTTPS Server
server {
    listen 443 ssl http2;
    server_name $N8N_SUBDOMAIN.$DOMAIN;
    
    # SSL Configuration
    ssl_certificate /etc/ssl/certs/server.crt;
    ssl_certificate_key /etc/ssl/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    location / {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://n8n_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # File upload
        client_max_body_size 50m;
    }
}

# Dashboard HTTPS Server
server {
    listen 443 ssl http2;
    server_name $DASHBOARD_SUBDOMAIN.$DOMAIN;
    
    # SSL Configuration
    ssl_certificate /etc/ssl/certs/server.crt;
    ssl_certificate_key /etc/ssl/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    location / {
        proxy_pass http://dashboard_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

    log_success "Nginx設定作成完了"
}

# 関数: SSL証明書生成（自己署名）
generate_ssl_certs() {
    log_info "SSL証明書を生成しています..."
    
    mkdir -p ssl
    
    # 自己署名証明書生成
    openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
        -keyout ssl/server.key \
        -out ssl/server.crt \
        -subj "/C=JP/ST=Tokyo/L=Tokyo/O=n8n-tweet/OU=IT Department/CN=$DOMAIN"
    
    log_success "SSL証明書生成完了（自己署名）"
    log_warning "本番環境ではLet's Encrypt等の正式な証明書を使用してください"
}

# 関数: サービス起動
start_services() {
    log_info "サービスを起動しています..."
    
    # Docker Composeでサービス起動
    docker-compose -f docker-compose.production.yml --env-file .env.production up -d
    
    # サービス状態確認
    sleep 30
    docker-compose -f docker-compose.production.yml ps
    
    log_success "サービス起動完了"
}

# 関数: ヘルスチェック
health_check() {
    log_info "ヘルスチェックを実行しています..."
    
    # サービス起動待機
    log_info "サービスの起動を待機しています（60秒）..."
    sleep 60
    
    # ヘルスチェック実行
    if curl -f -s http://localhost/nginx_status > /dev/null; then
        log_success "Nginx: OK"
    else
        log_error "Nginx: NG"
    fi
    
    if docker-compose -f docker-compose.production.yml exec -T postgres pg_isready -U n8n > /dev/null 2>&1; then
        log_success "PostgreSQL: OK"
    else
        log_error "PostgreSQL: NG"
    fi
    
    if docker-compose -f docker-compose.production.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis: OK"
    else
        log_error "Redis: NG"
    fi
}

# 関数: セットアップ完了メッセージ
show_completion_message() {
    log_success "=== n8n-tweet Docker セットアップ完了 ==="
    echo ""
    echo "アクセス情報:"
    echo "  n8n:        https://$N8N_SUBDOMAIN.$DOMAIN"
    echo "  Dashboard:  https://$DASHBOARD_SUBDOMAIN.$DOMAIN"
    echo ""
    echo "認証情報:"
    echo "  ファイル:   /opt/n8n-tweet/passwords.txt"
    echo ""
    echo "次の手順:"
    echo "  1. Twitter API設定: .env.production ファイルを編集"
    echo "  2. SSL証明書設定: Let's Encrypt等の正式な証明書に変更"
    echo "  3. ドメイン設定: DNS レコードの設定"
    echo "  4. ファイアウォール: 必要なポートの開放"
    echo ""
    echo "管理コマンド:"
    echo "  起動:   docker-compose -f docker-compose.production.yml up -d"
    echo "  停止:   docker-compose -f docker-compose.production.yml down"
    echo "  ログ:   docker-compose -f docker-compose.production.yml logs -f"
    echo "  状態:   docker-compose -f docker-compose.production.yml ps"
    echo ""
    log_warning "パスワードファイル (/opt/n8n-tweet/passwords.txt) を安全な場所に保存してください！"
}

# メイン実行関数
main() {
    echo "=== n8n-tweet Quick Docker Setup ==="
    echo "ドメイン: $DOMAIN"
    echo "n8nサブドメイン: $N8N_SUBDOMAIN"
    echo "ダッシュボードサブドメイン: $DASHBOARD_SUBDOMAIN"
    echo ""
    
    # rootユーザーチェック
    if [[ $EUID -ne 0 ]]; then
        log_error "このスクリプトはrootユーザーで実行してください"
        exit 1
    fi
    
    read -p "続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "セットアップをキャンセルしました"
        exit 0
    fi
    
    install_docker
    install_docker_compose
    setup_environment
    setup_nginx_config
    generate_ssl_certs
    start_services
    health_check
    show_completion_message
}

# スクリプト実行
main "$@"