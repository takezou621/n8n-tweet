/**
 * 統合テスト用TwitterClientモック
 * 実際のTwitter APIを使わずに統合テストで使用
 */

const RateLimiter = require('../../../src/utils/rate-limiter')
const { createLogger } = require('../../../src/utils/logger')

class TwitterClientMock {
  constructor (credentials = {}, config = {}) {
    // テスト用の必須認証情報を自動設定
    this.credentials = {
      bearerToken: 'test_bearer_token_12345',
      apiKey: 'test_api_key_12345',
      apiSecret: 'test_api_secret_12345',
      accessToken: 'test_access_token_12345',
      accessTokenSecret: 'test_access_token_secret_12345',
      ...credentials
    }

    this.config = {
      api: {
        version: 'v2',
        baseUrl: 'https://api.twitter.com/2',
        timeout: 30000
      },
      validation: {
        maxTweetLength: 280
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 10000
      },
      rateLimit: {
        tweetsPerHour: 50,
        tweetsPerDay: 1000,
        requestsPerMinute: 100
      },
      ...config
    }

    this.logger = createLogger('twitter-client-mock', { enableConsole: false })
    this.rateLimiter = new RateLimiter(this.config.rateLimit)

    // 統計情報
    this.stats = {
      totalTweets: 0,
      successfulTweets: 0,
      failedTweets: 0
    }

    this.logger.info('TwitterClientMock initialized successfully')
  }

  /**
   * 認証情報の検証（常に成功）
   */
  validateCredentials () {
    // テスト環境では常に成功
    return true
  }

  /**
   * ツイート投稿のモック
   */
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

      // レート制限チェック
      const canPost = await this.rateLimiter.checkLimit('tweets')
      if (!canPost) {
        return {
          success: false,
          error: {
            type: 'rate_limit',
            message: 'Rate limit exceeded for tweets'
          }
        }
      }

      // モック API レスポンス生成
      const mockResponse = this._generateMockResponse(text)

      // 成功時の処理
      await this.rateLimiter.recordRequest('tweets', true)
      this.stats.totalTweets++
      this.stats.successfulTweets++

      return {
        success: true,
        data: mockResponse.data
      }
    } catch (error) {
      // 失敗時の処理
      await this.rateLimiter.recordRequest('tweets', false)
      this.stats.totalTweets++
      this.stats.failedTweets++

      return {
        success: false,
        error: {
          type: 'unknown',
          message: error.message
        }
      }
    }
  }

  /**
   * ツイートバリデーション
   */
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

  /**
   * 接続テスト（常に成功）
   */
  async testConnection () {
    return {
      success: true,
      user: {
        id: 'test_user_123',
        name: 'Test User',
        username: 'testuser'
      }
    }
  }

  /**
   * 統計情報の取得
   */
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

  /**
   * クリーンアップ
   */
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

      this.logger.info('TwitterClientMock cleanup completed')
    } catch (error) {
      this.logger.error('Error during cleanup', { error: error.message })
    }
  }

  /**
   * エラーシナリオの設定（テスト用）
   */
  setErrorScenario (scenario) {
    this.errorScenario = scenario
  }

  /**
   * モックレスポンス生成
   */
  _generateMockResponse (text) {
    // エラーシナリオの処理
    if (this.errorScenario) {
      switch (this.errorScenario) {
        case 'auth_error':
          throw new Error('Unauthorized')
        case 'network_error':
          throw new Error('Network connection failed')
        case 'server_error':
          throw new Error('Internal server error')
        default:
          break
      }
    }

    // 成功レスポンスの生成
    return {
      data: {
        id: `mock_tweet_${Date.now()}`,
        text,
        created_at: new Date().toISOString()
      }
    }
  }
}

module.exports = TwitterClientMock
