#!/bin/bash

# n8n-tweet バックアップスクリプト
# ワークフロー、設定、データベースのバックアップ

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
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PREFIX="n8n-tweet-backup-$TIMESTAMP"
DOCKER_COMPOSE_FILE="./infrastructure/docker-compose.yml"

# バックアップ対象の定義
BACKUP_TARGETS=(
    "workflows"
    "config"
    "credentials"
    "n8n_data"
    "logs"
    "cache"
)

log_info "💾 n8n-tweet バックアップを開始します..."

# バックアップディレクトリを作成
mkdir -p "$BACKUP_DIR"

# 環境変数を読み込み
if [ -f ".env" ]; then
    source .env
else
    log_warning "環境変数ファイル .env が見つかりません"
fi

# ===============================
# ファイルシステムバックアップ
# ===============================

log_info "📁 ファイルシステムのバックアップを作成中..."

# 各ターゲットディレクトリをバックアップ
for target in "${BACKUP_TARGETS[@]}"; do
    if [ -d "./$target" ] && [ "$(ls -A ./$target 2>/dev/null)" ]; then
        log_info "📦 $target をバックアップ中..."
        
        BACKUP_FILE="$BACKUP_DIR/$BACKUP_PREFIX-$target.tar.gz"
        tar -czf "$BACKUP_FILE" -C . "$target"
        
        if [ $? -eq 0 ]; then
            BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
            log_success "$target バックアップ完了: $BACKUP_FILE ($BACKUP_SIZE)"
        else
            log_error "$target バックアップに失敗しました"
        fi
    else
        log_warning "$target ディレクトリが存在しないか空です"
    fi
done

# 設定ファイルのバックアップ
log_info "⚙️  設定ファイルをバックアップ中..."
CONFIG_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX-config-files.tar.gz"

# バックアップ対象の設定ファイル
CONFIG_FILES=(
    ".env"
    "package.json"
    "package-lock.json"
    "README.md"
    ".gitignore"
    ".cursorules"
    "claude-desktop-config.json"
    "infrastructure/docker-compose.yml"
    "Dockerfile"
    ".dockerignore"
)

# 存在するファイルのみバックアップ
EXISTING_FILES=()
for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        EXISTING_FILES+=("$file")
    fi
done

if [ ${#EXISTING_FILES[@]} -gt 0 ]; then
    tar -czf "$CONFIG_BACKUP" "${EXISTING_FILES[@]}"
    CONFIG_SIZE=$(du -h "$CONFIG_BACKUP" | cut -f1)
    log_success "設定ファイルバックアップ完了: $CONFIG_BACKUP ($CONFIG_SIZE)"
else
    log_warning "バックアップ対象の設定ファイルが見つかりません"
fi

# ===============================
# データベースバックアップ
# ===============================

if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    log_info "🗄️  データベースバックアップを作成中..."
    
    # PostgreSQLが起動しているかチェック
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps postgres | grep -q "Up"; then
        log_info "PostgreSQL データベースをバックアップ中..."
        
        DB_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX-database.sql"
        docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_dump \
            -U "${POSTGRES_USER:-n8n}" \
            -d "${POSTGRES_DB:-n8n}" \
            --no-password > "$DB_BACKUP"
        
        if [ $? -eq 0 ] && [ -f "$DB_BACKUP" ] && [ -s "$DB_BACKUP" ]; then
            # SQLファイルを圧縮
            gzip "$DB_BACKUP"
            DB_SIZE=$(du -h "$DB_BACKUP.gz" | cut -f1)
            log_success "データベースバックアップ完了: $DB_BACKUP.gz ($DB_SIZE)"
        else
            log_error "データベースバックアップに失敗しました"
        fi
    else
        log_warning "PostgreSQL コンテナが起動していません。データベースバックアップをスキップします"
    fi
    
    # Redisデータのバックアップ
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps redis | grep -q "Up"; then
        log_info "Redis データをバックアップ中..."
        
        REDIS_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX-redis.rdb"
        docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis redis-cli --rdb - > "$REDIS_BACKUP"
        
        if [ $? -eq 0 ] && [ -f "$REDIS_BACKUP" ] && [ -s "$REDIS_BACKUP" ]; then
            # RDBファイルを圧縮
            gzip "$REDIS_BACKUP"
            REDIS_SIZE=$(du -h "$REDIS_BACKUP.gz" | cut -f1)
            log_success "Redis バックアップ完了: $REDIS_BACKUP.gz ($REDIS_SIZE)"
        else
            log_error "Redis バックアップに失敗しました"
            rm -f "$REDIS_BACKUP"
        fi
    else
        log_warning "Redis コンテナが起動していません。Redis バックアップをスキップします"
    fi
else
    log_warning "Docker Compose ファイルが見つかりません。データベースバックアップをスキップします"
fi

# ===============================
# アプリケーション固有データ
# ===============================

log_info "📊 アプリケーション固有データをバックアップ中..."

# ツイート履歴をエクスポート
if [ -f "./cache/tweet-history.json" ]; then
    log_info "ツイート履歴をバックアップ中..."
    cp "./cache/tweet-history.json" "$BACKUP_DIR/$BACKUP_PREFIX-tweet-history.json"
    log_success "ツイート履歴バックアップ完了"
fi

# メトリクスデータをエクスポート
if [ -f "./logs/metrics.json" ]; then
    log_info "メトリクスデータをバックアップ中..."
    cp "./logs/metrics.json" "$BACKUP_DIR/$BACKUP_PREFIX-metrics.json"
    log_success "メトリクスデータバックアップ完了"
fi

# ログファイルをバックアップ（最新のもののみ）
if [ -d "./logs" ] && [ "$(ls -A ./logs)" ]; then
    log_info "ログファイルをバックアップ中..."
    LOG_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX-logs.tar.gz"
    
    # 過去7日分のログのみバックアップ
    find ./logs -name "*.log" -mtime -7 -print0 | tar -czf "$LOG_BACKUP" --null -T -
    
    if [ $? -eq 0 ] && [ -f "$LOG_BACKUP" ]; then
        LOG_SIZE=$(du -h "$LOG_BACKUP" | cut -f1)
        log_success "ログファイルバックアップ完了: $LOG_BACKUP ($LOG_SIZE)"
    else
        log_warning "ログファイルバックアップに失敗しました"
    fi
fi

# ===============================
# 統合バックアップファイル作成
# ===============================

log_info "📦 統合バックアップファイルを作成中..."

# すべてのバックアップファイルを一つのアーカイブにまとめる
COMPLETE_BACKUP="$BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz"

cd "$BACKUP_DIR"
tar -czf "$(basename $COMPLETE_BACKUP)" $BACKUP_PREFIX-*

if [ $? -eq 0 ]; then
    COMPLETE_SIZE=$(du -h "$(basename $COMPLETE_BACKUP)" | cut -f1)
    log_success "統合バックアップ作成完了: $COMPLETE_BACKUP ($COMPLETE_SIZE)"
    
    # 個別ファイルを削除（統合ファイルのみ残す）
    rm -f $BACKUP_PREFIX-*
    
    cd - > /dev/null
else
    log_error "統合バックアップファイルの作成に失敗しました"
    cd - > /dev/null
fi

# ===============================
# バックアップ情報の保存
# ===============================

log_info "📝 バックアップ情報を記録中..."

BACKUP_INFO="$BACKUP_DIR/$BACKUP_PREFIX-info.json"

cat > "$BACKUP_INFO" << EOF
{
  "backup_timestamp": "$TIMESTAMP",
  "backup_prefix": "$BACKUP_PREFIX",
  "project_version": "$(git describe --tags 2>/dev/null || echo 'unknown')",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
  "docker_version": "$(docker --version 2>/dev/null || echo 'unknown')",
  "backup_targets": $(printf '%s\n' "${BACKUP_TARGETS[@]}" | jq -R . | jq -s .),
  "backup_size": "$(du -h $BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz 2>/dev/null | cut -f1 || echo 'unknown')",
  "backup_files": $(find "$BACKUP_DIR" -name "$BACKUP_PREFIX*" -type f | jq -R . | jq -s .),
  "environment": {
    "node_env": "${NODE_ENV:-development}",
    "log_level": "${LOG_LEVEL:-info}",
    "twitter_configured": "$([ -n "$TWITTER_API_KEY" ] && echo 'true' || echo 'false')"
  }
}
EOF

log_success "バックアップ情報を保存しました: $BACKUP_INFO"

# ===============================
# バックアップの検証
# ===============================

log_info "🔍 バックアップファイルを検証中..."

VERIFICATION_PASSED=true

# 統合バックアップファイルの存在確認
if [ -f "$BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz" ]; then
    # ファイルサイズチェック
    BACKUP_SIZE_BYTES=$(stat -f%z "$BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz" 2>/dev/null || stat -c%s "$BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz" 2>/dev/null)
    
    if [ "$BACKUP_SIZE_BYTES" -gt 1024 ]; then
        log_success "バックアップファイルサイズ検証: OK (${BACKUP_SIZE_BYTES} bytes)"
    else
        log_error "バックアップファイルが小さすぎます"
        VERIFICATION_PASSED=false
    fi
    
    # アーカイブの整合性チェック
    if tar -tzf "$BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz" > /dev/null 2>&1; then
        log_success "アーカイブ整合性チェック: OK"
    else
        log_error "アーカイブが破損している可能性があります"
        VERIFICATION_PASSED=false
    fi
else
    log_error "統合バックアップファイルが見つかりません"
    VERIFICATION_PASSED=false
fi

# ===============================
# 古いバックアップの削除
# ===============================

log_info "🗑️  古いバックアップファイルを削除中..."

# 30日より古いバックアップファイルを削除
DELETED_COUNT=$(find "$BACKUP_DIR" -name "n8n-tweet-backup-*" -mtime +30 -type f | wc -l)

if [ "$DELETED_COUNT" -gt 0 ]; then
    find "$BACKUP_DIR" -name "n8n-tweet-backup-*" -mtime +30 -type f -delete
    log_info "$DELETED_COUNT 個の古いバックアップファイルを削除しました"
else
    log_info "削除対象の古いバックアップファイルはありません"
fi

# ===============================
# バックアップ完了
# ===============================

if [ "$VERIFICATION_PASSED" = true ]; then
    log_success "🎉 バックアップが正常に完了しました！"
    echo ""
    echo "📦 バックアップファイル:"
    echo "   統合バックアップ: $BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz"
    echo "   バックアップ情報: $BACKUP_INFO"
    echo ""
    echo "📋 復元方法:"
    echo "   ./scripts/restore-workflows.sh $BACKUP_PREFIX"
    echo ""
    echo "🔍 バックアップ内容を確認:"
    echo "   tar -tzf $BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz"
    echo ""
else
    log_error "❌ バックアップ処理中にエラーが発生しました"
    echo ""
    echo "🔧 トラブルシューティング:"
    echo "   1. ディスク容量を確認してください"
    echo "   2. 権限を確認してください"
    echo "   3. Docker コンテナの状態を確認してください"
    echo ""
    exit 1
fi

log_info "バックアップスクリプトの実行が完了しました"
