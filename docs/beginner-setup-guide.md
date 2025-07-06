# 🔰 初心者向け完全セットアップガイド

このガイドでは、プログラミング初心者でもn8n-tweetシステムを簡単にセットアップできるよう、すべての手順を画像付きで詳しく説明します。

## 📋 目次

1. [必要なもの](#必要なもの)
2. [環境準備](#環境準備)
3. [Twitter API取得](#twitter-api取得)
4. [システムセットアップ](#システムセットアップ)
5. [n8n設定](#n8n設定)
6. [動作確認](#動作確認)
7. [トラブルシューティング](#トラブルシューティング)

---

## 1. 必要なもの

### 📱 Twitter Developer Account
- Twitterアカウント（無料）
- Twitter Developer Account（無料申請）

### 💻 パソコン環境
- Windows 10/11, macOS, または Linux
- インターネット接続
- 最低4GB RAM、10GB以上の空き容量

### ⏱️ 所要時間
- 初回セットアップ：約60-90分
- Twitter API承認待ち：最大1-2日

---

## 2. 環境準備

### 2.1 Node.js インストール

**🔗 [詳細な環境構築ガイド](environment-setup.md)も参照してください**

1. **Node.js公式サイトにアクセス**
   - https://nodejs.org/
   - 「LTS」版（推奨）をダウンロード

2. **インストール実行**
   ```
   Windows: ダウンロードした.msiファイルを実行
   macOS: ダウンロードした.pkgファイルを実行
   Linux: パッケージマネージャーを使用
   ```

3. **インストール確認**
   ```bash
   # ターミナル（コマンドプロンプト）を開いて実行
   node --version
   # v18.0.0 以上が表示されることを確認
   
   npm --version
   # 8.0.0 以上が表示されることを確認
   ```

### 2.2 Git インストール

1. **Git公式サイトにアクセス**
   - https://git-scm.com/
   - お使いのOSに合わせてダウンロード

2. **インストール確認**
   ```bash
   git --version
   # git version 2.30.0 以上が表示されることを確認
   ```

### 2.3 コードエディタ（推奨）

**Visual Studio Code**
- https://code.visualstudio.com/
- 無料で高機能、初心者にも優しい

---

## 3. Twitter API取得

**🔗 [詳細なTwitter API設定ガイド](twitter-api-setup.md)も参照してください**

### 3.1 Twitter Developer Accountの申請

1. **Twitterにログイン**
   - https://twitter.com/ でログイン

2. **Developer Portalにアクセス**
   - https://developer.twitter.com/
   - 「Apply」をクリック

3. **申請フォーム記入**
   ```
   Use case: Research & Education
   Description: AI research news aggregation for educational purposes
   Will you analyze Twitter data: No
   Will you display Tweets outside of Twitter: No
   ```

4. **承認待ち**
   - 通常数時間～2日で承認メール到着

### 3.2 アプリケーション作成

1. **Developer Dashboard**
   - https://developer.twitter.com/en/portal/dashboard
   - 「Create App」をクリック

2. **アプリ情報入力**
   ```
   App name: n8n-tweet-[あなたの名前]
   App description: AI news aggregation and sharing system
   Website URL: https://example.com （任意のURL）
   ```

3. **API Keys取得**
   - 「Keys and tokens」タブをクリック
   - 以下をメモ帳にコピー保存：
     ```
     API Key (Consumer Key)
     API Key Secret (Consumer Secret)
     Access Token
     Access Token Secret
     ```

⚠️ **重要**: これらのキーは絶対に他人に見せないでください！

---

## 4. システムセットアップ

### 4.1 リポジトリクローン

1. **作業フォルダ作成**
   ```bash
   # ホームディレクトリに移動
   cd ~
   
   # 作業フォルダ作成
   mkdir projects
   cd projects
   ```

2. **リポジトリクローン**
   ```bash
   git clone https://github.com/takezou621/n8n-tweet.git
   cd n8n-tweet
   ```

### 4.2 依存関係インストール

```bash
# Node.jsパッケージをインストール
npm install

# インストール完了まで5-10分程度お待ちください
```

### 4.3 環境変数設定

1. **設定ファイルコピー**
   ```bash
   cp config/template.env .env
   ```

2. **環境変数編集**
   ```bash
   # VS Codeで編集（推奨）
   code .env
   
   # または他のエディタで編集
   # Windows: notepad .env
   # macOS: open -e .env
   # Linux: nano .env
   ```

3. **Twitter API情報を設定**
   ```env
   # Twitter API 設定
   TWITTER_API_KEY=あなたのAPI Key
   TWITTER_API_SECRET=あなたのAPI Key Secret
   TWITTER_ACCESS_TOKEN=あなたのAccess Token
   TWITTER_ACCESS_TOKEN_SECRET=あなたのAccess Token Secret
   
   # n8n 設定
   N8N_BASIC_AUTH_ACTIVE=true
   N8N_BASIC_AUTH_USER=admin
   N8N_BASIC_AUTH_PASSWORD=your_secure_password
   
   # その他の設定
   NODE_ENV=production
   LOG_LEVEL=info
   ```

   **💡 パスワードは必ず変更してください！**

### 4.4 システム検証

```bash
# システムが正しく設定されているかチェック
node system-verify.js
```

**期待される出力:**
```
✅ システム準備完了! 成功率: 100.0%
```

---

## 5. n8n設定

### 5.1 n8n起動

```bash
# n8nを起動
./scripts/deploy-n8n.sh

# 起動完了まで2-3分お待ちください
# "n8n ready on port 5678" が表示されたら成功
```

### 5.2 n8nダッシュボードアクセス

1. **ブラウザでアクセス**
   - URL: http://localhost:5678
   - ユーザー名: admin
   - パスワード: .envで設定したパスワード

2. **初回設定**
   - 「Owner account setup」画面が表示される場合は、適当な情報を入力
   - 「Save」をクリック

### 5.3 ワークフローインポート

**🔗 [詳細なn8n設定ガイド](n8n-configuration.md)も参照してください**

1. **ワークフローインポート**
   - 左メニュー「Workflows」をクリック
   - 右上「Import from file」をクリック
   - `workflows/ai-tweet-rss-workflow.json` を選択
   - 「Import」をクリック

2. **ワークフロー確認**
   - インポートされたワークフローが表示される
   - 各ノードが正しく接続されていることを確認

### 5.4 Twitter認証設定

1. **Credentialsメニュー**
   - 左メニュー「Credentials」をクリック
   - 「Add Credential」をクリック

2. **Twitter OAuth1認証**
   - 「Twitter OAuth1 API」を選択
   - API情報を入力：
     ```
     Consumer Key: あなたのAPI Key
     Consumer Secret: あなたのAPI Key Secret
     Access Token: あなたのAccess Token
     Access Token Secret: あなたのAccess Token Secret
     ```
   - 「Save」をクリック

3. **ワークフローで認証設定**
   - ワークフローの「Tweet」ノードをクリック
   - 「Credential for Twitter」で作成した認証を選択
   - 「Save」をクリック

### 5.5 ワークフローアクティブ化

1. **ワークフロー編集画面**
   - インポートしたワークフローを開く

2. **アクティブ化**
   - 右上の「Inactive」スイッチをクリック
   - 「Active」に変更

3. **動作確認**
   - 「Execute Workflow」をクリック
   - エラーが表示されないことを確認

---

## 6. 動作確認

### 6.1 システムヘルスチェック

```bash
# ヘルスチェック実行
./scripts/health-check.sh
```

**期待される出力:**
```
✅ システムは正常に動作しています
✅ n8nサービス: 稼働中
✅ ワークフロー: アクティブ
✅ Twitter API: 接続正常
```

### 6.2 手動テスト実行

```bash
# テストスクリプト実行
node test-complete-workflow.js
```

### 6.3 ログ確認

```bash
# システムログ確認
tail -f logs/app.log

# Ctrl+C で停止
```

---

## 7. トラブルシューティング

### よくある問題と解決方法

#### 🚨 「npm: command not found」

**原因**: Node.jsが正しくインストールされていない

**解決方法**:
1. Node.jsを再インストール
2. ターミナルを再起動
3. PATHが正しく設定されているか確認

#### 🚨 「Twitter API 認証エラー」

**原因**: Twitter API認証情報が間違っている

**解決方法**:
1. .envファイルの認証情報を再確認
2. Twitter Developer Dashboardで認証情報を確認
3. アプリの権限設定を確認（Read and Write必要）

#### 🚨 「n8n: Cannot connect」

**原因**: n8nサービスが起動していない

**解決方法**:
```bash
# n8nプロセス確認
ps aux | grep n8n

# n8n再起動
./scripts/deploy-n8n.sh
```

#### 🚨 「Permission denied」

**原因**: スクリプトファイルに実行権限がない

**解決方法**:
```bash
# 実行権限付与
chmod +x scripts/*.sh
```

#### 🚨 「Memory insufficient」

**原因**: メモリ不足

**解決方法**:
1. 他のアプリケーションを終了
2. 最低4GB RAMが必要
3. スワップファイル設定を確認

### 📞 サポート情報

**🔗 詳細ガイド**
- [環境構築ガイド](environment-setup.md)
- [Twitter API設定ガイド](twitter-api-setup.md) 
- [トラブルシューティング](troubleshooting.md)
- [FAQ](faq.md)

**🐛 問題報告**
- GitHub Issues: https://github.com/takezou621/n8n-tweet/issues

**💬 コミュニティ**
- GitHub Discussions: https://github.com/takezou621/n8n-tweet/discussions

---

## 🎉 セットアップ完了！

おめでとうございます！これでn8n-tweetシステムのセットアップが完了しました。

**次のステップ:**
1. システムが自動的にAI関連ニュースを収集
2. 定期的にTwitterに投稿
3. ログを確認して動作状況をモニタリング

**カスタマイズ:**
- `config/rss-feeds.json`: RSS収集先の設定
- `config/keywords.json`: フィルタリングキーワード
- `config/tweet-templates.json`: ツイートテンプレート

**お疲れ様でした！ 🚀**
