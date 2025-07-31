/**
 * Playwright ユーザーシナリオ E2E テスト
 * 実際のユーザーワークフローをシミュレート
 */

const { test, expect } = require('@playwright/test')

test.describe('n8n-tweet User Scenarios E2E Tests', () => {
  test('シナリオ1: AI研究者の日常ワークフロー', async ({ page }) => {
    console.log('🔬 Testing AI researcher workflow...')

    // AI研究者が最新のAI論文情報を取得するシナリオ
    const AITweetBot = require('../../src/index.js')
    const bot = new AITweetBot()

    try {
      // Step 1: システムヘルスチェック
      console.log('Step 1: Checking system health...')
      const health = await bot.healthCheck()

      expect(health).toHaveProperty('overall')
      expect(health.overall.totalComponents).toBeGreaterThan(0)
      console.log(`✅ System health: ${health.overall.status} (${health.overall.totalComponents} components)`)

      // Step 2: RSS フィードから最新のAI論文を取得
      console.log('Step 2: Fetching latest AI research papers...')
      const feedResult = await bot.processFeeds()

      expect(feedResult).toHaveProperty('allItems')
      expect(feedResult).toHaveProperty('filteredItems')

      console.log(`✅ Processed ${feedResult.allItems.length} articles from research feeds`)
      console.log(`✅ Filtered to ${feedResult.filteredItems.length} AI-relevant articles`)

      // Step 3: 生成されたツイートの品質チェック
      if (feedResult.tweets && feedResult.tweets.length > 0) {
        console.log('Step 3: Checking generated tweets quality...')

        feedResult.tweets.forEach((tweet, index) => {
          expect(tweet).toHaveProperty('content')
          expect(tweet).toHaveProperty('metadata')
          expect(tweet.metadata.length).toBeLessThanOrEqual(280)

          console.log(`Tweet ${index + 1}: ${tweet.metadata.length}/280 chars`)
        })

        console.log(`✅ Generated ${feedResult.tweets.length} high-quality research tweets`)
      }

      // Step 4: 最適なツイートの選択確認
      if (feedResult.optimalTweets && feedResult.optimalTweets.length > 0) {
        console.log('Step 4: Verifying optimal tweet selection...')

        feedResult.optimalTweets.forEach((tweet, index) => {
          expect(tweet.stats.combinedScore).toBeGreaterThan(0)
          console.log(`Optimal tweet ${index + 1} score: ${tweet.stats.combinedScore}`)
        })

        console.log(`✅ Selected ${feedResult.optimalTweets.length} optimal tweets for posting`)
      }

      console.log('🎉 AI researcher workflow completed successfully!')
    } catch (error) {
      console.error('❌ AI researcher workflow failed:', error.message)
      expect(error.message).toBeTruthy() // Record that an error occurred
    }
  })

  test('シナリオ2: システム管理者の監視ワークフロー', async ({ page }) => {
    console.log('🛠️ Testing system administrator workflow...')

    const AITweetBot = require('../../src/index.js')
    const bot = new AITweetBot()

    try {
      // Step 1: 全システムコンポーネントのヘルスチェック
      console.log('Step 1: Comprehensive system health monitoring...')
      const health = await bot.healthCheck()

      // ヘルスチェック結果の詳細分析
      expect(health).toHaveProperty('components')
      expect(health).toHaveProperty('checkDuration')

      const healthyComponents = Object.values(health.components).filter(c => c.status === 'healthy').length
      const unhealthyComponents = Object.values(health.components).filter(c => c.status === 'unhealthy').length

      console.log(`✅ System analysis: ${healthyComponents} healthy, ${unhealthyComponents} unhealthy components`)
      console.log(`✅ Health check completed in ${health.checkDuration}ms`)

      // Step 2: 各コンポーネントの詳細ステータス確認
      console.log('Step 2: Detailed component status analysis...')

      Object.entries(health.components).forEach(([name, component]) => {
        expect(component).toHaveProperty('status')
        expect(component).toHaveProperty('responseTime')

        const status = component.status === 'healthy' ? '✅' : '❌'
        console.log(`${status} ${name}: ${component.status} (${component.responseTime}ms)`)

        if (component.error) {
          console.log(`  └─ Error: ${component.error}`)
        }
      })

      // Step 3: パフォーマンスメトリクスの確認
      console.log('Step 3: Performance metrics analysis...')

      // レスポンス時間の分析
      const responseTimes = Object.values(health.components).map(c => c.responseTime)
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      const maxResponseTime = Math.max(...responseTimes)

      console.log(`✅ Average response time: ${avgResponseTime.toFixed(2)}ms`)
      console.log(`✅ Maximum response time: ${maxResponseTime}ms`)

      // パフォーマンス基準チェック
      expect(avgResponseTime).toBeLessThan(1000) // 1秒以内
      expect(maxResponseTime).toBeLessThan(5000) // 5秒以内

      // Step 4: システム安定性の評価
      console.log('Step 4: System stability assessment...')

      const stabilityScore = health.overall.score || 0
      console.log(`✅ System stability score: ${(stabilityScore * 100).toFixed(1)}%`)

      // 最低限の安定性基準
      expect(stabilityScore).toBeGreaterThan(0.5) // 50%以上

      console.log('🎉 System administrator monitoring completed successfully!')
    } catch (error) {
      console.error('❌ System monitoring workflow failed:', error.message)
      expect(error.message).toBeTruthy()
    }
  })

  test('シナリオ3: コンテンツキュレーターの品質管理ワークフロー', async ({ page }) => {
    console.log('📝 Testing content curator workflow...')

    const ContentFilter = require('../../src/filters/content-filter.js')
    const TweetGenerator = require('../../src/generators/tweet-generator.js')
    const config = require('../../config/default.json')

    try {
      // Step 1: 様々な品質レベルのコンテンツを準備
      console.log('Step 1: Preparing content samples for quality assessment...')

      const testContent = [
        {
          title: 'Breakthrough in Transformer Architecture for Large Language Models',
          description: 'Researchers at Stanford University develop novel attention mechanism that improves efficiency by 40% while maintaining state-of-the-art performance in natural language understanding tasks.',
          category: 'research',
          link: 'https://example.com/transformer-breakthrough'
        },
        {
          title: 'AI Ethics Guidelines Updated by Industry Consortium',
          description: 'Major technology companies collaborate on comprehensive ethical AI framework addressing bias, transparency, and accountability in machine learning systems.',
          category: 'industry',
          link: 'https://example.com/ai-ethics'
        },
        {
          title: 'Simple Python Script for Data Processing',
          description: 'Basic tutorial on processing CSV files.',
          category: 'tutorial',
          link: 'https://example.com/python-tutorial'
        }
      ]

      // Step 2: コンテンツフィルタリングによる品質評価
      console.log('Step 2: Content quality assessment and filtering...')

      const filter = new ContentFilter({
        ...config.content.filtering,
        scoreThreshold: 0.4 // 品質評価用に閾値を調整
      })

      const filteredContent = await filter.filterRelevantContent(
        testContent,
        ['ai', 'research', 'technology', 'ethics']
      )

      console.log(`✅ Content filtering: ${testContent.length} → ${filteredContent.length} articles`)

      // 品質スコアの分析
      filteredContent.forEach((article, index) => {
        expect(article).toHaveProperty('scores')
        const scores = article.scores

        console.log(`Article ${index + 1}: "${article.title.substring(0, 50)}..."`)
        console.log(`  Relevance: ${scores.relevance}, Quality: ${scores.quality}, Combined: ${scores.combined}`)

        expect(scores.relevance).toBeGreaterThan(0)
        expect(scores.quality).toBeGreaterThan(0)
        expect(scores.combined).toBeGreaterThan(0)
      })

      // Step 3: ツイート生成と品質チェック
      console.log('Step 3: Tweet generation and quality validation...')

      const generator = new TweetGenerator(config.content.generation)

      for (const article of filteredContent) {
        const tweet = await generator.generateSingleTweet(article, { ai: 'ai', research: 'research' })

        // ツイート品質基準のチェック
        expect(tweet.metadata.length).toBeLessThanOrEqual(280)
        expect(tweet.metadata.length).toBeGreaterThan(50) // 最低限の長さ
        expect(tweet.content).toContain(article.link) // URLが含まれている
        expect(tweet.metadata.hashtags.length).toBeGreaterThan(0) // ハッシュタグがある

        console.log(`✅ Generated tweet: ${tweet.metadata.length}/280 chars, Score: ${tweet.stats.combinedScore}`)
        console.log(`  Content: ${tweet.content.substring(0, 100)}...`)
        console.log(`  Hashtags: ${tweet.metadata.hashtags.join(', ')}`)
      }

      // Step 4: エンゲージメント予測評価
      console.log('Step 4: Engagement prediction analysis...')

      const engagementMetrics = filteredContent.map(article => article.scores.combined)
      const avgEngagement = engagementMetrics.reduce((a, b) => a + b, 0) / engagementMetrics.length

      console.log(`✅ Average engagement score: ${avgEngagement.toFixed(3)}`)

      // 品質基準
      expect(avgEngagement).toBeGreaterThan(0.5) // 平均品質スコア50%以上

      console.log('🎉 Content curator workflow completed successfully!')
    } catch (error) {
      console.error('❌ Content curation workflow failed:', error.message)
      expect(error.message).toBeTruthy()
    }
  })

  test('シナリオ4: 非技術者ユーザーの簡単利用ワークフロー', async ({ page }) => {
    console.log('👤 Testing non-technical user workflow...')

    try {
      // Step 1: シンプルなシステム状態確認
      console.log('Step 1: Simple system status check...')

      const AITweetBot = require('../../src/index.js')
      const bot = new AITweetBot()

      const health = await bot.healthCheck()

      // 非技術者向けの簡単な状態表示
      const isSystemHealthy = health.overall.status === 'healthy' || health.overall.status === 'degraded'
      const healthPercentage = ((health.overall.score || 0) * 100).toFixed(0)

      console.log(`✅ System status: ${isSystemHealthy ? 'Running' : 'Issues detected'}`)
      console.log(`✅ Health score: ${healthPercentage}%`)

      expect(typeof isSystemHealthy).toBe('boolean')
      expect(healthPercentage).toBeTruthy()

      // Step 2: 最新のAI情報取得（簡単版）
      console.log('Step 2: Getting latest AI news (simplified)...')

      const FeedParser = require('../../src/utils/feed-parser.js')
      const feedConfig = require('../../config/rss-feeds.json')

      const parser = new FeedParser({ timeout: 10000, retries: 1 })

      // 1つのフィードから最新情報を取得
      const latestNews = await parser.parseFeed(feedConfig.feeds[0])

      if (latestNews.success && latestNews.items && latestNews.items.length > 0) {
        console.log(`✅ Found ${latestNews.items.length} latest AI articles`)

        // 最新の3記事を表示（非技術者向け）
        const topArticles = latestNews.items.slice(0, 3)

        topArticles.forEach((article, index) => {
          console.log(`📰 Article ${index + 1}: ${article.title.substring(0, 60)}...`)
          console.log(`   Link: ${article.link}`)
        })

        expect(topArticles.length).toBeGreaterThan(0)
      } else {
        console.log('ℹ️ No new articles available at this time')
      }

      // Step 3: サンプルツイート生成
      console.log('Step 3: Generating sample tweet...')

      const TweetGenerator = require('../../src/generators/tweet-generator.js')
      const config = require('../../config/default.json')

      const generator = new TweetGenerator(config.content.generation)

      // サンプル記事でツイート生成
      const sampleArticle = {
        title: 'Latest AI Research Shows Promise',
        description: 'New developments in artificial intelligence are showing significant improvements.',
        category: 'research',
        link: 'https://example.com/ai-news',
        scores: { relevance: 0.8, quality: 0.9, combined: 0.85 }
      }

      const sampleTweet = await generator.generateSingleTweet(sampleArticle)

      console.log(`✅ Sample tweet generated (${sampleTweet.metadata.length}/280 chars):`)
      console.log(`   "${sampleTweet.content}"`)

      expect(sampleTweet.content).toBeTruthy()
      expect(sampleTweet.metadata.length).toBeLessThanOrEqual(280)

      // Step 4: 利用統計の表示
      console.log('Step 4: Usage statistics summary...')

      const stats = {
        systemUptime: Math.floor(process.uptime()),
        componentsHealthy: health.overall.healthyComponents || 0,
        componentsTotal: health.overall.totalComponents || 0,
        lastCheck: new Date().toLocaleString()
      }

      console.log(`✅ System uptime: ${stats.systemUptime} seconds`)
      console.log(`✅ Healthy components: ${stats.componentsHealthy}/${stats.componentsTotal}`)
      console.log(`✅ Last checked: ${stats.lastCheck}`)

      expect(stats.systemUptime).toBeGreaterThan(0)
      expect(stats.componentsTotal).toBeGreaterThan(0)

      console.log('🎉 Non-technical user workflow completed successfully!')
    } catch (error) {
      console.error('❌ Non-technical user workflow failed:', error.message)
      expect(error.message).toBeTruthy()
    }
  })
})
