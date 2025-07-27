const TwitterClient = require('../../src/integrations/twitter-client')
const RateLimiter = require('../../src/utils/rate-limiter')
const TweetHistory = require('../../src/storage/tweet-history')
const {
  createMockCredentials,
  setupTestEnvironment,
  createTestDataDirectory,
  cleanupTestDataDirectory,
  setupFetchMock
} = require('./helpers/test-helpers')

describe('Twitter Integration Tests', () => {
  let twitterClient
  let rateLimiter
  let tweetHistory
  let testStoragePath
  let envCleanup
  let fetchMock

  beforeEach(async () => {
    // テスト環境の設定
    envCleanup = setupTestEnvironment()

    // テスト用ストレージパス
    testStoragePath = await createTestDataDirectory(__dirname)

    // モック認証情報
    const mockCredentials = createMockCredentials()

    // TwitterClient初期化
    twitterClient = new TwitterClient(mockCredentials, {
      rateLimit: {
        tweetsPerHour: 5,
        tweetsPerDay: 50,
        requestsPerMinute: 10
      }
    })

    // RateLimiter初期化
    rateLimiter = new RateLimiter({
      tweetsPerHour: 5,
      tweetsPerDay: 50,
      requestsPerMinute: 10
    })

    // TweetHistory初期化
    tweetHistory = new TweetHistory({
      storagePath: testStoragePath,
      maxHistorySize: 50,
      enablePersistence: true
    })

    await tweetHistory.initialize()

    // fetchのモック設定
    fetchMock = setupFetchMock()
  })

  afterEach(async () => {
    // コンポーネントのクリーンアップ
    if (twitterClient) {
      twitterClient.cleanup()
    }

    if (rateLimiter) {
      rateLimiter.cleanup()
    }

    if (tweetHistory) {
      await tweetHistory.cleanup()
    }

    // テストデータとモックのクリーンアップ
    await cleanupTestDataDirectory(testStoragePath)

    if (fetchMock) {
      fetchMock.cleanup()
    }

    if (envCleanup) {
      envCleanup()
    }
  })

  describe('完全な投稿フロー', () => {
    test('成功したツイート投稿の完全フローが動作する', async () => {
      const tweetText = 'Test integration tweet'

      // API成功をモック
      fetchMock.mockSuccess({
        data: {
          id: '1234567890',
          text: tweetText
        }
      })

      // 1. TwitterClientでツイート投稿
      const postResult = await twitterClient.postTweet(tweetText)
      expect(postResult.success).toBe(true)
      expect(postResult.data.id).toBe('1234567890')

      // 2. RateLimiterでリクエスト記録
      await rateLimiter.recordRequest('tweets', true)
      const rateLimitStats = rateLimiter.getStats()
      expect(rateLimitStats.tweets.total).toBe(1)
      expect(rateLimitStats.tweets.successful).toBe(1)

      // 3. TweetHistoryに履歴保存
      await tweetHistory.addTweet({
        id: postResult.data.id,
        text: tweetText,
        status: 'success'
      })

      const history = tweetHistory.getHistory()
      expect(history.length).toBe(1)
      expect(history[0].text).toBe(tweetText)
      expect(history[0].status).toBe('success')

      // 4. 統計情報の確認
      const twitterStats = twitterClient.getStats()
      expect(twitterStats.totalTweets).toBe(1)
      expect(twitterStats.successfulTweets).toBe(1)
      expect(twitterStats.successRate).toBe(100)

      const historyStats = tweetHistory.getStats()
      expect(historyStats.total).toBe(1)
      expect(historyStats.successful).toBe(1)
      expect(historyStats.successRate).toBe(100)
    })

    test('失敗したツイート投稿の完全フローが動作する', async () => {
      const tweetText = 'Failed integration tweet'

      // API失敗をモック
      fetchMock.mockError(401, {
        errors: [{ message: 'Unauthorized' }]
      })

      // 1. TwitterClientでツイート投稿（失敗）
      const postResult = await twitterClient.postTweet(tweetText)
      expect(postResult.success).toBe(false)
      expect(postResult.error.type).toBe('authentication')

      // 2. RateLimiterでリクエスト記録
      await rateLimiter.recordRequest('tweets', false)
      const rateLimitStats = rateLimiter.getStats()
      expect(rateLimitStats.tweets.total).toBe(1)
      expect(rateLimitStats.tweets.failed).toBe(1)

      // 3. TweetHistoryに失敗履歴保存
      await tweetHistory.addTweet({
        text: tweetText,
        status: 'failed',
        error: postResult.error.message
      })

      const history = tweetHistory.getHistory()
      expect(history.length).toBe(1)
      expect(history[0].status).toBe('failed')
      expect(history[0].error).toBe('Unauthorized')

      // 4. 統計情報の確認
      const twitterStats = twitterClient.getStats()
      expect(twitterStats.totalTweets).toBe(1)
      expect(twitterStats.failedTweets).toBe(1)
      expect(twitterStats.successRate).toBe(0)

      const historyStats = tweetHistory.getStats()
      expect(historyStats.total).toBe(1)
      expect(historyStats.failed).toBe(1)
      expect(historyStats.successRate).toBe(0)
    })
  })

  describe('レート制限統合', () => {
    test('レート制限に達した場合の統合動作', async () => {
      // TwitterClient内部のRateLimiterでレート制限まで要求を記録
      for (let i = 0; i < 5; i++) {
        await twitterClient.rateLimiter.recordRequest('tweets', true)
      }

      // TwitterClientがレート制限を検出
      const canPost = await twitterClient.rateLimiter.checkLimit('tweets')
      expect(canPost).toBe(false)

      // ツイート投稿を試行
      const postResult = await twitterClient.postTweet('Rate limited tweet')
      expect(postResult.success).toBe(false)
      expect(postResult.error.type).toBe('rate_limit')

      // 失敗履歴を記録
      await tweetHistory.addTweet({
        text: 'Rate limited tweet',
        status: 'failed',
        error: 'Rate limit exceeded'
      })

      const history = tweetHistory.getHistory({ status: 'failed' })
      expect(history.length).toBe(1)
      expect(history[0].error).toBe('Rate limit exceeded')
    })

    test('レート制限リセット後の動作', async () => {
      // レート制限まで要求を記録
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordRequest('tweets', true)
      }

      expect(await rateLimiter.checkLimit('tweets')).toBe(false)

      // レート制限をリセット
      await rateLimiter.resetLimits('tweets')

      expect(await rateLimiter.checkLimit('tweets')).toBe(true)

      // 投稿成功をモック
      fetchMock.mockSuccess({
        data: { id: '1234567890', text: 'Reset test tweet' }
      })

      // ツイート投稿が成功
      const postResult = await twitterClient.postTweet('Reset test tweet')
      expect(postResult.success).toBe(true)
    })
  })

  describe('重複検出統合', () => {
    test('TweetHistoryとの重複検出が動作する', async () => {
      const duplicateText = 'Duplicate tweet test'

      // 最初のツイートを履歴に追加
      await tweetHistory.addTweet({
        text: duplicateText,
        status: 'success'
      })

      // 重複チェック
      const isDuplicate = await tweetHistory.isDuplicate(duplicateText)
      expect(isDuplicate).toBe(true)

      // 同じ内容での投稿試行
      const validation = twitterClient.validateTweet(duplicateText)
      expect(validation.isValid).toBe(true) // TwitterClientは重複チェックしない

      // 外部で重複チェックして履歴に記録
      if (isDuplicate) {
        await tweetHistory.addTweet({
          text: duplicateText,
          status: 'failed',
          error: 'Duplicate content detected'
        })
      }

      const failedHistory = tweetHistory.getHistory({ status: 'failed' })
      expect(failedHistory.length).toBe(1)
      expect(failedHistory[0].error).toBe('Duplicate content detected')
    })

    test('ハッシュベース重複検出が動作する', async () => {
      const originalText = 'Original tweet content'
      const similarText = '  Original Tweet Content  ' // 大文字小文字・空白違い

      // 最初のツイートを追加
      await tweetHistory.addTweet({
        text: originalText,
        status: 'success'
      })

      // ハッシュベース重複チェック
      const hash = tweetHistory.generateContentHash(similarText)
      const isDuplicateHash = await tweetHistory.isDuplicateHash(hash)

      expect(isDuplicateHash).toBe(true)
    })
  })

  describe('データ永続化統合', () => {
    test('ツイート履歴の保存と読み込みが動作する', async () => {
      // テストデータを追加
      await tweetHistory.addTweet({
        text: 'Persistence test tweet 1',
        status: 'success'
      })

      await tweetHistory.addTweet({
        text: 'Persistence test tweet 2',
        status: 'failed',
        error: 'Test error'
      })

      // ファイルに保存
      await tweetHistory.save()

      // 新しいインスタンスで読み込み
      const newHistory = new TweetHistory({
        storagePath: testStoragePath,
        enablePersistence: true
      })

      await newHistory.initialize()
      await newHistory.load()

      const loadedHistory = newHistory.getHistory()
      expect(loadedHistory.length).toBe(2)
      expect(loadedHistory[0].text).toBe('Persistence test tweet 2')
      expect(loadedHistory[1].text).toBe('Persistence test tweet 1')

      await newHistory.cleanup()
    })
  })

  describe('エラーハンドリング統合', () => {
    test('ネットワークエラーの統合処理', async () => {
      const tweetText = 'Network error test'

      // ネットワークエラーをモック
      fetchMock.mockNetworkError('Network connection failed')

      // ツイート投稿試行
      const postResult = await twitterClient.postTweet(tweetText)
      expect(postResult.success).toBe(false)

      // エラー履歴を記録
      await tweetHistory.addTweet({
        text: tweetText,
        status: 'failed',
        error: postResult.error.message
      })

      // 統計情報確認
      const stats = tweetHistory.getStats()
      expect(stats.failed).toBe(1)
      expect(stats.successRate).toBe(0)
    })

    test('リトライ機能の統合動作', async () => {
      const tweetText = 'Retry test tweet'

      // 最初は失敗、2回目は成功
      global.fetch
        .mockRejectedValueOnce(new Error('Temporary server error'))

      fetchMock.mockSuccess({
        data: { id: '1234567890', text: tweetText }
      })

      // ツイート投稿（リトライで成功）
      const postResult = await twitterClient.postTweet(tweetText)
      expect(postResult.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(2)

      // 成功履歴を記録
      await tweetHistory.addTweet({
        id: postResult.data.id,
        text: tweetText,
        status: 'success'
      })

      const history = tweetHistory.getHistory()
      expect(history.length).toBe(1)
      expect(history[0].status).toBe('success')
    })
  })

  describe('複数コンポーネント統合', () => {
    test('TwitterClient、RateLimiter、TweetHistoryの統合動作', async () => {
      const tweets = [
        'Integration test tweet 1',
        'Integration test tweet 2',
        'Integration test tweet 3'
      ]

      let successCount = 0
      let failCount = 0

      for (const tweetText of tweets) {
        // レート制限チェック
        const canPost = await rateLimiter.checkLimit('tweets')

        if (canPost) {
          // 成功をモック
          fetchMock.mockSuccess({
            data: { id: Date.now().toString(), text: tweetText }
          })

          // ツイート投稿
          const result = await twitterClient.postTweet(tweetText)

          if (result.success) {
            successCount++
            await rateLimiter.recordRequest('tweets', true)
            await tweetHistory.addTweet({
              id: result.data.id,
              text: tweetText,
              status: 'success'
            })
          }
        } else {
          failCount++
          await rateLimiter.recordRequest('tweets', false)
          await tweetHistory.addTweet({
            text: tweetText,
            status: 'failed',
            error: 'Rate limit exceeded'
          })
        }
      }

      // 統計確認
      const twitterStats = twitterClient.getStats()
      const rateLimitStats = rateLimiter.getStats()
      const historyStats = tweetHistory.getStats()

      expect(twitterStats.totalTweets).toBe(successCount)
      expect(rateLimitStats.tweets.total).toBe(tweets.length)
      expect(historyStats.total).toBe(tweets.length)
      expect(historyStats.successful + historyStats.failed).toBe(tweets.length)
      expect(successCount + failCount).toBe(tweets.length)
    })
  })

  describe('設定統合', () => {
    test('設定ファイルからの統合設定が動作する', async () => {
      const customTwitterClient = new TwitterClient(createMockCredentials())

      // デフォルト設定値確認
      expect(customTwitterClient.config.api.version).toBe('v2')
      expect(customTwitterClient.config.validation.maxTweetLength).toBe(280)
      expect(customTwitterClient.config.retry.maxAttempts).toBe(3)

      customTwitterClient.cleanup()
    })
  })
})
