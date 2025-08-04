/**
 * Real RSS Feed Tweet Generation Integration Test
 * 実際のRSSフィードデータを使用したツイート生成統合テスト
 */

const TweetGenerator = require('../../src/generators/tweet-generator')
const FeedParser = require('../../src/utils/feed-parser')
const ContentFilter = require('../../src/filters/content-filter')
const config = require('../../config/rss-feeds.json')

describe('Real RSS Feed Tweet Generation Integration Test', () => {
  let generator, parser, filter
  let realFeedData = []

  beforeAll(async () => {
    generator = new TweetGenerator({
      maxLength: 280,
      includeUrl: true,
      hashtagLimit: 3,
      reserveUrlLength: 23
    })

    parser = new FeedParser()
    filter = new ContentFilter()

    // 実際のRSSフィードからデータを取得（タイムアウト設定）
    jest.setTimeout(60000)

    console.log('実際のRSSフィードからデータ取得中...')

    // 有効なフィードのみ取得
    const enabledFeeds = config.feeds.filter(feed => feed.enabled).slice(0, 3) // 最初の3つのフィードのみ

    for (const feedConfig of enabledFeeds) {
      try {
        console.log(`取得中: ${feedConfig.name}`)
        const items = await parser.parseFeed(feedConfig.url, {
          timeout: 30000,
          maxItems: 5 // 各フィードから最大5件
        })

        const processedItems = items.map(item => ({
          ...item,
          feedName: feedConfig.name,
          category: feedConfig.category
        }))

        realFeedData.push(...processedItems)
        console.log(`${feedConfig.name}: ${processedItems.length}件取得`)
      } catch (error) {
        console.warn(`フィード取得失敗: ${feedConfig.name} - ${error.message}`)
      }
    }

    console.log(`総取得件数: ${realFeedData.length}件`)
  })

  describe('実際のRSSフィードデータでの280文字制限テスト', () => {
    test('全てのフィードアイテムが280文字制限を遵守', async () => {
      // CIで外部フィードが利用できない場合、モックデータを使用
      if (realFeedData.length === 0) {
        console.warn('外部RSSフィードからデータを取得できませんでした。モックデータを使用します。')
        realFeedData = [
          {
            title: 'Test AI Article for Tweet Generation',
            description: 'This is a test article about artificial intelligence and machine learning technologies for tweet generation testing.',
            link: 'https://example.com/ai-article',
            feedName: 'Test Feed',
            category: 'ai'
          },
          {
            title: 'Another Test Tech Article',
            description: 'This is another test article about technology and innovation in the field of computer science.',
            link: 'https://example.com/tech-article',
            feedName: 'Test Feed',
            category: 'tech'
          }
        ]
      }

      expect(realFeedData.length).toBeGreaterThan(0)

      const results = []

      for (const item of realFeedData) {
        const tweet = await generator.generateTweet(item, config.categories)

        expect(tweet).toBeTruthy()
        expect(tweet.content.length).toBeLessThanOrEqual(280)

        results.push({
          feedName: item.feedName,
          category: item.category,
          originalTitle: item.title?.substring(0, 80) + '...',
          tweetLength: tweet.content.length,
          withinLimit: tweet.content.length <= 280,
          engagementScore: tweet.metadata.engagementScore,
          hashtags: tweet.metadata.hashtags
        })
      }

      // 結果の統計
      const stats = {
        totalTweets: results.length,
        withinLimit: results.filter(r => r.withinLimit).length,
        averageLength: Math.round(results.reduce((sum, r) => sum + r.tweetLength, 0) / results.length),
        maxLength: Math.max(...results.map(r => r.tweetLength)),
        minLength: Math.min(...results.map(r => r.tweetLength)),
        averageEngagement: Math.round(results.reduce((sum, r) => sum + r.engagementScore, 0) / results.length * 100) / 100
      }

      console.log('=== 実際のRSSフィードデータ 280文字制限テスト結果 ===')
      console.log('統計:', stats)
      console.log('\n詳細結果 (最初の10件):')
      results.slice(0, 10).forEach((result, index) => {
        console.log(`${index + 1}. ${result.feedName} (${result.category})`)
        console.log(`   タイトル: ${result.originalTitle}`)
        console.log(`   ツイート長: ${result.tweetLength}/280 文字`)
        console.log(`   制限内: ${result.withinLimit ? '✓' : '✗'}`)
        console.log(`   エンゲージメント: ${result.engagementScore}`)
        console.log(`   ハッシュタグ: ${result.hashtags.join(', ')}`)
        console.log()
      })

      // 全てのツイートが280文字制限内であることを確認
      expect(stats.withinLimit).toBe(stats.totalTweets)
      expect(stats.maxLength).toBeLessThanOrEqual(280)
    })

    test('各カテゴリでの文字数制限遵守確認', async () => {
      const categoryResults = {}

      for (const item of realFeedData) {
        const category = item.category || 'unknown'

        if (!categoryResults[category]) {
          categoryResults[category] = []
        }

        const tweet = await generator.generateTweet(item, config.categories)

        categoryResults[category].push({
          title: item.title?.substring(0, 60) + '...',
          length: tweet.content.length,
          content: tweet.content.substring(0, 100) + '...',
          engagement: tweet.metadata.engagementScore
        })
      }

      console.log('\n=== カテゴリ別結果 ===')

      for (const [category, tweets] of Object.entries(categoryResults)) {
        const avgLength = Math.round(tweets.reduce((sum, t) => sum + t.length, 0) / tweets.length)
        const maxLength = Math.max(...tweets.map(t => t.length))
        const allWithinLimit = tweets.every(t => t.length <= 280)

        console.log(`\n${category.toUpperCase()} カテゴリ:`)
        console.log(`  件数: ${tweets.length}`)
        console.log(`  平均長: ${avgLength} 文字`)
        console.log(`  最大長: ${maxLength} 文字`)
        console.log(`  制限遵守: ${allWithinLimit ? '✓' : '✗'}`)

        // サンプル表示
        console.log('  サンプル:')
        tweets.slice(0, 2).forEach((tweet, index) => {
          console.log(`    ${index + 1}. ${tweet.title} (${tweet.length}文字)`)
        })

        expect(allWithinLimit).toBe(true)
        expect(maxLength).toBeLessThanOrEqual(280)
      }
    })
  })

  describe('フィルタリング後のツイート生成テスト', () => {
    test('高品質コンテンツのツイート生成', async () => {
      if (realFeedData.length === 0) {
        console.warn('実際のフィードデータが取得できませんでした')
        return
      }

      // コンテンツフィルタリング
      const filteredItems = []
      for (const item of realFeedData) {
        try {
          const scores = await filter.analyzeContent(item)
          if (scores.combined >= 0.7) { // 高品質のみ
            filteredItems.push({ ...item, scores })
          }
        } catch (error) {
          console.warn(`フィルタリングエラー: ${error.message}`)
        }
      }

      console.log(`\n高品質コンテンツ: ${filteredItems.length}/${realFeedData.length}件`)

      if (filteredItems.length === 0) {
        console.warn('高品質コンテンツが見つかりませんでした')
        return
      }

      // ツイート生成
      const highQualityTweets = []
      for (const item of filteredItems.slice(0, 5)) { // 最初の5件
        const tweet = await generator.generateTweet(item, config.categories)
        expect(tweet.content.length).toBeLessThanOrEqual(280)
        highQualityTweets.push(tweet)
      }

      console.log('\n=== 高品質コンテンツツイート ===')
      highQualityTweets.forEach((tweet, index) => {
        console.log(`${index + 1}. ${tweet.originalItem.source} (${tweet.content.length}文字)`)
        console.log(`   品質スコア: ${tweet.stats.combinedScore}`)
        console.log(`   エンゲージメント: ${tweet.metadata.engagementScore}`)
        console.log(`   ツイート: ${tweet.content}`)
        console.log()
      })
    })
  })

  describe('長い記事でのツイート最適化テスト', () => {
    test('最も長い記事でのツイート生成', async () => {
      if (realFeedData.length === 0) return

      // 最も長いタイトル＋説明文の記事を見つける
      const longestItem = realFeedData.reduce((longest, current) => {
        const currentLength = (current.title || '').length + (current.description || '').length
        const longestLength = (longest.title || '').length + (longest.description || '').length
        return currentLength > longestLength ? current : longest
      })

      console.log('\n=== 最長記事でのテスト ===')
      console.log(`記事: ${longestItem.title?.substring(0, 100)}...`)
      console.log(`元タイトル長: ${(longestItem.title || '').length}文字`)
      console.log(`元説明文長: ${(longestItem.description || '').length}文字`)

      const tweet = await generator.generateTweet(longestItem, config.categories)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)

      console.log(`生成ツイート: ${tweet.content}`)
      console.log(`ツイート長: ${tweet.content.length}/280文字`)
      console.log(`最適化済み: ${tweet.content.includes('...') ? 'Yes' : 'No'}`)
    })
  })

  describe('URL長とハッシュタグを含む実際のケース', () => {
    test('実際のURL付き記事での文字数計算', async () => {
      const urlItems = realFeedData.filter(item => item.link && item.link.length > 50)

      if (urlItems.length === 0) {
        console.warn('長いURLを持つ記事が見つかりませんでした')
        return
      }

      console.log('\n=== 実際のURL付き記事テスト ===')

      for (const item of urlItems.slice(0, 3)) {
        const tweet = await generator.generateTweet(item, config.categories)

        expect(tweet.content.length).toBeLessThanOrEqual(280)

        console.log(`記事: ${item.title?.substring(0, 60)}...`)
        console.log(`元URL: ${item.link}`)
        console.log(`URL長: ${item.link.length}文字`)
        console.log(`ツイート: ${tweet.content}`)
        console.log(`ツイート長: ${tweet.content.length}/280文字`)
        console.log()
      }
    })
  })

  describe('エンゲージメントスコア検証', () => {
    test('実データでのエンゲージメントスコア算出', async () => {
      if (realFeedData.length === 0) return

      const engagementResults = []

      for (const item of realFeedData.slice(0, 10)) {
        const tweet = await generator.generateTweet(item, config.categories)

        engagementResults.push({
          feedName: item.feedName,
          category: item.category,
          engagementScore: tweet.metadata.engagementScore,
          hasUrl: tweet.content.includes('http'),
          hashtagCount: tweet.metadata.hashtags.length,
          tweetLength: tweet.content.length
        })
      }

      console.log('\n=== エンゲージメントスコア分析 ===')

      const avgEngagement = engagementResults.reduce((sum, r) => sum + r.engagementScore, 0) / engagementResults.length
      console.log(`平均エンゲージメントスコア: ${Math.round(avgEngagement * 100) / 100}`)

      const byFeed = {}
      engagementResults.forEach(result => {
        if (!byFeed[result.feedName]) {
          byFeed[result.feedName] = []
        }
        byFeed[result.feedName].push(result.engagementScore)
      })

      console.log('\nフィード別平均エンゲージメント:')
      Object.entries(byFeed).forEach(([feedName, scores]) => {
        const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length
        console.log(`  ${feedName}: ${Math.round(avg * 100) / 100}`)
      })

      // 全てのエンゲージメントスコアが妥当な範囲内であることを確認
      engagementResults.forEach(result => {
        expect(result.engagementScore).toBeGreaterThan(0)
        expect(result.engagementScore).toBeLessThanOrEqual(1)
      })
    })
  })
})
