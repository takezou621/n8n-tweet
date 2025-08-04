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
const TwitterClient = require('./integrations/twitter-client')

// Monitoring modules
const HealthChecker = require('./monitoring/health-checker')
const MetricsCollector = require('./monitoring/metrics-collector')

// Storage modules
const TweetHistory = require('./storage/tweet-history')

class AITweetBot {
  constructor () {
    this.initializeLogger()
    this.loadConfiguration()
    this.initializeComponents()
  }

  /**
   * ロガーを初期化
   */
  initializeLogger () {
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
  async loadConfiguration () {
    try {
      const defaultConfig = require('../config/default.json')
      const feedConfig = require('../config/rss-feeds.json')

      // 環境変数の置換処理
      const resolvedConfig = this.resolveEnvironmentVariables(defaultConfig)

      this.config = {
        ...resolvedConfig,
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
   * 設定ファイル内の環境変数を置換する
   */
  resolveEnvironmentVariables (config) {
    const resolved = JSON.parse(JSON.stringify(config)) // Deep copy

    const replaceEnvVars = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // ${ENV_VAR} パターンを環境変数で置換
          obj[key] = obj[key].replace(/\$\{([^}]+)\}/g, (match, envVar) => {
            const envValue = process.env[envVar]
            if (envValue === undefined) {
              this.logger.warn(`Environment variable ${envVar} is not set, using placeholder`)
              return match // 環境変数が設定されていない場合はそのまま
            }
            return envValue
          })
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          replaceEnvVars(obj[key])
        }
      }
    }

    replaceEnvVars(resolved)
    return resolved
  }

  /**
   * コンポーネントを初期化
   */
  initializeComponents () {
    try {
      // RSS Feed Parser
      this.feedParser = new FeedParser(this.config.apis.rss)

      // Content Filtering
      this.contentFilter = new ContentFilter(this.config.content.filtering)
      this.duplicateChecker = new DuplicateChecker(this.config.storage.rssCache)

      // Tweet Generation
      this.tweetGenerator = new TweetGenerator(this.config.content.generation)

      // Twitter API Client
      this.twitterClient = new TwitterClient(this.config.apis.twitter)

      // Storage Components
      this.tweetHistory = new TweetHistory(this.config.storage.tweetHistory)

      // Monitoring Components
      this.healthChecker = new HealthChecker(this.config.monitoring.healthCheck)
      this.metricsCollector = new MetricsCollector(this.config.monitoring.metrics)

      // コンポーネントを監視に登録
      this.healthChecker.registerComponent('feedParser', this.feedParser)
      this.healthChecker.registerComponent('contentFilter', this.contentFilter)
      this.healthChecker.registerComponent('duplicateChecker', this.duplicateChecker)
      this.healthChecker.registerComponent('tweetGenerator', this.tweetGenerator)
      this.healthChecker.registerComponent('twitterClient', this.twitterClient)
      this.healthChecker.registerComponent('tweetHistory', this.tweetHistory)

      // メトリクスを登録
      this.metricsCollector.registerMetric(
        'feed_processing_count',
        'counter',
        'Number of feed processing operations'
      )
      this.metricsCollector.registerMetric('tweets_posted', 'counter', 'Number of tweets posted')
      this.metricsCollector.registerMetric('errors_total', 'counter', 'Total number of errors')
      this.metricsCollector.registerMetric(
        'feed_processing_duration_ms',
        'gauge',
        'Feed processing duration in milliseconds'
      )
      this.metricsCollector.registerMetric(
        'tweet_posting_duration_ms',
        'gauge',
        'Tweet posting duration in milliseconds'
      )

      // 初期化完了を記録
      this.lastFeedResults = null

      this.logger.info('All components initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize components', { error: error.message })
      throw error
    }
  }

  /**
   * システムの健全性チェック
   */
  async healthCheck () {
    try {
      // 詳細なヘルスチェックを実行
      const health = await this.healthChecker.performHealthCheck()

      this.logger.info('Health check completed', {
        status: health.status,
        score: health.score,
        components: health.totalComponents
      })

      return health
    } catch (error) {
      const fallbackHealth = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        components: {}
      }

      this.logger.error('Health check failed', fallbackHealth)
      return fallbackHealth
    }
  }

  /**
   * RSS フィード処理のメインワークフロー
   */
  async processFeeds () {
    try {
      this.logger.info('Starting RSS feed processing workflow')

      // メトリクス収集開始
      const result = await this.metricsCollector.measureExecutionTime(
        'feed_processing',
        async () => {
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

          return {
            allItems,
            filteredItems,
            uniqueItems,
            tweets,
            optimalTweets
          }
        }
      )

      // 結果を保存（メトリクス用）
      this.lastFeedResults = result

      // メトリクスを記録
      this.metricsCollector.incrementCounter('feed_processing_count')
      this.metricsCollector.setGauge('rss_items_processed_latest', result.allItems.length)
      this.metricsCollector.setGauge('rss_items_filtered_latest', result.filteredItems.length)
      this.metricsCollector.setGauge('tweets_generated_latest', result.tweets.length)

      this.logger.info('Feed processing completed', {
        originalItems: result.allItems.length,
        afterFiltering: result.filteredItems.length,
        afterDeduplication: result.uniqueItems.length,
        tweetsGenerated: result.tweets.length,
        optimalTweets: result.optimalTweets.length
      })

      return result
    } catch (error) {
      this.metricsCollector.incrementCounter('errors_total', 1, { component: 'feed_processing' })
      this.logger.error('Feed processing failed', { error: error.message })
      throw error
    }
  }

  /**
   * ツイートを投稿する
   */
  async postTweets (tweets) {
    try {
      if (!tweets || tweets.length === 0) {
        this.logger.warn('No tweets to post')
        return { success: true, posted: 0, message: 'No tweets to post' }
      }

      this.logger.info('Starting tweet posting process', {
        tweetCount: tweets.length
      })

      // Twitter API認証確認
      const twitterHealth = await this.twitterClient.healthCheck()
      if (!twitterHealth.authenticated) {
        throw new Error('Twitter API authentication failed: ' + twitterHealth.error)
      }

      // 履歴チェックで重複を除去
      const uniqueTweets = []
      for (const tweet of tweets) {
        const duplicateCheck = this.tweetHistory.checkDuplicate(tweet.text)
        if (!duplicateCheck.isDuplicate) {
          uniqueTweets.push(tweet)
        } else {
          this.logger.info('Skipping duplicate tweet', {
            text: tweet.text.substring(0, 50) + '...',
            originalDate: duplicateCheck.existingTweet.timestamp
          })
        }
      }

      if (uniqueTweets.length === 0) {
        this.logger.warn('All tweets were duplicates, nothing to post')
        return {
          success: true,
          total: tweets.length,
          successful: 0,
          failed: 0,
          skipped: tweets.length,
          message: 'All tweets were duplicates'
        }
      }

      // ツイートを投稿（メトリクス付き）
      const result = await this.metricsCollector.measureExecutionTime(
        'tweet_posting',
        async () => {
          return await this.twitterClient.postMultipleTweets(uniqueTweets)
        }
      )

      // 投稿されたツイートを履歴に記録
      if (result.results) {
        for (let i = 0; i < result.results.length; i++) {
          const postResult = result.results[i]
          const originalTweet = uniqueTweets[i]

          try {
            await this.tweetHistory.addTweet({
              id: postResult.data?.id || null,
              text: originalTweet.text,
              timestamp: new Date().toISOString(),
              source: 'ai-tweet-bot',
              metadata: {
                posted: postResult.success,
                platform: 'twitter',
                category: originalTweet.category || 'ai',
                tags: originalTweet.tags || [],
                dryRun: postResult.dryRun || false,
                error: postResult.error || null
              }
            })
          } catch (historyError) {
            this.logger.error('Failed to record tweet in history', {
              error: historyError.message,
              tweet: originalTweet.text.substring(0, 50) + '...'
            })
          }
        }
      }

      // メトリクスを記録
      this.metricsCollector.incrementCounter('tweets_posted', result.successful)
      if (result.failed > 0) {
        this.metricsCollector.incrementCounter(
          'errors_total',
          result.failed,
          { component: 'twitter_posting' }
        )
      }

      const finalResult = {
        ...result,
        skipped: tweets.length - uniqueTweets.length
      }

      this.logger.info('Tweet posting completed', {
        total: tweets.length,
        unique: uniqueTweets.length,
        successful: result.successful,
        failed: result.failed,
        skipped: finalResult.skipped
      })

      return {
        success: true,
        ...finalResult
      }
    } catch (error) {
      this.metricsCollector.incrementCounter('errors_total', 1, { component: 'tweet_posting' })
      this.logger.error('Tweet posting failed', { error: error.message })
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 完全なワークフロー実行（RSS収集→フィルタリング→ツイート生成→投稿）
   */
  async runCompleteWorkflow () {
    try {
      this.logger.info('Starting complete AI Tweet Bot workflow')

      // 1. RSS フィード処理
      const feedResults = await this.processFeeds()

      // 2. ツイート投稿
      const postResults = await this.postTweets(feedResults.optimalTweets)

      const workflowResults = {
        feedProcessing: {
          originalItems: feedResults.allItems.length,
          afterFiltering: feedResults.filteredItems.length,
          afterDeduplication: feedResults.uniqueItems.length,
          tweetsGenerated: feedResults.tweets.length,
          optimalTweets: feedResults.optimalTweets.length
        },
        tweetPosting: {
          success: postResults.success,
          total: postResults.total || 0,
          successful: postResults.successful || 0,
          failed: postResults.failed || 0
        },
        timestamp: new Date().toISOString()
      }

      this.logger.info('Complete workflow finished', workflowResults)
      return workflowResults
    } catch (error) {
      this.logger.error('Complete workflow failed', { error: error.message })
      throw error
    }
  }

  /**
   * アプリケーション開始
   */
  async start () {
    try {
      this.logger.info('Starting AI Tweet Bot', {
        version: this.config.version,
        environment: this.config.environment
      })

      // ツイート履歴を読み込み
      await this.tweetHistory.loadHistory()
      this.logger.info('Tweet history loaded')

      // Health check
      await this.healthCheck()

      // 監視機能を開始
      if (this.config.monitoring?.healthCheck?.enabled !== false) {
        this.healthChecker.startPeriodicChecks()
        this.logger.info('Health monitoring started')
      }

      if (this.config.monitoring?.metrics?.collection !== false) {
        this.metricsCollector.startPeriodicCollection(this)
        this.logger.info('Metrics collection started')
      }

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
  async stop () {
    try {
      this.logger.info('Stopping AI Tweet Bot')

      // 監視機能を停止
      if (this.healthChecker) {
        this.healthChecker.stopPeriodicChecks()
        this.logger.info('Health monitoring stopped')
      }

      if (this.metricsCollector) {
        await this.metricsCollector.cleanup()
        this.logger.info('Metrics collection stopped')
      }

      // ストレージを保存・クリーンアップ
      if (this.tweetHistory) {
        await this.tweetHistory.cleanup()
        this.logger.info('Tweet history saved and cleaned up')
      }

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
  const logger = bot.logger

  bot.start()
    .then(() => {
      logger.info('✅ AI Tweet Bot is running')

      // Graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('🛑 Shutting down gracefully...')
        await bot.stop()
        process.exit(0)
      })

      process.on('SIGTERM', async () => {
        logger.info('🛑 Received SIGTERM, shutting down...')
        await bot.stop()
        process.exit(0)
      })
    })
    .catch(error => {
      logger.error('❌ Failed to start AI Tweet Bot:', error.message)
      process.exit(1)
    })
}

module.exports = AITweetBot
