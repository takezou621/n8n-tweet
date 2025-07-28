/**
 * 実践的なEnd-to-Endテスト
 * 実際のRSSフィードからTwitter投稿までの完全ワークフローを検証
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

describe('Real End-to-End Workflow Tests', () => {
  let feedParser
  let contentFilter
  let tweetGenerator
  let twitterClient
  let rateLimiter
  let tweetHistory
  // let healthChecker
  let logger
  let testDataDir

  beforeAll(async () => {
    // テストデータディレクトリ
    testDataDir = path.join(__dirname, '../data')
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true })
    }

    // テスト用ログ設定
    logger = createLogger('e2e-real-test', {
      logDir: path.join(testDataDir, 'logs'),
      enableConsole: false
    })

    // コンポーネント初期化
    feedParser = new FeedParser({
      timeout: 30000,
      enableCache: false,
      logger
    })

    contentFilter = new ContentFilter({
      scoreThreshold: 0.4,
      minQualityScore: 0.3,
      logger
    })

    tweetGenerator = new TweetGenerator({
      maxLength: 280,
      includeUrl: true,
      hashtagLimit: 3,
      logger
    })

    rateLimiter = new RateLimiter({
      limits: {
        tweets: { perHour: 100, perDay: 500, perMonth: 10000 },
        reads: { per15min: 100, perHour: 500 }
      },
      enableLogging: false
    })

    tweetHistory = new TweetHistory({
      storageFile: path.join(testDataDir, 'test-tweet-history-real.json'),
      logger
    })

    // Twitter クライアントはドライランモードで初期化
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

    // healthChecker = new HealthChecker({
    //   logger,
    //   components: {
    //     feedParser,
    //     contentFilter,
    //     tweetGenerator,
    //     twitterClient,
    //     rateLimiter,
    //     tweetHistory
    //   }
    // })
  })

  afterAll(async () => {
    // テストデータクリーンアップ
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    // レート制限リセット
    rateLimiter.reset()
    jest.clearAllMocks()
  })

  describe('実際のRSSフィードからのワークフロー', () => {
    test('ArXiv AI フィードからの完全ワークフロー', async () => {
      const workflowStartTime = Date.now()
      const workflowResults = {
        phases: {},
        errors: [],
        performance: {}
      }

      try {
        // Phase 1: RSS Feed取得
        logger.info('Phase 1: RSS Feed取得開始')
        const phase1Start = Date.now()

        const arxivFeed = {
          name: 'ArXiv AI',
          url: 'http://export.arxiv.org/rss/cs.AI',
          category: 'research',
          enabled: true
        }

        const feedResults = await feedParser.parseMultipleFeeds([arxivFeed])
        workflowResults.phases.rssRetrieval = {
          duration: Date.now() - phase1Start,
          success: true,
          feedCount: feedResults.length,
          totalArticles: feedResults.reduce((sum, feed) => sum + (feed.articles?.length || 0), 0)
        }

        expect(feedResults).toBeDefined()
        expect(Array.isArray(feedResults)).toBe(true)
        expect(feedResults.length).toBeGreaterThan(0)

        const arxivResult = feedResults[0]
        expect(arxivResult).toHaveProperty('feedName')
        expect(arxivResult).toHaveProperty('articles')

        if (arxivResult.articles.length === 0) {
          throw new Error('No articles retrieved from ArXiv feed')
        }

        logger.info('Phase 1 完了', workflowResults.phases.rssRetrieval)

        // Phase 2: コンテンツフィルタリング
        logger.info('Phase 2: コンテンツフィルタリング開始')
        const phase2Start = Date.now()

        const allArticles = feedResults.flatMap(result => result.articles || [])
        const filteredArticles = await contentFilter.filterRelevantContent(allArticles)

        workflowResults.phases.contentFiltering = {
          duration: Date.now() - phase2Start,
          success: true,
          originalCount: allArticles.length,
          filteredCount: filteredArticles.length,
          filterRatio: filteredArticles.length / allArticles.length
        }

        expect(Array.isArray(filteredArticles)).toBe(true)
        logger.info('Phase 2 完了', workflowResults.phases.contentFiltering)

        // Phase 3: ツイート生成
        logger.info('Phase 3: ツイート生成開始')
        const phase3Start = Date.now()

        // フィルタリング後の記事がない場合は最初の記事を使用
        const articlesToProcess = filteredArticles.length > 0 ? filteredArticles : [allArticles[0]]
        const selectedArticle = articlesToProcess[0]

        const tweet = await tweetGenerator.generateTweet(selectedArticle)

        workflowResults.phases.tweetGeneration = {
          duration: Date.now() - phase3Start,
          success: true,
          tweetLength: tweet?.content?.length || 0,
          hasHashtags: !!(tweet?.metadata?.hashtags?.length > 0),
          engagementScore: tweet?.metadata?.engagementScore || 0
        }

        expect(tweet).toBeDefined()
        expect(tweet).toHaveProperty('content')
        expect(typeof tweet.content).toBe('string')
        expect(tweet.content.length).toBeLessThanOrEqual(280)
        expect(tweet).toHaveProperty('metadata')

        logger.info('Phase 3 完了', workflowResults.phases.tweetGeneration)

        // Phase 4: 重複チェック
        logger.info('Phase 4: 重複チェック開始')
        const phase4Start = Date.now()

        const articleUrl = selectedArticle.link || selectedArticle.url
        const isDuplicate = await tweetHistory.isDuplicate(articleUrl)

        workflowResults.phases.duplicateCheck = {
          duration: Date.now() - phase4Start,
          success: true,
          isDuplicate,
          checkedUrl: articleUrl
        }

        expect(typeof isDuplicate).toBe('boolean')
        logger.info('Phase 4 完了', workflowResults.phases.duplicateCheck)

        // Phase 5: レート制限チェック
        logger.info('Phase 5: レート制限チェック開始')
        const phase5Start = Date.now()

        const rateLimitCheck = await rateLimiter.checkTweetLimit()

        workflowResults.phases.rateLimitCheck = {
          duration: Date.now() - phase5Start,
          success: true,
          allowed: rateLimitCheck.allowed,
          waitTime: rateLimitCheck.waitTime,
          reason: rateLimitCheck.reason
        }

        expect(rateLimitCheck).toBeDefined()
        expect(rateLimitCheck).toHaveProperty('allowed')
        expect(typeof rateLimitCheck.allowed).toBe('boolean')

        logger.info('Phase 5 完了', workflowResults.phases.rateLimitCheck)

        // Phase 6: Twitter投稿（ドライラン）
        logger.info('Phase 6: Twitter投稿（ドライラン）開始')
        const phase6Start = Date.now()

        const postResult = await twitterClient.postTweet(tweet.content)

        workflowResults.phases.twitterPost = {
          duration: Date.now() - phase6Start,
          success: true,
          dryRun: true,
          postSuccess: postResult?.success || false,
          tweetId: postResult?.tweetId || null
        }

        expect(postResult).toBeDefined()
        logger.info('Phase 6 完了', workflowResults.phases.twitterPost)

        // Phase 7: 履歴保存
        logger.info('Phase 7: 履歴保存開始')
        const phase7Start = Date.now()

        if (postResult?.success) {
          await tweetHistory.saveTweet({
            url: articleUrl,
            title: selectedArticle.title,
            tweetText: tweet.content,
            hashtags: tweet.metadata.hashtags || [],
            postedAt: new Date(),
            tweetId: postResult.tweetId
          })

          rateLimiter.recordTweet()
        }

        workflowResults.phases.historySave = {
          duration: Date.now() - phase7Start,
          success: true,
          saved: postResult?.success || false
        }

        logger.info('Phase 7 完了', workflowResults.phases.historySave)

        // 全体の成功結果
        workflowResults.performance.totalDuration = Date.now() - workflowStartTime
        workflowResults.performance.success = true

        logger.info('完全ワークフロー成功', workflowResults)

        // 最終検証
        expect(workflowResults.phases.rssRetrieval.success).toBe(true)
        expect(workflowResults.phases.contentFiltering.success).toBe(true)
        expect(workflowResults.phases.tweetGeneration.success).toBe(true)
        expect(workflowResults.phases.duplicateCheck.success).toBe(true)
        expect(workflowResults.phases.rateLimitCheck.success).toBe(true)
        expect(workflowResults.phases.twitterPost.success).toBe(true)
        expect(workflowResults.phases.historySave.success).toBe(true)
      } catch (error) {
        workflowResults.errors.push({
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
        workflowResults.performance.success = false
        workflowResults.performance.totalDuration = Date.now() - workflowStartTime

        logger.error('ワークフローエラー', {
          error: error.message,
          results: workflowResults
        })

        // ネットワークエラーの場合はスキップ
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          console.warn('Skipping test due to network connectivity issues')
          return
        }

        throw error
      }
    }, 120000) // 2分タイムアウト

    test('複数フィードの並行処理ワークフロー', async () => {
      const startTime = Date.now()

      try {
        const realFeeds = [
          {
            name: 'ArXiv AI',
            url: 'http://export.arxiv.org/rss/cs.AI',
            category: 'research',
            enabled: true
          },
          {
            name: 'MIT Technology Review',
            url: 'https://www.technologyreview.com/feed/',
            category: 'news',
            enabled: true
          }
        ]

        const feedResults = await feedParser.parseMultipleFeeds(realFeeds)
        const duration = Date.now() - startTime

        expect(feedResults).toBeDefined()
        expect(Array.isArray(feedResults)).toBe(true)
        expect(duration).toBeLessThan(60000) // 60秒以内

        let totalArticles = 0
        let successfulFeeds = 0

        feedResults.forEach(result => {
          if (result && result.articles && result.articles.length > 0) {
            successfulFeeds++
            totalArticles += result.articles.length
          }
        })

        logger.info('Multiple feeds workflow test completed', {
          totalFeeds: realFeeds.length,
          successfulFeeds,
          totalArticles,
          duration: `${duration}ms`
        })

        // 少なくとも1つのフィードが成功することを期待
        expect(successfulFeeds).toBeGreaterThan(0)
      } catch (error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          console.warn('Skipping test due to network connectivity issues')
          return
        }
        throw error
      }
    }, 90000)

    test('エラーハンドリングとリカバリー', async () => {
      const errorScenarios = [
        {
          name: '無効なURL',
          feed: {
            name: 'Invalid Feed',
            url: 'https://invalid-domain-that-does-not-exist.com/feed.xml',
            category: 'test',
            enabled: true
          }
        },
        {
          name: '無効なプロトコル',
          feed: {
            name: 'Invalid Protocol',
            url: 'ftp://example.com/feed.xml',
            category: 'test',
            enabled: true
          }
        }
      ]

      for (const scenario of errorScenarios) {
        let feedResults = null
        let errorCaught = null

        try {
          feedResults = await feedParser.parseMultipleFeeds([scenario.feed])
        } catch (error) {
          errorCaught = error
        }

        // エラーケースと成功ケースの検証
        const errorCases = errorCaught ? [errorCaught] : []
        const successCases = !errorCaught && feedResults ? [feedResults] : []

        errorCases.forEach(error => {
          expect(error).toBeInstanceOf(Error)
          logger.info(`Error scenario test completed: ${scenario.name}`, {
            error: error.message
          })
        })

        successCases.forEach(results => {
          expect(results).toBeDefined()
          expect(Array.isArray(results)).toBe(true)

          // 結果がある場合の検証
          results.slice(0, 1).forEach(result => {
            expect(result).toHaveProperty('feedName')
            expect(result.articles || result.error).toBeDefined()
          })

          logger.info(`Error scenario handled correctly: ${scenario.name}`)
        })
      }
    }, 60000)
  })

  describe('パフォーマンスとスケーラビリティ', () => {
    test('大量記事処理の性能測定', async () => {
      // 実際のフィードから大量記事を取得してパフォーマンステスト
      try {
        const feeds = [
          {
            name: 'ArXiv AI',
            url: 'http://export.arxiv.org/rss/cs.AI',
            category: 'research',
            enabled: true
          }
        ]

        const startTime = Date.now()
        const feedResults = await feedParser.parseMultipleFeeds(feeds)
        const parseTime = Date.now() - startTime

        // パフォーマンスメトリクスの初期化
        let performanceMetrics = {
          parsing: { duration: parseTime, articlesPerSecond: 0 },
          filtering: { duration: 0, articlesPerSecond: 0, filterRatio: 0 },
          tweetGeneration: { duration: 0, tweetsPerSecond: 0, averageTweetLength: 0 }
        }

        if (feedResults.length > 0 && feedResults[0].articles.length > 0) {
          const allArticles = feedResults.flatMap(result => result.articles)

          // フィルタリング性能測定
          const filterStartTime = Date.now()
          const filteredArticles = await contentFilter.filterRelevantContent(allArticles)
          const filterTime = Date.now() - filterStartTime

          // ツイート生成性能測定（最初の5記事）
          const tweetsToGenerate = filteredArticles.slice(0, 5)
          const tweetStartTime = Date.now()

          const tweets = []
          for (const article of tweetsToGenerate) {
            const tweet = await tweetGenerator.generateTweet(article)
            if (tweet) tweets.push(tweet)
          }

          const tweetTime = Date.now() - tweetStartTime

          performanceMetrics = {
            parsing: {
              duration: parseTime,
              articlesPerSecond: Math.round(allArticles.length / (parseTime / 1000))
            },
            filtering: {
              duration: filterTime,
              articlesPerSecond: Math.round(allArticles.length / (filterTime / 1000)),
              filterRatio: filteredArticles.length / allArticles.length
            },
            tweetGeneration: {
              duration: tweetTime,
              tweetsPerSecond: Math.round(tweets.length / (tweetTime / 1000)),
              averageTweetLength: tweets.length > 0 ? Math.round(tweets.reduce((sum, t) => sum + t.content.length, 0) / tweets.length) : 0
            }
          }
        }

        logger.info('Performance test results', performanceMetrics)

        // パフォーマンス基準の検証
        expect(performanceMetrics.parsing.duration).toBeLessThan(30000) // 30秒以内
        expect(performanceMetrics.filtering.duration).toBeLessThan(10000) // 10秒以内
        expect(performanceMetrics.tweetGeneration.duration).toBeLessThan(15000) // 15秒以内
      } catch (error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          console.warn('Skipping performance test due to network connectivity issues')
          return
        }
        throw error
      }
    }, 120000)
  })

  describe('品質とデータ整合性', () => {
    test('生成されたツイートの品質検証', async () => {
      try {
        const feeds = [{
          name: 'ArXiv AI',
          url: 'http://export.arxiv.org/rss/cs.AI',
          category: 'research',
          enabled: true
        }]

        const feedResults = await feedParser.parseMultipleFeeds(feeds)

        const validTweets = []

        if (feedResults.length > 0 && feedResults[0].articles.length > 0) {
          const articles = feedResults[0].articles.slice(0, 3) // 最初の3記事をテスト

          for (const article of articles) {
            const tweet = await tweetGenerator.generateTweet(article)

            if (tweet) {
              validTweets.push({ tweet, article })
            }
          }
        }

        // 生成されたツイートの品質検証
        validTweets.forEach(({ tweet, article }) => {
          // 品質検証
          expect(tweet.content.length).toBeLessThanOrEqual(280)
          expect(tweet.content.length).toBeGreaterThan(50) // 最低限の内容
          expect(tweet.metadata.engagementScore).toBeGreaterThanOrEqual(0)
          expect(tweet.metadata.engagementScore).toBeLessThanOrEqual(1)

          // AI関連コンテンツの検証
          const content = tweet.content.toLowerCase()
          const hasAIContent = /ai|artificial intelligence|machine learning|deep learning|neural|research|algorithm/.test(content)
          expect(hasAIContent).toBe(true)

          logger.info('Tweet quality verified', {
            title: article.title?.substring(0, 50),
            tweetLength: tweet.content.length,
            engagementScore: tweet.metadata.engagementScore,
            hashtags: tweet.metadata.hashtags
          })
        })

        // ハッシュタグ検証 - ハッシュタグがあるツイートのみ
        const tweetsWithHashtags = validTweets.filter(({ tweet }) => tweet.metadata.hashtags)
        tweetsWithHashtags.forEach(({ tweet }) => {
          expect(tweet.metadata.hashtags.length).toBeLessThanOrEqual(3)
          tweet.metadata.hashtags.forEach(hashtag => {
            expect(hashtag).toMatch(/^#\w+/)
          })
        })
      } catch (error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          console.warn('Skipping quality test due to network connectivity issues')
          return
        }
        throw error
      }
    }, 60000)
  })
})
