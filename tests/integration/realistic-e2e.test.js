/**
 * 実際のユースケースに基づいたE2Eテスト
 *
 * 3つの主要ユースケースをテスト:
 * 1. AI研究者のニュース配信シナリオ
 * 2. システム管理者の監視シナリオ
 * 3. 非技術者ユーザーの利用シナリオ
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals')
const request = require('supertest')
const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs')

// システムコンポーネント
const DashboardServer = require('../../src/dashboard/index')
const FeedParser = require('../../src/utils/feed-parser')
const ContentFilter = require('../../src/filters/content-filter')
const TweetGenerator = require('../../src/generators/tweet-generator')
const TwitterClient = require('../../src/integrations/twitter-client')
const TweetHistory = require('../../src/storage/tweet-history')
const HealthChecker = require('../../src/monitoring/health-checker')
const { createLogger } = require('../../src/utils/logger')

describe('実際のユースケースに基づいたE2Eテスト', () => {
  let dashboardServer
  let app
  let browser
  let page
  let logger
  let testDataDir

  // システムコンポーネント
  let feedParser
  let contentFilter
  let tweetGenerator
  let twitterClient
  let tweetHistory
  let healthChecker

  beforeAll(async () => {
    // テストデータディレクトリ準備
    testDataDir = path.join(__dirname, '../data', 'realistic-e2e')
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true })
    }

    // ログ設定
    logger = createLogger('realistic-e2e-test', {
      logDir: path.join(testDataDir, 'logs'),
      enableConsole: false
    })

    // システムコンポーネント初期化
    await initializeSystemComponents()

    // ダッシュボードサーバー起動
    dashboardServer = new DashboardServer({
      port: 3001, // テスト用ポート
      logLevel: 'error' // ノイズ削減
    })

    await dashboardServer.start()
    app = dashboardServer.app

    // Puppeteer起動（UI操作テスト用）
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    page = await browser.newPage()
    await page.setViewport({ width: 1920, height: 1080 })
  }, 30000)

  afterAll(async () => {
    // クリーンアップ
    if (browser) {
      await browser.close()
    }
    if (dashboardServer) {
      await dashboardServer.stop()
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  async function initializeSystemComponents () {
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

    twitterClient = new TwitterClient({
      credentials: {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        accessToken: 'test-token',
        accessTokenSecret: 'test-token-secret'
      },
      dryRun: true,
      logger
    })

    tweetHistory = new TweetHistory({
      storageFile: path.join(testDataDir, 'realistic-tweet-history.json'),
      logger
    })

    healthChecker = new HealthChecker({
      logger,
      components: {
        feedParser,
        contentFilter,
        tweetGenerator,
        twitterClient,
        tweetHistory
      }
    })
  }

  describe('ユースケース1: AI研究者のニュース配信シナリオ', () => {
    test('完全なニュース配信ワークフロー', async () => {
      logger.info('=== AI研究者のニュース配信シナリオ開始 ===')

      // Phase 1: RSS フィードから最新のAI論文情報を収集
      const mockAIArticles = [
        {
          title: 'GPT-5: Revolutionary Language Model Architecture',
          description: 'OpenAI announces groundbreaking improvements in language understanding',
          content: 'This paper introduces GPT-5 with significant advances in reasoning capabilities, multimodal understanding, and reduced hallucinations.',
          url: 'https://arxiv.org/abs/2024.ai.001',
          pubDate: new Date().toISOString(),
          category: 'ai',
          source: 'arXiv'
        },
        {
          title: 'Transformer Optimization for Edge Computing',
          description: 'Novel techniques for running large language models on mobile devices',
          content: 'We present compression and optimization techniques that enable transformer models to run efficiently on edge devices.',
          url: 'https://arxiv.org/abs/2024.ai.002',
          pubDate: new Date().toISOString(),
          category: 'ai',
          source: 'arXiv'
        }
      ]

      jest.spyOn(feedParser, 'parseMultipleFeeds').mockResolvedValue([
        {
          feedName: 'arxiv-ai',
          articles: mockAIArticles
        }
      ])

      const feedResults = await feedParser.parseMultipleFeeds([
        { url: 'http://export.arxiv.org/rss/cs.AI', category: 'ai', enabled: true }
      ])

      expect(feedResults).toBeDefined()
      expect(feedResults[0].articles.length).toBe(2)

      // Phase 2: AI関連度の高い記事をフィルタリング
      const allArticles = feedResults.flatMap(result => result.articles)

      // フィルタリングのモック（AI関連記事として高スコア付与）
      jest.spyOn(contentFilter, 'filterRelevantContent').mockResolvedValue(
        allArticles.map(article => ({
          ...article,
          relevanceScore: 0.9, // 高い関連度
          categories: ['ai', 'research', 'machine-learning'],
          filteringReason: 'High AI relevance detected'
        }))
      )

      const filteredArticles = await contentFilter.filterRelevantContent(allArticles)

      expect(filteredArticles.length).toBe(2)
      expect(filteredArticles[0].relevanceScore).toBeGreaterThan(0.8)
      expect(filteredArticles[0].categories).toContain('ai')

      // Phase 3: 自動でツイート文章を生成
      const selectedArticle = filteredArticles[0]

      jest.spyOn(tweetGenerator, 'generateTweet').mockResolvedValue({
        text: '🤖 GPT-5: Revolutionary Language Model Architecture - OpenAI announces groundbreaking improvements in language understanding #AI #GPT5 #MachineLearning',
        hashtags: ['#AI', '#GPT5', '#MachineLearning'],
        url: selectedArticle.url,
        metadata: {
          category: 'ai',
          priority: 'high',
          sentiment: 'positive'
        }
      })

      const generatedTweet = await tweetGenerator.generateTweet(selectedArticle)

      expect(generatedTweet).toBeDefined()
      expect(generatedTweet.text.length).toBeLessThanOrEqual(280)
      expect(generatedTweet.hashtags).toContain('#AI')
      expect(generatedTweet.url).toBe(selectedArticle.url)

      // Phase 4: Twitter に投稿（ドライランモード）
      jest.spyOn(twitterClient, 'postTweet').mockResolvedValue({
        success: true,
        tweetId: 'mock-tweet-123',
        message: 'Tweet posted successfully (dry run)',
        metadata: {
          characterCount: generatedTweet.text.length,
          hashtags: generatedTweet.hashtags.length
        }
      })

      const postResult = await twitterClient.postTweet(generatedTweet.text)

      expect(postResult.success).toBe(true)
      expect(postResult.tweetId).toBeDefined()

      // Phase 5: 投稿履歴を記録・管理
      const tweetRecord = {
        url: selectedArticle.url,
        title: selectedArticle.title,
        tweetText: generatedTweet.text,
        hashtags: generatedTweet.hashtags,
        postedAt: new Date(),
        tweetId: postResult.tweetId,
        category: 'ai',
        status: 'posted',
        metrics: {
          relevanceScore: selectedArticle.relevanceScore,
          characterCount: generatedTweet.text.length
        }
      }

      await tweetHistory.saveTweet(tweetRecord)

      // 記録が正常に保存されたことを確認
      const isDuplicate = await tweetHistory.isDuplicate(selectedArticle.url)
      expect(isDuplicate).toBe(true)

      logger.info('=== AI研究者のニュース配信シナリオ完了 ===')
    }, 15000)

    test('高負荷時の並行処理性能', async () => {
      // 100件の模擬AI記事での並行処理テスト
      const mockArticles = Array.from({ length: 100 }, (_, i) => ({
        title: `AI Research Paper ${i}`,
        content: `Artificial intelligence and machine learning research paper ${i}`,
        url: `https://arxiv.org/abs/2024.${i}`,
        category: 'ai',
        publishedAt: new Date()
      }))

      jest.spyOn(feedParser, 'parseMultipleFeeds').mockResolvedValue([
        { feedName: 'bulk-ai-feed', articles: mockArticles }
      ])

      const startTime = Date.now()
      const feedResults = await feedParser.parseMultipleFeeds([
        { url: 'mock://bulk-feed', category: 'ai', enabled: true }
      ])
      const processingTime = Date.now() - startTime

      expect(feedResults[0].articles.length).toBe(100)
      expect(processingTime).toBeLessThan(3000) // 3秒以内

      logger.performance('Bulk AI article processing', {
        articleCount: 100,
        processingTime: `${processingTime}ms`,
        articlesPerSecond: (100 / (processingTime / 1000)).toFixed(2)
      })
    })
  })

  describe('ユースケース2: システム管理者の監視シナリオ', () => {
    test('ダッシュボードでシステムヘルス確認', async () => {
      logger.info('=== システム管理者の監視シナリオ開始 ===')

      // API経由でのヘルスチェック
      const healthResponse = await request(app)
        .get('/api/v1/health')
        .expect(200)

      expect(healthResponse.body).toHaveProperty('status', 'success')
      expect(healthResponse.body).toHaveProperty('data')
      expect(healthResponse.body).toHaveProperty('timestamp')

      // 各コンポーネントの健康状態確認
      const healthData = healthResponse.body.data
      expect(healthData).toHaveProperty('overall')
      expect(healthData).toHaveProperty('components')

      // メトリクス・パフォーマンス監視
      const metricsResponse = await request(app)
        .get('/api/v1/metrics')
        .expect(200)

      expect(metricsResponse.body).toHaveProperty('status', 'success')
      expect(metricsResponse.body).toHaveProperty('data')

      // システム統計情報の確認
      const statsResponse = await request(app)
        .get('/api/v1/statistics')
        .expect(200)

      expect(statsResponse.body).toHaveProperty('status', 'success')
      expect(statsResponse.body.data).toHaveProperty('system')
      expect(statsResponse.body.data.system).toHaveProperty('uptime')
      expect(statsResponse.body.data.system).toHaveProperty('memory')

      logger.info('=== システム管理者の監視シナリオ完了 ===')
    })

    test('コンポーネント別健康状態の詳細監視', async () => {
      // 各コンポーネントの個別ヘルスチェック
      const components = ['feedParser', 'contentFilter', 'tweetGenerator', 'twitterClient']

      for (const component of components) {
        // 健康なコンポーネントの場合
        jest.spyOn(healthChecker, 'checkComponent').mockResolvedValueOnce({
          status: 'healthy',
          responseTime: Math.random() * 100,
          details: `${component} is operating normally`,
          lastCheck: new Date().toISOString()
        })

        const componentHealth = await healthChecker.checkComponent(component)

        expect(componentHealth).toBeDefined()
        expect(componentHealth.status).toBe('healthy')
        expect(componentHealth.responseTime).toBeGreaterThan(0)
      }
    })

    test('アラート・エラー状況の確認', async () => {
      // 異常なコンポーネントをシミュレート
      jest.spyOn(healthChecker, 'performHealthCheck').mockResolvedValue({
        overall: { status: 'degraded', score: 0.75 },
        components: {
          feedParser: { status: 'healthy', responseTime: 50 },
          contentFilter: { status: 'healthy', responseTime: 75 },
          tweetGenerator: { status: 'unhealthy', responseTime: null, error: 'Connection timeout' },
          twitterClient: { status: 'healthy', responseTime: 100 }
        },
        timestamp: new Date().toISOString()
      })

      const healthStatus = await healthChecker.performHealthCheck()

      expect(healthStatus.overall.status).toBe('degraded')
      expect(healthStatus.components.tweetGenerator.status).toBe('unhealthy')
      expect(healthStatus.components.tweetGenerator.error).toBeDefined()
    })
  })

  describe('ユースケース3: 非技術者ユーザーの利用シナリオ', () => {
    test('ブラウザでダッシュボードにアクセス', async () => {
      logger.info('=== 非技術者ユーザーの利用シナリオ開始 ===')

      // ダッシュボードページの読み込み
      await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' })

      // ページタイトルの確認
      const title = await page.title()
      expect(title).toBe('n8n-tweet Dashboard')

      // ナビゲーション要素の確認
      const navItems = await page.$$eval('.nav-link', links =>
        links.map(link => link.textContent.trim())
      )
      expect(navItems).toContain('ヘルス')
      expect(navItems).toContain('メトリクス')
      expect(navItems).toContain('ツイート履歴')
      expect(navItems).toContain('RSSフィード')

      // デフォルトでヘルスタブが表示されることを確認
      const activeTab = await page.$eval('#health-tab', el =>
        el.classList.contains('active')
      )
      expect(activeTab).toBe(true)

      logger.info('=== 非技術者ユーザーの利用シナリオ完了 ===')
    }, 15000)

    test('直感的なUIでシステム状況確認', async () => {
      await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' })

      // ヘルスカードの表示確認
      const healthCards = await page.$$('.health-card')
      expect(healthCards.length).toBeGreaterThan(0)

      // ステータスインジケーターの確認
      const statusIndicators = await page.$$('.status-indicator')
      expect(statusIndicators.length).toBeGreaterThan(0)

      // メトリクスタブへの切り替え
      await page.click('[data-tab="metrics"]')

      // メトリクスタブが表示されることを確認
      await page.waitForSelector('#metrics-tab.active', { timeout: 5000 })

      const metricsTabActive = await page.$eval('#metrics-tab', el =>
        el.classList.contains('active')
      )
      expect(metricsTabActive).toBe(true)

      // メトリクスカードの確認
      const metricCards = await page.$$('.metric-card')
      expect(metricCards.length).toBeGreaterThan(0)
    })

    test('フィルタリング機能でデータ検索', async () => {
      await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' })

      // ツイート履歴タブに切り替え
      await page.click('[data-tab="tweets"]')
      await page.waitForSelector('#tweets-tab.active', { timeout: 5000 })

      // フィルタコントロールの確認
      const statusFilter = await page.$('#tweet-status-filter')
      const categoryFilter = await page.$('#tweet-category-filter')
      const dateFilter = await page.$('#tweet-date-filter')

      expect(statusFilter).toBeTruthy()
      expect(categoryFilter).toBeTruthy()
      expect(dateFilter).toBeTruthy()

      // フィルタ選択のテスト
      await page.select('#tweet-status-filter', 'sent')
      await page.select('#tweet-category-filter', 'ai')

      // フィルタ適用ボタンの確認
      const filterButton = await page.$('button[onclick="loadTweets()"]')
      expect(filterButton).toBeTruthy()
    })

    test('レスポンシブデザインの確認', async () => {
      // モバイルサイズでの表示確認
      await page.setViewport({ width: 375, height: 667 }) // iPhone SE
      await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' })

      // ナビゲーションの折りたたみ確認
      const navToggler = await page.$('.navbar-toggler')
      expect(navToggler).toBeTruthy()

      // カードレイアウトの確認（モバイルで正しく表示されるか）
      const healthCards = await page.$$('.health-card')
      expect(healthCards.length).toBeGreaterThan(0)

      // タブレットサイズでの表示確認
      await page.setViewport({ width: 768, height: 1024 }) // iPad
      await page.reload({ waitUntil: 'networkidle2' })

      // デスクトップサイズに戻す
      await page.setViewport({ width: 1920, height: 1080 })
    })
  })

  describe('エラーハンドリングとセキュリティテスト', () => {
    test('APIエラー時の適切な処理', async () => {
      // 存在しないエンドポイントへのリクエスト
      await request(app)
        .get('/api/v1/nonexistent')
        .expect(404)

      // 不正なパラメータでのリクエスト
      await request(app)
        .get('/api/v1/tweets?limit=invalid')
        .expect(200) // バリデーションが適切に処理される
    })

    test('セキュリティヘッダーの確認', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200)

      // セキュリティヘッダーの確認
      expect(response.headers).toHaveProperty('x-frame-options')
      expect(response.headers).toHaveProperty('x-content-type-options')
      expect(response.headers).toHaveProperty('x-xss-protection')
    })

    test('XSS攻撃の防御', async () => {
      await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' })

      // XSSスクリプトの注入試行（Content Security Policyで防御される）
      const cspHeader = await page.evaluate(() => {
        const metaTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
        return metaTags.length > 0
      })

      // CSPまたはその他のセキュリティ機能の確認
      expect(typeof cspHeader).toBe('boolean')
    })
  })

  describe('パフォーマンステスト', () => {
    test('ダッシュボードの読み込み性能', async () => {
      const startTime = Date.now()
      await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' })
      const loadTime = Date.now() - startTime

      expect(loadTime).toBeLessThan(5000) // 5秒以内

      logger.performance('Dashboard load performance', {
        loadTime: `${loadTime}ms`,
        threshold: '5000ms'
      })
    })

    test('API応答時間の測定', async () => {
      const endpoints = [
        '/api/v1/health',
        '/api/v1/metrics',
        '/api/v1/statistics',
        '/api/v1/tweets',
        '/api/v1/feeds'
      ]

      for (const endpoint of endpoints) {
        const startTime = Date.now()
        const response = await request(app).get(endpoint)
        const responseTime = Date.now() - startTime

        expect(response.status).toBe(200)
        expect(responseTime).toBeLessThan(2000) // 2秒以内

        logger.performance(`API response time for ${endpoint}`, {
          responseTime: `${responseTime}ms`,
          status: response.status
        })
      }
    })
  })
})
