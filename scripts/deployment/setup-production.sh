#!/bin/bash

# n8n-tweet Production Setup Script for Proxmox LXC
# このスクリプトはLXCコンテナ内で実行します

set -e

# 色付きログ出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
DOMAIN=${DOMAIN:-"yourdomain.com"}
N8N_SUBDOMAIN=${N8N_SUBDOMAIN:-"n8n"}
DASHBOARD_SUBDOMAIN=${DASHBOARD_SUBDOMAIN:-"dashboard"}
DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -base64 32)}
REDIS_PASSWORD=${REDIS_PASSWORD:-$(openssl rand -base64 32)}
ENCRYPTION_KEY=${ENCRYPTION_KEY:-$(openssl rand -hex 32)}
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 64)}

# 前提条件チェック
check_prerequisites() {
    log_info "前提条件をチェックしています..."
    
    # rootユーザーチェック
    if [[ $EUID -ne 0 ]]; then
        log_error "このスクリプトはrootユーザーで実行してください"
        exit 1
    fi
    
    # Ubuntu/Debianチェック
    if ! command -v apt &> /dev/null; then
        log_error "このスクリプトはUbuntu/Debian系OSでのみ動作します"
        exit 1
    fi
    
    log_success "前提条件チェック完了"
}

# システム更新
update_system() {
    log_info "システムを更新しています..."
    
    apt update
    apt upgrade -y
    
    log_success "システム更新完了"
}

# 基本パッケージインストール
install_base_packages() {
    log_info "基本パッケージをインストールしています..."
    
    apt install -y \
        curl \
        wget \
        gnupg \
        software-properties-common \
        git \
        htop \
        vim \
        unzip \
        fail2ban \
        ufw \
        supervisor \
        nginx \
        certbot \
        python3-certbot-nginx \
        openssl \
        ca-certificates
    
    log_success "基本パッケージインストール完了"
}

# Node.js インストール
install_nodejs() {
    log_info "Node.js 18をインストールしています..."
    
    # NodeSourceリポジトリ追加
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    
    # Node.js インストール
    apt install -y nodejs
    
    # バージョン確認
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    
    log_success "Node.js インストール完了: Node $NODE_VERSION, npm $NPM_VERSION"
}

# PostgreSQL インストール・設定
setup_postgresql() {
    log_info "PostgreSQLをセットアップしています..."
    
    # PostgreSQL インストール
    apt install -y postgresql postgresql-contrib
    
    # サービス開始・有効化
    systemctl start postgresql
    systemctl enable postgresql
    
    # データベースとユーザー作成
    sudo -u postgres psql << EOF
CREATE USER n8n WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE n8n_production OWNER n8n;
GRANT ALL PRIVILEGES ON DATABASE n8n_production TO n8n;
\q
EOF
    
    log_success "PostgreSQL セットアップ完了"
}

# Redis インストール・設定
setup_redis() {
    log_info "Redisをセットアップしています..."
    
    # Redis インストール
    apt install -y redis-server
    
    # Redis設定
    sed -i "s/# requirepass foobared/requirepass $REDIS_PASSWORD/" /etc/redis/redis.conf
    sed -i "s/bind 127.0.0.1/bind 127.0.0.1/" /etc/redis/redis.conf
    
    # サービス開始・有効化
    systemctl restart redis-server
    systemctl enable redis-server
    
    log_success "Redis セットアップ完了"
}

# アプリケーションユーザー作成
create_app_user() {
    log_info "アプリケーション用ユーザーを作成しています..."
    
    # n8nユーザー作成
    if ! id "n8nuser" &>/dev/null; then
        useradd -m -s /bin/bash n8nuser
        usermod -aG sudo n8nuser
        log_success "n8nuser ユーザー作成完了"
    else
        log_warning "n8nuser ユーザーは既に存在します"
    fi
}

# n8n グローバルインストール
install_n8n() {
    log_info "n8nをグローバルインストールしています..."
    
    npm install -g n8n@latest
    
    N8N_VERSION=$(n8n --version)
    log_success "n8n インストール完了: $N8N_VERSION"
}

# アプリケーションのセットアップ
setup_application() {
    log_info "アプリケーションをセットアップしています..."
    
    # n8nユーザーディレクトリに移動
    cd /home/n8nuser
    
    # リポジトリクローン（既に存在しない場合）
    if [ ! -d "n8n-tweet" ]; then
        sudo -u n8nuser git clone https://github.com/takezou621/n8n-tweet.git
    else
        log_warning "n8n-tweet ディレクトリは既に存在します"
    fi
    
    cd n8n-tweet
    
    # 依存関係インストール
    sudo -u n8nuser npm ci --production
    
    log_success "アプリケーションセットアップ完了"
}

# 環境設定ファイル作成
create_environment_config() {
    log_info "環境設定ファイルを作成しています..."
    
    cd /home/n8nuser/n8n-tweet
    
    # .env ファイル作成
    sudo -u n8nuser cat > .env << EOF
# 環境設定
NODE_ENV=production
LOG_LEVEL=info

# データベース設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=n8n_production
DB_USER=n8n
DB_PASSWORD=$DB_PASSWORD

# Redis設定
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD

# n8n設定
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=https
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=change_this_password

# ダッシュボード設定
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=3000

# Twitter API設定（手動で設定してください）
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here

# セキュリティ設定
ENCRYPTION_KEY=$ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET

# CORS設定
CORS_ORIGIN=https://$DASHBOARD_SUBDOMAIN.$DOMAIN

# SSL設定
SSL_CERT_PATH=/etc/letsencrypt/live/$N8N_SUBDOMAIN.$DOMAIN/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/$N8N_SUBDOMAIN.$DOMAIN/privkey.pem
EOF
    
    # 権限設定
    chown n8nuser:n8nuser .env
    chmod 600 .env
    
    # 暗号化キー生成
    echo "$ENCRYPTION_KEY" | sudo -u n8nuser tee .encryption-key > /dev/null
    chown n8nuser:n8nuser .encryption-key
    chmod 600 .encryption-key
    
    log_success "環境設定ファイル作成完了"
}

# Supervisor設定
setup_supervisor() {
    log_info "Supervisorを設定しています..."
    
    # ログディレクトリ作成
    mkdir -p /var/log/n8n /var/log/n8n-tweet
    chown n8nuser:n8nuser /var/log/n8n /var/log/n8n-tweet
    
    # n8n用設定ファイル
    cat > /etc/supervisor/conf.d/n8n.conf << EOF
[program:n8n]
command=/usr/bin/node /usr/lib/node_modules/n8n/bin/n8n
directory=/home/n8nuser/n8n-tweet
user=n8nuser
autostart=true
autorestart=true
startsecs=10
startretries=3
stdout_logfile=/var/log/n8n/n8n.log
stderr_logfile=/var/log/n8n/n8n_error.log
environment=NODE_ENV=production,N8N_DB_TYPE=postgresdb,N8N_DB_POSTGRESDB_HOST=localhost,N8N_DB_POSTGRESDB_PORT=5432,N8N_DB_POSTGRESDB_DATABASE=n8n_production,N8N_DB_POSTGRESDB_USER=n8n,N8N_DB_POSTGRESDB_PASSWORD=$DB_PASSWORD,N8N_HOST=0.0.0.0,N8N_PORT=5678
EOF
    
    # ダッシュボード用設定ファイル
    cat > /etc/supervisor/conf.d/n8n-tweet-dashboard.conf << EOF
[program:n8n-tweet-dashboard]
command=/usr/bin/node src/dashboard/index.js
directory=/home/n8nuser/n8n-tweet
user=n8nuser
autostart=true
autorestart=true
startsecs=10
startretries=3
stdout_logfile=/var/log/n8n-tweet/dashboard.log
stderr_logfile=/var/log/n8n-tweet/dashboard_error.log
environment=NODE_ENV=production
EOF
    
    # Supervisor設定読み込み
    supervisorctl reread
    supervisorctl update
    
    log_success "Supervisor設定完了"
}

# Nginx設定
setup_nginx() {
    log_info "Nginxを設定しています..."
    
    # Nginx設定ファイル作成
    cat > /etc/nginx/sites-available/n8n-tweet << EOF
# n8n Workflow Engine
server {
    listen 80;
    server_name $N8N_SUBDOMAIN.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $N8N_SUBDOMAIN.$DOMAIN;
    
    # SSL Configuration (Let's Encryptで後で設定)
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # Rate Limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/m;
    
    location / {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://127.0.0.1:5678;
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

# Dashboard
server {
    listen 80;
    server_name $DASHBOARD_SUBDOMAIN.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DASHBOARD_SUBDOMAIN.$DOMAIN;
    
    # SSL Configuration (Let's Encryptで後で設定)
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    location / {
        proxy_pass http://127.0.0.1:3000;
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
    
    # サイト有効化
    ln -sf /etc/nginx/sites-available/n8n-tweet /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Nginx設定テスト
    nginx -t
    
    log_success "Nginx設定完了"
}

# ファイアウォール設定
setup_firewall() {
    log_info "ファイアウォールを設定しています..."
    
    # UFW設定
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    
    # 必要なポート開放
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    log_success "ファイアウォール設定完了"
}

# バックアップスクリプト作成
create_backup_script() {
    log_info "バックアップスクリプトを作成しています..."
    
    cat > /usr/local/bin/backup-n8n-tweet.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/backup/n8n-tweet"
DATE=$(date +%Y%m%d_%H%M%S)

# ディレクトリ作成
mkdir -p $BACKUP_DIR

# PostgreSQLバックアップ
sudo -u postgres pg_dump n8n_production > $BACKUP_DIR/n8n_db_$DATE.sql

# アプリケーションファイルバックアップ
tar -czf $BACKUP_DIR/n8n_app_$DATE.tar.gz -C /home/n8nuser n8n-tweet --exclude=node_modules --exclude=logs

# 古いバックアップ削除（30日以上）
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF
    
    chmod +x /usr/local/bin/backup-n8n-tweet.sh
    
    log_success "バックアップスクリプト作成完了"
}

# サービス開始
start_services() {
    log_info "サービスを開始しています..."
    
    # 全サービス開始・有効化
    systemctl start postgresql redis-server nginx supervisor
    systemctl enable postgresql redis-server nginx supervisor
    
    # Supervisorプロセス開始
    supervisorctl start all
    
    log_success "サービス開始完了"
}

# セットアップ完了メッセージ
setup_complete_message() {
    log_success "=== n8n-tweet Production Setup 完了 ==="
    echo ""
    echo "次の手順を実行してください:"
    echo ""
    echo "1. SSL証明書の設定:"
    echo "   certbot --nginx -d $N8N_SUBDOMAIN.$DOMAIN -d $DASHBOARD_SUBDOMAIN.$DOMAIN"
    echo ""
    echo "2. Twitter API設定:"
    echo "   /home/n8nuser/n8n-tweet/.env ファイルでTwitter API認証情報を設定"
    echo ""
    echo "3. 管理者ユーザー作成:"
    echo "   su - n8nuser"
    echo "   cd n8n-tweet"
    echo "   n8n user:create --email admin@$DOMAIN --firstName Admin --lastName User"
    echo ""
    echo "4. アクセスURL:"
    echo "   n8n: https://$N8N_SUBDOMAIN.$DOMAIN"
    echo "   Dashboard: https://$DASHBOARD_SUBDOMAIN.$DOMAIN"
    echo ""
    echo "5. 設定されたパスワード:"
    echo "   PostgreSQL: $DB_PASSWORD"
    echo "   Redis: $REDIS_PASSWORD"
    echo ""
    log_warning "これらのパスワードを安全な場所に保存してください！"
}

# メイン実行関数
main() {
    echo "=== n8n-tweet Production Setup Script ==="
    echo "ドメイン: $DOMAIN"
    echo "n8nサブドメイン: $N8N_SUBDOMAIN"
    echo "ダッシュボードサブドメイン: $DASHBOARD_SUBDOMAIN"
    echo ""
    
    read -p "続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "セットアップをキャンセルしました"
        exit 0
    fi
    
    check_prerequisites
    update_system
    install_base_packages
    install_nodejs
    setup_postgresql
    setup_redis
    create_app_user
    install_n8n
    setup_application
    create_environment_config
    setup_supervisor
    setup_nginx
    setup_firewall
    create_backup_script
    start_services
    setup_complete_message
}

# スクリプト実行
main "$@"