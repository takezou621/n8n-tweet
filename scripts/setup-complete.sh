#!/bin/bash

# n8n-tweet 完全自動セットアップスクリプト

echo "🚀 n8n-tweet 完全自動セットアップ開始"
echo "======================================"

# 色定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# n8nプロセス確認
check_n8n() {
    log_info "n8nの起動状態を確認中..."
    
    if pgrep -f "n8n start" > /dev/null; then
        log_success "n8nが起動しています"
        return 0
    else
        log_warning "n8nが起動していません"
        return 1
    fi
}

# n8n起動
start_n8n() {
    log_info "n8nを起動中..."
    
    # バックグラウンドでn8nを起動
    npm run n8n > logs/n8n.log 2>&1 &
    N8N_PID=$!
    
    log_info "n8nの起動を待機中（PID: $N8N_PID）..."
    
    # n8nの起動完了を待つ（最大60秒）
    for i in {1..60}; do
        if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
            log_success "n8nが起動しました（${i}秒後）"
            return 0
        fi
        sleep 1
        echo -n "."
    done
    
    log_error "n8nの起動に失敗しました"
    return 1
}

# ダッシュボード確認
check_dashboard() {
    log_info "ダッシュボードの起動確認中..."
    
    if curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1; then
        log_success "ダッシュボードが起動しています"
        return 0
    else
        log_warning "ダッシュボードが起動していません"
        return 1
    fi
}

# ダッシュボード起動
start_dashboard() {
    log_info "ダッシュボードを起動中..."
    
    npm run dashboard > logs/dashboard.log 2>&1 &
    DASHBOARD_PID=$!
    
    log_info "ダッシュボードの起動を待機中（PID: $DASHBOARD_PID）..."
    
    # ダッシュボードの起動完了を待つ（最大30秒）
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1; then
            log_success "ダッシュボードが起動しました（${i}秒後）"
            return 0
        fi
        sleep 1
        echo -n "."
    done
    
    log_warning "ダッシュボードの起動に時間がかかっています"
    return 1
}

# 環境変数の確認
check_env_vars() {
    log_info "環境変数を確認中..."
    
    local missing_vars=()
    
    if [ -z "$TWITTER_API_KEY" ]; then
        missing_vars+=("TWITTER_API_KEY")
    fi
    
    if [ -z "$TWITTER_API_SECRET" ]; then
        missing_vars+=("TWITTER_API_SECRET")
    fi
    
    if [ -z "$TWITTER_ACCESS_TOKEN" ]; then
        missing_vars+=("TWITTER_ACCESS_TOKEN")
    fi
    
    if [ -z "$TWITTER_ACCESS_TOKEN_SECRET" ]; then
        missing_vars+=("TWITTER_ACCESS_TOKEN_SECRET")
    fi
    
    if [ ${#missing_vars[@]} -eq 0 ]; then
        log_success "Twitter認証情報が設定されています"
        return 0
    else
        log_warning "以下のTwitter認証情報が設定されていません:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "設定例:"
        echo "export TWITTER_API_KEY='your_api_key'"
        echo "export TWITTER_API_SECRET='your_api_secret'"
        echo "export TWITTER_ACCESS_TOKEN='your_access_token'"
        echo "export TWITTER_ACCESS_TOKEN_SECRET='your_access_token_secret'"
        echo ""
        return 1
    fi
}

# ワークフロー自動インポート
import_workflows() {
    log_info "ワークフローを自動インポート中..."
    
    # Node.jsスクリプトを実行
    if node scripts/setup-n8n-auto.js; then
        log_success "ワークフローのインポートが完了しました"
        return 0
    else
        log_error "ワークフローのインポートに失敗しました"
        return 1
    fi
}

# ログディレクトリ作成
mkdir -p logs

echo ""
log_info "=== ステップ 1: サービス起動確認 ==="

# n8n確認・起動
if ! check_n8n; then
    if ! start_n8n; then
        log_error "n8nの起動に失敗しました。手動で確認してください。"
        exit 1
    fi
fi

# ダッシュボード確認・起動
if ! check_dashboard; then
    start_dashboard
fi

echo ""
log_info "=== ステップ 2: 環境変数確認 ==="

# 環境変数確認
ENV_OK=0
if check_env_vars; then
    ENV_OK=1
fi

echo ""
log_info "=== ステップ 3: ワークフローインポート ==="

# ワークフローインポート
if import_workflows; then
    IMPORT_SUCCESS=1
else
    IMPORT_SUCCESS=0
fi

echo ""
log_info "=== セットアップ完了 ==="
echo "======================================"

log_success "🎉 n8n-tweet セットアップが完了しました！"
echo ""

echo "📊 サービス状況:"
echo "   - n8n エディター: http://localhost:5678"
echo "   - ダッシュボード: http://localhost:3000"
echo ""

if [ $ENV_OK -eq 1 ]; then
    log_success "Twitter認証情報: 設定済み"
else
    log_warning "Twitter認証情報: 要設定"
fi

if [ $IMPORT_SUCCESS -eq 1 ]; then
    log_success "ワークフロー: インポート済み"
else
    log_warning "ワークフロー: 手動インポートが必要"
fi

echo ""
echo "🔧 次のステップ:"
echo "1. n8nエディター（http://localhost:5678）にアクセス"
echo "2. ユーザー名: admin, パスワード: admin でログイン"

if [ $ENV_OK -eq 0 ]; then
    echo "3. Twitter認証情報を設定"
fi

echo "4. ワークフローをテスト実行"
echo "5. 問題なければ 'Active' をONに"
echo ""

echo "📋 ワークフロー一覧:"
echo "   - AI Tweet Bot - RSS to Twitter (メイン)"
echo "   - Simple AI Tweet Workflow (シンプル版)"
echo ""

log_success "セットアップ完了！AI Tweet Botの運用を開始できます。"