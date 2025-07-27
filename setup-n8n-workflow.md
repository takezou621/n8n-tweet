# n8n ワークフロー設定手順

## 1. n8nエディターにアクセス
1. ブラウザで http://localhost:5678 にアクセス
2. ログイン情報:
   - ユーザー名: `admin`
   - パスワード: `admin`

## 2. ワークフローのインポート

### 方法1: ファイルからインポート（推奨）
1. n8nエディターの左上「Workflows」をクリック
2. 「Add workflow」→「Import from File...」を選択
3. 以下のファイルを順番にインポート：
   - `/Users/kawai/dev/n8n-tweet/workflows/ai-tweet-rss-workflow.json` (メインワークフロー)
   - `/Users/kawai/dev/n8n-tweet/workflows/simple-ai-tweet-workflow.json` (シンプル版)

### 方法2: コピー&ペーストでインポート
1. n8nエディターの左上「Workflows」をクリック
2. 「Add workflow」→「Import from URL or JSON...」を選択
3. 以下のJSONコンテンツをコピー&ペースト

## 3. Twitter認証設定

1. インポートしたワークフローを開く
2. 「Post to Twitter」ノードをダブルクリック
3. 「Credentials」フィールドで「Create New」を選択
4. 以下の情報を入力：
   ```
   Credential Name: Twitter API
   Consumer Key: [あなたのAPI Key]
   Consumer Secret: [あなたのAPI Secret]
   Access Token: [あなたのAccess Token]
   Access Token Secret: [あなたのAccess Token Secret]
   ```
5. 「Create」をクリックして保存

## 4. ワークフローのテスト

1. ワークフロー画面で「Execute Workflow」ボタンをクリック
2. 各ノードの実行結果を確認
3. エラーがある場合は、ノードをクリックして詳細を確認

## 5. ワークフローの有効化

1. テストが成功したら、右上の「Active」トグルをONに
2. スケジュール通りに自動実行されます
   - デフォルト: 6時、12時、18時

## トラブルシューティング

### Twitter認証エラーの場合
- API Keyが正しいか確認
- Access Tokenに「Read and Write」権限があるか確認
- Twitter Developer Portalで設定を再確認

### RSS取得エラーの場合
- インターネット接続を確認
- RSS URLが有効か確認
- タイムアウト時間を増やす（60秒以上推奨）

## カスタマイズ

### 投稿時間の変更
1. 「Schedule AI Content」ノードを編集
2. 希望の時間を設定

### RSSフィードの追加/削除
1. 「RSS Feed Config」ノードを編集
2. フィードリストを更新

---

詳細は `/Users/kawai/dev/n8n-tweet/docs/workflow-setup-guide.md` を参照してください。