# n8n-tweet ワークフロー設定ガイド

## 🚀 クイックスタート

### 1. ワークフローのインポート

n8nエディター（http://localhost:5678）で以下の手順を実行：

1. **新規ワークフロー作成**
   - 「+ New」ボタンをクリック
   - 「Import from File」を選択
   - `workflows/ai-tweet-rss-workflow.json` を選択

### 2. Twitter認証設定

1. **Twitter API Credentials作成**
   - ワークフロー内の「Post to Twitter」ノードをクリック
   - 「Credentials」→「Create New」
   - 以下の情報を入力：
     ```
     Consumer Key: [あなたのAPI Key]
     Consumer Secret: [あなたのAPI Secret]
     Access Token: [あなたのAccess Token]
     Access Token Secret: [あなたのAccess Token Secret]
     ```

### 3. ワークフローのカスタマイズ

#### **RSS フィード設定**
「RSS Feed Config」ノードで以下を編集：
- フィードURL追加/削除
- カテゴリ設定
- ハッシュタグ設定

#### **スケジュール設定**
「Schedule AI Content」ノードで投稿時間を調整：
- デフォルト: 6時、12時、18時
- 任意の時間に変更可能

## 📊 ワークフロー構成

### **メインワークフロー: AI Tweet Bot - RSS to Twitter**

```
[Schedule Trigger]
    ↓
[RSS Feed Config]
    ↓
[Fetch RSS Feeds] (並列実行)
    - OpenAI Blog
    - ArXiv AI
    - Google AI Blog
    ↓
[Process RSS Content]
    - AI関連記事のフィルタリング
    - ツイート文生成（280文字）
    - 重複チェック
    ↓
[Post to Twitter]
    ↓
[Log Results]
    ↓
[Error Handling]
    - Success Report
    - Error Alert
```

### **主要機能**

1. **自動RSS収集**
   - 複数のAI関連RSSフィードを監視
   - 24時間以内の最新記事を抽出

2. **AIコンテンツフィルタリング**
   - 30以上のAI関連キーワードでフィルタリング
   - 関連度スコアリング

3. **ツイート最適化**
   - 280文字制限に自動調整
   - カテゴリ別ハッシュタグ付与
   - URL短縮形式

4. **エラーハンドリング**
   - 投稿失敗時のSlack通知（オプション）
   - 詳細ログ記録

## 🔧 トラブルシューティング

### **ワークフローが動作しない場合**

1. **Twitter認証エラー**
   ```bash
   # 認証情報の確認
   - API KeyとSecretが正しいか確認
   - アクセストークンの権限を確認（Read and Write必須）
   ```

2. **RSS取得エラー**
   ```bash
   # タイムアウト設定を増やす
   - HTTPリクエストノードのtimeoutを60000ms以上に設定
   ```

3. **投稿重複**
   ```bash
   # 重複チェックロジックの調整
   - Process RSS Contentノード内のseenTitlesロジックを確認
   ```

## 📝 カスタマイズ例

### **新しいRSSフィード追加**

```javascript
// RSS Feed Configノードに追加
{
  "name": "MIT AI News",
  "url": "https://news.mit.edu/rss/topic/artificial-intelligence",
  "category": "research",
  "enabled": true
}
```

### **投稿頻度の変更**

```javascript
// Schedule AI Contentノードで調整
// 例: 1時間ごとに実行
{
  "field": "hours",
  "hoursInterval": 1
}
```

## 🎯 次のステップ

1. **ワークフローを有効化**
   - ワークフロー画面右上の「Active」トグルをON

2. **テスト実行**
   - 「Execute Workflow」ボタンで手動実行
   - 結果を確認

3. **本番運用**
   - スケジュール通りの自動実行を確認
   - ログとメトリクスを監視

---

詳細な設定や高度なカスタマイズについては、[プロジェクトREADME](../README.md)を参照してください。