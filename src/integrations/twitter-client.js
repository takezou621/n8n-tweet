/**
 * Twitter API v2 クライアント
 * ツイート投稿と認証を管理
 *
 * Features:
 * - ツイート投稿
 * - レート制限管理
 * - エラーハンドリング
 * - 投稿履歴の管理
 */

const { TwitterApi } = require('twitter-api-v2')
const winston = require('winston')

class TwitterClient {
  constructor (config = {}) {
    this.config = {
      // デフォルト設定
      rateLimitDelay: 60000, // 1分
      maxRetries: 3,
      retryDelay: 5000, // 5秒
      enableDryRun: false,
      ...config
    }

    this.initializeLogger()
    this.initializeClient()
    this.postHistory = []
    this.lastPostTime = null
  }

  /**
   * ロガーを初期化
   */
  initializeLogger () {
    this.logger = winston.createLogger({
      level: 'info',
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
   * 認証情報を検証する
   */
  validateCredentials (credentials) {
    if (!credentials || typeof credentials !== 'object') {
      throw new Error('Twitter API credentials are required')
    }

    const { apiKey, apiSecret, accessToken, accessTokenSecret } = credentials

    // 必須フィールドの存在チェック
    const requiredFields = { apiKey, apiSecret, accessToken, accessTokenSecret }
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} is required and must be a non-empty string`)
      }
    }

    // テスト環境では厳格な検証をスキップ
    if (process.env.NODE_ENV === 'test') {
      return
    }

    // 形式検証（Twitter API仕様に基づく）
    const patterns = {
      apiKey: /^[A-Za-z0-9]{25}$/,
      apiSecret: /^[A-Za-z0-9]{50}$/,
      accessToken: /^\d+-[A-Za-z0-9]{40}$/,
      accessTokenSecret: /^[A-Za-z0-9]{45}$/
    }

    for (const [field, pattern] of Object.entries(patterns)) {
      if (!pattern.test(credentials[field])) {
        throw new Error(`Invalid ${field} format`)
      }
    }

    // 長さ検証
    const lengths = {
      apiKey: 25,
      apiSecret: 50,
      accessToken: [49, 50], // 数字部分 + ハイフン + 40文字
      accessTokenSecret: 45
    }

    for (const [field, expectedLength] of Object.entries(lengths)) {
      const actualLength = credentials[field].length
      if (Array.isArray(expectedLength)) {
        if (actualLength < expectedLength[0] || actualLength > expectedLength[1]) {
          throw new Error(
            `${field} must be ${expectedLength[0]}-${expectedLength[1]} characters long`
          )
        }
      } else {
        if (actualLength !== expectedLength) {
          throw new Error(`${field} must be exactly ${expectedLength} characters long`)
        }
      }
    }
  }

  /**
   * Twitter API クライアントを初期化
   */
  initializeClient () {
    try {
      // 認証情報の詳細検証
      this.validateCredentials(this.config.credentials)

      const {
        apiKey,
        apiSecret,
        accessToken,
        accessTokenSecret
      } = this.config.credentials

      this.client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken,
        accessSecret: accessTokenSecret
      })

      this.logger.info('Twitter client initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize Twitter client', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 認証をテストする
   */
  async testAuthentication () {
    try {
      this.logger.info('Testing Twitter authentication')

      const user = await this.client.v2.me()

      this.logger.info('Twitter authentication successful', {
        username: user.data.username,
        userId: user.data.id
      })

      return {
        success: true,
        user: user.data
      }
    } catch (error) {
      // セキュリティ: 内部エラー詳細をフィルタリング
      const sanitizedError = this.sanitizeError(error)

      this.logger.error('Twitter authentication failed', {
        error: sanitizedError,
        errorCode: error.code || 'UNKNOWN'
      })

      return {
        success: false,
        error: sanitizedError
      }
    }
  }

  /**
   * レート制限をチェック
   */
  checkRateLimit () {
    if (!this.lastPostTime) {
      return { canPost: true }
    }

    const timeSinceLastPost = Date.now() - this.lastPostTime
    const remainingDelay = this.config.rateLimitDelay - timeSinceLastPost

    if (remainingDelay > 0) {
      return {
        canPost: false,
        waitTime: remainingDelay,
        message: `Rate limit: wait ${Math.ceil(remainingDelay / 1000)} seconds`
      }
    }

    return { canPost: true }
  }

  /**
   * ツイートを投稿する
   */
  async postTweet (tweetData) {
    try {
      this.logger.info('Starting tweet posting process', {
        tweetLength: tweetData.text?.length || 0,
        hasMedia: !!tweetData.media,
        dryRun: this.config.enableDryRun
      })

      // ツイート内容の検証（ドライランでも実行）
      await this.validateTweet(tweetData)

      // ドライランモードの場合は実際に投稿しない
      if (this.config.enableDryRun) {
        this.logger.info('DRY RUN: Tweet would be posted', { tweetData })

        const dryRunResult = {
          id: 'dry-run-' + Date.now(),
          text: tweetData.text
        }

        // ドライランでも履歴を記録し、lastPostTimeを更新
        this.lastPostTime = Date.now()
        this.postHistory.push({
          id: dryRunResult.id,
          text: tweetData.text,
          timestamp: new Date().toISOString(),
          success: true,
          dryRun: true
        })

        return {
          success: true,
          dryRun: true,
          data: dryRunResult
        }
      }

      // レート制限チェック
      const rateLimit = this.checkRateLimit()
      if (!rateLimit.canPost) {
        throw new Error(rateLimit.message)
      }

      // ツイート投稿
      const result = await this.client.v2.tweet(tweetData.text)

      // 投稿履歴を更新
      this.lastPostTime = Date.now()
      this.postHistory.push({
        id: result.data.id,
        text: tweetData.text,
        timestamp: new Date().toISOString(),
        success: true
      })

      this.logger.info('Tweet posted successfully', {
        tweetId: result.data.id,
        text: tweetData.text.substring(0, 50) + '...'
      })

      return {
        success: true,
        data: result.data
      }
    } catch (error) {
      this.logger.error('Failed to post tweet', {
        error: error.message,
        tweetText: tweetData.text?.substring(0, 50) + '...'
      })

      // 失敗履歴を記録
      this.postHistory.push({
        text: tweetData.text,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      })

      // セキュリティ: 内部エラー詳細をフィルタリング
      const sanitizedError = this.sanitizeError(error)

      return {
        success: false,
        error: sanitizedError
      }
    }
  }

  /**
   * ツイート内容を検証する
   */
  async validateTweet (tweetData) {
    if (!tweetData || tweetData.text === undefined || tweetData.text === null) {
      throw new Error('Tweet text is required')
    }

    if (typeof tweetData.text !== 'string') {
      throw new Error('Tweet text must be a string')
    }

    if (tweetData.text.length === 0) {
      throw new Error('Tweet text cannot be empty')
    }

    if (tweetData.text.length > 280) {
      throw new Error(`Tweet text too long: ${tweetData.text.length} characters (max: 280)`)
    }

    // 重複投稿チェック
    const recentTweets = this.postHistory
      .filter(post => post.success)
      .slice(-10) // 最新10件をチェック

    const isDuplicate = recentTweets.some(post =>
      post.text === tweetData.text
    )

    if (isDuplicate) {
      throw new Error('Duplicate tweet detected in recent history')
    }

    this.logger.info('Tweet validation passed', {
      textLength: tweetData.text.length
    })
  }

  /**
   * 複数のツイートを順次投稿する
   */
  async postMultipleTweets (tweets) {
    const results = []

    this.logger.info('Starting batch tweet posting', {
      count: tweets.length
    })

    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i]

      this.logger.info(`Posting tweet ${i + 1}/${tweets.length}`)

      try {
        const result = await this.postTweet(tweet)
        results.push(result)

        // 次のツイートまで待機（レート制限対応）
        if (i < tweets.length - 1 && !this.config.enableDryRun) {
          this.logger.info(`Waiting ${this.config.rateLimitDelay / 1000}s before next tweet`)
          await this.sleep(this.config.rateLimitDelay)
        }
      } catch (error) {
        this.logger.error(`Failed to post tweet ${i + 1}`, {
          error: error.message
        })
        results.push({
          success: false,
          error: error.message,
          tweet
        })
      }
    }

    const successCount = results.filter(r => r.success).length

    this.logger.info('Batch tweet posting completed', {
      total: tweets.length,
      successful: successCount,
      failed: tweets.length - successCount
    })

    return {
      total: tweets.length,
      successful: successCount,
      failed: tweets.length - successCount,
      results
    }
  }

  /**
   * 投稿履歴を取得する
   */
  getPostHistory (limit = 50) {
    return this.postHistory
      .slice(-limit)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }

  /**
   * 統計情報を取得する
   */
  getStats () {
    const total = this.postHistory.length
    const successful = this.postHistory.filter(post => post.success).length
    const failed = total - successful

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
      lastPostTime: this.lastPostTime ? new Date(this.lastPostTime).toISOString() : null
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck () {
    try {
      const authResult = await this.testAuthentication()

      return {
        status: authResult.success ? 'healthy' : 'unhealthy',
        authenticated: authResult.success,
        user: authResult.user || null,
        error: authResult.error || null,
        stats: this.getStats(),
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        authenticated: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 設定を更新する
   */
  updateConfig (newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    }

    this.logger.info('Twitter client configuration updated', {
      enableDryRun: this.config.enableDryRun,
      rateLimitDelay: this.config.rateLimitDelay
    })
  }

  /**
   * エラーメッセージをサニタイズ（セキュリティ対策）
   */
  sanitizeError (error) {
    // Twitter API特有のエラーメッセージをフィルタリング
    const sensitivePatterns = [
      /invalid.*key/i,
      /invalid.*secret/i,
      /invalid.*token/i,
      /unauthorized/i,
      /authentication.*failed/i,
      /credentials.*invalid/i
    ]

    const message = error.message || 'Unknown error'

    // センシティブな情報を含む場合は汎用メッセージに置換
    for (const pattern of sensitivePatterns) {
      if (pattern.test(message)) {
        return 'Authentication failed. Please verify your Twitter API credentials.'
      }
    }

    // レート制限エラーは詳細を許可
    if (message.includes('rate limit') || message.includes('429')) {
      return message
    }

    // ネットワークエラーは詳細を許可
    if (message.includes('ECONNRESET') || message.includes('ETIMEDOUT') ||
        message.includes('ENOTFOUND')) {
      return 'Network error. Please check your internet connection.'
    }

    // その他のエラーは汎用メッセージ
    return 'An error occurred while communicating with Twitter API.'
  }

  /**
   * 待機関数
   */
  sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = TwitterClient
