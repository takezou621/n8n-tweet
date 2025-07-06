# n8n-tweet デプロイメントガイド

本番環境でのn8n-tweet AI情報収集・配信システムのデプロイ手順

## 🎯 概要

このシステムは以下の構成で動作します：

- **n8n**: ワークフロー実行エンジン
- **PostgreSQL**: データ永続化
- **Redis**: キャッシュ・セッション管理
- **AI Tweet Bot**: カスタムNode.jsサービス
- **Docker**: コンテナ化

## 📋 前提条件

### システム要件

- **OS**: Ubuntu 20.04 LTS以上 / CentOS 8以上
- **CPU**: 2コア以上
- **メモリ**: 4GB以上推奨
- **ストレージ**: 20GB以上の空き容量
- **ネットワーク**: インターネット接続

### 必要なソフトウェア

```bash
# Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Git
sudo apt update && sudo apt install git -y

# Node.js (開発・テスト用)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 🚀 クイックスタート

### 1. リポジトリクローン

```bash
git clone https://github.com/takezou621/n8n-tweet.git
cd n8n-tweet
```

### 2. 環境設定

```bash
# 環境変数ファイルを作成
cp config/template.env .env

# 環境変数を編集
nano .env
```

#### 必須設定項目

```bash
# Twitter API認証情報
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here
TWITTER_BEARER_TOKEN=your_bearer_token_here

# n8n設定
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=secure_password_here
N8N_WEBHOOK_URL=https://your-domain.com

# データベース設定
POSTGRES_DB=n8n_production
POSTGRES_USER=n8n_user
POSTGRES_PASSWORD=secure_database_password

# セキュリティ
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_encryption_key

# 通知設定
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### 3. デプロイ実行

```bash
# デプロイスクリプトを実行
./scripts/deploy-n8n.sh
```

### 4. 初期セットアップ

1. **n8nダッシュボードにアクセス**
   ```
   http://your-server-ip:5678
   ```

2. **Twitter API認証情報を設定**
   - Credentials → Add Credential → Twitter OAuth1 API
   - API Key/Secret、Access Token/Secretを入力

3. **ワークフローをインポート**
   ```bash
   # n8nダッシュボードで
   # Workflows → Import from File → workflows/ai-tweet-rss-workflow.json
   ```

4. **ワークフローをアクティブ化**
   - インポートしたワークフローを開く
   - 右上の「Active」トグルをON

## 🔧 詳細設定

### SSL/TLS設定

#### Nginx + Let's Encrypt

```bash
# Nginxインストール
sudo apt install nginx certbot python3-certbot-nginx -y

# SSL証明書取得
sudo certbot --nginx -d your-domain.com

# Nginx設定
sudo nano /etc/nginx/sites-available/n8n-tweet
```

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5678;
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
```

```bash
# 設定を有効化
sudo ln -s /etc/nginx/sites-available/n8n-tweet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### データベース最適化

#### PostgreSQL設定

```bash
# PostgreSQLコンテナ内での設定
docker-compose exec postgres psql -U n8n_user -d n8n_production

-- パフォーマンス最適化
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';

-- 設定を再読み込み
SELECT pg_reload_conf();
```

### 監視設定

#### Prometheus + Grafana

```yaml
# monitoring/docker-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

volumes:
  prometheus_data:
  grafana_data:
```

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'n8n-tweet-bot'
    static_configs:
      - targets: ['localhost:3000']
```

## 🔐 セキュリティ設定

### ファイアウォール設定

```bash
# UFWを有効化
sudo ufw enable

# 必要なポートのみ開放
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 内部通信用ポート（ローカルのみ）
sudo ufw allow from 127.0.0.1 to any port 5678
sudo ufw allow from 127.0.0.1 to any port 5432
sudo ufw allow from 127.0.0.1 to any port 6379
```

### Docker セキュリティ

```bash
# Dockerグループにユーザー追加（必要な場合のみ）
sudo usermod -aG docker $USER

# Docker daemon設定
sudo nano /etc/docker/daemon.json
```

```json
{
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "security-opts": ["no-new-privileges:true"]
}
```

### 秘密情報管理

```bash
# Docker Secretsを使用
echo "your_api_key" | docker secret create twitter_api_key -
echo "your_db_password" | docker secret create postgres_password -
```

## 📊 運用・監視

### ヘルスチェック

```bash
# システム全体のヘルスチェック
curl http://localhost:5678/healthz

# 個別サービスチェック
docker-compose ps
docker-compose logs -f ai-tweet-bot-service
```

### ログ管理

```bash
# ログローテーション設定
sudo nano /etc/logrotate.d/n8n-tweet
```

```
/var/log/n8n-tweet/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
}
```

### バックアップ自動化

```bash
# cronジョブ設定
crontab -e

# 毎日午前2時にバックアップ実行
0 2 * * * /path/to/n8n-tweet/scripts/backup-workflows.sh

# 週次で古いバックアップを削除
0 3 * * 0 find /path/to/n8n-tweet/backups -name "*.tar.gz" -mtime +30 -delete
```

### パフォーマンス監視

```bash
# システムリソース監視
sudo apt install htop iotop -y

# Dockerリソース監視
docker stats

# アプリケーションメトリクス
curl http://localhost:3000/metrics
```

## 🚨 トラブルシューティング

### よくある問題

#### 1. Twitter API認証エラー

```bash
# 認証情報確認
docker-compose exec ai-tweet-bot-service node -e "
const TwitterClient = require('./src/integrations/twitter-client');
const client = new TwitterClient({
  credentials: {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  }
});
client.testAuthentication().then(console.log);
"
```

#### 2. データベース接続エラー

```bash
# PostgreSQL接続確認
docker-compose exec postgres pg_isready -U n8n_user

# 接続テスト
docker-compose exec postgres psql -U n8n_user -d n8n_production -c "SELECT version();"
```

#### 3. メモリ不足

```bash
# メモリ使用量確認
free -h
docker stats --no-stream

# スワップ設定
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 4. ディスク容量不足

```bash
# ディスク使用量確認
df -h
docker system df

# 不要なDockerリソース削除
docker system prune -a
docker volume prune
```

### ログレベル調整

```bash
# デバッグモード有効化
export LOG_LEVEL=debug
docker-compose restart ai-tweet-bot-service

# 詳細ログ確認
docker-compose logs -f --tail=100 ai-tweet-bot-service
```

## 🔄 アップデート手順

### 1. 事前準備

```bash
# バックアップ作成
./scripts/backup-workflows.sh

# 現在のバージョン確認
git tag -l
```

### 2. アップデート実行

```bash
# 最新コードを取得
git fetch --all --tags
git checkout tags/v1.x.x

# 依存関係更新
npm install

# データベースマイグレーション（必要な場合）
docker-compose exec postgres psql -U n8n_user -d n8n_production -f migrations/latest.sql
```

### 3. サービス再起動

```bash
# サービス停止
docker-compose down

# イメージ再ビルド
docker-compose build --no-cache

# サービス開始
docker-compose up -d
```

### 4. 動作確認

```bash
# ヘルスチェック
./scripts/run-tests.sh integration

# ワークフロー動作確認
curl -X POST http://localhost:5678/webhook/test
```

## 📈 スケーリング

### 水平スケーリング

```yaml
# docker-compose.override.yml
version: '3.8'

services:
  ai-tweet-bot:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

### ロードバランシング

```bash
# HAProxy設定
sudo apt install haproxy -y
sudo nano /etc/haproxy/haproxy.cfg
```

```
backend ai_tweet_bot
    balance roundrobin
    server bot1 127.0.0.1:3001 check
    server bot2 127.0.0.1:3002 check
    server bot3 127.0.0.1:3003 check
```

## 📞 サポート

### 問題報告

- **GitHub Issues**: https://github.com/takezou621/n8n-tweet/issues
- **ドキュメント**: https://github.com/takezou621/n8n-tweet/wiki

### 緊急時連絡先

```bash
# システムアラート設定
export ALERT_EMAIL=admin@your-domain.com
export ALERT_SLACK_WEBHOOK=https://hooks.slack.com/your-webhook
```

---

**注意**: 本番環境では必ずセキュリティ設定を適切に行い、定期的なバックアップを実施してください。
