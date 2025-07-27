/**
 * パフォーマンス・負荷テスト
 * システムの性能限界とボトルネックを特定
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals')
const path = require('path')
const fs = require('fs')

// テスト対象モジュール
const FeedParser = require('../../src/utils/feed-parser')
const ContentFilter = require('../../src/filters/content-filter')
const TweetGenerator = require('../../src/generators/tweet-generator')
// const TwitterClient = require('../../src/integrations/twitter-client')
const RateLimiter = require('../../src/utils/rate-limiter')
const TweetHistory = require('../../src/storage/tweet-history')
const { createLogger } = require('../../src/utils/logger')

describe('Performance and Load Tests', () => {
  let feedParser
  let contentFilter
  let tweetGenerator
  let tweetHistory
  let rateLimiter
  let logger
  let performanceMetrics

  beforeAll(async () => {
    // パフォーマンステスト用ログ設定
    logger = createLogger('performance-test', {
      logDir: path.join(__dirname, '../data/performance-logs'),
      enableConsole: false
    })

    // コンポーネント初期化
    feedParser = new FeedParser({
      enableCache: false,
      timeout: 5000,
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

    tweetHistory = new TweetHistory({
      storageFile: path.join(__dirname, '../data/performance-tweet-history.json'),
      logger
    })

    rateLimiter = new RateLimiter({
      enableLogging: false
    })

    // パフォーマンスメトリクス初期化
    performanceMetrics = {
      tests: [],
      summary: {
        totalTests: 0,
        passedTests: 0,
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity
      }
    }
  })

  afterAll(() => {
    // パフォーマンス結果をファイルに保存
    const resultsPath = path.join(__dirname, '../data/performance-results.json')
    fs.writeFileSync(resultsPath, JSON.stringify(performanceMetrics, null, 2))

    // eslint-disable-next-line no-console
    console.log('\n🚀 Performance Test Summary:')
    // eslint-disable-next-line no-console
    console.log(`Total Tests: ${performanceMetrics.summary.totalTests}`)
    // eslint-disable-next-line no-console
    console.log(`Passed Tests: ${performanceMetrics.summary.passedTests}`)
    // eslint-disable-next-line no-console
    console.log(`Average Response Time: ${performanceMetrics.summary.averageResponseTime}ms`)
    // eslint-disable-next-line no-console
    console.log(`Max Response Time: ${performanceMetrics.summary.maxResponseTime}ms`)
    // eslint-disable-next-line no-console
    console.log(`Min Response Time: ${performanceMetrics.summary.minResponseTime}ms`)
  })

  beforeEach(() => {
    rateLimiter.reset()
  })

  /**
   * パフォーマンスメトリクスを記録
   */
  function recordMetric (testName, duration, success = true, additionalData = {}) {
    const metric = {
      testName,
      duration,
      success,
      timestamp: new Date().toISOString(),
      ...additionalData
    }

    performanceMetrics.tests.push(metric)
    performanceMetrics.summary.totalTests++

    if (success) {
      performanceMetrics.summary.passedTests++
    }

    // 統計更新
    const responseTimes = performanceMetrics.tests
      .filter(t => t.success)
      .map(t => t.duration)

    if (responseTimes.length > 0) {
      performanceMetrics.summary.averageResponseTime =
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      performanceMetrics.summary.maxResponseTime = Math.max(...responseTimes)
      performanceMetrics.summary.minResponseTime = Math.min(...responseTimes)
    }

    return metric
  }

  describe('RSS Feed Parser Performance', () => {
    test('シングルフィード解析性能', async () => {
      const testFeed = {
        url: 'https://feeds.feedburner.com/oreilly/radar',
        category: 'tech',
        enabled: true
      }

      const startTime = Date.now()
      const result = await feedParser.parseFeeds([testFeed])
      const duration = Date.now() - startTime

      recordMetric('single_feed_parsing', duration, result.length > 0, {
        feedUrl: testFeed.url,
        articlesCount: result[0]?.articles?.length || 0
      })

      expect(duration).toBeLessThan(5000) // 5秒以内
      expect(result).toBeDefined()
      expect(result.length).toBe(1)
    })

    test('複数フィード並行解析性能', async () => {
      const testFeeds = [
        { url: 'https://feeds.feedburner.com/oreilly/radar', category: 'tech', enabled: true },
        { url: 'https://rss.cnn.com/rss/edition_technology.rss', category: 'tech', enabled: true },
        { url: 'https://feeds.feedburner.com/TechCrunch/', category: 'tech', enabled: true }
      ]

      const startTime = Date.now()
      const results = await feedParser.parseFeeds(testFeeds)
      const duration = Date.now() - startTime

      const totalArticles = results.reduce((sum, result) => sum + (result.articles?.length || 0), 0)
      const articlesPerSecond = (totalArticles / (duration / 1000)).toFixed(2)

      recordMetric('multiple_feeds_parsing', duration, results.length === testFeeds.length, {
        feedsCount: testFeeds.length,
        totalArticles,
        articlesPerSecond
      })

      expect(duration).toBeLessThan(10000) // 10秒以内
      expect(results.length).toBe(testFeeds.length)
      expect(parseFloat(articlesPerSecond)).toBeGreaterThan(1) // 最低1記事/秒
    })

    test('高負荷時のフィード解析', async () => {
      // 同時に多数のリクエストを実行
      const concurrentRequests = 5
      const testFeed = {
        url: 'https://feeds.feedburner.com/oreilly/radar',
        category: 'tech',
        enabled: true
      }

      const startTime = Date.now()
      const promises = Array.from({ length: concurrentRequests }, () =>
        feedParser.parseFeeds([testFeed])
      )

      const results = await Promise.all(promises)
      const duration = Date.now() - startTime

      recordMetric('concurrent_feed_parsing', duration, results.length === concurrentRequests, {
        concurrentRequests,
        avgDurationPerRequest: (duration / concurrentRequests).toFixed(2)
      })

      expect(duration).toBeLessThan(15000) // 15秒以内
      expect(results.length).toBe(concurrentRequests)
    }, 20000)
  })

  describe('Content Filtering Performance', () => {
    test('小規模記事フィルタリング性能（100件）', async () => {
      const articles = generateMockArticles(100)

      const startTime = Date.now()
      const filtered = await contentFilter.filterArticles(articles)
      const duration = Date.now() - startTime

      const filteringRate = (articles.length / (duration / 1000)).toFixed(2)

      recordMetric('small_scale_filtering', duration, filtered.length >= 0, {
        inputArticles: articles.length,
        filteredArticles: filtered.length,
        filteringRate: `${filteringRate} articles/sec`,
        filterRatio: (filtered.length / articles.length * 100).toFixed(1) + '%'
      })

      expect(duration).toBeLessThan(3000) // 3秒以内
      expect(parseFloat(filteringRate)).toBeGreaterThan(10) // 最低10記事/秒
    })

    test('中規模記事フィルタリング性能（1000件）', async () => {
      const articles = generateMockArticles(1000)

      const startTime = Date.now()
      const filtered = await contentFilter.filterArticles(articles)
      const duration = Date.now() - startTime

      const filteringRate = (articles.length / (duration / 1000)).toFixed(2)

      recordMetric('medium_scale_filtering', duration, filtered.length >= 0, {
        inputArticles: articles.length,
        filteredArticles: filtered.length,
        filteringRate: `${filteringRate} articles/sec`,
        filterRatio: (filtered.length / articles.length * 100).toFixed(1) + '%'
      })

      expect(duration).toBeLessThan(10000) // 10秒以内
      expect(parseFloat(filteringRate)).toBeGreaterThan(50) // 最低50記事/秒
    })

    test('大規模記事フィルタリング性能（5000件）', async () => {
      const articles = generateMockArticles(5000)

      const startTime = Date.now()
      const filtered = await contentFilter.filterArticles(articles)
      const duration = Date.now() - startTime

      const filteringRate = (articles.length / (duration / 1000)).toFixed(2)

      recordMetric('large_scale_filtering', duration, filtered.length >= 0, {
        inputArticles: articles.length,
        filteredArticles: filtered.length,
        filteringRate: `${filteringRate} articles/sec`,
        filterRatio: (filtered.length / articles.length * 100).toFixed(1) + '%'
      })

      expect(duration).toBeLessThan(30000) // 30秒以内
      expect(parseFloat(filteringRate)).toBeGreaterThan(100) // 最低100記事/秒
    }, 35000)
  })

  describe('Tweet Generation Performance', () => {
    test('バッチツイート生成性能', async () => {
      const articles = generateMockArticles(50, true) // AI関連記事のみ
      const tweets = []

      const startTime = Date.now()

      for (const article of articles) {
        const tweet = await tweetGenerator.generateTweet(article)
        tweets.push(tweet)
      }

      const duration = Date.now() - startTime
      const tweetsPerSecond = (tweets.length / (duration / 1000)).toFixed(2)

      recordMetric('batch_tweet_generation', duration, tweets.length === articles.length, {
        articlesCount: articles.length,
        tweetsGenerated: tweets.length,
        tweetsPerSecond,
        avgTweetLength: (tweets.reduce((sum, t) => sum + t.text.length, 0) /
          tweets.length).toFixed(1)
      })

      expect(duration).toBeLessThan(15000) // 15秒以内
      expect(tweets.length).toBe(articles.length)
      expect(parseFloat(tweetsPerSecond)).toBeGreaterThan(2) // 最低2ツイート/秒

      // 全ツイートが280文字以内であることを確認
      tweets.forEach(tweet => {
        expect(tweet.text.length).toBeLessThanOrEqual(280)
      })
    })

    test('継続的ツイート生成負荷テスト', async () => {
      const testDuration = 10000 // 10秒間
      const article = generateMockArticles(1, true)[0]
      let generatedCount = 0

      const startTime = Date.now()

      while (Date.now() - startTime < testDuration) {
        await tweetGenerator.generateTweet(article)
        generatedCount++
      }

      const actualDuration = Date.now() - startTime
      const tweetsPerSecond = (generatedCount / (actualDuration / 1000)).toFixed(2)

      recordMetric('continuous_tweet_generation', actualDuration, generatedCount > 0, {
        testDurationMs: testDuration,
        actualDurationMs: actualDuration,
        tweetsGenerated: generatedCount,
        tweetsPerSecond
      })

      expect(generatedCount).toBeGreaterThan(5) // 最低5ツイート
      expect(parseFloat(tweetsPerSecond)).toBeGreaterThan(0.5) // 最低0.5ツイート/秒
    }, 15000)
  })

  describe('Tweet History Performance', () => {
    test('大量ツイート履歴検索性能', async () => {
      // 1000件のダミーツイート履歴を作成
      const tweetCount = 1000

      for (let i = 0; i < tweetCount; i++) {
        await tweetHistory.saveTweet({
          url: `https://example.com/article-${i}`,
          title: `Test Article ${i}`,
          tweetText: `Test tweet ${i}`,
          hashtags: ['#test'],
          postedAt: new Date(),
          tweetId: `tweet-${i}`
        })
      }

      // 重複チェック性能テスト
      const startTime = Date.now()
      const checkCount = 100

      for (let i = 0; i < checkCount; i++) {
        await tweetHistory.isDuplicate(`https://example.com/article-${i}`)
      }

      const duration = Date.now() - startTime
      const checksPerSecond = (checkCount / (duration / 1000)).toFixed(2)

      recordMetric('tweet_history_search', duration, true, {
        totalHistorySize: tweetCount,
        duplicateChecks: checkCount,
        checksPerSecond
      })

      expect(duration).toBeLessThan(5000) // 5秒以内
      expect(parseFloat(checksPerSecond)).toBeGreaterThan(10) // 最低10チェック/秒
    })

    test('ツイート履歴ストレージ性能', async () => {
      const saveCount = 100

      const startTime = Date.now()

      for (let i = 0; i < saveCount; i++) {
        await tweetHistory.saveTweet({
          url: `https://performance-test.com/article-${i}`,
          title: `Performance Test Article ${i}`,
          tweetText: `Performance test tweet ${i} with some additional ` +
            'content to make it realistic',
          hashtags: ['#performance', '#test', '#ai'],
          postedAt: new Date(),
          tweetId: `perf-test-${i}`
        })
      }

      const duration = Date.now() - startTime
      const savesPerSecond = (saveCount / (duration / 1000)).toFixed(2)

      recordMetric('tweet_history_storage', duration, true, {
        savedTweets: saveCount,
        savesPerSecond
      })

      expect(duration).toBeLessThan(8000) // 8秒以内
      expect(parseFloat(savesPerSecond)).toBeGreaterThan(5) // 最低5保存/秒
    })
  })

  describe('Rate Limiter Performance', () => {
    test('レート制限チェック性能', async () => {
      const checkCount = 1000

      const startTime = Date.now()

      for (let i = 0; i < checkCount; i++) {
        await rateLimiter.checkTweetLimit()
      }

      const duration = Date.now() - startTime
      const checksPerSecond = (checkCount / (duration / 1000)).toFixed(2)

      recordMetric('rate_limit_checks', duration, true, {
        totalChecks: checkCount,
        checksPerSecond
      })

      expect(duration).toBeLessThan(2000) // 2秒以内
      expect(parseFloat(checksPerSecond)).toBeGreaterThan(100) // 最低100チェック/秒
    })

    test('レート制限記録性能', async () => {
      const recordCount = 500

      const startTime = Date.now()

      for (let i = 0; i < recordCount; i++) {
        rateLimiter.recordTweet()
      }

      const duration = Date.now() - startTime
      const recordsPerSecond = (recordCount / (duration / 1000)).toFixed(2)

      recordMetric('rate_limit_records', duration, true, {
        totalRecords: recordCount,
        recordsPerSecond
      })

      expect(duration).toBeLessThan(1000) // 1秒以内
      expect(parseFloat(recordsPerSecond)).toBeGreaterThan(200) // 最低200記録/秒
    })
  })

  describe('Memory and Resource Usage', () => {
    test('メモリ使用量監視', async () => {
      const initialMemory = process.memoryUsage()

      // 大量データ処理
      const articles = generateMockArticles(5000)
      await contentFilter.filterArticles(articles)

      const finalMemory = process.memoryUsage()
      const memoryIncrease = {
        rss: finalMemory.rss - initialMemory.rss,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal
      }

      recordMetric('memory_usage', 0, true, {
        initialMemory: {
          rss: `${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`
        },
        finalMemory: {
          rss: `${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`
        },
        memoryIncrease: {
          rss: `${(memoryIncrease.rss / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(memoryIncrease.heapUsed / 1024 / 1024).toFixed(2)} MB`
        }
      })

      // メモリ使用量が過度に増加していないことを確認
      expect(memoryIncrease.heapUsed).toBeLessThan(500 * 1024 * 1024) // 500MB以下
    })
  })
})

/**
 * モック記事生成ユーティリティ
 */
function generateMockArticles (count, aiRelated = false) {
  const articles = []
  const aiKeywords = ['artificial intelligence', 'machine learning', 'deep learning',
    'neural network', 'AI', 'ML', 'algorithm', 'automation']
  const generalKeywords = ['technology', 'innovation', 'software',
    'development', 'business', 'research']

  for (let i = 0; i < count; i++) {
    const keywords = aiRelated ? aiKeywords : [...aiKeywords, ...generalKeywords]
    const keyword = keywords[Math.floor(Math.random() * keywords.length)]

    articles.push({
      title: `Test Article ${i}: ${keyword} Innovation`,
      content: `This is a test article about ${keyword} and its applications. `.repeat(10),
      url: `https://example.com/article-${i}`,
      publishedAt: new Date(Date.now() - Math.random() * 86400000), // 過去24時間内
      category: aiRelated ? 'ai' : 'tech'
    })
  }

  return articles
}
