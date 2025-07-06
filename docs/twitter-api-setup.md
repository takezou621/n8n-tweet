# 🔑 Twitter API設定ガイド

このガイドでは、n8n-tweetシステムでTwitterに投稿するために必要なTwitter API認証情報の取得方法を詳しく説明します。

## 📋 目次

1. [Twitter Developer Account申請](#twitter-developer-account申請)
2. [アプリケーション作成](#アプリケーション作成)
3. [API認証情報取得](#api認証情報取得)
4. [権限設定](#権限設定)
5. [n8n-tweetでの設定](#n8n-tweetでの設定)
6. [テスト・確認](#テスト確認)
7. [トラブルシューティング](#トラブルシューティング)

---

## 1. Twitter Developer Account申請

### 1.1 前提条件

✅ **Twitterアカウントが必要**
- 有効なTwitterアカウント（個人・法人問わず）
- 電話番号認証済み
- アカウント作成から数日経過（推奨）

✅ **申請に必要な情報**
- 使用目的の説明（英語推奨）
- 開発予定のアプリケーション概要
- データの使用方法

### 1.2 申請手順

#### Step 1: Developer Portalアクセス

1. **Twitterにログイン**
   - https://twitter.com/ でログイン
   - 使用する予定のアカウントでログイン

2. **Developer Portalにアクセス**
   - https://developer.twitter.com/
   - 右上「Apply」ボタンをクリック

#### Step 2: 申請フォーム記入

**🌟 承認されやすい申請内容の例:**

```
Use case: Educational and Research
Purpose: Creating an automated system to share AI research news and updates

Primary use case: Academic research & education
Will you analyze Twitter data: No
Will you display Tweets: No (only posting)
Will you use Tweet, Retweet, like, follow, or Direct Message functionality: Yes (posting only)

Detailed description:
I'm developing an educational bot that automatically shares curated AI research news from academic sources like ArXiv, university publications, and tech company research blogs. The system will:

1. Collect RSS feeds from academic and research sources
2. Filter content for AI-related topics using keyword matching
3. Generate informative tweets with proper attribution
4. Post 1-3 times per day to share valuable research updates

This is for educational purposes to help the AI research community stay updated with latest developments. No personal data collection or analysis will be performed.
```

**⚠️ 注意点:**
- 正直に記述する
- スパムや商用利用ではないことを明確にする
- 具体的な使用目的を記載
- 英語での記述を推奨

#### Step 3: 申請送信・承認待ち

1. **送信確認**
   - 申請内容を再確認
   - 「Submit Application」をクリック

2. **承認待ち**
   - 通常：数時間〜2営業日
   - 長い場合：1週間程度
   - 承認メールがTwitterアカウントに登録したメールアドレスに送信

3. **再申請が必要な場合**
   - 拒否理由を確認
   - より詳細な説明を追加して再申請

---

## 2. アプリケーション作成

### 2.1 Developer Dashboard アクセス

承認後、Developer Dashboardにアクセスできるようになります。

1. **Dashboard アクセス**
   - https://developer.twitter.com/en/portal/dashboard
   - 「Create App」または「+ Create App」をクリック

### 2.2 アプリケーション情報入力

#### 基本情報

```
App name: n8n-ai-tweet-bot-[あなたの名前/ID]
例: n8n-ai-tweet-bot-research-lab

App description: 
AI research news aggregation and sharing bot for educational purposes. 
Automatically curates and shares AI research updates from academic sources.

Website URL: 
https://github.com/takezou621/n8n-tweet
（GitHubリポジトリのURL、または個人サイト）

Terms of Service (optional):
（空欄でも可）

Privacy Policy (optional):
（空欄でも可）
```

#### 使用目的

```
How will you use the Twitter API or Twitter Data?
Educational content sharing and research information dissemination.

Are you planning to analyze Twitter data?
No

Will your app use Tweet, Retweet, Like, Follow, or Direct Message functionality?
Yes - Tweet functionality only for sharing curated research content.

Do you plan to display Tweets or aggregate data about Twitter content outside Twitter?
No

Will your product, service, or analysis make Twitter content or derived info available to a government entity?
No
```

### 2.3 アプリケーション作成完了

「Create」をクリックしてアプリケーションを作成します。

---

## 3. API認証情報取得

### 3.1 API Keys確認

アプリケーション作成後、「Keys and tokens」タブで認証情報を取得します。

#### 必要な認証情報

1. **API Key (Consumer Key)**
   - 例: `xRfZ7pXYjQ9S8Kw4LmNoP2cRt`

2. **API Key Secret (Consumer Secret)**
   - 例: `4xH8mBqYvZ2LpK9sJdF6WtR3eQ1nM7cGbN0vC5sE2rA8fH4uKs`

3. **Bearer Token**
   - 自動生成される
   - 一部の操作で使用

### 3.2 Access Token生成

#### Access Token and Secret生成

1. **「Keys and tokens」タブアクセス**

2. **「Access Token and Secret」セクション**
   - 「Generate」ボタンをクリック

3. **生成される認証情報**
   ```
   Access Token: 1234567890-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCd
   Access Token Secret: AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEf
   ```

### 3.3 認証情報の安全な保存

⚠️ **重要セキュリティ注意事項:**

```
🔐 これらの認証情報は絶対に他人に見せてはいけません：
✅ 必ず安全な場所に保存
✅ GitHubなどの公開リポジトリにコミットしない  
✅ スクリーンショットを他人に共有しない
✅ 定期的にキーローテーション実施

❌ 絶対にしてはいけないこと：
❌ SNSにスクリーンショット投稿
❌ チャットやメールで生の認証情報を送信
❌ 設定ファイルをそのまま共有
```

**推奨保存方法:**

```
方法1: テキストファイル保存
- ファイル名: twitter-api-keys.txt
- 保存先: パスワードマネージャーまたは暗号化フォルダ
- 内容:
  API Key: [あなたのAPIキー]
  API Secret: [あなたのAPIシークレット]  
  Access Token: [あなたのアクセストークン]
  Access Token Secret: [あなたのアクセストークンシークレット]

方法2: パスワードマネージャー
- 1Password, Bitwarden, LastPass等に保存
- カテゴリ: API Keys / Development

方法3: 環境変数（開発時）
- .envファイルに保存
- .gitignoreに.envを追加
```

---

## 4. 権限設定

### 4.1 App権限確認

1. **「Settings」タブアクセス**

2. **「App permissions」セクション確認**
   - 必要権限: **Read and Write**
   - デフォルトは「Read」のみの場合があります

### 4.2 権限変更手順

#### Read and Write権限への変更

1. **権限編集**
   - 「App permissions」の「Edit」をクリック

2. **権限選択**
   ```
   ✅ Read and Write
   ❌ Read only  
   ❌ Read and Write and Direct Message
   ```

3. **保存・確認**
   - 「Save」をクリック
   - 変更反映まで数分かかる場合があります

#### 権限変更後の重要事項

⚠️ **Access Token再生成が必要**

権限を変更した場合、既存のAccess Tokenは無効になります：

1. **「Keys and tokens」タブに戻る**
2. **「Access Token and Secret」セクション**
3. **「Regenerate」をクリック**
4. **新しいAccess TokenとSecretをメモ**

---

## 5. n8n-tweetでの設定

### 5.1 環境変数ファイル設定

1. **設定ファイルコピー**
   ```bash
   cd /path/to/n8n-tweet
   cp config/template.env .env
   ```

2. **環境変数編集**
   ```bash
   # エディタで.envファイルを開く
   code .env
   # または
   nano .env
   ```

3. **Twitter API認証情報設定**
   ```env
   # =================================
   # Twitter API Configuration
   # =================================
   TWITTER_API_KEY=あなたのAPI Key（Consumer Key）
   TWITTER_API_SECRET=あなたのAPI Key Secret（Consumer Secret）
   TWITTER_ACCESS_TOKEN=あなたのAccess Token
   TWITTER_ACCESS_TOKEN_SECRET=あなたのAccess Token Secret
   
   # Optional: Bearer Token (一部機能で使用)
   TWITTER_BEARER_TOKEN=あなたのBearer Token
   
   # =================================
   # Twitter Client Configuration
   # =================================
   TWITTER_DRY_RUN=false
   TWITTER_RATE_LIMIT_ENABLED=true
   TWITTER_MAX_TWEETS_PER_HOUR=5
   TWITTER_MAX_TWEETS_PER_DAY=20
   ```

### 5.2 設定の検証

**設定テストスクリプト実行:**

```bash
# Twitter API接続テスト
node test-twitter-client.js
```

**期待される出力:**
```
✅ Twitter API認証成功
✅ アカウント情報取得成功
✅ 投稿権限確認完了
✅ レート制限情報取得成功
```

---

## 6. テスト・確認

### 6.1 認証テスト

#### 手動テストツール作成

**twitter-auth-test.js**

```javascript
require('dotenv').config();
const { TwitterClient } = require('./src/integrations/twitter-client');

async function testTwitterAuth() {
  console.log('🔍 Twitter API認証テスト開始...\n');
  
  // 環境変数確認
  const requiredVars = [
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET', 
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_TOKEN_SECRET'
  ];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.error(`❌ 環境変数 ${varName} が設定されていません`);
      return;
    }
    console.log(`✅ ${varName}: ${'*'.repeat(10)}${process.env[varName].slice(-4)}`);
  }
  
  try {
    // Twitter クライアント初期化
    const client = new TwitterClient({
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      dryRun: true // テストモード
    });
    
    // 認証テスト
    const isHealthy = await client.isHealthy();
    if (isHealthy) {
      console.log('\n✅ Twitter API認証成功！');
    } else {
      console.log('\n❌ Twitter API認証失敗');
    }
    
    // アカウント情報取得
    const accountInfo = await client.getAccountInfo();
    console.log('📋 アカウント情報:');
    console.log(`   ユーザー名: @${accountInfo.username}`);
    console.log(`   表示名: ${accountInfo.name}`);
    console.log(`   フォロワー数: ${accountInfo.public_metrics.followers_count}`);
    
    // テストツイート（Dry Run）
    const testTweet = await client.postTweet('🤖 これはテストツイートです（実際には投稿されません）');
    console.log('\n✅ テストツイート送信成功（Dry Run）');
    
  } catch (error) {
    console.error('\n❌ エラー発生:', error.message);
    
    // 詳細なエラー診断
    if (error.message.includes('Unauthorized')) {
      console.error('🔍 認証エラーの可能性:');
      console.error('   - API KeyとSecretが正しいか確認');
      console.error('   - Access TokenとSecretが正しいか確認');  
      console.error('   - App権限が"Read and Write"になっているか確認');
      console.error('   - 権限変更後にAccess Tokenを再生成したか確認');
    }
  }
}

// テスト実行
testTwitterAuth();
```

#### テスト実行

```bash
# 認証テスト実行
node twitter-auth-test.js
```

### 6.2 n8nでの認証設定

#### Credentials設定

1. **n8nダッシュボードアクセス**
   - http://localhost:5678

2. **Credentialsメニュー**
   - 左サイドバー「Credentials」をクリック

3. **新しいCredential追加**
   - 「Add Credential」をクリック
   - 「Twitter OAuth1 API」を選択

4. **認証情報入力**
   ```
   Credential Name: Twitter API (本番)
   Consumer Key: [あなたのAPI Key]
   Consumer Secret: [あなたのAPI Key Secret]  
   Access Token: [あなたのAccess Token]
   Access Token Secret: [あなたのAccess Token Secret]
   ```

5. **保存・テスト**
   - 「Save」をクリック
   - 「Test」ボタンで接続確認

---

## 7. トラブルシューティング

### 7.1 よくあるエラーと解決方法

#### 🚨 「401 Unauthorized」エラー

**原因と解決方法:**

```
原因1: API認証情報が間違っている
解決: 
- Developer Dashboardで認証情報を再確認
- .envファイルの認証情報を再入力
- 余分なスペースや改行がないか確認

原因2: Access Tokenが古い
解決:
- App権限を変更した後にAccess Tokenを再生成
- Developer Dashboard > Keys and tokens > Regenerate

原因3: App権限が不十分
解決:
- App Settings > App permissions > Read and Write に変更
- 変更後はAccess Token再生成必須
```

#### 🚨 「403 Forbidden」エラー

**原因と解決方法:**

```
原因1: アプリの使用が停止されている
解決:
- Developer Dashboardでアプリのステータス確認
- 利用規約違反がないか確認

原因2: レート制限に達している  
解決:
- 15分〜24時間待機
- 投稿頻度を下げる設定に変更

原因3: Twitterアカウントが制限されている
解決:
- Twitterアカウントのステータス確認
- 必要に応じてTwitterサポートに連絡
```

#### 🚨 「429 Too Many Requests」エラー

**原因と解決方法:**

```
原因: レート制限に達している
解決:
- 15分〜1時間待機
- n8n-tweetの設定でレート制限を調整:
  
  config/twitter-config.json:
  {
    "rateLimits": {
      "tweets": {
        "perHour": 1,    // 時間あたり1ツイートに制限
        "perDay": 10     // 日あたり10ツイートに制限
      }
    }
  }
```

#### 🚨 「App suspended」通知

**原因と解決方法:**

```
原因: Twitter利用規約違反疑い
解決:
1. Developer Dashboardで詳細確認
2. 違反内容を確認・修正
3. Twitterサポートにアピール申請
4. 必要に応じてアプリを再作成
```

### 7.2 診断コマンド

```bash
# 環境変数確認
env | grep TWITTER

# 接続テスト
curl -H "Authorization: Bearer [Your-Bearer-Token]" \
     "https://api.twitter.com/2/users/me"

# n8n-tweet設定確認
node system-verify.js
```

### 7.3 よくある設定ミス

#### 1. 環境変数の設定ミス

❌ **間違い:**
```env
TWITTER_API_KEY = abc123  # スペースが入っている
TWITTER_API_SECRET="def456"  # クォートが不要
```

✅ **正しい:**
```env
TWITTER_API_KEY=abc123
TWITTER_API_SECRET=def456
```

#### 2. 権限設定の確認不足

❌ **間違い:** Read権限のまま投稿を試行
✅ **正しい:** Read and Write権限に変更後、Access Token再生成

#### 3. 古いAccess Tokenの使用

❌ **間違い:** 権限変更前のTokenを継続使用
✅ **正しい:** 権限変更後に必ずToken再生成

---

## 📞 サポート・参考情報

### 公式ドキュメント

- [Twitter API Documentation](https://developer.twitter.com/en/docs)
- [Twitter API v2 Guide](https://developer.twitter.com/en/docs/twitter-api/getting-started/guide)
- [Authentication Guide](https://developer.twitter.com/en/docs/authentication/overview)

### コミュニティサポート

- **n8n-tweet GitHub Issues**: https://github.com/takezou621/n8n-tweet/issues
- **n8n-tweet Discussions**: https://github.com/takezou621/n8n-tweet/discussions
- **Twitter Developer Community**: https://twittercommunity.com/

### その他のガイド

- [環境構築ガイド](environment-setup.md)
- [n8n設定ガイド](n8n-configuration.md)  
- [トラブルシューティング](troubleshooting.md)
- [FAQ](faq.md)

---

## 🎉 設定完了！

Twitter API設定が完了したら、[初心者向け完全セットアップガイド](beginner-setup-guide.md)に戻って、システム全体のセットアップを続けてください。

**次のステップ:**
1. n8n-tweetシステムの環境変数設定
2. n8nワークフローの設定
3. システム動作テスト

**お疲れ様でした！ 🚀**
