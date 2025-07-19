/**
 * RSS Feed Parser
 * RSSフィードの解析と処理を行うクラス
 *
 * Features:
 * - RSS/XMLフィード解析
 * - エラーハンドリングとリトライ機能
 * - 複数フィード同時処理
 * - メタデータ付与
 */

const RSSParser = require('rss-parser')
const fs = require('fs').promises
const winston = require('winston')

class FeedParser {
  /**
   * FeedParser constructor
   * @param {Object} config - 設定オブジェクト
   */
  constructor (config = {}) {
    this.config = {
      timeout: 30000,
      retryAttempts: 2,
      retryDelay: 5000,
      userAgent: 'n8n-tweet-bot/1.0.0',
      rateLimitDelay: 1000,
      maxConcurrentFeeds: 5,
      ...config
    }

    // Logger setup
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          silent: process.env.NODE_ENV === 'test'
        })
      ]
    })

    // RSS Parser setup
    this.rssParser = new RSSParser({
      timeout: this.config.timeout,
      headers: {
        'User-Agent': this.config.userAgent
      }
    })
  }

  /**
   * RSS設定ファイルを読み込む
   * @param {string} configPath - 設定ファイルのパス
   * @returns {Promise<Object>} 設定オブジェクト
   */
  async loadFeedConfig (configPath) {
    try {
      const configData = await fs.readFile(configPath, 'utf8')
      const config = JSON.parse(configData)

      this.logger.info('Feed configuration loaded successfully', {
        configPath,
        feedCount: config.feeds?.length || 0
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
   * フィード設定を検証する
   * @param {Object} feedConfig - フィード設定
   * @throws {Error} 無効な設定の場合
   */
  validateFeedConfig (feedConfig) {
    const required = ['name', 'url']
    const missing = required.filter(field => !feedConfig[field] || feedConfig[field].trim() === '')

    if (missing.length > 0) {
      throw new Error(`Invalid feed configuration: missing ${missing.join(', ')}`)
    }

    // URL format validation
    try {
      new URL(feedConfig.url)
    } catch (error) {
      throw new Error('Invalid feed configuration: invalid URL format')
    }

    // Positive number validation
    if (feedConfig.timeout !== undefined && feedConfig.timeout < 0) {
      throw new Error('Invalid feed configuration: timeout must be positive')
    }

    if (feedConfig.retryAttempts !== undefined && feedConfig.retryAttempts < 0) {
      throw new Error('Invalid feed configuration: retryAttempts must be positive')
    }
  }

  /**
   * 単一のRSSフィードを解析する
   * @param {Object} feedConfig - フィード設定
   * @returns {Promise<Object>} 解析結果
   */
  async parseFeed (feedConfig) {
    try {
      this.validateFeedConfig(feedConfig)

      this.logger.info('Starting feed parsing', {
        feedName: feedConfig.name,
        url: feedConfig.url
      })

      const startTime = Date.now()

      // Set timeout for this specific feed
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Feed parsing timeout'))
        }, feedConfig.timeout || this.config.timeout)
      })

      // Parse feed with timeout
      const parsePromise = this.rssParser.parseURL(feedConfig.url)
      const feed = await Promise.race([parsePromise, timeoutPromise])

      const duration = Date.now() - startTime

      this.logger.info('Feed parsing completed', {
        feedName: feedConfig.name,
        itemCount: feed.items?.length || 0,
        duration
      })

      return {
        metadata: {
          title: feed.title,
          description: feed.description,
          link: feed.link,
          lastBuildDate: feed.lastBuildDate,
          feedName: feedConfig.name,
          category: feedConfig.category,
          parsedAt: new Date().toISOString(),
          duration
        },
        items: this.enrichFeedItems(feed.items || [], feedConfig)
      }
    } catch (error) {
      this.logger.error('Feed parsing failed', {
        feedName: feedConfig.name,
        url: feedConfig.url,
        error: error.message
      })
      throw new Error(`Failed to parse RSS feed: ${error.message}`)
    }
  }

  /**
   * フィードアイテムにメタデータを付与する
   * @param {Array} items - フィードアイテム配列
   * @param {Object} feedConfig - フィード設定
   * @returns {Array} エンリッチされたアイテム配列
   */
  enrichFeedItems (items, feedConfig) {
    return items.map(item => {
      const content = `${item.title || ''} ${item.description || ''}`
      const wordCount = this.calculateWordCount(content)
      const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200)) // 200 words per minute

      return {
        ...item,
        feedName: feedConfig.name,
        category: feedConfig.category,
        priority: feedConfig.priority,
        processedAt: new Date().toISOString(),
        wordCount,
        estimatedReadTime,
        // Ensure required fields
        title: item.title || 'Untitled',
        description: item.description || '',
        link: item.link || '',
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        guid: item.guid || item.link || `${feedConfig.name}-${Date.now()}`
      }
    })
  }

  /**
   * テキストの単語数を計算する
   * @param {string} text - 対象テキスト
   * @returns {number} 単語数
   */
  calculateWordCount (text) {
    if (!text || typeof text !== 'string') return 0
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  /**
   * リトライ機能付きでフィードを解析する
   * @param {Object} feedConfig - フィード設定
   * @returns {Promise<Object>} 解析結果
   */
  async parseWithRetry (feedConfig) {
    const maxAttempts = feedConfig.retryAttempts || this.config.retryAttempts
    let lastError

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.parseFeed(feedConfig)
      } catch (error) {
        lastError = error

        this.logger.warn('Feed parsing attempt failed', {
          feedName: feedConfig.name,
          attempt,
          maxAttempts,
          error: error.message
        })

        if (attempt < maxAttempts) {
          const delay = this.config.retryDelay * attempt // Exponential backoff
          await this.delay(delay)
        }
      }
    }

    this.logger.error('Feed parsing failed after all retry attempts', {
      feedName: feedConfig.name,
      maxAttempts,
      error: lastError
    })

    throw new Error(`Max retry attempts exceeded: ${lastError.message}`)
  }

  /**
   * 複数のフィードを並行処理で解析する
   * @param {Array} feedConfigs - フィード設定配列
   * @returns {Promise<Array>} 解析結果配列
   */
  async parseMultipleFeeds (feedConfigs) {
    // Filter enabled feeds only
    const enabledFeeds = feedConfigs.filter(config => config.enabled !== false)

    this.logger.info('Starting multiple feed parsing', {
      totalFeeds: feedConfigs.length,
      enabledFeeds: enabledFeeds.length
    })

    const parsePromises = enabledFeeds.map(async (feedConfig, index) => {
      try {
        // Rate limiting - add delay between requests
        if (index > 0) {
          await this.delay(this.config.rateLimitDelay * index)
        }

        return await this.parseWithRetry(feedConfig)
      } catch (error) {
        this.logger.error('Individual feed parsing failed', {
          feedName: feedConfig.name,
          error: error.message
        })
        return null // Return null for failed feeds, filter out later
      }
    })

    const results = await Promise.allSettled(parsePromises)

    // Filter successful results
    const successfulResults = results
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value)

    this.logger.info('Multiple feed parsing completed', {
      totalRequested: enabledFeeds.length,
      successful: successfulResults.length,
      failed: enabledFeeds.length - successfulResults.length
    })

    return successfulResults
  }

  /**
   * 指定時間待機する
   * @param {number} ms - 待機時間（ミリ秒）
   * @returns {Promise} 待機Promise
   */
  delay (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * フィード設定からカテゴリ情報を取得する
   * @param {Object} fullConfig - 完全な設定オブジェクト
   * @param {string} categoryName - カテゴリ名
   * @returns {Object} カテゴリ情報
   */
  getCategoryInfo (fullConfig, categoryName) {
    return fullConfig.categories?.[categoryName] || {
      weight: 0.5,
      keywords: [],
      hashtagPrefix: '#AI'
    }
  }

  /**
   * フィードの健全性をチェックする
   * @param {Object} feedResult - フィード解析結果
   * @returns {Object} 健全性チェック結果
   */
  checkFeedHealth (feedResult) {
    const health = {
      status: 'healthy',
      issues: [],
      score: 1.0
    }

    // Check if feed has items
    if (!feedResult.items || feedResult.items.length === 0) {
      health.issues.push('No items found in feed')
      health.score -= 0.3
    }

    // Check for recent content
    if (feedResult.items && feedResult.items.length > 0) {
      const latestItem = feedResult.items[0]
      const daysSinceLatest = (Date.now() - new Date(latestItem.pubDate)) / (1000 * 60 * 60 * 24)

      if (daysSinceLatest > 30) {
        health.issues.push('No recent content (older than 30 days)')
        health.score -= 0.2
      }
    }

    // Check parse duration
    if (feedResult.metadata.duration > 30000) {
      health.issues.push('Slow feed response time')
      health.score -= 0.1
    }

    // Determine overall status
    if (health.score < 0.5) {
      health.status = 'unhealthy'
    } else if (health.score < 0.8) {
      health.status = 'warning'
    }

    return health
  }
}

module.exports = FeedParser
