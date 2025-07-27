# 🚀 n8n-tweet クイックセットアップ

## 自動セットアップ（推奨）

```bash
# 1. 完全自動セットアップを実行
./scripts/setup-complete.sh

# 2. n8nエディターにアクセス
open http://localhost:5678
```

## ワークフローの手動インポート（必要に応じて）

### 方法1: ファイルからインポート
1. n8nエディター (http://localhost:5678) にアクセス
2. ログイン: `admin` / `admin`
3. 左上の「Workflows」→「Add workflow」→「Import from File...」
4. 以下のファイルを選択:
   - `workflows/simple-ai-tweet-workflow.json` （シンプル版・推奨）
   - `workflows/ai-tweet-rss-workflow.json` （フル機能版）

### 方法2: JSONからインポート
1. 「Import from URL or JSON...」を選択
2. 以下のJSONをコピー&ペースト:

```json
{
  "name": "AI RSS to Tweet - Simple",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{ "field": "hours", "triggerAtHour": 12 }]
        }
      },
      "name": "Daily Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "url": "https://openai.com/news/rss.xml",
        "options": { "timeout": 30000 }
      },
      "name": "Fetch RSS",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [460, 300]
    },
    {
      "parameters": {
        "jsCode": "// RSS to Tweet Processor\\nconst items = $input.all();\\nconst rssData = items[0]?.json?.data;\\n\\nif (!rssData) {\\n  return [{ json: { error: 'No RSS data' } }];\\n}\\n\\n// Simple RSS parsing\\nconst titleMatch = rssData.match(/<title>([^<]*)<\\/title>/i);\\nconst linkMatch = rssData.match(/<link>([^<]*)<\\/link>/i);\\n\\nconst title = titleMatch ? titleMatch[1] : 'AI News';\\nconst link = linkMatch ? linkMatch[1] : '';\\n\\n// Create tweet\\nlet tweet = title;\\nif (tweet.length > 200) {\\n  tweet = tweet.substring(0, 197) + '...';\\n}\\n\\ntweet += '\\\\n\\\\n#AI #OpenAI #TechNews';\\nif (link) {\\n  tweet += '\\\\n' + link;\\n}\\n\\nreturn [{\\n  json: {\\n    title,\\n    link,\\n    tweet,\\n    tweetLength: tweet.length,\\n    timestamp: new Date().toISOString()\\n  }\\n}];"
      },
      "name": "Process to Tweet",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    }
  ],
  "connections": {
    "Daily Trigger": {
      "main": [
        [{ "node": "Fetch RSS", "type": "main", "index": 0 }]
      ]
    },
    "Fetch RSS": {
      "main": [
        [{ "node": "Process to Tweet", "type": "main", "index": 0 }]
      ]
    }
  },
  "active": false,
  "settings": { "executionOrder": "v1" }
}
```

## Twitter認証設定

1. ワークフローに「Twitter」ノードを追加
2. 「Credentials」で「Create New」を選択
3. Twitter API情報を入力:
   - Consumer Key: `your_api_key`
   - Consumer Secret: `your_api_secret`
   - Access Token: `your_access_token`
   - Access Token Secret: `your_access_token_secret`

## テスト実行

1. ワークフロー画面で「Execute Workflow」をクリック
2. 各ノードの結果を確認
3. 成功したら右上の「Active」トグルをON

## 完了確認

✅ チェックリスト:
- [ ] n8nエディター (http://localhost:5678) にアクセス可能
- [ ] ダッシュボード (http://localhost:3000) にアクセス可能
- [ ] ワークフローがインポート済み
- [ ] Twitter認証情報が設定済み
- [ ] テスト実行が成功
- [ ] ワークフローが「Active」状態

---

🎉 **セットアップ完了！** AI Tweet Botが自動でAI関連ニュースをツイートします。