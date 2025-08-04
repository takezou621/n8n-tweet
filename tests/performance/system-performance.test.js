/**
 * システムパフォーマンステスト
 * n8n-tweet システムのパフォーマンス測定
 */

const FeedParser = require('../../src/utils/feed-parser')
const ContentFilter = require('../../src/filters/content-filter')
const TweetGenerator = require('../../src/generators/tweet-generator')
const feedConfig = require('../../config/rss-feeds.json')
const config = require('../../config/default.json')

describe('n8n-tweet Performance Tests', () => {
  test('RSS フィード処理のパフォーマンステスト', async () => {
    console.log('🚀 Testing RSS feed processing performance...')

    const parser = new FeedParser({ timeout: 15000, retries: 1 })

    const performanceMetrics = {
      feedProcessingTimes: [],
      totalArticles: 0,
      averageResponseTime: 0,
      throughput: 0
    }

    try {
      // 複数フィードの並行処理性能テスト
      console.log('Testing concurrent feed processing...')
      const startTime = Date.now()

      const testFeeds = feedConfig.feeds.slice(0, 3) // 最初の3つのフィードをテスト
      const feedPromises = testFeeds.map(async (feed, index) => {
        const feedStartTime = Date.now()

        try {
          const result = await parser.parseFeed(feed)
          const feedProcessingTime = Date.now() - feedStartTime

          performanceMetrics.feedProcessingTimes.push({
            feedName: feed.name,
            processingTime: feedProcessingTime,
            articles: result.items?.length || 0,
            success: result.success
          })

          return result
        } catch (error) {
          performanceMetrics.feedProcessingTimes.push({
            feedName: feed.name,
            processingTime: Date.now() - feedStartTime,
            articles: 0,
            success: false,
            error: error.message
          })
          return null
        }
      })

      const results = await Promise.all(feedPromises)
      const totalProcessingTime = Date.now() - startTime

      // パフォーマンスメトリクスの計算
      const successfulFeeds = performanceMetrics.feedProcessingTimes.filter(f => f.success)
      performanceMetrics.totalArticles = successfulFeeds.reduce((sum, f) => sum + f.articles, 0)
      performanceMetrics.averageResponseTime = successfulFeeds.reduce((sum, f) => sum + f.processingTime, 0) / successfulFeeds.length
      performanceMetrics.throughput = performanceMetrics.totalArticles / (totalProcessingTime / 1000) // articles per second

      console.log('\\n📊 RSS Feed Processing Performance Results:')
      console.log('===========================================')
      console.log(`Total processing time: ${totalProcessingTime}ms`)
      console.log(`Successful feeds: ${successfulFeeds.length}/${testFeeds.length}`)
      console.log(`Total articles processed: ${performanceMetrics.totalArticles}`)
      console.log(`Average feed response time: ${performanceMetrics.averageResponseTime.toFixed(2)}ms`)
      console.log(`Throughput: ${performanceMetrics.throughput.toFixed(2)} articles/second`)

      // パフォーマンス基準の検証
      expect(performanceMetrics.averageResponseTime).toBeLessThan(10000) // 10秒以内
      expect(performanceMetrics.throughput).toBeGreaterThan(0.1) // 最低0.1 articles/second
      expect(successfulFeeds.length).toBeGreaterThan(0) // 少なくとも1つのフィードが成功

      console.log('\\n✅ RSS feed processing performance test: PASSED')
    } catch (error) {
      console.error('❌ RSS performance test failed:', error.message)
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.warn('Skipping test due to network connectivity issues')
        return
      }
      throw error
    }
  }, 60000)

  test('コンテンツフィルタリングのパフォーマンステスト', async () => {
    console.log('🔍 Testing content filtering performance...')

    const filter = new ContentFilter(config.content.filtering)

    // 大量の記事でテスト
    const testArticles = Array.from({ length: 100 }, (_, i) => ({
      title: `Test Article ${i}: ${i % 3 === 0 ? 'AI and Machine Learning' : 'General News'}`,
      description: `This is a test article about ${i % 3 === 0 ? 'artificial intelligence, neural networks, and deep learning' : 'various topics in technology'}`,
      link: `https://example.com/article-${i}`,
      category: i % 3 === 0 ? 'ai' : 'general'
    }))

    const startTime = Date.now()

    try {
      const filteredArticles = await filter.filterRelevantContent(
        testArticles,
        ['ai', 'research', 'technology']
      )

      const processingTime = Date.now() - startTime
      const throughput = testArticles.length / (processingTime / 1000) // articles per second

      console.log('\\n📊 Content Filtering Performance Results:')
      console.log('=========================================')
      console.log(`Articles processed: ${testArticles.length}`)
      console.log(`Articles filtered: ${filteredArticles.length}`)
      console.log(`Processing time: ${processingTime}ms`)
      console.log(`Throughput: ${throughput.toFixed(2)} articles/second`)
      console.log(`Filter rate: ${((filteredArticles.length / testArticles.length) * 100).toFixed(1)}%`)

      // パフォーマンス基準の検証
      expect(processingTime).toBeLessThan(5000) // 5秒以内
      expect(throughput).toBeGreaterThan(10) // 最低10 articles/second
      expect(filteredArticles.length).toBeGreaterThan(0) // 少なくとも1つはフィルタを通過

      console.log('\\n✅ Content filtering performance test: PASSED')
    } catch (error) {
      console.error('❌ Filtering performance test failed:', error.message)
      throw error
    }
  })

  test('ツイート生成のパフォーマンステスト', async () => {
    console.log('✍️ Testing tweet generation performance...')

    const generator = new TweetGenerator(config.content.generation)

    // テスト記事
    const testArticles = Array.from({ length: 20 }, (_, i) => ({
      title: `AI Research Breakthrough ${i}: New Neural Network Architecture Achieves State-of-the-Art Results`,
      description: 'Scientists have developed a revolutionary neural network architecture that significantly improves performance on various AI tasks. The new model demonstrates remarkable efficiency and accuracy.',
      link: `https://example.com/ai-research-${i}`,
      category: 'research',
      scores: { relevance: 0.8 + (i % 3) * 0.05, quality: 0.9, combined: 0.85 }
    }))

    const startTime = Date.now()
    const generatedTweets = []

    try {
      for (const article of testArticles) {
        const tweetStartTime = Date.now()
        const tweet = await generator.generateSingleTweet(article, { research: 'research' })
        const tweetGenerationTime = Date.now() - tweetStartTime

        generatedTweets.push({
          article: article.title,
          tweetLength: tweet.metadata.length,
          generationTime: tweetGenerationTime,
          valid: tweet.metadata.length <= 280
        })
      }

      const totalGenerationTime = Date.now() - startTime
      const averageGenerationTime = totalGenerationTime / testArticles.length
      const throughput = testArticles.length / (totalGenerationTime / 1000) // tweets per second

      console.log('\\n📊 Tweet Generation Performance Results:')
      console.log('=======================================')
      console.log(`Tweets generated: ${generatedTweets.length}`)
      console.log(`Total generation time: ${totalGenerationTime}ms`)
      console.log(`Average generation time: ${averageGenerationTime.toFixed(2)}ms per tweet`)
      console.log(`Throughput: ${throughput.toFixed(2)} tweets/second`)

      // 280文字制限の遵守確認
      const validTweets = generatedTweets.filter(t => t.valid)
      console.log(`Valid tweets (≤280 chars): ${validTweets.length}/${generatedTweets.length}`)

      // パフォーマンス基準の検証
      expect(averageGenerationTime).toBeLessThan(500) // 平均500ms以内
      expect(throughput).toBeGreaterThan(1) // 最低1 tweet/second
      expect(validTweets.length).toBe(generatedTweets.length) // 全てのツイートが280文字以内

      console.log('\\n✅ Tweet generation performance test: PASSED')
    } catch (error) {
      console.error('❌ Tweet generation performance test failed:', error.message)
      throw error
    }
  })

  test('完全ワークフローのパフォーマンステスト', async () => {
    console.log('🔄 Testing complete workflow performance...')

    const parser = new FeedParser({ timeout: 15000, retries: 1 })
    const filter = new ContentFilter(config.content.filtering)
    const generator = new TweetGenerator(config.content.generation)

    const workflowMetrics = {
      rssProcessing: 0,
      filtering: 0,
      tweetGeneration: 0,
      total: 0
    }

    try {
      const workflowStartTime = Date.now()

      // Step 1: RSS Processing
      console.log('Step 1: Processing RSS feeds...')
      const rssStartTime = Date.now()
      const testFeed = feedConfig.feeds[0]
      const feedResult = await parser.parseFeed(testFeed)
      workflowMetrics.rssProcessing = Date.now() - rssStartTime

      if (!feedResult.success || !feedResult.items || feedResult.items.length === 0) {
        console.log('No articles retrieved from feed, using mock data')
        feedResult.items = [{
          title: 'AI Research Breakthrough',
          description: 'New developments in artificial intelligence',
          link: 'https://example.com/ai-research',
          category: 'research'
        }]
      }

      // Step 2: Content Filtering
      console.log('Step 2: Filtering content...')
      const filterStartTime = Date.now()
      const filteredArticles = await filter.filterRelevantContent(
        feedResult.items.slice(0, 10),
        ['ai', 'research', 'technology']
      )
      workflowMetrics.filtering = Date.now() - filterStartTime

      // Step 3: Tweet Generation
      console.log('Step 3: Generating tweets...')
      const tweetStartTime = Date.now()
      const tweets = []
      for (const article of filteredArticles.slice(0, 5)) {
        const tweet = await generator.generateSingleTweet(article, { research: 'research' })
        tweets.push(tweet)
      }
      workflowMetrics.tweetGeneration = Date.now() - tweetStartTime

      workflowMetrics.total = Date.now() - workflowStartTime

      console.log('\\n📊 Complete Workflow Performance Results:')
      console.log('========================================')
      console.log(`RSS Processing: ${workflowMetrics.rssProcessing}ms`)
      console.log(`Content Filtering: ${workflowMetrics.filtering}ms`)
      console.log(`Tweet Generation: ${workflowMetrics.tweetGeneration}ms`)
      console.log(`Total Workflow Time: ${workflowMetrics.total}ms`)
      console.log(`Articles processed: ${feedResult.items.length} → ${filteredArticles.length} → ${tweets.length} tweets`)

      // パフォーマンス基準の検証
      expect(workflowMetrics.total).toBeLessThan(30000) // 30秒以内
      expect(tweets.length).toBeGreaterThan(0) // 少なくとも1つのツイートが生成

      console.log('\\n✅ Complete workflow performance test: PASSED')
    } catch (error) {
      console.error('❌ Workflow performance test failed:', error.message)
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.warn('Skipping test due to network connectivity issues')
        return
      }
      throw error
    }
  }, 60000)
})
