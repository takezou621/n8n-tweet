const RateLimiter = require('../../src/utils/rate-limiter')

describe('RateLimiter', () => {
  let rateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      tweetsPerHour: 10,
      tweetsPerDay: 100,
      requestsPerMinute: 30,
      cooldownPeriod: 15
    })
  })

  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.cleanup()
    }
  })

  describe('初期化', () => {
    test('デフォルト設定でRateLimiterインスタンスが作成できる', () => {
      const defaultLimiter = new RateLimiter()

      expect(defaultLimiter).toBeInstanceOf(RateLimiter)
      expect(defaultLimiter.limits.tweetsPerHour).toBe(50)
      expect(defaultLimiter.limits.tweetsPerDay).toBe(1000)
      expect(defaultLimiter.limits.requestsPerMinute).toBe(100)

      defaultLimiter.cleanup()
    })

    test('カスタム設定でRateLimiterインスタンスが作成できる', () => {
      expect(rateLimiter).toBeInstanceOf(RateLimiter)
      expect(rateLimiter.limits.tweetsPerHour).toBe(10)
      expect(rateLimiter.limits.tweetsPerDay).toBe(100)
      expect(rateLimiter.limits.requestsPerMinute).toBe(30)
    })
  })

  describe('制限チェック', () => {
    test('制限内であればtrueを返す', async () => {
      const result = await rateLimiter.checkLimit('tweets')

      expect(result.allowed).toBe(true)
      expect(result.reason).toBe('Within limits')
      expect(result.waitTime).toBe(0)
    })

    test('時間単位の制限に達した場合はfalseを返す', async () => {
      // 時間制限まで要求を記録
      for (let i = 0; i < 10; i++) {
        await rateLimiter.recordRequest('tweets')
      }

      const result = await rateLimiter.checkLimit('tweets')

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Tweets per hour limit exceeded')
      expect(result.waitTime).toBeGreaterThan(0)
    })

    test('日単位の制限に達した場合はfalseを返す', async () => {
      // 日制限まで要求を記録
      for (let i = 0; i < 100; i++) {
        await rateLimiter.recordRequest('tweets')
      }

      const result = await rateLimiter.checkLimit('tweets')

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('limit exceeded')
      expect(result.waitTime).toBeGreaterThan(0)
    })

    test('分単位の要求制限に達した場合はfalseを返す', async () => {
      // 分制限まで要求を記録
      for (let i = 0; i < 30; i++) {
        await rateLimiter.recordRequest('requests')
      }

      const result = await rateLimiter.checkLimit('requests')

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Request per minute limit exceeded')
      expect(result.waitTime).toBeGreaterThan(0)
    })

    test('不明なタイプの場合はデフォルト制限を使用する', async () => {
      const result = await rateLimiter.checkLimit('unknown')

      expect(result.allowed).toBe(true)
      expect(result.reason).toBe('Within limits')
      expect(result.waitTime).toBe(0)
    })
  })

  describe('要求記録', () => {
    test('ツイート要求を記録できる', async () => {
      const initialStats = rateLimiter.getStats()

      await rateLimiter.recordRequest('tweets')

      const stats = rateLimiter.getStats()
      expect(stats.tweets.total).toBe(initialStats.tweets.total + 1)
    })

    test('API要求を記録できる', async () => {
      const initialStats = rateLimiter.getStats()

      await rateLimiter.recordRequest('requests')

      const stats = rateLimiter.getStats()
      expect(stats.requests.total).toBe(initialStats.requests.total + 1)
    })

    test('タイムスタンプが正しく記録される', async () => {
      const beforeTime = Date.now()

      await rateLimiter.recordRequest('tweets')

      const stats = rateLimiter.getStats()
      const lastRequest = stats.tweets.history[stats.tweets.history.length - 1]

      expect(lastRequest.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(lastRequest.timestamp).toBeLessThanOrEqual(Date.now())
    })

    test('成功と失敗のステータスが記録される', async () => {
      await rateLimiter.recordRequest('tweets', true)
      await rateLimiter.recordRequest('tweets', false)

      const stats = rateLimiter.getStats()

      expect(stats.tweets.successful).toBe(1)
      expect(stats.tweets.failed).toBe(1)
      expect(stats.tweets.total).toBe(2)
    })
  })

  describe('待機時間計算', () => {
    test('制限に達していない場合は0を返す', async () => {
      const waitTime = await rateLimiter.getWaitTime('tweets')

      expect(waitTime).toBe(0)
    })

    test('時間制限に達した場合は適切な待機時間を返す', async () => {
      // 制限まで要求を記録
      for (let i = 0; i < 10; i++) {
        await rateLimiter.recordRequest('tweets')
      }

      const waitTime = await rateLimiter.getWaitTime('tweets')

      expect(waitTime).toBeGreaterThan(0)
      expect(waitTime).toBeLessThanOrEqual(3600000) // 1時間以内
    })

    test('分制限に達した場合は適切な待機時間を返す', async () => {
      // 分制限まで要求を記録
      for (let i = 0; i < 30; i++) {
        await rateLimiter.recordRequest('requests')
      }

      const waitTime = await rateLimiter.getWaitTime('requests')

      expect(waitTime).toBeGreaterThan(0)
      expect(waitTime).toBeLessThanOrEqual(60000) // 1分以内
    })
  })

  describe('制限リセット', () => {
    test('指定された期間後に制限がリセットされる', async () => {
      // 制限まで要求を記録
      for (let i = 0; i < 10; i++) {
        await rateLimiter.recordRequest('tweets')
      }

      const result = await rateLimiter.checkLimit('tweets')
      expect(result.allowed).toBe(false)

      // 時間を進める（実際の実装では時間経過をシミュレートする必要がある）
      await rateLimiter.resetLimits('tweets')

      const resultAfterReset = await rateLimiter.checkLimit('tweets')
      expect(resultAfterReset.allowed).toBe(true)
    })

    test('すべての制限をリセットできる', async () => {
      await rateLimiter.recordRequest('tweets')
      await rateLimiter.recordRequest('requests')

      await rateLimiter.resetAllLimits()

      const stats = rateLimiter.getStats()
      expect(stats.tweets.total).toBe(0)
      expect(stats.requests.total).toBe(0)
    })
  })

  describe('統計情報', () => {
    test('統計情報を取得できる', () => {
      const stats = rateLimiter.getStats()

      expect(stats).toHaveProperty('tweets')
      expect(stats).toHaveProperty('requests')
      expect(stats.tweets).toHaveProperty('total')
      expect(stats.tweets).toHaveProperty('successful')
      expect(stats.tweets).toHaveProperty('failed')
      expect(stats.tweets).toHaveProperty('remaining')
      expect(stats.tweets).toHaveProperty('resetTime')
      expect(stats.tweets).toHaveProperty('history')
    })

    test('残り要求数が正しく計算される', async () => {
      await rateLimiter.recordRequest('tweets')
      await rateLimiter.recordRequest('tweets')

      const stats = rateLimiter.getStats()

      expect(stats.tweets.remaining.hour).toBe(8) // 10 - 2
      expect(stats.tweets.remaining.day).toBe(98) // 100 - 2
    })

    test('成功率が正しく計算される', async () => {
      await rateLimiter.recordRequest('tweets', true)
      await rateLimiter.recordRequest('tweets', true)
      await rateLimiter.recordRequest('tweets', false)

      const stats = rateLimiter.getStats()

      expect(stats.tweets.successRate).toBe(66.67) // 2/3 * 100, 小数点2桁
    })
  })

  describe('時間窓管理', () => {
    test('古い記録が時間窓から除外される', async () => {
      // テスト用に短い時間窓を設定
      const shortLimiter = new RateLimiter({
        tweetsPerHour: 5,
        timeWindowHour: 100 // 100ms
      })

      await shortLimiter.recordRequest('tweets')

      // 記録直後の状態確認
      let stats = shortLimiter.getStats()
      expect(stats.tweets.remaining.hour).toBe(4) // 1件記録されているので残り4

      // 時間経過をシミュレート
      await new Promise(resolve => setTimeout(resolve, 150))

      stats = shortLimiter.getStats()

      // 古い記録は除外されているはず
      expect(stats.tweets.remaining.hour).toBe(5)

      shortLimiter.cleanup()
    })
  })

  describe('バックオフ機能', () => {
    test('連続失敗時にバックオフ期間を適用する', async () => {
      // 連続で失敗を記録
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordRequest('tweets', false)
      }

      const backoffTime = rateLimiter.getBackoffTime('tweets')

      expect(backoffTime).toBeGreaterThan(0)
    })

    test('成功によりバックオフがリセットされる', async () => {
      // 失敗を記録
      await rateLimiter.recordRequest('tweets', false)
      await rateLimiter.recordRequest('tweets', false)

      // 成功を記録
      await rateLimiter.recordRequest('tweets', true)

      const backoffTime = rateLimiter.getBackoffTime('tweets')

      expect(backoffTime).toBe(0)
    })
  })

  describe('ヘルスチェック', () => {
    test('ヘルス状態を取得できる', () => {
      const health = rateLimiter.getHealth()

      expect(health).toHaveProperty('status')
      expect(health).toHaveProperty('limits')
      expect(health).toHaveProperty('usage')
      expect(health.status).toBe('healthy')
    })

    test('制限に近い場合は警告状態を返す', async () => {
      // 制限の80%まで使用
      for (let i = 0; i < 8; i++) {
        await rateLimiter.recordRequest('tweets')
      }

      const health = rateLimiter.getHealth()

      expect(health.status).toBe('warning')
      expect(health.usage.maximum).toBeGreaterThanOrEqual(80)
    })

    test('制限に達した場合は不健全状態を返す', async () => {
      // 制限まで使用
      for (let i = 0; i < 10; i++) {
        await rateLimiter.recordRequest('tweets')
      }

      const health = rateLimiter.getHealth()

      expect(health.status).toBe('unhealthy')
      expect(health.usage.maximum).toBeGreaterThanOrEqual(90)
    })
  })

  describe('クリーンアップ', () => {
    test('クリーンアップ処理が正常に実行される', () => {
      expect(() => {
        rateLimiter.cleanup()
      }).not.toThrow()
    })

    test('クリーンアップ後は統計情報がリセットされる', () => {
      rateLimiter.recordRequest('tweets')
      rateLimiter.cleanup()

      const stats = rateLimiter.getStats()
      expect(stats.tweets.total).toBe(0)
    })
  })
})
