/**
 * RSSフィード収集・処理システム
 * AI関連情報の自動収集・フィルタリング・ツイート生成
 */

const RssParser = require('rss-parser')
// const TwitterClient = require('./integrations/twitter-client')
const { createLogger } = require('./utils/logger')
const RateLimiter = require('./utils/rate-limiter')

class RSSCollector {
  constructor (config = {}) {
    this.config = {
      rssFeeds: config.rssFeeds || [
        'https://arxiv.org/rss/cs.AI',
        'https://blog.openai.com/rss/',
        'https://ai.googleblog.com/feeds/posts/default'
      ],
      keywords: config.keywords || [
        'AI', 'artificial intelligence', 'machine learning', 'deep learning',
        'neural network', 'GPT', 'transformer', 'LLM', 'computer vision'
      ],
      maxItemsPerFeed: config.maxItemsPerFeed || 5,
      updateInterval: config.updateInterval || 3600000, // 1時間
      ...config
    }

    this.logger = createLogger('rss-collector')
    this.rssParser = new RssParser()
    this.twitterClient = null
    this.rateLimiter = new RateLimiter({
      requests: 10,
      windowMs: 60000
    })

    this.processedItems = new Set() // 重複防止
    this.stats = {
      feedsProcessed: 0,
      itemsCollected: 0,
      tweetsPosted: 0,
      errors: 0
    }
  }

  async initialize () {
    // 既存のTwitterClientを使用（動作確認済み）
    if (!this.twitterClient) {
      const TwitterClient = require('./integrations/twitter-client')
      this.twitterClient = new TwitterClient({
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
      }, { dryRun: false })
      this.logger.info('RSS Collector initialized successfully (TwitterClient)')
    }
  }

  async collectFeeds () {
    this.logger.info('Starting RSS feed collection...')

    const allItems = []

    for (const feedUrl of this.config.rssFeeds) {
      try {
        const feed = await this.rssParser.parseURL(feedUrl)
        this.logger.info(`Processing feed: ${feed.title} (${feedUrl})`)

        const items = feed.items
          .slice(0, this.config.maxItemsPerFeed)
          .map(item => ({
            ...item,
            sourceFeed: feed.title,
            feedUrl
          }))

        allItems.push(...items)
        this.stats.feedsProcessed++
      } catch (error) {
        this.logger.error(`Failed to process feed ${feedUrl}:`, error.message)
        this.stats.errors++
      }
    }

    this.stats.itemsCollected = allItems.length
    this.logger.info(`Collected ${allItems.length} items from ${this.stats.feedsProcessed} feeds`)

    return allItems
  }

  filterAIContent (items) {
    return items.filter(item => {
      const title = item.title?.toLowerCase() || ''
      const content = item.contentSnippet?.toLowerCase() || ''
      const description = item.content?.toLowerCase() || ''

      return this.config.keywords.some(keyword =>
        title.includes(keyword.toLowerCase()) ||
        content.includes(keyword.toLowerCase()) ||
        description.includes(keyword.toLowerCase())
      )
    })
  }

  generateTweet (item) {
    const title = item.title || ''
    const maxLength = 220 // ハッシュタグとURLのために余裕を残す

    let tweet = title.length > maxLength
      ? title.substring(0, maxLength - 3) + '...'
      : title

    // ハッシュタグを追加
    const hashtags = ['#AI', '#MachineLearning', '#Tech']
    tweet += '\n\n' + hashtags.join(' ')

    // URLを追加（短縮URLを使用）
    if (item.link) {
      tweet += '\n' + item.link
    }

    // ソース情報を追加
    if (item.sourceFeed) {
      tweet += `\n📡 ${item.sourceFeed}`
    }

    return tweet
  }

  async postToTwitter (items) {
    const tweetsPosted = []

    for (const item of items) {
      try {
        // 重複チェック
        const itemKey = item.link || item.guid
        if (this.processedItems.has(itemKey)) {
          continue
        }

        // レート制限チェック
        const limitCheck = await this.rateLimiter.checkLimit('tweets')
        if (!limitCheck.allowed) {
          this.logger.warn('Rate limit reached, skipping tweet')
          break
        }

        // ツイート生成
        const tweet = this.generateTweet(item)
        this.logger.info(`Posting tweet: ${tweet.substring(0, 50)}...`)

        // Twitter投稿
        const result = await this.twitterClient.postTweet(tweet, ['#AI', '#RSS'])

        if (result.success) {
          this.processedItems.add(itemKey)
          tweetsPosted.push({
            item,
            tweet,
            tweetId: result.data.id
          })
          this.stats.tweetsPosted++

          this.logger.info(`Tweet posted successfully: ${result.data.id}`)
        } else {
          this.logger.error('Failed to post tweet:', result.error)
          this.stats.errors++
        }

        // 次の投稿まで待機
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        this.logger.error(`Error posting tweet for ${item.title}:`, error.message)
        this.stats.errors++
      }
    }

    return tweetsPosted
  }

  async runCollectionCycle () {
    try {
      this.logger.info('=== Starting RSS Collection Cycle ===')

      // RSSフィード収集
      const allItems = await this.collectFeeds()

      // AI関連コンテンツフィルタリング
      const aiItems = this.filterAIContent(allItems)
      this.logger.info(`Filtered ${aiItems.length} AI-related items`)

      // Twitter投稿
      const postedTweets = await this.postToTwitter(aiItems)

      this.logger.info('=== RSS Collection Cycle Completed ===')
      this.logger.info(`Stats: ${JSON.stringify(this.stats)}`)

      return {
        collected: allItems.length,
        filtered: aiItems.length,
        posted: postedTweets.length,
        stats: this.stats
      }
    } catch (error) {
      this.logger.error('RSS Collection Cycle failed:', error.message)
      this.stats.errors++
      throw error
    }
  }

  startAutoCollection () {
    this.logger.info(`Starting auto collection with ${this.config.updateInterval}ms interval`)

    this.intervalId = setInterval(async () => {
      try {
        await this.runCollectionCycle()
      } catch (error) {
        this.logger.error('Auto collection cycle failed:', error.message)
      }
    }, this.config.updateInterval)
  }

  stopAutoCollection () {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.logger.info('Auto collection stopped')
    }
  }
}

module.exports = RSSCollector
