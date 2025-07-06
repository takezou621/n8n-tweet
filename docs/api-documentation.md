# n8n-tweet API ドキュメント

AI情報収集・配信システムの内部APIと外部インテグレーション仕様書

## 📋 目次

- [概要](#概要)
- [認証](#認証)
- [エンドポイント一覧](#エンドポイント一覧)
- [データモデル](#データモデル)
- [エラーハンドリング](#エラーハンドリング)
- [レート制限](#レート制限)
- [Webhook](#webhook)
- [SDK・ライブラリ](#sdkライブラリ)

## 🎯 概要

n8n-tweet システムは以下のAPIを提供します：

- **REST API**: HTTP/JSONベースのAPI
- **Webhook API**: イベント通知用API
- **Internal API**: コンポーネント間通信用API
- **n8n Integration**: n8nワークフロー統合API

### ベースURL

```
Production:  https://api.your-domain.com/v1
Development: http://localhost:3000/v1
```

### APIバージョン

- **Current**: v1.0.0
- **Supported**: v1.x.x

## 🔐 認証

### JWT Bearer Token

```http
Authorization: Bearer <JWT_TOKEN>
```

### API Key認証

```http
X-API-Key: <YOUR_API_KEY>
```

### Twitter API認証

```javascript
// OAuth 1.0a (Twitter API v2)
{
  "apiKey": "your_api_key",
  "apiSecret": "your_api_secret", 
  "accessToken": "your_access_token",
  "accessTokenSecret": "your_access_token_secret"
}
```

## 📡 エンドポイント一覧

### ヘルスチェック

#### `GET /health`

システム全体のヘルスチェック

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0",
  "components": {
    "feedParser": { "status": "healthy", "responseTime": 45 },
    "contentFilter": { "status": "healthy", "responseTime": 12 },
    "twitterClient": { "status": "degraded", "error": "Rate limit" },
    "database": { "status": "healthy", "responseTime": 8 }
  },
  "score": 0.85
}
```

#### `GET /health/{component}`

個別コンポーネントのヘルスチェック

**Parameters:**
- `component` (string): コンポーネント名 (feedParser, contentFilter, etc.)

### RSS フィード管理

#### `GET /feeds`

RSS フィード一覧取得

**Query Parameters:**
- `enabled` (boolean): 有効なフィードのみ
- `category` (string): カテゴリフィルタ
- `limit` (integer): 取得件数制限
- `offset` (integer): オフセット

**Response:**
```json
{
  "feeds": [
    {
      "id": "openai-blog",
      "name": "OpenAI Blog",
      "url": "https://openai.com/blog/rss/",
      "category": "openai",
      "enabled": true,
      "lastFetch": "2024-01-01T12:00:00Z",
      "itemCount": 25,
      "status": "active"
    }
  ],
  "total": 5,
  "pagination": {
    "limit": 10,
    "offset": 0,
    "hasNext": false
  }
}
```

#### `POST /feeds`

新しいRSSフィードを追加

**Request Body:**
```json
{
  "name": "New AI Blog",
  "url": "https://example.com/rss",
  "category": "research",
  "enabled": true,
  "metadata": {
    "tags": ["AI", "Research"],
    "priority": 2
  }
}
```

#### `GET /feeds/{feedId}/items`

特定フィードのアイテム一覧

**Response:**
```json
{
  "items": [
    {
      "id": "item-123",
      "title": "Latest AI Research Breakthrough",
      "link": "https://example.com/article",
      "pubDate": "2024-01-01T10:00:00Z",
      "category": "research",
      "relevanceScore": 0.92,
      "processed": true
    }
  ],
  "total": 50
}
```

### ツイート管理

#### `GET /tweets`

ツイート履歴一覧

**Query Parameters:**
- `status` (string): posted, draft, failed
- `category` (string): カテゴリフィルタ
- `startDate` (string): 開始日時 (ISO 8601)
- `endDate` (string): 終了日時 (ISO 8601)
- `limit` (integer): 取得件数制限

**Response:**
```json
{
  "tweets": [
    {
      "id": "tweet-456",
      "text": "🤖 Latest AI breakthrough...",
      "status": "posted",
      "category": "research",
      "twitterId": "1234567890",
      "postedAt": "2024-01-01T12:00:00Z",
      "metadata": {
        "sourceUrl": "https://example.com/article",
        "hashtags": ["#AI", "#Research"],
        "length": 245
      }
    }
  ],
  "total": 100,
  "statistics": {
    "posted": 85,
    "failed": 5,
    "draft": 10
  }
}
```

#### `POST /tweets`

新しいツイートを作成・投稿

**Request Body:**
```json
{
  "text": "🤖 AI research update...",
  "category": "research",
  "scheduled": false,
  "scheduledAt": null,
  "metadata": {
    "sourceUrl": "https://example.com/article",
    "tags": ["AI", "Research"]
  }
}
```

**Response:**
```json
{
  "id": "tweet-789",
  "status": "posted",
  "twitterId": "1234567890",
  "postedAt": "2024-01-01T12:00:00Z",
  "url": "https://twitter.com/user/status/1234567890"
}
```

#### `DELETE /tweets/{tweetId}`

ツイートを削除（Twitter APIから削除）

### コンテンツフィルタリング

#### `POST /filter/analyze`

コンテンツのAI関連度分析

**Request Body:**
```json
{
  "content": {
    "title": "Article title",
    "description": "Article description",
    "text": "Full article text"
  },
  "options": {
    "threshold": 0.7,
    "categories": ["AI", "ML", "Research"]
  }
}
```

**Response:**
```json
{
  "relevanceScore": 0.85,
  "isRelevant": true,
  "categories": ["AI", "MachineLearning"],
  "keywords": ["neural network", "transformer", "AI"],
  "confidence": 0.92
}
```

### メトリクス・統計

#### `GET /metrics`

システムメトリクス取得

**Query Parameters:**
- `timeRange` (string): 1h, 24h, 7d, 30d
- `metrics` (array): 取得するメトリクス名

**Response:**
```json
{
  "timeRange": "24h",
  "timestamp": "2024-01-01T12:00:00Z",
  "metrics": {
    "tweets_posted": {
      "value": 25,
      "change": "+15%"
    },
    "rss_items_processed": {
      "value": 150,
      "change": "+8%"
    },
    "system_uptime": {
      "value": 99.9,
      "unit": "percentage"
    }
  }
}
```

#### `GET /statistics`

システム統計情報

**Response:**
```json
{
  "period": "last_30_days",
  "tweets": {
    "total": 750,
    "successful": 720,
    "failed": 30,
    "successRate": 96.0
  },
  "feeds": {
    "totalItems": 4500,
    "filtered": 180,
    "filterRate": 4.0
  },
  "engagement": {
    "averageLikes": 12.5,
    "averageRetweets": 3.2,
    "topPerformingTweet": "tweet-123"
  }
}
```

## 📊 データモデル

### Feed Model

```typescript
interface Feed {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  lastFetch?: Date;
  itemCount: number;
  status: 'active' | 'inactive' | 'error';
  metadata: {
    tags: string[];
    priority: number;
    refreshInterval: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### Tweet Model

```typescript
interface Tweet {
  id: string;
  text: string;
  status: 'draft' | 'posted' | 'failed' | 'scheduled';
  category: string;
  twitterId?: string;
  postedAt?: Date;
  scheduledAt?: Date;
  metadata: {
    sourceUrl?: string;
    hashtags: string[];
    length: number;
    relevanceScore?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### FeedItem Model

```typescript
interface FeedItem {
  id: string;
  feedId: string;
  title: string;
  link: string;
  description?: string;
  pubDate: Date;
  category: string;
  relevanceScore: number;
  processed: boolean;
  tweetId?: string;
  createdAt: Date;
}
```

## ❌ エラーハンドリング

### エラーレスポンス形式

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request body is invalid",
    "details": {
      "field": "url",
      "reason": "Invalid URL format"
    },
    "requestId": "req-123456",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### エラーコード一覧

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | リクエストが無効 |
| `UNAUTHORIZED` | 401 | 認証が必要 |
| `FORBIDDEN` | 403 | アクセス権限なし |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `RATE_LIMITED` | 429 | レート制限に達した |
| `TWITTER_API_ERROR` | 502 | Twitter API エラー |
| `INTERNAL_ERROR` | 500 | 内部サーバーエラー |

## 🚦 レート制限

### API制限

- **一般API**: 1000リクエスト/時間
- **ツイート投稿**: 50リクエスト/時間
- **メトリクス取得**: 200リクエスト/時間

### ヘッダー

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

### Twitter API制限

- **ツイート投稿**: 300ツイート/15分
- **認証確認**: 75リクエスト/15分

## 🔔 Webhook

### 設定

```http
POST /webhooks
Content-Type: application/json

{
  "url": "https://your-server.com/webhook",
  "events": ["tweet.posted", "feed.error", "system.alert"],
  "secret": "webhook_secret_key"
}
```

### イベント

#### tweet.posted

```json
{
  "event": "tweet.posted",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "tweetId": "tweet-123",
    "twitterId": "1234567890",
    "text": "🤖 AI breakthrough...",
    "category": "research"
  }
}
```

#### feed.error

```json
{
  "event": "feed.error", 
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "feedId": "openai-blog",
    "error": "HTTP 404 Not Found",
    "url": "https://openai.com/blog/rss/"
  }
}
```

#### system.alert

```json
{
  "event": "system.alert",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "level": "warning",
    "component": "twitterClient",
    "message": "Rate limit approaching",
    "details": {
      "remaining": 10,
      "resetAt": "2024-01-01T13:00:00Z"
    }
  }
}
```

## 🛠️ SDK・ライブラリ

### JavaScript/TypeScript

```bash
npm install n8n-tweet-sdk
```

```javascript
import { N8nTweetClient } from 'n8n-tweet-sdk';

const client = new N8nTweetClient({
  baseUrl: 'https://api.your-domain.com/v1',
  apiKey: 'your-api-key'
});

// ツイート投稿
const tweet = await client.tweets.create({
  text: '🤖 AI update...',
  category: 'research'
});

// フィード一覧取得
const feeds = await client.feeds.list({
  enabled: true
});

// メトリクス取得
const metrics = await client.metrics.get({
  timeRange: '24h'
});
```

### Python

```bash
pip install n8n-tweet-client
```

```python
from n8n_tweet import N8nTweetClient

client = N8nTweetClient(
    base_url='https://api.your-domain.com/v1',
    api_key='your-api-key'
)

# ツイート投稿
tweet = client.tweets.create(
    text='🤖 AI update...',
    category='research'
)

# ヘルスチェック
health = client.health.check()
```

### cURL

```bash
# ヘルスチェック
curl -H "X-API-Key: your-api-key" \
  https://api.your-domain.com/v1/health

# ツイート投稿
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"text":"🤖 AI update...","category":"research"}' \
  https://api.your-domain.com/v1/tweets
```

## 🔧 内部API（コンポーネント間通信）

### FeedParser

```javascript
// RSS フィード解析
const feedParser = new FeedParser(config);
const result = await feedParser.parseFeed(feedConfig);
```

### ContentFilter

```javascript
// コンテンツフィルタリング
const filter = new ContentFilter(config);
const isRelevant = await filter.isAIRelated(content);
```

### TwitterClient

```javascript
// ツイート投稿
const twitter = new TwitterClient(config);
const result = await twitter.postTweet({
  text: 'Tweet content...'
});
```

### TweetHistory

```javascript
// 履歴管理
const history = new TweetHistory(config);
await history.addTweet(tweetData);
const duplicate = history.checkDuplicate(text);
```

## 📚 使用例

### 基本的なワークフロー

```javascript
// 1. RSS フィードを取得
const feeds = await client.feeds.list({ enabled: true });

// 2. 新しいアイテムを処理
for (const feed of feeds) {
  const items = await client.feeds.getItems(feed.id, { 
    since: '2024-01-01T00:00:00Z' 
  });
  
  // 3. AI関連度チェック
  for (const item of items) {
    const analysis = await client.filter.analyze({
      content: {
        title: item.title,
        description: item.description
      }
    });
    
    // 4. 関連度が高い場合ツイート作成
    if (analysis.isRelevant) {
      await client.tweets.create({
        text: generateTweet(item),
        category: analysis.categories[0]
      });
    }
  }
}
```

### 統計取得とアラート

```javascript
// メトリクス監視
const metrics = await client.metrics.get({ timeRange: '1h' });

if (metrics.tweets_posted.value < 1) {
  // アラート送信
  await sendAlert({
    level: 'warning',
    message: 'No tweets posted in the last hour'
  });
}
```

## 🔍 テスト

### APIテスト

```bash
# 統合テスト実行
npm run test:api

# 特定エンドポイントテスト
npm run test:api -- --grep "tweets"
```

### Postmanコレクション

```bash
# Postmanコレクションをインポート
curl -o n8n-tweet-api.postman_collection.json \
  https://raw.githubusercontent.com/takezou621/n8n-tweet/main/docs/postman/collection.json
```

---

**更新履歴**
- v1.0.0: 初回リリース
- v1.1.0: Webhook機能追加
- v1.2.0: メトリクス API 拡張

**サポート**
- GitHub Issues: https://github.com/takezou621/n8n-tweet/issues
- API Status: https://status.your-domain.com
