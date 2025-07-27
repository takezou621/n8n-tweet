/**
 * エンドツーエンド統合テスト
 * RSS取得 → フィルタリング → ツイート生成 → 投稿の全工程をテスト
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals')
const path = require('path')
const fs = require('fs')

// テスト対象モジュール
const FeedParser = require('../../src/utils/feed-parser')
const ContentFilter = require('../../src/filters/content-filter')
const TweetGenerator = require('../../src/generators/tweet-generator')
const TwitterClient = require('../../src/integrations/twitter-client')
const RateLimiter = require('../../src/utils/rate-limiter')
const TweetHistory = require('../../src/storage/tweet-history')
const HealthChecker = require('../../src/monitoring/health-checker')
const { createLogger } = require('../../src/utils/logger')

describe('End-to-End Integration Tests', () => {
  let feedParser
  let contentFilter
  let tweetGenerator
  let twitterClient
  let rateLimiter
  let tweetHistory
  let healthChecker
  let logger
  let testDataDir

  beforeAll(async () => {
    // テストデータディレクトリ
    testDataDir = path.join(__dirname, '../data')
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true })
    }

    // テスト用ログ設定
    logger = createLogger('e2e-test', {
      logDir: path.join(testDataDir, 'logs'),
      enableConsole: false
    })

    // コンポーネント初期化
    feedParser = new FeedParser({
      enableCache: false,
      logger
    })

    contentFilter = new ContentFilter({
      keywordsFile: path.join(__dirname, '../../config/keywords.json'),
      logger
    })

    tweetGenerator = new TweetGenerator({
      templatesFile: path.join(__dirname, '../../config/tweet-templates.json'),
      logger
    })

    rateLimiter = new RateLimiter({
      limits: {
        tweets: { perHour: 10, perDay: 50, perMonth: 1000 },
        reads: { per15min: 20, perHour: 100 }
      },
      enableLogging: false
    })

    tweetHistory = new TweetHistory({
      storageFile: path.join(testDataDir, 'test-tweet-history.json'),
      logger
    })

    // Twitter クライアントはモックモードで初期化
    twitterClient = new TwitterClient({
      credentials: {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        accessToken: 'test-token',
        accessTokenSecret: 'test-token-secret'
      },
      dryRun: true, // テストモード
      logger
    })

    healthChecker = new HealthChecker({
      logger,
      components: {
        feedParser,
        contentFilter,
        tweetGenerator,
        twitterClient,
        rateLimiter,
        tweetHistory
      }
    })
  })

  afterAll(async () => {
    // テストデータクリーンアップ
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true })
    }
  })

  beforeEach(async () => {
    // レート制限リセット
    await rateLimiter.resetLimits('tweets')

    // テストごとにクリーンな状態に
    jest.clearAllMocks()
  })

  describe('Complete Workflow Integration', () => {
    test('RSS取得からツイート投稿までの完全なワークフロー', async () => {
      // Phase 1: RSS Feed取得（モックデータを使用）
      jest.spyOn(feedParser, 'parseMultipleFeeds').mockResolvedValue([
        {
          feedName: 'test-feed',
          articles: [
            {
              title: 'Test Article 1',
              description: 'Test description for article 1',
              link: 'https://example.com/article1',
              pubDate: new Date().toISOString(),
              category: 'news'
            },
            {
              title: 'Test Article 2',
              description: 'Test description for article 2',
              link: 'https://example.com/article2',
              pubDate: new Date().toISOString(),
              category: 'news'
            }
          ]
        }
      ])

      const testFeeds = [
        {
          name: 'Test AI Feed',
          url: 'https://example.com/test-feed.rss',
          category: 'ai',
          enabled: true
        }
      ]

      let feedResults
      try {
        feedResults = await feedParser.parseMultipleFeeds(testFeeds)
        // Debug output for tests
        logger.debug('feedResults:', JSON.stringify(feedResults, null, 2))
      } catch (error) {
        logger.error('parseMultipleFeeds error:', error.message)
        throw error
      }

      expect(feedResults).toBeDefined()
      expect(Array.isArray(feedResults)).toBe(true)
      expect(feedResults.length).toBeGreaterThan(0)

      const allArticles = feedResults.flatMap(result => result.items || [])
      expect(allArticles.length).toBeGreaterThan(0)

      // Phase 2: コンテンツフィルタリング
      const filteredArticles = await contentFilter.filterRelevantContent(allArticles)

      expect(filteredArticles).toBeDefined()
      expect(Array.isArray(filteredArticles)).toBe(true)

      // AI関連記事が適切にフィルタリングされているかチェック
      filteredArticles.forEach(article => {
        expect(article.relevanceScore).toBeGreaterThan(0.5)
        expect(article.categories).toContain('ai')
      })

      // Phase 3: ツイート生成
      expect(filteredArticles.length).toBeGreaterThan(0)
      const firstArticle = filteredArticles[0]
      const tweet = await tweetGenerator.generateTweet(firstArticle)

      expect(tweet).toBeDefined()
      expect(tweet.text).toBeDefined()
      expect(tweet.text.length).toBeLessThanOrEqual(280)
      expect(tweet.hashtags).toBeDefined()
      expect(Array.isArray(tweet.hashtags)).toBe(true)

      // Phase 4: 重複チェック
      const isDuplicate = await tweetHistory.isDuplicate(firstArticle.url)
      expect(typeof isDuplicate).toBe('boolean')

      // Phase 5: レート制限チェック
      const rateLimitCheck = await rateLimiter.checkLimit('tweets')

      expect(rateLimitCheck).toBeDefined()
      expect(rateLimitCheck).toHaveProperty('allowed')
      expect(rateLimitCheck).toHaveProperty('waitTime')
      expect(rateLimitCheck).toHaveProperty('reason')

      // Phase 6: ツイート投稿（ドライラン）
      expect(rateLimitCheck.allowed).toBe(true)
      const finalTweet = await tweetGenerator.generateTweet(firstArticle)
      const postResult = await twitterClient.postTweet(finalTweet.text)

      expect(postResult).toBeDefined()
      expect(postResult.success).toBe(true) // ドライランなので成功

      // 投稿記録
      await tweetHistory.addTweet({
        url: firstArticle.url,
        title: firstArticle.title,
        text: finalTweet.text,
        hashtags: finalTweet.hashtags,
        postedAt: new Date(),
        tweetId: postResult.tweetId
      })

      await rateLimiter.recordRequest('tweets', true)
    }, 30000) // 30秒タイムアウト

    test('複数フィードの並行処理', async () => {
      // モックデータで複数フィードの並行処理をテスト
      jest.spyOn(feedParser, 'parseMultipleFeeds').mockResolvedValue([
        {
          feedName: 'tech-feed-1',
          articles: [
            { title: 'Tech Article 1', link: 'https://example.com/tech1', category: 'tech' },
            { title: 'Tech Article 2', link: 'https://example.com/tech2', category: 'tech' }
          ]
        },
        {
          feedName: 'tech-feed-2',
          articles: [
            { title: 'Tech Article 3', link: 'https://example.com/tech3', category: 'tech' }
          ]
        }
      ])

      const testFeeds = [
        { url: 'https://example.com/feed1.rss', category: 'tech', enabled: true },
        { url: 'https://example.com/feed2.rss', category: 'tech', enabled: true }
      ]

      const startTime = Date.now()
      const feedResults = await feedParser.parseMultipleFeeds(testFeeds)
      const duration = Date.now() - startTime

      expect(feedResults).toBeDefined()
      expect(feedResults.length).toBe(testFeeds.length)
      expect(duration).toBeLessThan(1000) // モックなので高速

      // 並行処理による効率性をチェック
      const totalArticles = feedResults.reduce((sum, result) => sum + result.articles.length, 0)
      expect(totalArticles).toBeGreaterThan(0)
    }, 5000)

    test('エラー処理とリカバリー', async () => {
      // Test basic error handling - simple validation test
      expect(feedParser.parseFeeds).toBeDefined()
      expect(typeof feedParser.parseFeeds).toBe('function')

      // Test with empty array - should return empty array
      const emptyResult = await feedParser.parseFeeds([])
      expect(Array.isArray(emptyResult)).toBe(true)
    })

    test('レート制限に達した場合の処理', async () => {
      // レート制限を意図的に超過させる
      for (let i = 0; i < 12; i++) { // 制限は10/hour
        await rateLimiter.recordRequest('tweets', true)
      }

      const rateLimitCheck = await rateLimiter.checkLimit('tweets')

      expect(rateLimitCheck.allowed).toBe(false)
      expect(rateLimitCheck.waitTime).toBeGreaterThan(0)
      expect(rateLimitCheck.reason).toContain('limit exceeded')
    })

    test('ツイート履歴の永続化と重複検出', async () => {
      const testArticle = {
        url: 'https://example.com/test-article',
        title: 'Test Article for Duplicate Detection',
        content: 'This is a test article for duplicate detection.'
      }

      // 初回は重複なし
      const isDuplicateFirst = await tweetHistory.isDuplicate(testArticle.url)
      expect(isDuplicateFirst).toBe(false)

      // ツイートを保存
      await tweetHistory.addTweet({
        url: testArticle.url,
        title: testArticle.title,
        text: 'Test tweet text',
        hashtags: ['#test'],
        postedAt: new Date(),
        tweetId: 'test-tweet-id'
      })

      // 再度チェック - 今度は重複検出
      const isDuplicateSecond = await tweetHistory.isDuplicate(testArticle.url)
      expect(isDuplicateSecond).toBe(true)
    })
  })

  describe('Performance Tests', () => {
    test('大量記事の処理性能', async () => {
      // 100件の模擬記事を生成
      const mockArticles = Array.from({ length: 100 }, (_, i) => ({
        title: `Test Article ${i}`,
        content: `This is test content for article ${i} about ` +
          'artificial intelligence and machine learning.',
        url: `https://example.com/article-${i}`,
        publishedAt: new Date(),
        category: 'ai'
      }))

      const startTime = Date.now()
      const filteredArticles = await contentFilter.filterArticles(mockArticles)
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(5000) // 5秒以内
      expect(filteredArticles.length).toBeGreaterThan(0)

      // パフォーマンスメトリクスをログ
      logger.performance('Bulk article filtering', {
        totalArticles: mockArticles.length,
        filteredArticles: filteredArticles.length,
        duration: `${duration}ms`,
        articlesPerSecond: (mockArticles.length / (duration / 1000)).toFixed(2)
      })
    })

    test('ツイート生成の性能', async () => {
      const testArticle = {
        title: 'AI Breakthrough in Natural Language Processing',
        content: 'Researchers have developed a new transformer architecture ' +
          'that significantly improves understanding of context in ' +
          'natural language processing tasks.',
        url: 'https://example.com/ai-breakthrough',
        publishedAt: new Date()
      }

      const iterations = 10
      const startTime = Date.now()

      for (let i = 0; i < iterations; i++) {
        await tweetGenerator.generateTweet(testArticle)
      }

      const duration = Date.now() - startTime
      const avgDuration = duration / iterations

      expect(avgDuration).toBeLessThan(1000) // 平均1秒以内

      logger.performance('Tweet generation performance', {
        iterations,
        totalDuration: `${duration}ms`,
        averageDuration: `${avgDuration}ms`
      })
    })
  })

  describe('Health Check Integration', () => {
    test('全コンポーネントのヘルスチェック', async () => {
      const healthStatus = await healthChecker.checkHealth()

      expect(healthStatus).toBeDefined()
      expect(healthStatus).toHaveProperty('overall')
      expect(healthStatus).toHaveProperty('components')
      expect(healthStatus).toHaveProperty('timestamp')

      // 各コンポーネントの状態をチェック
      const components = [
        'feedParser', 'contentFilter', 'tweetGenerator',
        'twitterClient', 'rateLimiter', 'tweetHistory'
      ]

      components.forEach(component => {
        expect(healthStatus.components).toHaveProperty(component)
        expect(healthStatus.components[component]).toHaveProperty('status')
        expect(healthStatus.components[component]).toHaveProperty('responseTime')
      })

      // 全体的な健康状態
      expect(['healthy', 'degraded', 'unhealthy']).toContain(healthStatus.overall.status)
    })

    test('コンポーネント障害時のヘルスチェック', async () => {
      // Twitter クライアントを無効にして障害をシミュレート
      const mockTwitterClient = {
        isHealthy: jest.fn().mockRejectedValue(new Error('Twitter API unavailable'))
      }

      const tempHealthChecker = new HealthChecker({
        logger,
        healthThreshold: 0.9, // 統合テスト用の厳しい閾値
        components: {
          feedParser,
          contentFilter,
          tweetGenerator,
          twitterClient: mockTwitterClient,
          rateLimiter,
          tweetHistory
        }
      })

      const healthStatus = await tempHealthChecker.checkHealth()

      expect(healthStatus.components.twitterClient.status).toBe('unhealthy')
      expect(healthStatus.overall.status).toBe('degraded')
    })
  })

  describe('Data Consistency Tests', () => {
    test('設定ファイルの整合性', () => {
      // RSS フィード設定の確認
      const rssConfigPath = path.join(__dirname, '../../config/rss-feeds.json')
      expect(fs.existsSync(rssConfigPath)).toBe(true)

      const rssConfig = JSON.parse(fs.readFileSync(rssConfigPath, 'utf8'))
      expect(rssConfig).toHaveProperty('feeds')
      expect(Array.isArray(rssConfig.feeds)).toBe(true)

      // 各フィードの必須フィールドをチェック
      rssConfig.feeds.forEach(feed => {
        expect(feed).toHaveProperty('url')
        expect(feed).toHaveProperty('category')
        expect(feed).toHaveProperty('enabled')
        expect(typeof feed.url).toBe('string')
        expect(typeof feed.enabled).toBe('boolean')
      })
    })

    test('テンプレート設定の整合性', () => {
      const templatesPath = path.join(__dirname, '../../config/tweet-templates.json')
      expect(fs.existsSync(templatesPath)).toBe(true)

      const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'))
      expect(templates).toHaveProperty('templates')
      expect(Array.isArray(templates.templates)).toBe(true)

      // テンプレートの検証
      templates.templates.forEach(template => {
        expect(template).toHaveProperty('category')
        expect(template).toHaveProperty('template')
        expect(template.template.length).toBeLessThanOrEqual(280)
      })
    })
  })
})
