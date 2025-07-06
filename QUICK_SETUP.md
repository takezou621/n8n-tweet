# n8n-tweet 初期設定ガイド

## 🚀 クイックスタート

http://localhost:5678/setup にアクセスしてn8nの初期設定を行うための簡単なセットアップ手順です。

### 📋 前提条件

- Node.js 18以上
- npm 8以上  
- Docker（推奨、オプション）

### ⚡ 1分でセットアップ

```bash
# リポジトリをクローン（まだの場合）
git clone https://github.com/takezou621/n8n-tweet.git
cd n8n-tweet

# 初期設定スクリプトを実行
./setup-initial.sh

# または npm コマンドで実行
npm run setup:initial
```

### 🎯 セットアップ方法の選択

スクリプトを実行すると、以下の選択肢が表示されます：

1. **📦 Dockerを使用してセットアップ（推奨）**
   - Docker ComposeでPostgreSQL、Redis、n8nを一括起動
   - 本格的な運用環境に最適

2. **🔧 ローカルのn8nを使用してセットアップ**
   - ローカル環境でn8nを直接起動
   - 開発・テスト環境に最適

3. **🤖 自動セットアップ（完全自動化）**
   - n8nの起動からワークフローインポートまで全自動
   - 即座に動作確認したい場合に最適

4. **❌ セットアップをスキップ**
   - 手動でセットアップしたい場合

### 📱 ブラウザでの設定

スクリプト実行後、自動的にブラウザで `http://localhost:5678/setup` が開きます。

#### 管理者アカウント作成

- **Email**: `admin@n8n-tweet.local`
- **Password**: `Admin123!`
- **First Name**: `AI`
- **Last Name**: `TweetBot`

#### ワークフローのインポート

1. 「+ Add workflow」をクリック
2. 「Import from file」を選択
3. `workflows/ai-tweet-rss-workflow.json` を選択
4. 「Import」をクリック
5. ワークフローを「Active」に変更

### 🔧 セットアップ後の操作

#### n8nサービスの管理

```bash
# ログ確認
tail -f n8n.log

# ローカル起動の場合 - サービス停止
kill $(cat .n8n_pid)

# Docker起動の場合 - サービス停止
docker-compose down

# 再起動
./setup-initial.sh
```

#### 設定ファイルの編集

```bash
# 環境変数を編集
nano .env

# Twitter API キーの設定
TWITTER_API_KEY=your_actual_api_key
TWITTER_API_SECRET=your_actual_api_secret
TWITTER_ACCESS_TOKEN=your_actual_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_actual_access_token_secret
```

### 📊 動作確認

1. **ダッシュボードアクセス**: http://localhost:5678
2. **ワークフロー実行**: 「Execute Workflow」ボタンをクリック
3. **実行履歴確認**: 「Executions」タブで結果を確認

### ⏰ 自動実行スケジュール

設定完了後、以下のスケジュールで自動実行されます：

- **🌅 朝 6:00** - モーニング AI ニュース
- **🌞 昼 12:00** - ランチタイム AI アップデート  
- **🌇 夕 18:00** - イブニング AI サマリー

### 🆘 トラブルシューティング

#### ポート5678が使用中の場合

```bash
# ポートを使用しているプロセスを確認
lsof -i :5678

# プロセスを停止
kill -9 <PID>
```

#### n8nサービスが起動しない場合

```bash
# ログを確認
tail -f n8n.log

# Dockerログを確認（Docker使用の場合）
docker-compose logs n8n
```

#### 依存関係のエラー

```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

### 📚 追加リソース

- **GitHub Repository**: https://github.com/takezou621/n8n-tweet
- **n8n Documentation**: https://docs.n8n.io/
- **詳細セットアップ手順**: `SETUP_INSTRUCTIONS.md`
- **その他のスクリプト**: `scripts/` ディレクトリ

### 🤝 サポート

問題が発生した場合は、以下の情報と共にIssueを作成してください：

- OS情報
- Node.js バージョン
- エラーメッセージ
- n8n.log の内容

---

🎉 **セットアップ完了！AI情報収集・Twitter自動投稿システムをお楽しみください！**