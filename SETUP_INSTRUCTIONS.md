🚀 **n8nワークフロー簡単セットアップ** 🚀

📋 **ステップ1: ブラウザアクセス**
✅ http://localhost:5678 (既に開いています)

📋 **ステップ2: 初期セットアップ**
1. 管理者アカウント作成:
   - ユーザー名: admin
   - パスワード: Admin123!
   - メール: admin@n8n-tweet.local

📋 **ステップ3: ワークフローインポート**
1. "+ Add workflow" → "Import from file" をクリック
2. ファイル選択: workflows/ai-tweet-rss-workflow.json
3. "Import" をクリック

📋 **ステップ4: ワークフロー有効化**
1. 右上の "Inactive" を "Active" に変更
2. "Execute Workflow" でテスト実行

🎉 **設定完了！**
AI情報収集・Twitter自動投稿システムが稼働開始します！

⏰ **自動実行スケジュール**
- 毎日 6:00, 12:00, 18:00 に自動実行
- AI関連記事を収集してTwitterに投稿

📊 **実行結果確認**
- n8nダッシュボード → "Executions" タブで実行履歴確認
