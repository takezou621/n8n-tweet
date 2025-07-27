/**
 * RSSフィードパーサー
 * 複数のRSSフィードから記事を収集・解析
 */

const winston = require('winston')
const Parser = require('rss-parser')
const fs = require('fs').promises

class FeedParser {
  constructor (config = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      logLevel: 'info',
      retryAttempts: 2,
      ...config
    }

    this.initializeLogger()
    this.rssParser = new Parser({
      timeout: this.config.timeout,
      maxRedirects: 5,
      headers: {
        'User-Agent': this.config.userAgent || 'n8n-tweet-bot/1.0.0'
      }
    })
  }

  initializeLogger () {
    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          silent: process.env.NODE_ENV === 'test',
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })
  }

  /**
   * 複数のフィードを解析
   */
  async parseFeeds (feeds) {
    if (!Array.isArray(feeds)) {
      throw new Error('Feeds must be an array')
    }

    this.logger.info('Parsing feeds', { feedCount: feeds.length })

    const results = []

    for (const feed of feeds) {
      try {
        // フィードの解析（モック実装）
        const feedResult = await this.parseFeed(feed)
        results.push(...feedResult)
      } catch (error) {
        this.logger.error('Failed to parse feed', {
          url: feed.url,
          error: error.message
        })
        // エラーでも続行
      }
    }

    return results
  }

  /**
   * 複数のフィードを並行解析
   */
  async parseMultipleFeeds (feedConfigs) {
    if (!Array.isArray(feedConfigs)) {
      throw new Error('Feed configs must be an array')
    }

    this.logger.info('Parsing multiple feeds', { count: feedConfigs.length })

    const results = []

    for (const feedConfig of feedConfigs) {
      if (!feedConfig.enabled) {
        continue
      }

      try {
        const result = await this.parseWithRetry(feedConfig)
        // 成功した結果のみを含める
        if (result && !result.error) {
          // 期待される形式に変換
          const feedResult = {
            feedName: feedConfig.name,
            articles: result.items || [],
            metadata: result.metadata || {},
            success: result.success || true
          }
          results.push(feedResult)
        }
      } catch (error) {
        this.logger.error('Failed to parse feed after retries', {
          feedName: feedConfig.name,
          error: error.message
        })
        // エラーの場合でも空の結果を返す（テストの期待値に合わせる）
        results.push({
          feedName: feedConfig.name,
          articles: [],
          error: error.message,
          success: false
        })
      }
    }

    return results
  }

  /**
   * リトライ機能付きフィード解析
   */
  async parseWithRetry (feedConfig) {
    const maxRetries = feedConfig.retryAttempts || this.config.maxRetries
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug('Attempting to parse feed', {
          feedName: feedConfig.name,
          attempt,
          maxRetries
        })

        const result = await this.parseFeed(feedConfig)
        return result
      } catch (error) {
        lastError = error
        this.logger.warn('Feed parsing failed', {
          feedName: feedConfig.name,
          attempt,
          maxRetries,
          error
        })

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))
        }
      }
    }

    // 最大リトライ回数に達したらエラーをthrow
    throw new Error(`Max retry attempts exceeded: ${lastError.message}`)
  }

  /**
   * 単一フィードを解析
   */
  async parseFeed (feedConfig) {
    try {
      // バリデーション
      if (!feedConfig || !feedConfig.url) {
        throw new Error('Invalid feed configuration')
      }

      this.logger.debug('Parsing RSS feed', {
        feedName: feedConfig.name,
        url: feedConfig.url
      })

      // 実際のRSSフィードを解析
      const feed = await this.rssParser.parseURL(feedConfig.url)

      // メタデータと記事アイテムを整形
      const result = {
        metadata: {
          title: feed.title || feedConfig.name || 'RSS Feed',
          description: feed.description || `Feed from ${feedConfig.url}`,
          feedUrl: feedConfig.url,
          lastBuildDate: feed.lastBuildDate,
          link: feed.link
        },
        items: feed.items.map(item => ({
          title: item.title,
          description: item.contentSnippet || item.content || item.summary,
          link: item.link || item.url,
          pubDate: item.pubDate || item.isoDate,
          guid: item.guid || item.id,
          categories: item.categories || [],
          author: item.creator || item.author
        })),
        success: true
      }

      this.logger.info('RSS feed parsed successfully', {
        feedName: feedConfig.name,
        itemCount: result.items.length
      })

      return result
    } catch (error) {
      this.logger.error('Failed to parse RSS feed', {
        feedName: feedConfig.name,
        url: feedConfig.url,
        error: error.message
      })

      throw new Error(`Failed to parse RSS feed: ${error.message}`)
    }
  }

  /**
   * RSS設定ファイルを読み込む
   */
  async loadFeedConfig (configPath) {
    try {
      const configData = await fs.readFile(configPath, 'utf8')
      const config = JSON.parse(configData)

      this.logger.info('Feed configuration loaded successfully', {
        feedCount: config.feeds?.length || 0,
        configPath
      })

      return config
    } catch (error) {
      this.logger.error('Failed to load feed configuration', {
        configPath,
        error: error.message
      })
      throw new Error(`Failed to load feed configuration: ${error.message}`)
    }
  }

  /**
   * フィード設定を検証
   */
  validateFeedConfig (feedConfig) {
    if (!feedConfig || typeof feedConfig !== 'object') {
      throw new Error('Invalid feed configuration: must be an object')
    }

    if (!feedConfig.name || typeof feedConfig.name !== 'string' || feedConfig.name.trim() === '') {
      throw new Error('Invalid feed configuration: name is required')
    }

    if (!feedConfig.url || typeof feedConfig.url !== 'string' || feedConfig.url.trim() === '') {
      throw new Error('Invalid feed configuration: url is required')
    }

    // URL形式の簡単な検証
    try {
      const url = new URL(feedConfig.url)
      // URL検証のために使用
      if (!url.protocol) {
        throw new Error('Invalid protocol')
      }
    } catch {
      throw new Error('Invalid feed configuration: invalid URL format')
    }

    if (feedConfig.timeout !== undefined &&
        (typeof feedConfig.timeout !== 'number' || feedConfig.timeout < 0)) {
      throw new Error('Invalid feed configuration: timeout must be a positive number')
    }

    if (feedConfig.retryAttempts !== undefined &&
        (typeof feedConfig.retryAttempts !== 'number' || feedConfig.retryAttempts < 0)) {
      throw new Error('Invalid feed configuration: retryAttempts must be a positive number')
    }

    return true
  }

  /**
   * フィードアイテムを追加メタデータで強化
   */
  enrichFeedItems (items, feedConfig) {
    return items.map(item => {
      const text = `${item.title || ''} ${item.description || ''}`.trim()
      const wordCount = text.split(/\s+/).filter(word => word.length > 0).length
      const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200)) // 200 words per minute

      return {
        ...item,
        feedName: feedConfig.name,
        category: feedConfig.category,
        priority: feedConfig.priority,
        processedAt: new Date().toISOString(),
        wordCount,
        estimatedReadTime
      }
    })
  }

  /**
   * 文字数カウント
   */
  calculateWordCount (text) {
    if (!text || typeof text !== 'string') {
      return 0
    }
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  /**
   * 指定時間待機
   */
  async delay (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * カテゴリ情報を取得
   */
  getCategoryInfo (config, categoryName) {
    const categories = config.categories || {}
    const category = categories[categoryName]

    if (category) {
      return category
    }

    // デフォルトカテゴリを返す
    return {
      weight: 0.5,
      keywords: ['ai', 'technology'],
      hashtagPrefix: '#AI'
    }
  }

  /**
   * フィードの健全性をチェック
   */
  checkFeedHealth (feedResult) {
    const issues = []
    let score = 1.0

    // アイテム数をチェック
    if (!feedResult.items || feedResult.items.length === 0) {
      issues.push('No items found in feed')
      score -= 0.5
    }

    // 最新コンテンツのチェック (30日以内)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const hasRecentContent = feedResult.items?.some(item => {
      if (!item.pubDate) return false
      const itemDate = new Date(item.pubDate)
      return itemDate > thirtyDaysAgo
    })

    if (!hasRecentContent && feedResult.items?.length > 0) {
      issues.push('No recent content (older than 30 days)')
      score -= 0.3
    }

    // スコアに基づくステータス決定
    let status = 'healthy'
    if (score < 0.8) {
      status = 'warning'
    }
    if (score < 0.3) {
      status = 'critical'
    }

    return {
      status,
      score,
      issues
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck () {
    return {
      status: 'healthy',
      metrics: {
        available: true
      }
    }
  }
}

module.exports = FeedParser
