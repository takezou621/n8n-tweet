/**
 * ユーザーシナリオ統合テスト
 * 実際のユーザーワークフローをシミュレート
 */

const AITweetBot = require('../../src/index.js')

describe('n8n-tweet User Scenarios Tests', () => {
  test('シナリオ1: AI研究者の日常ワークフロー', async () => {
    console.log('🔬 Testing AI researcher workflow...')

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
        console.log('Step 4: Checking optimal tweet selection...')

        const topTweet = feedResult.optimalTweets[0]
        expect(topTweet).toHaveProperty('content')
        expect(topTweet).toHaveProperty('stats')
        expect(topTweet.stats.combinedScore).toBeGreaterThan(0.5)

        console.log(`✅ Selected optimal tweet with score: ${topTweet.stats.combinedScore.toFixed(2)}`)
      }

      console.log('\\n🎉 AI researcher workflow completed successfully!')
    } catch (error) {
      console.error('Workflow error:', error.message)
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.warn('Skipping test due to network connectivity issues')
        return
      }
      throw error
    }
  }, 60000)

  test('シナリオ2: システム管理者の監視ダッシュボード確認', async () => {
    console.log('🔧 Testing system administrator monitoring workflow...')

    const bot = new AITweetBot()

    try {
      // Step 1: システム全体のヘルスチェック
      console.log('Step 1: Performing comprehensive health check...')
      const health = await bot.healthCheck()

      expect(health).toHaveProperty('overall')
      expect(health).toHaveProperty('components')
      expect(health).toHaveProperty('timestamp')

      console.log('System Health Status:')
      console.log(`- Overall Status: ${health.overall.status}`)
      console.log(`- Total Components: ${health.overall.totalComponents}`)
      console.log(`- Healthy Components: ${health.overall.healthyComponents}`)

      // 各コンポーネントの詳細確認
      Object.entries(health.components).forEach(([component, status]) => {
        console.log(`- ${component}: ${status.status} ${status.responseTime ? `(${status.responseTime}ms)` : ''}`)
      })

      // Step 2: パフォーマンスメトリクスの確認
      console.log('\\nStep 2: Checking performance metrics...')

      // メモリ使用量
      const memUsage = process.memoryUsage()
      console.log('Memory Usage:')
      console.log(`- Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`)
      console.log(`- RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`)

      // 稼働時間
      const uptime = process.uptime()
      console.log(`\\nUptime: ${Math.floor(uptime / 60)} minutes`)

      expect(health.overall.status).not.toBe('unhealthy')
      console.log('\\n✅ System monitoring completed successfully!')
    } catch (error) {
      console.error('Monitoring error:', error.message)
      throw error
    }
  })

  test('シナリオ3: コンテンツキュレーターの記事選定ワークフロー', async () => {
    console.log('📚 Testing content curator workflow...')

    const ContentFilter = require('../../src/filters/content-filter.js')
    const config = require('../../config/default.json')

    const filter = new ContentFilter(config.content.filtering)

    try {
      // Step 1: 様々なソースからの記事を想定
      console.log('Step 1: Simulating articles from various sources...')

      const diverseArticles = [
        {
          title: 'Breakthrough in Transformer Architecture for NLP',
          description: 'Researchers develop new attention mechanism that reduces computational complexity while maintaining performance.',
          category: 'research',
          link: 'https://example.com/transformer-breakthrough'
        },
        {
          title: 'OpenAI Releases New GPT Model',
          description: 'Latest model shows improved reasoning capabilities and reduced hallucinations.',
          category: 'industry',
          link: 'https://example.com/openai-gpt'
        },
        {
          title: 'Stock Market Update',
          description: 'Technology stocks rise on positive earnings reports.',
          category: 'finance',
          link: 'https://example.com/stocks'
        },
        {
          title: 'Machine Learning in Healthcare',
          description: 'AI systems now capable of detecting diseases earlier than traditional methods.',
          category: 'healthcare',
          link: 'https://example.com/ml-healthcare'
        }
      ]

      // Step 2: AI関連度によるフィルタリング
      console.log('Step 2: Filtering articles by AI relevance...')

      const filteredArticles = await filter.filterRelevantContent(
        diverseArticles,
        ['ai', 'research', 'technology']
      )

      console.log('\\nFiltering Results:')
      console.log(`- Input Articles: ${diverseArticles.length}`)
      console.log(`- AI-Relevant Articles: ${filteredArticles.length}`)
      console.log(`- Filter Rate: ${((filteredArticles.length / diverseArticles.length) * 100).toFixed(1)}%`)

      // Step 3: フィルタリング結果の品質確認
      console.log('\\nStep 3: Verifying filtering quality...')

      filteredArticles.forEach((article, index) => {
        expect(article).toHaveProperty('scores')
        expect(article.scores.relevance).toBeGreaterThan(0.3)

        console.log(`Article ${index + 1}: "${article.title}"`)
        console.log(`  - Relevance Score: ${article.scores.relevance.toFixed(2)}`)
        console.log(`  - Quality Score: ${article.scores.quality.toFixed(2)}`)
        console.log(`  - Categories: ${article.categories.join(', ')}`)
      })

      expect(filteredArticles.length).toBeGreaterThan(0)
      expect(filteredArticles.length).toBeLessThan(diverseArticles.length)

      console.log('\\n✅ Content curation workflow completed successfully!')
    } catch (error) {
      console.error('Curation error:', error.message)
      throw error
    }
  })

  test('シナリオ4: 非技術者ユーザーの簡易確認ワークフロー', async () => {
    console.log('👤 Testing non-technical user workflow...')

    const TweetGenerator = require('../../src/generators/tweet-generator.js')
    const config = require('../../config/default.json')

    const generator = new TweetGenerator(config.content.generation)

    try {
      // Step 1: わかりやすい形式でツイート生成
      console.log('Step 1: Generating user-friendly tweet preview...')

      const sampleArticle = {
        title: 'AI Makes Scientific Discovery',
        description: 'Artificial intelligence system discovers new material that could revolutionize solar panels.',
        link: 'https://example.com/ai-discovery',
        category: 'news'
      }

      const tweet = await generator.generateSingleTweet(sampleArticle, { news: 'news' })

      console.log('\\n📱 Tweet Preview:')
      console.log('─'.repeat(50))
      console.log(tweet.content)
      console.log('─'.repeat(50))
      console.log(`Character count: ${tweet.metadata.length}/280`)
      console.log(`Hashtags: ${tweet.metadata.hashtags.join(' ')}`)

      // Step 2: 読みやすさとエンゲージメント評価
      console.log('\\nStep 2: Checking readability and engagement...')

      expect(tweet.metadata.length).toBeLessThanOrEqual(280)
      expect(tweet.metadata.hashtags.length).toBeGreaterThan(0)
      expect(tweet.stats.engagementScore).toBeGreaterThan(0.5)

      console.log(`Engagement Score: ${(tweet.stats.engagementScore * 100).toFixed(0)}%`)
      console.log(`Content Quality: ${tweet.stats.quality > 0.7 ? 'High' : 'Medium'}`)

      console.log('\\n✅ Non-technical user workflow completed successfully!')
    } catch (error) {
      console.error('User workflow error:', error.message)
      throw error
    }
  })
})
