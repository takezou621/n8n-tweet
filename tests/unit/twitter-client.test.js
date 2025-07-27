const TwitterClient = require('../../src/integrations/twitter-client')
const RateLimiter = require('../../src/utils/rate-limiter')

// モック設定
jest.mock('../../src/utils/rate-limiter')
jest.mock('../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }))
}))

describe('TwitterClient', () => {
  let twitterClient
  let mockRateLimiter
  let mockCredentials

  beforeEach(() => {
    // RateLimiterのモック
    mockRateLimiter = {
      checkLimit: jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'Within limits',
        waitTime: 0
      }),
      recordRequest: jest.fn(),
      getStats: jest.fn().mockReturnValue({
        requests: 0,
        remaining: 100
      })
    }
    RateLimiter.mockImplementation(() => mockRateLimiter)

    // Twitter認証情報のモック
    mockCredentials = {
      bearerToken: 'test_bearer_token',
      apiKey: 'test_api_key',
      apiSecret: 'test_api_secret',
      accessToken: 'test_access_token',
      accessTokenSecret: 'test_access_token_secret'
    }

    // fetchのモック
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('初期化', () => {
    test('有効な認証情報でTwitterClientインスタンスが作成できる', () => {
      expect(() => {
        twitterClient = new TwitterClient(mockCredentials)
      }).not.toThrow()

      expect(twitterClient).toBeInstanceOf(TwitterClient)
      expect(twitterClient.credentials).toEqual(mockCredentials)
    })

    test('認証情報がない場合はエラーをスローする', () => {
      expect(() => {
        new TwitterClient() // eslint-disable-line no-new
      }).toThrow('Twitter credentials are required')
    })

    test('必須フィールドが不足している場合はエラーをスローする', () => {
      const incompleteCredentials = {
        bearerToken: 'test_token'
      }

      expect(() => {
        new TwitterClient(incompleteCredentials) // eslint-disable-line no-new
      }).toThrow('Missing required Twitter credential fields')
    })
  })

  describe('ツイート投稿', () => {
    beforeEach(() => {
      twitterClient = new TwitterClient(mockCredentials)
    })

    test('正常なツイートが投稿できる', async () => {
      const tweetText = 'Test tweet content'
      const mockResponse = {
        data: {
          id: '1234567890',
          text: tweetText
        }
      }

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await twitterClient.postTweet(tweetText)

      expect(result.success).toBe(true)
      expect(result.data.id).toBe('1234567890')
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tweets')
      expect(mockRateLimiter.recordRequest).toHaveBeenCalledWith('tweets', true)
    })

    test('レート制限に達した場合はエラーを返す', async () => {
      mockRateLimiter.checkLimit.mockResolvedValueOnce({
        allowed: false,
        reason: 'Rate limit exceeded',
        waitTime: 3600000
      })

      const result = await twitterClient.postTweet('Test tweet')

      expect(result.success).toBe(false)
      expect(result.error.type).toBe('rate_limit')
      expect(result.error.message).toContain('Rate limit exceeded')
    })

    test('280文字を超えるツイートはエラーを返す', async () => {
      const longTweet = 'a'.repeat(281)

      const result = await twitterClient.postTweet(longTweet)

      expect(result.success).toBe(false)
      expect(result.error.type).toBe('validation')
      expect(result.error.message).toContain('exceeds maximum length')
    })

    test('空のツイートはエラーを返す', async () => {
      const result = await twitterClient.postTweet('')

      expect(result.success).toBe(false)
      expect(result.error.type).toBe('validation')
      expect(result.error.message).toContain('Tweet text is required')
    })

    test('API認証エラーの場合はエラーを返す', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          errors: [{ message: 'Unauthorized' }]
        })
      })

      const result = await twitterClient.postTweet('Test tweet')

      expect(result.success).toBe(false)
      expect(result.error.type).toBe('authentication')
      expect(result.error.statusCode).toBe(401)
    })

    test('サーバーエラーの場合はリトライされる', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal server error' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({
            data: { id: '1234567890', text: 'Test tweet' }
          })
        })

      const result = await twitterClient.postTweet('Test tweet')

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('ツイート検証', () => {
    beforeEach(() => {
      twitterClient = new TwitterClient(mockCredentials)
    })

    test('有効なツイートテキストの検証が成功する', () => {
      const validTweet = 'This is a valid tweet'

      const result = twitterClient.validateTweet(validTweet)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('長すぎるツイートテキストの検証が失敗する', () => {
      const longTweet = 'a'.repeat(281)

      const result = twitterClient.validateTweet(longTweet)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Tweet exceeds maximum length of 280 characters')
    })

    test('空のツイートテキストの検証が失敗する', () => {
      const result = twitterClient.validateTweet('')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Tweet text is required')
    })

    test('ホワイトスペースのみのツイートの検証が失敗する', () => {
      const result = twitterClient.validateTweet('   \n\t   ')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Tweet text is required')
    })
  })

  describe('接続テスト', () => {
    beforeEach(() => {
      twitterClient = new TwitterClient(mockCredentials)
    })

    test('正常な接続テストが成功する', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          data: {
            id: 'test_user_id',
            name: 'Test User',
            username: 'testuser'
          }
        })
      })

      const result = await twitterClient.testConnection()

      expect(result.success).toBe(true)
      expect(result.user).toBeDefined()
      expect(result.user.id).toBe('test_user_id')
    })

    test('認証失敗の場合は接続テストが失敗する', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          errors: [{ message: 'Unauthorized' }]
        })
      })

      const result = await twitterClient.testConnection()

      expect(result.success).toBe(false)
      expect(result.error.type).toBe('authentication')
    })
  })

  describe('統計情報', () => {
    beforeEach(() => {
      twitterClient = new TwitterClient(mockCredentials)
    })

    test('統計情報を取得できる', () => {
      const stats = twitterClient.getStats()

      expect(stats).toHaveProperty('totalTweets')
      expect(stats).toHaveProperty('successfulTweets')
      expect(stats).toHaveProperty('failedTweets')
      expect(stats).toHaveProperty('successRate')
      expect(stats).toHaveProperty('rateLimitStats')
      expect(stats.totalTweets).toBe(0)
      expect(stats.successRate).toBe(0)
    })

    test('ツイート投稿後に統計情報が更新される', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          data: { id: '1234567890', text: 'Test tweet' }
        })
      })

      await twitterClient.postTweet('Test tweet')
      const stats = twitterClient.getStats()

      expect(stats.totalTweets).toBe(1)
      expect(stats.successfulTweets).toBe(1)
      expect(stats.successRate).toBe(100)
    })
  })

  describe('クリーンアップ', () => {
    beforeEach(() => {
      twitterClient = new TwitterClient(mockCredentials)
    })

    test('クリーンアップ処理が正常に実行される', () => {
      expect(() => {
        twitterClient.cleanup()
      }).not.toThrow()
    })
  })
})
