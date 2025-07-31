# Proxmox LXC 本番環境セットアップ手順

## 概要

このドキュメントでは、Proxmox Virtual Environment (PVE) 上のLXC (Linux Container) にn8n-tweetシステムを本番環境として構築する詳細手順を説明します。

## 前提条件

### Proxmox環境
- Proxmox VE 7.0 以上
- 最低限のハードウェア要件:
  - CPU: 2コア以上
  - メモリ: 4GB以上
  - ストレージ: 20GB以上の空き容量

### 必要な情報
- Twitter API v2 の認証情報
- 対象RSSフィードのURL
- SSL証明書（本番環境の場合）

## LXCコンテナの作成

### 1. コンテナテンプレートの準備

```bash
# Proxmoxホストにログイン
ssh root@proxmox-host

# Ubuntu 22.04 LTSテンプレートをダウンロード
pveam update
pveam available | grep ubuntu-22.04
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst
```

### 2. LXCコンテナの作成

```bash
# コンテナ作成（CT ID: 100の例）
pct create 100 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname n8n-tweet-prod \
  --memory 2048 \
  --swap 512 \
  --cores 2 \
  --storage local-lvm \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1
```

### 3. コンテナ設定の調整

```bash
# 設定ファイル編集
nano /etc/pve/lxc/100.conf

# 以下の設定を追加/確認
lxc.apparmor.profile: unconfined
lxc.cgroup2.devices.allow: c 10:200 rwm
```

### 4. コンテナ起動とアクセス

```bash
# コンテナ起動
pct start 100

# コンテナに入る
pct enter 100
```

## コンテナ内の環境構築

### 1. システム更新と基本パッケージインストール

```bash
# パッケージリスト更新
apt update && apt upgrade -y

# 必要なパッケージインストール
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
  python3-certbot-nginx
```

### 2. Node.js 18+ インストール

```bash
# NodeSourceリポジトリ追加
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -

# Node.js インストール
apt install -y nodejs

# バージョン確認
node --version  # v18.x.x
npm --version   # 9.x.x
```

### 3. PostgreSQL インストール（n8n用）

```bash
# PostgreSQL インストール
apt install -y postgresql postgresql-contrib

# PostgreSQL設定
systemctl start postgresql
systemctl enable postgresql

# データベースとユーザー作成
sudo -u postgres psql << EOF
CREATE USER n8n WITH PASSWORD 'secure_password_here';
CREATE DATABASE n8n_production OWNER n8n;
GRANT ALL PRIVILEGES ON DATABASE n8n_production TO n8n;
\q
EOF
```

### 4. Redis インストール

```bash
# Redis インストール
apt install -y redis-server

# Redis設定
systemctl start redis-server
systemctl enable redis-server

# 設定ファイル編集
nano /etc/redis/redis.conf

# 以下の設定を変更
# bind 127.0.0.1
# requirepass your_redis_password_here

# Redis再起動
systemctl restart redis-server
```

## アプリケーションのデプロイ

### 1. アプリケーション用ユーザー作成

```bash
# n8nユーザー作成
useradd -m -s /bin/bash n8nuser
usermod -aG sudo n8nuser

# ユーザー切り替え
su - n8nuser
```

### 2. アプリケーションコードの取得

```bash
# ホームディレクトリに移動
cd /home/n8nuser

# リポジトリクローン
git clone https://github.com/takezou621/n8n-tweet.git
cd n8n-tweet

# 依存関係インストール
npm ci --production

# グローバルにn8nインストール
sudo npm install -g n8n@latest
```

### 3. 環境設定ファイル作成

```bash
# 本番環境用設定ファイル作成
cat > .env << 'EOF'
# 環境設定
NODE_ENV=production
LOG_LEVEL=info

# データベース設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=n8n_production
DB_USER=n8n
DB_PASSWORD=secure_password_here

# Redis設定
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here

# n8n設定
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=http
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=change_this_password

# ダッシュボード設定
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=3000

# Twitter API設定
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here

# セキュリティ設定
ENCRYPTION_KEY=generate_strong_encryption_key_here
JWT_SECRET=generate_jwt_secret_here

# CORS設定
CORS_ORIGIN=https://yourdomain.com

# SSL設定（本番環境）
SSL_CERT_PATH=/etc/ssl/certs/n8n-tweet.crt
SSL_KEY_PATH=/etc/ssl/private/n8n-tweet.key
EOF

# 権限設定
chmod 600 .env
```

### 4. 本番環境用設定ファイル作成

```bash
# 本番環境用設定
cat > config/production.json << 'EOF'
{
  "system": {
    "environment": "production",
    "logLevel": "info",
    "enableDebug": false
  },
  "database": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "database": "n8n_production",
    "synchronize": false,
    "logging": false
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "ttl": 3600,
    "enableCluster": false
  },
  "security": {
    "enableRateLimit": true,
    "enableCors": true,
    "enableHelmet": true,
    "rateLimitWindowMs": 900000,
    "rateLimitMax": 100
  },
  "monitoring": {
    "enableMetrics": true,
    "enableHealthCheck": true,
    "metricsInterval": 60000
  },
  "features": {
    "enableDashboard": true,
    "enableTweetHistory": true,
    "enableDuplicateDetection": true
  }
}
EOF
```

## サービス設定

### 1. Supervisor設定（プロセス管理）

```bash
# Supervisor設定ディレクトリ作成
sudo mkdir -p /etc/supervisor/conf.d

# n8n用設定ファイル
sudo cat > /etc/supervisor/conf.d/n8n.conf << 'EOF'
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
environment=NODE_ENV=production,DB_HOST=localhost,DB_PORT=5432,DB_NAME=n8n_production,DB_USER=n8n,DB_PASSWORD=secure_password_here,N8N_HOST=0.0.0.0,N8N_PORT=5678
EOF

# ダッシュボード用設定ファイル
sudo cat > /etc/supervisor/conf.d/n8n-tweet-dashboard.conf << 'EOF'
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

# ログディレクトリ作成
sudo mkdir -p /var/log/n8n /var/log/n8n-tweet
sudo chown n8nuser:n8nuser /var/log/n8n /var/log/n8n-tweet

# Supervisor設定読み込み
sudo supervisorctl reread
sudo supervisorctl update
```

### 2. Nginx設定（リバースプロキシ）

```bash
# Nginx設定ファイル作成
sudo cat > /etc/nginx/sites-available/n8n-tweet << 'EOF'
# n8n-tweet Production Configuration

# n8n Workflow Engine
server {
    listen 80;
    server_name n8n.yourdomain.com;
    
    # SSL redirect
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name n8n.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/n8n.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/m;
    
    location / {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
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
    server_name dashboard.yourdomain.com;
    
    # SSL redirect
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dashboard.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/dashboard.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# サイト有効化
sudo ln -sf /etc/nginx/sites-available/n8n-tweet /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Nginx設定テスト
sudo nginx -t

# Nginx再起動
sudo systemctl restart nginx
```

### 3. SSL証明書設定

```bash
# Let's Encrypt証明書取得
sudo certbot --nginx -d n8n.yourdomain.com -d dashboard.yourdomain.com

# 自動更新設定
sudo crontab -e
# 以下を追加
# 0 12 * * * /usr/bin/certbot renew --quiet
```

### 4. ファイアウォール設定

```bash
# UFW有効化
sudo ufw enable

# 基本ルール
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 必要なポート開放
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 内部通信のみ許可（必要に応じて）
sudo ufw allow from 192.168.1.0/24 to any port 5678
sudo ufw allow from 192.168.1.0/24 to any port 3000

# ステータス確認
sudo ufw status
```

## セキュリティ強化

### 1. Fail2Ban設定

```bash
# Nginx用Fail2Ban設定
sudo cat > /etc/fail2ban/jail.d/nginx.conf << 'EOF'
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
findtime = 600
bantime = 7200
EOF

# Fail2Ban再起動
sudo systemctl restart fail2ban
```

### 2. システム監視設定

```bash
# ログローテーション設定
sudo cat > /etc/logrotate.d/n8n-tweet << 'EOF'
/var/log/n8n/*.log /var/log/n8n-tweet/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 n8nuser n8nuser
    postrotate
        systemctl reload supervisor
    endscript
}
EOF
```

## データベース初期化

### 1. n8n初期設定

```bash
# n8nユーザーに切り替え
su - n8nuser
cd /home/n8nuser/n8n-tweet

# データベース初期化（初回のみ）
N8N_DB_TYPE=postgresdb \
N8N_DB_POSTGRESDB_HOST=localhost \
N8N_DB_POSTGRESDB_PORT=5432 \
N8N_DB_POSTGRESDB_DATABASE=n8n_production \
N8N_DB_POSTGRESDB_USER=n8n \
N8N_DB_POSTGRESDB_PASSWORD=secure_password_here \
n8n init

# 管理者ユーザー作成
N8N_DB_TYPE=postgresdb \
N8N_DB_POSTGRESDB_HOST=localhost \
N8N_DB_POSTGRESDB_PORT=5432 \
N8N_DB_POSTGRESDB_DATABASE=n8n_production \
N8N_DB_POSTGRESDB_USER=n8n \
N8N_DB_POSTGRESDB_PASSWORD=secure_password_here \
n8n user:create --email admin@yourdomain.com --firstName Admin --lastName User --password admin_password_here
```

### 2. アプリケーション初期設定

```bash
# キャッシュディレクトリ作成
mkdir -p cache logs
chmod 755 cache logs

# 暗号化キー生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > .encryption-key
chmod 600 .encryption-key
```

## サービス起動と確認

### 1. サービス起動

```bash
# 全サービス起動
sudo systemctl start postgresql redis-server nginx
sudo supervisorctl start all

# 自動起動設定
sudo systemctl enable postgresql redis-server nginx supervisor
```

### 2. 動作確認

```bash
# プロセス確認
sudo supervisorctl status

# ポート確認
sudo netstat -tlnp | grep -E ':(5678|3000|5432|6379|80|443)'

# ログ確認
sudo tail -f /var/log/n8n/n8n.log
sudo tail -f /var/log/n8n-tweet/dashboard.log
```

### 3. ヘルスチェック

```bash
# 内部ヘルスチェック
curl -I http://localhost:5678/healthz
curl -I http://localhost:3000/api/v1/health

# 外部アクセス確認
curl -I https://n8n.yourdomain.com/healthz
curl -I https://dashboard.yourdomain.com/api/v1/health
```

## バックアップ設定

### 1. データベースバックアップ

```bash
# バックアップスクリプト作成
sudo cat > /usr/local/bin/backup-n8n-tweet.sh << 'EOF'
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

sudo chmod +x /usr/local/bin/backup-n8n-tweet.sh

# 毎日午前2時にバックアップ実行
sudo crontab -e
# 以下を追加
# 0 2 * * * /usr/local/bin/backup-n8n-tweet.sh >> /var/log/backup.log 2>&1
```

## 監視とメンテナンス

### 1. システム監視

```bash
# システムリソース監視用スクリプト
cat > /home/n8nuser/monitor.sh << 'EOF'
#!/bin/bash

echo "=== N8N-Tweet System Status ===" 
echo "Date: $(date)"
echo ""

echo "=== Services Status ==="
sudo supervisorctl status
echo ""

echo "=== System Resources ==="
free -h
df -h
echo ""

echo "=== Network ==="
sudo netstat -tlnp | grep -E ':(5678|3000|5432|6379|80|443)'
echo ""

echo "=== Recent Logs ==="
sudo tail -5 /var/log/n8n/n8n.log
echo ""
sudo tail -5 /var/log/n8n-tweet/dashboard.log
EOF

chmod +x /home/n8nuser/monitor.sh
```

### 2. アップデート手順

```bash
# アップデート用スクリプト
cat > /home/n8nuser/update.sh << 'EOF'
#!/bin/bash

cd /home/n8nuser/n8n-tweet

echo "Stopping services..."
sudo supervisorctl stop all

echo "Backing up current version..."
cp -r . ../n8n-tweet-backup-$(date +%Y%m%d_%H%M%S)

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
npm ci --production

echo "Starting services..."
sudo supervisorctl start all

echo "Update completed!"
EOF

chmod +x /home/n8nuser/update.sh
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. サービスが起動しない

```bash
# ログ確認
sudo supervisorctl tail n8n
sudo supervisorctl tail n8n-tweet-dashboard

# 設定ファイル確認
sudo supervisorctl reread
sudo supervisorctl update
```

#### 2. データベース接続エラー

```bash
# PostgreSQL状態確認
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"

# 接続テスト
psql -h localhost -U n8n -d n8n_production
```

#### 3. SSL証明書エラー

```bash
# 証明書確認
sudo certbot certificates

# 手動更新
sudo certbot renew --dry-run
```

#### 4. メモリ不足

```bash
# スワップファイル追加
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 永続化
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## セキュリティチェックリスト

- [ ] SSH公開鍵認証設定済み
- [ ] rootログイン無効化
- [ ] UFWファイアウォール設定済み
- [ ] Fail2Ban設定済み
- [ ] SSL証明書設定済み
- [ ] 強力なパスワード設定済み
- [ ] 定期バックアップ設定済み
- [ ] ログローテーション設定済み
- [ ] システム監視設定済み
- [ ] セキュリティヘッダー設定済み

---

## 完了後の確認事項

1. **Webアクセス確認**
   - https://n8n.yourdomain.com でn8nにアクセス
   - https://dashboard.yourdomain.com でダッシュボードにアクセス

2. **ワークフロー設定**
   - n8nでAI情報収集ワークフローを設定
   - RSS フィードの登録
   - Twitter API接続テスト

3. **監視設定**
   - ダッシュボードでシステム状態確認
   - アラート設定
   - ログ監視設定

これで Proxmox LXC 上での n8n-tweet システムの本番環境構築が完了です。