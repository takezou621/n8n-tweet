/**
 * TwitterClient unit tests
 * Twitter API統合機能のテスト
 * TDD Red → Green → Refactor approach
 */

const TwitterClient = require('../../src/integrations/twitter-client')

// Mockデータ
const mockCredentials = {
  apiKey: 'test_api_key',
  apiSecret: 'test_api_secret',
  accessToken: 'test_access_token',
  accessTokenSecret: 'test_access_token_secret'
}

const mockConfig = {
  credentials: mockCredentials,
  rateLimitDelay: 1000, // テスト用に短縮
  maxRetries: 2,
  enableDryRun: true // テストではドライランモード
}

describe('TwitterClient', () => {
  let twitterClient

  beforeEach(() => {
    // 各テストの前に新しいインスタンスを作成
    twitterClient = new TwitterClient(mockConfig)
  })

  afterEach(() => {
    // テスト後のクリーンアップ
    twitterClient = null
  })

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      const client = new TwitterClient({ credentials: mockCredentials })
      
      expect(client.config.rateLimitDelay).toBe(60000)
      expect(client.config.maxRetries).toBe(3)
      expect(client.config.enableDryRun).toBe(false)
    })

    it('should merge custom configuration with defaults', () => {
      expect(twitterClient.config.rateLimitDelay).toBe(1000)
      expect(twitterClient.config.enableDryRun).toBe(true)
      expect(twitterClient.config.maxRetries).toBe(2)
    })

    it('should throw error when credentials are missing', () => {
      expect(() => {
        new TwitterClient({})
      }).toThrow('Twitter API credentials are required')
    })

    it('should throw error when credentials are incomplete', () => {
      const incompleteCredentials = {
        credentials: {
          apiKey: 'test_key'
          // missing other credentials
        }
      }
      
      expect(() => {
        new TwitterClient(incompleteCredentials)
      }).toThrow('All Twitter API credentials must be provided')
    })

    it('should initialize empty post history', () => {
      expect(twitterClient.postHistory).toEqual([])
      expect(twitterClient.lastPostTime).toBeNull()
    })
  })

  describe('Rate Limiting', () => {
    it('should allow posting when no previous posts', () => {
      const rateLimit = twitterClient.checkRateLimit()
      
      expect(rateLimit.canPost).toBe(true)
      expect(rateLimit.waitTime).toBeUndefined()
    })

    it('should enforce rate limit when posting too quickly', () => {
      // 前回の投稿時間を設定
      twitterClient.lastPostTime = Date.now() - 500 // 500ms前
      
      const rateLimit = twitterClient.checkRateLimit()
      
      expect(rateLimit.canPost).toBe(false)
      expect(rateLimit.waitTime).toBeGreaterThan(0)
      expect(rateLimit.message).toContain('Rate limit')
    })

    it('should allow posting after rate limit delay', () => {
      // 前回の投稿時間を設定（十分に時間が経過）
      twitterClient.lastPostTime = Date.now() - 2000 // 2秒前（制限は1秒）
      
      const rateLimit = twitterClient.checkRateLimit()
      
      expect(rateLimit.canPost).toBe(true)
    })
  })

  describe('Tweet Validation', () => {
    it('should validate correct tweet data', async () => {
      const validTweet = { text: 'This is a valid tweet' }
      
      await expect(
        twitterClient.validateTweet(validTweet)
      ).resolves.not.toThrow()
    })

    it('should reject empty tweet text', async () => {
      const emptyTweet = { text: '' }
      
      await expect(
        twitterClient.validateTweet(emptyTweet)
      ).rejects.toThrow('Tweet text cannot be empty')
    })

    it('should reject missing tweet text', async () => {
      const noTextTweet = {}
      
      await expect(
        twitterClient.validateTweet(noTextTweet)
      ).rejects.toThrow('Tweet text is required')
    })

    it('should reject non-string tweet text', async () => {
      const invalidTweet = { text: 123 }
      
      await expect(
        twitterClient.validateTweet(invalidTweet)
      ).rejects.toThrow('Tweet text must be a string')
    })

    it('should reject tweet text over 280 characters', async () => {
      const longText = 'a'.repeat(281)
      const longTweet = { text: longText }
      
      await expect(
        twitterClient.validateTweet(longTweet)
      ).rejects.toThrow('Tweet text too long')
    })

    it('should detect duplicate tweets', async () => {
      const tweetText = 'This is a duplicate test'
      
      // 投稿履歴に同じテキストを追加
      twitterClient.postHistory.push({
        text: tweetText,
        success: true,
        timestamp: new Date().toISOString()
      })
      
      const duplicateTweet = { text: tweetText }
      
      await expect(
        twitterClient.validateTweet(duplicateTweet)
      ).rejects.toThrow('Duplicate tweet detected')
    })
  })

  describe('Single Tweet Posting', () => {
    it('should successfully post tweet in dry run mode', async () => {
      const tweetData = { text: 'Test tweet for dry run' }
      
      const result = await twitterClient.postTweet(tweetData)
      
      expect(result.success).toBe(true)
      expect(result.dryRun).toBe(true)
      expect(result.data.text).toBe(tweetData.text)
      expect(result.data.id).toContain('dry-run-')
    })

    it('should add successful post to history', async () => {
      const tweetData = { text: 'Test tweet for history' }
      
      await twitterClient.postTweet(tweetData)
      
      expect(twitterClient.postHistory).toHaveLength(1)
      expect(twitterClient.postHistory[0].text).toBe(tweetData.text)
      expect(twitterClient.postHistory[0].success).toBe(true)
      expect(twitterClient.lastPostTime).not.toBeNull()
    })

    it('should handle posting failure gracefully', async () => {
      const invalidTweet = { text: '' } // 空のテキストでエラーを発生させる
      
      const result = await twitterClient.postTweet(invalidTweet)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Tweet text cannot be empty')
      
      // 失敗した投稿も履歴に記録される
      expect(twitterClient.postHistory).toHaveLength(1)
      expect(twitterClient.postHistory[0].success).toBe(false)
    })
  })

  describe('Batch Tweet Posting', () => {
    it('should post multiple tweets successfully', async () => {
      const tweets = [
        { text: 'First tweet' },
        { text: 'Second tweet' },
        { text: 'Third tweet' }
      ]
      
      const result = await twitterClient.postMultipleTweets(tweets)
      
      expect(result.total).toBe(3)
      expect(result.successful).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.results).toHaveLength(3)
      
      // 全ての投稿が履歴に記録されている
      expect(twitterClient.postHistory).toHaveLength(3)
    })

    it('should handle mixed success and failure in batch', async () => {
      const tweets = [
        { text: 'Valid tweet' },
        { text: '' }, // 無効なツイート
        { text: 'Another valid tweet' }
      ]
      
      const result = await twitterClient.postMultipleTweets(tweets)
      
      expect(result.total).toBe(3)
      expect(result.successful).toBe(2)
      expect(result.failed).toBe(1)
    })
  })

  describe('Post History and Statistics', () => {
    beforeEach(() => {
      // テスト用の履歴データを追加
      twitterClient.postHistory = [
        { text: 'Tweet 1', success: true, timestamp: '2024-01-01T10:00:00Z' },
        { text: 'Tweet 2', success: false, timestamp: '2024-01-01T11:00:00Z' },
        { text: 'Tweet 3', success: true, timestamp: '2024-01-01T12:00:00Z' }
      ]
    })

    it('should return post history in correct order', () => {
      const history = twitterClient.getPostHistory()
      
      expect(history).toHaveLength(3)
      // 最新が最初に来るようにソートされている
      expect(history[0].timestamp).toBe('2024-01-01T12:00:00Z')
    })

    it('should limit post history when requested', () => {
      const history = twitterClient.getPostHistory(2)
      
      expect(history).toHaveLength(2)
    })

    it('should calculate correct statistics', () => {
      const stats = twitterClient.getStats()
      
      expect(stats.total).toBe(3)
      expect(stats.successful).toBe(2)
      expect(stats.failed).toBe(1)
      expect(stats.successRate).toBe('66.67%')
    })

    it('should handle empty history for statistics', () => {
      twitterClient.postHistory = []
      
      const stats = twitterClient.getStats()
      
      expect(stats.total).toBe(0)
      expect(stats.successful).toBe(0)
      expect(stats.failed).toBe(0)
      expect(stats.successRate).toBe('0%')
    })
  })

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        rateLimitDelay: 2000,
        enableDryRun: false
      }
      
      twitterClient.updateConfig(newConfig)
      
      expect(twitterClient.config.rateLimitDelay).toBe(2000)
      expect(twitterClient.config.enableDryRun).toBe(false)
      expect(twitterClient.config.maxRetries).toBe(2) // 既存の設定は保持
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      // twitter-api-v2をモックしていないので、認証は失敗する想定
      const health = await twitterClient.healthCheck()
      
      expect(health).toHaveProperty('status')
      expect(health).toHaveProperty('authenticated')
      expect(health).toHaveProperty('timestamp')
      expect(health).toHaveProperty('stats')
    })
  })

  describe('Utility Functions', () => {
    it('should sleep for specified duration', async () => {
      const startTime = Date.now()
      
      await twitterClient.sleep(100)
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      expect(duration).toBeGreaterThanOrEqual(100)
      expect(duration).toBeLessThan(150) // 余裕を持って150ms以内
    })
  })
})
