#!/bin/bash

# n8n-tweet クイックコマンド集

# カラー設定
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 n8n-tweet クイックコマンド集${NC}"
echo "=================================="

# 使用方法を表示
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ] || [ -z "$1" ]; then
    echo "使用方法: ./quick.sh [コマンド]"
    echo ""
    echo "利用可能なコマンド:"
    echo "  setup     - 初期設定を実行"
    echo "  start     - n8nサービスを起動"
    echo "  stop      - n8nサービスを停止"
    echo "  restart   - n8nサービスを再起動"
    echo "  status    - サービス状況を確認"
    echo "  logs      - ログを表示"
    echo "  open      - ブラウザでn8nを開く"
    echo "  test      - ワークフローテストを実行"
    echo "  backup    - ワークフローをバックアップ"
    echo "  reset     - すべてのデータを初期化（完全リセット）"
    echo "  clean     - 一時ファイルをクリーンアップ"
    echo "  help      - このヘルプを表示"
    exit 0
fi

case "$1" in
    "setup")
        echo -e "${GREEN}初期設定を開始します...${NC}"
        ./setup-initial.sh
        ;;
    
    "start")
        echo -e "${GREEN}n8nサービスを起動中...${NC}"
        if [ -f "docker-compose.yml" ] && command -v docker-compose >/dev/null 2>&1; then
            docker-compose up -d
            echo -e "${GREEN}✅ Dockerサービス起動完了${NC}"
        else
            # ローカル起動
            export N8N_BASIC_AUTH_ACTIVE=true
            export N8N_BASIC_AUTH_USER=admin
            export N8N_BASIC_AUTH_PASSWORD=Admin123!
            nohup n8n start > n8n.log 2>&1 &
            echo $! > .n8n_pid
            echo -e "${GREEN}✅ n8nローカル起動完了 (PID: $(cat .n8n_pid))${NC}"
        fi
        echo "🌐 ダッシュボード: http://localhost:5678"
        ;;
    
    "stop")
        echo -e "${YELLOW}n8nサービスを停止中...${NC}"
        if [ -f ".n8n_pid" ]; then
            kill $(cat .n8n_pid) 2>/dev/null
            rm -f .n8n_pid
            echo -e "${GREEN}✅ ローカルn8n停止完了${NC}"
        fi
        if command -v docker-compose >/dev/null 2>&1; then
            docker-compose down 2>/dev/null
            echo -e "${GREEN}✅ Dockerサービス停止完了${NC}"
        fi
        ;;
    
    "restart")
        echo -e "${YELLOW}n8nサービスを再起動中...${NC}"
        $0 stop
        sleep 2
        $0 start
        ;;
    
    "status")
        echo -e "${BLUE}サービス状況を確認中...${NC}"
        if curl -s http://localhost:5678/healthz >/dev/null 2>&1; then
            echo -e "${GREEN}✅ n8nサービス: 稼働中${NC}"
            echo "🌐 ダッシュボード: http://localhost:5678"
        else
            echo -e "${YELLOW}⚠️  n8nサービス: 停止中${NC}"
        fi
        
        if [ -f ".n8n_pid" ]; then
            PID=$(cat .n8n_pid)
            if ps -p $PID > /dev/null 2>&1; then
                echo -e "${GREEN}✅ ローカルプロセス: 稼働中 (PID: $PID)${NC}"
            else
                echo -e "${YELLOW}⚠️  ローカルプロセス: 停止中${NC}"
                rm -f .n8n_pid
            fi
        fi
        
        if command -v docker-compose >/dev/null 2>&1; then
            if docker-compose ps | grep -q "Up"; then
                echo -e "${GREEN}✅ Dockerサービス: 稼働中${NC}"
                docker-compose ps
            else
                echo -e "${YELLOW}⚠️  Dockerサービス: 停止中${NC}"
            fi
        fi
        ;;
    
    "logs")
        echo -e "${BLUE}ログを表示中... (Ctrl+C で終了)${NC}"
        if [ -f "n8n.log" ]; then
            tail -f n8n.log
        elif command -v docker-compose >/dev/null 2>&1; then
            docker-compose logs -f n8n
        else
            echo "ログファイルが見つかりません"
        fi
        ;;
    
    "open")
        echo -e "${GREEN}ブラウザでn8nを開いています...${NC}"
        if command -v open >/dev/null 2>&1; then
            open http://localhost:5678
        elif command -v xdg-open >/dev/null 2>&1; then
            xdg-open http://localhost:5678
        elif command -v start >/dev/null 2>&1; then
            start http://localhost:5678
        else
            echo "手動で http://localhost:5678 にアクセスしてください"
        fi
        ;;
    
    "test")
        echo -e "${BLUE}ワークフローテストを実行中...${NC}"
        if [ -f "scripts/auto-setup-n8n.js" ]; then
            node scripts/auto-setup-n8n.js
        else
            echo "テストスクリプトが見つかりません"
        fi
        ;;
    
    "backup")
        echo -e "${BLUE}ワークフローをバックアップ中...${NC}"
        if [ -f "scripts/backup-workflows.sh" ]; then
            ./scripts/backup-workflows.sh
        else
            mkdir -p backups
            cp -r workflows/ backups/workflows-$(date +%Y%m%d_%H%M%S)/
            echo -e "${GREEN}✅ バックアップ完了: backups/workflows-$(date +%Y%m%d_%H%M%S)/${NC}"
        fi
        ;;
    
    "clean")
        echo -e "${YELLOW}一時ファイルをクリーンアップ中...${NC}"
        rm -f .n8n_pid
        rm -f n8n.log
        rm -rf logs/*.log
        rm -rf cache/*
        echo -e "${GREEN}✅ クリーンアップ完了${NC}"
        ;;
    
    "reset")
        echo -e "${RED}⚠️  危険: データベース完全リセット${NC}"
        echo -e "${YELLOW}====================================${NC}"
        echo -e "${RED}このコマンドは以下を完全に削除します:${NC}"
        echo "  💾 n8nデータベース（ワークフロー、ユーザー、実行履歴）"
        echo "  📦 Dockerボリューム（PostgreSQL、Redis、n8nデータ）"
        echo "  📁 ローカルキャッシュとログファイル"
        echo "  🔑 ユーザーアカウントと認証情報"
        echo ""
        echo -e "${RED}⚠️  この操作は元に戻せません！${NC}"
        echo ""
        read -p "本当にすべてをリセットしますか？ (yes/NO): " confirmation
        
        if [ "$confirmation" = "yes" ] || [ "$confirmation" = "YES" ]; then
            echo -e "${YELLOW}🔄 完全リセット開始...${NC}"
            
            # 1. サービス停止
            echo -e "${BLUE}1. n8nサービス停止中...${NC}"
            if [ -f ".n8n_pid" ]; then
                kill $(cat .n8n_pid) 2>/dev/null
                rm -f .n8n_pid
            fi
            docker-compose down 2>/dev/null
            
            # 2. ボリューム完全削除
            echo -e "${BLUE}2. Dockerボリューム削除中...${NC}"
            docker-compose down -v --remove-orphans
            
            # 3. ローカルデータ削除
            echo -e "${BLUE}3. ローカルデータ削除中...${NC}"
            rm -rf .n8n/*
            rm -rf n8n_data/*
            rm -f n8n*.log
            rm -rf logs/*
            rm -rf cache/*
            
            # 4. 完了メッセージ
            echo ""
            echo -e "${GREEN}🎉 完全リセット完了！${NC}"
            echo -e "${GREEN}============================${NC}"
            echo -e "${GREEN}✅ n8nデータベース: 削除完了${NC}"
            echo -e "${GREEN}✅ Dockerボリューム: 削除完了${NC}"
            echo -e "${GREEN}✅ ローカルデータ: 削除完了${NC}"
            echo -e "${GREEN}✅ ログファイル: 削除完了${NC}"
            echo ""
            echo -e "${BLUE}🚀 次回起動時はクリーンな状態から開始されます${NC}"
            echo -e "${BLUE}💡 './quick.sh start' でサービスを開始してください${NC}"
        else
            echo -e "${BLUE}ℹ️  リセットをキャンセルしました${NC}"
        fi
        ;;
    
    *)
        echo "❌ 不明なコマンド: $1"
        echo "使用方法: $0 help"
        exit 1
        ;;
esac