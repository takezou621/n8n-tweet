#!/bin/bash

echo "📦 n8n-tweet ワークフローをインポート中..."

# n8n CLIを使用してワークフローをインポート
# 注: n8nが起動している必要があります

WORKFLOW_DIR="workflows"
N8N_URL="http://localhost:5678"
N8N_USER="admin"
N8N_PASS="admin"

# 各ワークフローファイルをインポート
for workflow in $WORKFLOW_DIR/*.json; do
    if [ -f "$workflow" ]; then
        echo "Importing: $(basename $workflow)"
        
        # n8n REST APIを使用してインポート
        curl -X POST \
            -u "$N8N_USER:$N8N_PASS" \
            -H "Content-Type: application/json" \
            -d @"$workflow" \
            "$N8N_URL/api/v1/workflows" \
            2>/dev/null
            
        echo "✅ $(basename $workflow) imported"
    fi
done

echo "
✨ ワークフローのインポートが完了しました！

📌 n8nエディターで確認:
   URL: $N8N_URL
   ユーザー名: $N8N_USER
   パスワード: $N8N_PASS

📋 インポートされたワークフロー:
   - AI Tweet Bot - RSS to Twitter (メイン)
   - Simple AI Tweet Workflow (シンプル版)
   - RSS Feed Reader Template (テンプレート)
"