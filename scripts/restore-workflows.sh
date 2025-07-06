#!/bin/bash

# n8n-tweet 復元スクリプト
# バックアップからワークフロー、設定、データベースを復元

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

# 使用方法を表示
show_usage() {
    echo "使用方法: $0 [backup-prefix] [options]"
    echo ""
    echo "オプション:"
    echo "  -h, --help              このヘルプメッセージを表示"
    echo "  -l, --list              利用可能なバックアップを一覧表示"
    echo "  -f, --force             確認なしで復元を実行"
    echo "  --skip-database         データベースの復元をスキップ"
    echo "  --skip-files           ファイルの復元をスキップ"
    echo "  --dry-run              実際の復元を行わず、処理内容のみ表示"
    echo ""
    echo "例:"
    echo "  $0 n8n-tweet-backup-20240101-120000"
    echo "  $0 --list"
    echo "  $0 latest --force"
}

# バックアップ一覧を表示
list_backups() {
    echo "📦 利用可能なバックアップ:"
    echo ""
    
    if [ -d "./backups" ]; then
        BACKUPS=($(find ./backups -name "*-complete.tar.gz" -type f | sort -r))
        
        if [ ${#BACKUPS[@]} -eq 0 ]; then
            echo "  バックアップファイルが見つかりません"
            return 1
        fi
        
        for backup in "${BACKUPS[@]}"; do
            BASENAME=$(basename "$backup" -complete.tar.gz)
            SIZE=$(du -h "$backup" | cut -f1)
            DATE=$(echo "$BASENAME" | grep -o '[0-9]\{8\}-[0-9]\{6\}')
            
            if [ -n "$DATE" ]; then
                FORMATTED_DATE=$(echo "$DATE" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)-\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
                echo "  📄 $BASENAME ($SIZE) - $FORMATTED_DATE"
            else
                echo "  📄 $BASENAME ($SIZE)"
            fi
        done
        echo ""
        echo "最新のバックアップを使用するには 'latest' を指定してください"
    else
        echo "  backups ディレクトリが見つかりません"
        return 1
    fi
}

# 設定
PROJECT_NAME="n8n-tweet"
BACKUP_DIR="./backups"
DOCKER_COMPOSE_FILE="./infrastructure/docker-compose.yml"
RESTORE_TEMP_DIR="/tmp/n8n-tweet-restore-$$"

# オプション解析
BACKUP_PREFIX=""
FORCE_RESTORE=false
SKIP_DATABASE=false
SKIP_FILES=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -l|--list)
            list_backups
            exit 0
            ;;
        -f|--force)
            FORCE_RESTORE=true
            shift
            ;;
        --skip-database)
            SKIP_DATABASE=true
            shift
            ;;
        --skip-files)
            SKIP_FILES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        latest)
            BACKUP_PREFIX="latest"
            shift
            ;;
        *)
            if [ -z "$BACKUP_PREFIX" ]; then
                BACKUP_PREFIX="$1"
            else
                log_error "不明なオプション: $1"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# バックアッププレフィックスが指定されていない場合
if [ -z "$BACKUP_PREFIX" ]; then
    log_error "バックアッププレフィックスが指定されていません"
    echo ""
    show_usage
    echo ""
    list_backups
    exit 1
fi

log_info "🔄 n8n-tweet 復元を開始します..."

# 最新のバックアップを特定
if [ "$BACKUP_PREFIX" = "latest" ]; then
    if [ -d "$BACKUP_DIR" ]; then
        LATEST_BACKUP=$(find "$BACKUP_DIR" -name "*-complete.tar.gz" -type f | sort -r | head -n 1)
        
        if [ -z "$LATEST_BACKUP" ]; then
            log_error "最新のバックアップファイルが見つかりません"
            exit 1
        fi
        
        BACKUP_PREFIX=$(basename "$LATEST_BACKUP" -complete.tar.gz)
        log_info "最新のバックアップを使用: $BACKUP_PREFIX"
    else
        log_error "backups ディレクトリが見つかりません"
        exit 1
    fi
fi

# バックアップファイルの存在確認
BACKUP_FILE="$BACKUP_DIR/$BACKUP_PREFIX-complete.tar.gz"

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "バックアップファイルが見つかりません: $BACKUP_FILE"
    echo ""
    echo "利用可能なバックアップ:"
    list_backups
    exit 1
fi

# バックアップ情報の確認
BACKUP_INFO="$BACKUP_DIR/$BACKUP_PREFIX-info.json"
if [ -f "$BACKUP_INFO" ]; then
    log_info "📋 バックアップ情報:"
    if command -v jq &> /dev/null; then
        echo "   作成日時: $(jq -r '.backup_timestamp' "$BACKUP_INFO")"
        echo "   プロジェクトバージョン: $(jq -r '.project_version' "$BACKUP_INFO")"
        echo "   バックアップサイズ: $(jq -r '.backup_size' "$BACKUP_INFO")"
    else
        echo "   ファイル: $BACKUP_INFO"
    fi
    echo ""
fi

# 確認プロンプト
if [ "$FORCE_RESTORE" = false ] && [ "$DRY_RUN" = false ]; then
    echo "⚠️  警告: この操作により既存のデータが上書きされます"
    echo ""
    read -p "復元を続行しますか？ (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "復元をキャンセルしました"
        exit 0
    fi
fi

# ドライランモードの場合
if [ "$DRY_RUN" = true ]; then
    log_info "🔍 ドライランモード: 処理内容を表示します"
    echo ""
    echo "実行される処理:"
    echo "  ✓ バックアップファイルの展開: $BACKUP_FILE"
    
    if [ "$SKIP_FILES" = false ]; then
        echo "  ✓ ファイルの復元:"
        echo "    - workflows/"
        echo "    - config/"
        echo "    - credentials/"
        echo "    - n8n_data/"
        echo "    - 設定ファイル"
    fi
    
    if [ "$SKIP_DATABASE" = false ]; then
        echo "  ✓ データベースの復元:"
        echo "    - PostgreSQL データベース"
        echo "    - Redis データ"
    fi
    
    echo "  ✓ アプリケーション固有データの復元"
    echo "  ✓ サービスの再起動"
    echo ""
    log_info "ドライランモード完了 (実際の復元は実行されませんでした)"
    exit 0
fi

# 一時ディレクトリを作成
mkdir -p "$RESTORE_TEMP_DIR"

# クリーンアップ関数
cleanup() {
    log_info "🧹 一時ファイルをクリーンアップ中..."
    rm -rf "$RESTORE_TEMP_DIR"
}

# エラー時のクリーンアップ
trap cleanup EXIT

# バックアップファイルを展開
log_info "📦 バックアップファイルを展開中..."
cd "$RESTORE_TEMP_DIR"
tar -xzf "$BACKUP_FILE"

if [ $? -ne 0 ]; then
    log_error "バックアップファイルの展開に失敗しました"
    exit 1
fi

log_success "バックアップファイルの展開が完了しました"

# 元のディレクトリに戻る
cd - > /dev/null

# サービスを停止
if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    log_info "🛑 Docker サービスを停止中..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    # データベースの完全停止を待機
    sleep 5
fi

# ===============================
# ファイルの復元
# ===============================

if [ "$SKIP_FILES" = false ]; then
    log_info "📁 ファイルを復元中..."
    
    # 復元対象のファイル・ディレクトリ
    RESTORE_TARGETS=(
        "workflows"
        "config"
        "credentials"
        "n8n_data"
        "logs"
        "cache"
    )
    
    for target in "${RESTORE_TARGETS[@]}"; do
        TARGET_FILE="$RESTORE_TEMP_DIR/$BACKUP_PREFIX-$target.tar.gz"
        
        if [ -f "$TARGET_FILE" ]; then
            log_info "📂 $target を復元中..."
            
            # 既存のディレクトリをバックアップ
            if [ -d "./$target" ]; then
                mv "./$target" "./${target}.backup-$(date +%Y%m%d-%H%M%S)" 
            fi
            
            # ディレクトリを作成
            mkdir -p "./$target"
            
            # ファイルを展開
            tar -xzf "$TARGET_FILE" -C .
            
            if [ $? -eq 0 ]; then
                log_success "$target の復元が完了しました"
            else
                log_error "$target の復元に失敗しました"
            fi
        else
            log_warning "$target のバックアップファイルが見つかりません: $TARGET_FILE"
        fi
    done
    
    # 設定ファイルの復元
    CONFIG_FILE="$RESTORE_TEMP_DIR/$BACKUP_PREFIX-config-files.tar.gz"
    if [ -f "$CONFIG_FILE" ]; then
        log_info "⚙️  設定ファイルを復元中..."
        tar -xzf "$CONFIG_FILE" -C .
        log_success "設定ファイルの復元が完了しました"
    fi
else
    log_info "📁 ファイルの復元をスキップしました"
fi

# ===============================
# アプリケーション固有データの復元
# ===============================

log_info "📊 アプリケーション固有データを復元中..."

# ツイート履歴の復元
TWEET_HISTORY_FILE="$RESTORE_TEMP_DIR/$BACKUP_PREFIX-tweet-history.json"
if [ -f "$TWEET_HISTORY_FILE" ]; then
    mkdir -p "./cache"
    cp "$TWEET_HISTORY_FILE" "./cache/tweet-history.json"
    log_success "ツイート履歴の復元が完了しました"
fi

# メトリクスデータの復元
METRICS_FILE="$RESTORE_TEMP_DIR/$BACKUP_PREFIX-metrics.json"
if [ -f "$METRICS_FILE" ]; then
    mkdir -p "./logs"
    cp "$METRICS_FILE" "./logs/metrics.json"
    log_success "メトリクスデータの復元が完了しました"
fi

# ログファイルの復元
LOG_FILE="$RESTORE_TEMP_DIR/$BACKUP_PREFIX-logs.tar.gz"
if [ -f "$LOG_FILE" ]; then
    tar -xzf "$LOG_FILE" -C .
    log_success "ログファイルの復元が完了しました"
fi

# ===============================
# Dockerサービスの再起動
# ===============================

if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    log_info "🚀 Docker サービスを再起動中..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    # サービスの起動を待機
    log_info "⏳ サービスの起動を待機中..."
    sleep 10
else
    log_warning "Docker Compose ファイルが見つかりません。手動でサービスを起動してください"
fi

# ===============================
# データベースの復元
# ===============================

if [ "$SKIP_DATABASE" = false ] && [ -f "$DOCKER_COMPOSE_FILE" ]; then
    # PostgreSQLデータベースの復元
    DB_FILE="$RESTORE_TEMP_DIR/$BACKUP_PREFIX-database.sql.gz"
    if [ -f "$DB_FILE" ]; then
        log_info "🗄️  PostgreSQL データベースを復元中...")
        
        # サービスの起動を待機
        for i in {1..30}; do
            if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U "${POSTGRES_USER:-n8n}" > /dev/null 2>&1; then
                break
            fi
            sleep 2
        done
        
        # データベースをクリア
        docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql \
            -U "${POSTGRES_USER:-n8n}" \
            -d "${POSTGRES_DB:-n8n}" \
            -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
        
        # バックアップを復元
        gunzip -c "$DB_FILE" | docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql \
            -U "${POSTGRES_USER:-n8n}" \
            -d "${POSTGRES_DB:-n8n}" > /dev/null
        
        if [ $? -eq 0 ]; then
            log_success "PostgreSQL データベースの復元が完了しました"
        else
            log_error "PostgreSQL データベースの復元に失敗しました"
        fi
    else
        log_warning "PostgreSQL バックアップファイルが見つかりません"
    fi
    
    # Redisデータの復元
    REDIS_FILE="$RESTORE_TEMP_DIR/$BACKUP_PREFIX-redis.rdb.gz"
    if [ -f "$REDIS_FILE" ]; then
        log_info "🔄 Redis データを復元中...")
        
        # Redisサービスを停止
        docker-compose -f "$DOCKER_COMPOSE_FILE" stop redis
        
        # データを復元
        gunzip -c "$REDIS_FILE" | docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis redis-cli --pipe
        
        # Redisサービスを再起動
        docker-compose -f "$DOCKER_COMPOSE_FILE" start redis
        
        if [ $? -eq 0 ]; then
            log_success "Redis データの復元が完了しました"
        else
            log_error "Redis データの復元に失敗しました"
        fi
    else
        log_warning "Redis バックアップファイルが見つかりません"
    fi
else
    log_info "🗄️  データベースの復元をスキップしました"
fi

# ===============================
# 復元後の検証
# ===============================

log_info "🔍 復元結果を検証中..."

VERIFICATION_PASSED=true

# サービスのヘルスチェック
if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    # PostgreSQL接続チェック
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U "${POSTGRES_USER:-n8n}" > /dev/null 2>&1; then
        log_success "PostgreSQL が正常に起動しています"
    else
        log_error "PostgreSQL の起動に失敗しました"
        VERIFICATION_PASSED=false
    fi
    
    # Redis接続チェック
    sleep 2
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis が正常に起動しています"
    else
        log_error "Redis の起動に失敗しました"
        VERIFICATION_PASSED=false
    fi
    
    # n8n接続チェック
    sleep 5
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:5678 | grep -q "200\|401"; then
        log_success "n8n が正常に起動しています"
    else
        log_warning "n8n の起動確認ができませんでした（認証が必要な可能性があります）"
    fi
fi

# ファイルの存在確認
CRITICAL_FILES=(
    "config/default.json"
    "config/rss-feeds.json"
    ".env"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "./$file" ]; then
        log_success "$file が存在します"
    else
        log_warning "$file が見つかりません"
    fi
done

# ===============================
# 復元完了
# ===============================

if [ "$VERIFICATION_PASSED" = true ]; then
    log_success "🎉 復元が正常に完了しました！"
    echo ""
    echo "📋 復元内容:"
    echo "   バックアップ: $BACKUP_PREFIX"
    echo "   復元日時: $(date)"
    echo "   スキップした処理: $([ "$SKIP_FILES" = true ] && echo "ファイル " || echo "")$([ "$SKIP_DATABASE" = true ] && echo "データベース" || echo "")"
    echo ""
    echo "🔗 アクセス情報:"
    echo "   n8n ダッシュボード: http://localhost:5678"
    echo ""
    echo "🔧 次のステップ:"
    echo "   1. n8n ダッシュボードにアクセス"
    echo "   2. ワークフローの動作確認"
    echo "   3. Twitter API 認証情報の確認"
    echo "   4. スケジュールの確認・再設定"
    echo ""
else
    log_error "❌ 復元処理中に一部エラーが発生しました"
    echo ""
    echo "🔧 トラブルシューティング:"
    echo "   1. Docker サービスの状態を確認: docker-compose -f $DOCKER_COMPOSE_FILE ps"
    echo "   2. ログを確認: docker-compose -f $DOCKER_COMPOSE_FILE logs"
    echo "   3. 権限を確認してください"
    echo "   4. 必要に応じて手動でサービスを再起動してください"
    echo ""
fi

log_info "復元スクリプトの実行が完了しました"
