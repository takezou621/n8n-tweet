#!/bin/bash

# n8n-tweet 初期設定スクリプト
# http://localhost:5678/setup にアクセスするための環境を準備します

set -e

# カラー設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ログ出力関数
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

# プロジェクトルートディレクトリに移動
cd "$(dirname "$0")" 2>/dev/null || cd .

log_header "n8n-tweet 初期設定スクリプト開始"
echo "================================================================"

# 1. 前提条件チェック
log_info "システム要件をチェック中..."

# Node.js バージョンチェック
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        log_success "Node.js バージョン: $(node -v)"
    else
        log_error "Node.js 18以上が必要です。現在のバージョン: $(node -v)"
        exit 1
    fi
else
    log_error "Node.jsがインストールされていません"
    exit 1
fi

# npm バージョンチェック
if command -v npm >/dev/null 2>&1; then
    log_success "npm バージョン: $(npm -v)"
else
    log_error "npmがインストールされていません"
    exit 1
fi

# Docker チェック（オプション）
if command -v docker >/dev/null 2>&1; then
    log_success "Docker利用可能: $(docker --version | cut -d' ' -f3 | tr -d ',')"
    DOCKER_AVAILABLE=true
else
    log_warning "Dockerが見つかりません（オプション）"
    DOCKER_AVAILABLE=false
fi

# 2. 依存関係のインストール
if [ ! -d "node_modules" ]; then
    log_info "依存関係をインストール中..."
    npm install
    log_success "依存関係のインストール完了"
else
    log_success "依存関係は既にインストール済み"
fi

# 3. 環境設定の確認
log_info "環境設定を確認中..."

if [ ! -f ".env" ]; then
    log_warning ".envファイルが見つかりません"
    if [ -f "config/template.env" ]; then
        cp config/template.env .env
        log_success ".envファイルをテンプレートから作成しました"
    else
        log_warning ".envテンプレートが見つかりません。手動で作成してください"
    fi
else
    log_success ".envファイル確認済み"
fi

# 4. 必要なディレクトリの作成
log_info "プロジェクトディレクトリを準備中..."
mkdir -p logs cache backups workflows
log_success "ディレクトリ準備完了"

# 5. セットアップ方法の選択
echo ""
log_header "セットアップ方法を選択してください:"
echo "1) 📦 Dockerを使用してセットアップ (推奨)"
echo "2) 🔧 ローカルのn8nを使用してセットアップ"
echo "3) 🤖 自動セットアップ（完全自動化）"
echo "4) ❌ セットアップをスキップ"

read -p "選択してください (1-4): " choice

case $choice in
    1)
        # Docker使用
        if [ "$DOCKER_AVAILABLE" = false ]; then
            log_error "Dockerが利用できません。選択肢2を試してください"
            exit 1
        fi
        
        log_info "Dockerを使用してn8nを起動中..."
        
        # Docker Composeでサービス起動
        if [ -f "docker-compose.yml" ]; then
            docker-compose up -d
            log_success "Dockerサービス起動完了"
            
            # サービス起動待機
            log_info "n8nサービスの起動を待機中..."
            for i in {1..30}; do
                if curl -s http://localhost:5678/healthz >/dev/null 2>&1; then
                    log_success "n8nサービス起動確認"
                    break
                fi
                if [ $i -eq 30 ]; then
                    log_error "n8nサービスの起動がタイムアウトしました"
                    exit 1
                fi
                sleep 2
            done
        else
            log_error "docker-compose.ymlが見つかりません"
            exit 1
        fi
        ;;
        
    2)
        # ローカルn8n使用
        log_info "ローカルn8nを起動中..."
        
        # n8nがインストールされているかチェック
        if ! command -v n8n >/dev/null 2>&1; then
            log_info "n8nをインストール中..."
            npm install -g n8n
        fi
        
        # バックグラウンドでn8nを起動
        export N8N_BASIC_AUTH_ACTIVE=true
        export N8N_BASIC_AUTH_USER=admin
        export N8N_BASIC_AUTH_PASSWORD=Admin123!
        export N8N_HOST=localhost
        export N8N_PORT=5678
        export N8N_PROTOCOL=http
        export GENERIC_TIMEZONE=Asia/Tokyo
        
        log_info "n8nをバックグラウンドで起動中..."
        nohup n8n start > n8n.log 2>&1 &
        N8N_PID=$!
        echo $N8N_PID > .n8n_pid
        
        log_info "n8nサービスの起動を待機中..."
        for i in {1..30}; do
            if curl -s http://localhost:5678/healthz >/dev/null 2>&1; then
                log_success "n8nサービス起動確認 (PID: $N8N_PID)"
                break
            fi
            if [ $i -eq 30 ]; then
                log_error "n8nサービスの起動がタイムアウトしました"
                exit 1
            fi
            sleep 2
        done
        ;;
        
    3)
        # 自動セットアップ
        log_info "自動セットアップを実行中..."
        
        # まずn8nを起動（選択肢2と同じ）
        if ! command -v n8n >/dev/null 2>&1; then
            log_info "n8nをインストール中..."
            npm install -g n8n
        fi
        
        export N8N_BASIC_AUTH_ACTIVE=true
        export N8N_BASIC_AUTH_USER=admin
        export N8N_BASIC_AUTH_PASSWORD=Admin123!
        export N8N_HOST=localhost
        export N8N_PORT=5678
        export N8N_PROTOCOL=http
        export GENERIC_TIMEZONE=Asia/Tokyo
        
        nohup n8n start > n8n.log 2>&1 &
        N8N_PID=$!
        echo $N8N_PID > .n8n_pid
        
        # サービス起動待機
        log_info "n8nサービスの起動を待機中..."
        for i in {1..30}; do
            if curl -s http://localhost:5678/healthz >/dev/null 2>&1; then
                log_success "n8nサービス起動確認"
                break
            fi
            if [ $i -eq 30 ]; then
                log_error "n8nサービスの起動がタイムアウトしました"
                exit 1
            fi
            sleep 2
        done
        
        # 自動セットアップスクリプト実行
        if [ -f "scripts/auto-setup-n8n.js" ]; then
            log_info "自動セットアップスクリプトを実行中..."
            node scripts/auto-setup-n8n.js
        else
            log_warning "自動セットアップスクリプトが見つかりません"
        fi
        ;;
        
    4)
        log_info "セットアップをスキップしました"
        exit 0
        ;;
        
    *)
        log_error "無効な選択です"
        exit 1
        ;;
esac

# 6. セットアップ完了とブラウザ起動
echo ""
log_header "セットアップ完了！"
echo "================================================================"
log_success "n8nサービスが起動しています"
log_info "セットアップページ: http://localhost:5678/setup"
log_info "n8nダッシュボード: http://localhost:5678"

# ブラウザで自動的に開く
if command -v open >/dev/null 2>&1; then
    # macOS
    log_info "ブラウザでセットアップページを開いています..."
    open http://localhost:5678/setup
elif command -v xdg-open >/dev/null 2>&1; then
    # Linux
    log_info "ブラウザでセットアップページを開いています..."
    xdg-open http://localhost:5678/setup
elif command -v start >/dev/null 2>&1; then
    # Windows (Git Bash)
    log_info "ブラウザでセットアップページを開いています..."
    start http://localhost:5678/setup
else
    log_warning "ブラウザを自動で開けませんでした"
    echo "手動で以下のURLにアクセスしてください:"
    echo "http://localhost:5678/setup"
fi

echo ""
log_header "セットアップ手順:"
echo "1. ブラウザでセットアップページにアクセス"
echo "2. 管理者アカウントを作成:"
echo "   - Email: admin@n8n-tweet.local"
echo "   - Password: Admin123!"
echo "   - First Name: AI"
echo "   - Last Name: TweetBot"
echo "3. ワークフローをインポート:"
echo "   - workflows/ai-tweet-rss-workflow.json"
echo "4. ワークフローをアクティブ化"

echo ""
log_header "便利なコマンド:"
echo "• n8nログ確認: tail -f n8n.log"
echo "• n8n停止: kill \$(cat .n8n_pid) (ローカル起動の場合)"
echo "• Docker停止: docker-compose down (Docker起動の場合)"
echo "• 再セットアップ: ./setup-initial.sh"

echo ""
log_success "🎉 n8n-tweet初期設定完了！ブラウザでセットアップを続行してください"
echo "================================================================"