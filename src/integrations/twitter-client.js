/**
 * Twitter API v2 クライアント
 * ツイート投稿と認証を管理
 *
 * Features:
 * - ツイート投稿 (OAuth 1.0a認証)
 * - レート制限管理
 * - エラーハンドリング
 * - 投稿履歴の管理
 */

const { TwitterApi } = require('twitter-api-v2')
const RateLimiter = require('../utils/rate-limiter')
const { createLogger } = require('../utils/logger')
const twitterConfig = require('../../config/twitter-config.json')

class TwitterClient {
  constructor (credentials, config = {}) {
    if (!credentials) {
      throw new Error('Twitter credentials are required')
    }

    this.credentials = credentials
    this.config = {
      ...twitterConfig,
      ...config
    }

    // ドライランモードの設定
    this.dryRun = config.dryRun || false

    // Twitter API v2クライアントの初期化
    if (!this.dryRun) {
      this.client = new TwitterApi({
        appKey: this.credentials.apiKey,
        appSecret: this.credentials.apiSecret,
        accessToken: this.credentials.accessToken,
        accessSecret: this.credentials.accessTokenSecret
      })

      // Read-writeクライアントを取得
      this.rwClient = this.client.readWrite
    }

    this.logger = createLogger('twitter-client', { enableConsole: false })
    this.rateLimiter = new RateLimiter(this.config.rateLimit)

    // 統計情報
    this.stats = {
      totalTweets: 0,
      successfulTweets: 0,
      failedTweets: 0
    }

    this.logger.info('TwitterClient initialized successfully', { dryRun: this.dryRun })
  }

  validateCredentials () {
    const required = ['bearerToken', 'apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret']
    const missing = required.filter(field => !this.credentials[field])

    if (missing.length > 0) {
      // テスト環境でもエラーメッセージは統一
      throw new Error('Missing required Twitter credential fields')
    }
  }

  async postTweet (text) {
    try {
      // バリデーション
      const validation = this.validateTweet(text)
      if (!validation.isValid) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: validation.errors[0]
          }
        }
      }

      // ドライランモードの場合
      if (this.dryRun) {
        this.logger.info('Dry run mode: Skipping actual tweet post', {
          text: text.substring(0, 50) + '...'
        })

        // レート制限チェック（ドライランでも実行）
        const limitCheck = await this.rateLimiter.checkLimit('tweets')
        if (!limitCheck.allowed) {
          return {
            success: false,
            error: {
              type: 'rate_limit',
              message: 'Rate limit exceeded for tweets'
            }
          }
        }

        // モックレスポンスを返す
        const mockResponse = {
          data: {
            id: 'mock-tweet-id-' + Date.now(),
            text,
            created_at: new Date().toISOString()
          }
        }

        await this.rateLimiter.recordRequest('tweets', true)
        this.stats.totalTweets++
        this.stats.successfulTweets++

        return {
          success: true,
          data: mockResponse.data,
          dryRun: true
        }
      }

      // レート制限チェック
      const limitCheck = await this.rateLimiter.checkLimit('tweets')
      if (!limitCheck.allowed) {
        return {
          success: false,
          error: {
            type: 'rate_limit',
            message: 'Rate limit exceeded for tweets'
          }
        }
      }

      // twitter-api-v2ライブラリを使用してツイート投稿
      const result = await this.makeRequestWithRetry(async () => {
        try {
          const tweet = await this.rwClient.v2.tweet(text)
          return tweet
        } catch (error) {
          // twitter-api-v2のエラーを統一された形式に変換
          console.error('Twitter API Error Details:', error)

          const apiError = new Error(error.message || 'Twitter API request failed')
          apiError.status = error.code || error.statusCode || 500
          apiError.type = error.type || 'api_error'

          // エラーの詳細情報を追加
          if (error.errors) {
            apiError.details = error.errors
          }

          throw apiError
        }
      })

      // 成功時の処理
      await this.rateLimiter.recordRequest('tweets', true)
      this.stats.totalTweets++
      this.stats.successfulTweets++

      return {
        success: true,
        data: result.data
      }
    } catch (error) {
      // 失敗時の処理
      await this.rateLimiter.recordRequest('tweets', false)
      this.stats.totalTweets++
      this.stats.failedTweets++

      let errorType = 'unknown'
      if (error.status === 401) {
        errorType = 'authentication'
      } else if (error.status >= 500) {
        errorType = 'server'
      }

      return {
        success: false,
        error: {
          type: errorType,
          message: error.message,
          statusCode: error.status
        }
      }
    }
  }

  validateTweet (text) {
    const errors = []

    if (!text || typeof text !== 'string') {
      errors.push('Tweet text is required')
    } else {
      const trimmed = text.trim()
      if (trimmed.length === 0) {
        errors.push('Tweet text is required')
      } else if (trimmed.length > this.config.validation.maxTweetLength) {
        errors.push(
          `Tweet exceeds maximum length of ${this.config.validation.maxTweetLength} characters`
        )
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  async testConnection () {
    try {
      // twitter-api-v2ライブラリを使用して現在のユーザー情報を取得
      const user = await this.client.v2.me()

      return {
        success: true,
        user: user.data
      }
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'authentication',
          message: error.message || 'Authentication failed'
        }
      }
    }
  }

  async makeRequestWithRetry (requestFn) {
    const maxAttempts = this.config.retry.maxAttempts
    let lastError

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await requestFn()
      } catch (error) {
        lastError = error

        // リトライ不可能なエラー
        if (error.status && error.status < 500) {
          throw error
        }

        // 最後の試行
        if (attempt === maxAttempts) {
          throw error
        }

        // 待機
        const delay = this.config.retry.baseDelay *
          Math.pow(this.config.retry.backoffMultiplier, attempt - 1)
        await new Promise(resolve =>
          setTimeout(resolve, Math.min(delay, this.config.retry.maxDelay))
        )
      }
    }

    throw lastError
  }

  getStats () {
    const successRate = this.stats.totalTweets > 0
      ? Math.round((this.stats.successfulTweets / this.stats.totalTweets) * 100)
      : 0

    return {
      totalTweets: this.stats.totalTweets,
      successfulTweets: this.stats.successfulTweets,
      failedTweets: this.stats.failedTweets,
      successRate,
      rateLimitStats: this.rateLimiter.getStats()
    }
  }

  cleanup () {
    try {
      if (this.rateLimiter) {
        this.rateLimiter.cleanup()
      }

      this.stats = {
        totalTweets: 0,
        successfulTweets: 0,
        failedTweets: 0
      }

      this.logger.info('TwitterClient cleanup completed')
    } catch (error) {
      this.logger.error('Error during cleanup', { error: error.message })
    }
  }
}

module.exports = TwitterClient
