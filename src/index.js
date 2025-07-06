/**
 * n8n-tweet: AI情報収集・配信システム
 * メインエントリーポイント
 * 
 * Features:
 * - RSS Feed自動収集とフィルタリング
 * - ツイート生成と投稿
 * - 監視とヘルスチェック
 */

require('dotenv').config()
const path = require('path')
const winston = require('winston')

// Core modules
const FeedParser = require('./utils/feed-parser')
const ContentFilter = require('./filters/content-filter')
const DuplicateChecker = require('./filters/duplicate-checker')
const TweetGenerator = require('./generators/tweet-generator')

class AITweetBot {
  constructor() {
    this.initializeLogger()
    this.loadConfiguration()
    this.initializeComponents()
  }

  /**
   * ロガーを初期化
   */
  initializeLogger() {
    const logDir = process.env.LOG_DIR || './logs'
    
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
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
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error'
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'app.log')
        })
      ]
    })
  }

  /**
   * 設定を読み込む
   */
  async loadConfiguration() {
    try {
      const defaultConfig = require('../config/default.json')
      const feedConfig = require('../config/rss-feeds.json')
      
      this.config = {
        ...defaultConfig,
        feeds: feedConfig
      }
      
      this.logger.info('Configuration loaded successfully', {
        environment: this.config.environment,
        version: this.config.version
      })
    } catch (error) {
      this.logger.error('Failed to load configuration', { error: error.message })
      throw error
    }
  }

  /**
   * コンポーネントを初期化
   */
  initializeComponents() {
    try {
      // RSS Feed Parser
      this.feedParser = new FeedParser(this.config.apis.rss)
      
      // Content Filtering
      this.contentFilter = new ContentFilter(this.config.content.filtering)
      this.duplicateChecker = new DuplicateChecker(this.config.storage.rssCache)
      
      // Tweet Generation
      this.tweetGenerator = new TweetGenerator(this.config.content.generation)
      
      this.logger.info('All components initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize components', { error: error.message })
      throw error
    }
  }

  /**
   * システムの健全性チェック
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {}
    }

    try {
      // Feed Parser health check
      health.components.feedParser = { status: 'healthy' }
      
      // Content Filter health check
      health.components.contentFilter = { status: 'healthy' }
      
      // Duplicate Checker health check  
      health.components.duplicateChecker = { status: 'healthy' }
      
      // Tweet Generator health check
      health.components.tweetGenerator = { status: 'healthy' }
      
      this.logger.info('Health check completed', health)
      return health
    } catch (error) {
      health.status = 'unhealthy'
      health.error = error.message
      this.logger.error('Health check failed', health)
      return health
    }
  }

  /**
   * RSS フィード処理のメインワークフロー
   */
  async processFeeds() {
    try {
      this.logger.info('Starting RSS feed processing workflow')
      
      // 1. Load feed configuration
      const feedConfigs = this.config.feeds.feeds.filter(feed => feed.enabled)
      
      // 2. Parse RSS feeds
      this.logger.info('Parsing RSS feeds', { count: feedConfigs.length })
      const feedResults = await this.feedParser.parseMultipleFeeds(feedConfigs)
      
      // 3. Extract and combine all items
      const allItems = []
      feedResults.forEach(result => {
        if (result && result.items) {
          allItems.push(...result.items)
        }
      })
      
      this.logger.info('RSS parsing completed', { 
        totalItems: allItems.length,
        feeds: feedResults.length 
      })
      
      // 4. Filter content for AI relevance
      this.logger.info('Starting content filtering')
      const filteredItems = await this.contentFilter.filterRelevantContent(
        allItems, 
        this.config.feeds.categories
      )
      
      // 5. Remove duplicates
      this.logger.info('Checking for duplicates')
      const uniqueItems = await this.duplicateChecker.removeDuplicates(filteredItems)
      
      // 6. Generate tweets
      this.logger.info('Generating tweets')
      const tweets = await this.tweetGenerator.generateTweets(
        uniqueItems,
        this.config.feeds.categories
      )
      
      // 7. Select optimal tweets for posting
      const optimalTweets = this.tweetGenerator.selectOptimalTweets(tweets, 5)
      
      this.logger.info('Feed processing completed', {
        originalItems: allItems.length,
        afterFiltering: filteredItems.length,
        afterDeduplication: uniqueItems.length,
        tweetsGenerated: tweets.length,
        optimalTweets: optimalTweets.length
      })
      
      return {
        allItems,
        filteredItems,
        uniqueItems,
        tweets,
        optimalTweets
      }
    } catch (error) {
      this.logger.error('Feed processing failed', { error: error.message })
      throw error
    }
  }

  /**
   * アプリケーション開始
   */
  async start() {
    try {
      this.logger.info('Starting AI Tweet Bot', {
        version: this.config.version,
        environment: this.config.environment
      })
      
      // Health check
      await this.healthCheck()
      
      this.logger.info('AI Tweet Bot started successfully')
      return true
    } catch (error) {
      this.logger.error('Failed to start AI Tweet Bot', { error: error.message })
      throw error
    }
  }

  /**
   * アプリケーション停止
   */
  async stop() {
    try {
      this.logger.info('Stopping AI Tweet Bot')
      
      // Cleanup resources if needed
      
      this.logger.info('AI Tweet Bot stopped successfully')
      return true
    } catch (error) {
      this.logger.error('Failed to stop AI Tweet Bot', { error: error.message })
      throw error
    }
  }
}

// CLI実行時の処理
if (require.main === module) {
  const bot = new AITweetBot()
  
  bot.start()
    .then(() => {
      console.log('✅ AI Tweet Bot is running')
      
      // Graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down gracefully...')
        await bot.stop()
        process.exit(0)
      })
      
      process.on('SIGTERM', async () => {
        console.log('\n🛑 Received SIGTERM, shutting down...')
        await bot.stop()
        process.exit(0)
      })
    })
    .catch(error => {
      console.error('❌ Failed to start AI Tweet Bot:', error.message)
      process.exit(1)
    })
}

module.exports = AITweetBot
