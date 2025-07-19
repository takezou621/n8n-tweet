/**
 * Rate Limiter - Twitter API レート制限管理
 * Twitter API v2のレート制限を適切に管理し、制限に引っかからないように制御
 */

class RateLimiter {
  constructor (config = {}) {
    // Twitter API v2のデフォルトレート制限設定
    this.limits = {
      tweets: {
        perHour: 300, // 1時間あたりツイート投稿数
        perDay: 2400, // 1日あたりツイート投稿数
        perMonth: 50000 // 1ヶ月あたりツイート投稿数
      },
      reads: {
        per15min: 75, // 15分あたり読み込み回数
        perHour: 300 // 1時間あたり読み込み回数
      },
      ...config.limits
    }

    // 現在の使用状況を追跡
    this.usage = {
      tweets: {
        hour: { count: 0, resetTime: this.getNextHour() },
        day: { count: 0, resetTime: this.getNextDay() },
        month: { count: 0, resetTime: this.getNextMonth() }
      },
      reads: {
        quarter: { count: 0, resetTime: this.getNext15Min() },
        hour: { count: 0, resetTime: this.getNextHour() }
      }
    }

    // ログ設定
    this.enableLogging = config.enableLogging || true
    this.logger = config.logger || console
  }

  /**
   * ツイート投稿前のレート制限チェック
   * @returns {Object} { allowed: boolean, waitTime: number, reason: string }
   */
  async checkTweetLimit () {
    this.resetExpiredCounters()

    const checks = [
      {
        name: 'hourly',
        current: this.usage.tweets.hour.count,
        limit: this.limits.tweets.perHour,
        resetTime: this.usage.tweets.hour.resetTime
      },
      {
        name: 'daily',
        current: this.usage.tweets.day.count,
        limit: this.limits.tweets.perDay,
        resetTime: this.usage.tweets.day.resetTime
      },
      {
        name: 'monthly',
        current: this.usage.tweets.month.count,
        limit: this.limits.tweets.perMonth,
        resetTime: this.usage.tweets.month.resetTime
      }
    ]

    for (const check of checks) {
      if (check.current >= check.limit) {
        const waitTime = check.resetTime - Date.now()

        if (this.enableLogging) {
          this.logger.warn(`Twitter rate limit exceeded: ${check.name}`, {
            current: check.current,
            limit: check.limit,
            waitTimeMs: waitTime,
            resetTime: new Date(check.resetTime).toISOString()
          })
        }

        return {
          allowed: false,
          waitTime: Math.max(0, waitTime),
          reason: `${check.name} limit exceeded (${check.current}/${check.limit})`
        }
      }
    }

    return { allowed: true, waitTime: 0, reason: 'OK' }
  }

  /**
   * 読み込み操作前のレート制限チェック
   * @returns {Object} { allowed: boolean, waitTime: number, reason: string }
   */
  async checkReadLimit () {
    this.resetExpiredCounters()

    const checks = [
      {
        name: '15min',
        current: this.usage.reads.quarter.count,
        limit: this.limits.reads.per15min,
        resetTime: this.usage.reads.quarter.resetTime
      },
      {
        name: 'hourly',
        current: this.usage.reads.hour.count,
        limit: this.limits.reads.perHour,
        resetTime: this.usage.reads.hour.resetTime
      }
    ]

    for (const check of checks) {
      if (check.current >= check.limit) {
        const waitTime = check.resetTime - Date.now()

        if (this.enableLogging) {
          this.logger.warn(`Twitter read rate limit exceeded: ${check.name}`, {
            current: check.current,
            limit: check.limit,
            waitTimeMs: waitTime
          })
        }

        return {
          allowed: false,
          waitTime: Math.max(0, waitTime),
          reason: `${check.name} read limit exceeded (${check.current}/${check.limit})`
        }
      }
    }

    return { allowed: true, waitTime: 0, reason: 'OK' }
  }

  /**
   * ツイート投稿の使用量を記録
   */
  recordTweet () {
    this.resetExpiredCounters()

    this.usage.tweets.hour.count++
    this.usage.tweets.day.count++
    this.usage.tweets.month.count++

    if (this.enableLogging) {
      this.logger.info('Tweet recorded', {
        hourly: `${this.usage.tweets.hour.count}/${this.limits.tweets.perHour}`,
        daily: `${this.usage.tweets.day.count}/${this.limits.tweets.perDay}`,
        monthly: `${this.usage.tweets.month.count}/${this.limits.tweets.perMonth}`
      })
    }
  }

  /**
   * 読み込み操作の使用量を記録
   */
  recordRead () {
    this.resetExpiredCounters()

    this.usage.reads.quarter.count++
    this.usage.reads.hour.count++

    if (this.enableLogging) {
      this.logger.debug('Read operation recorded', {
        quarter: `${this.usage.reads.quarter.count}/${this.limits.reads.per15min}`,
        hourly: `${this.usage.reads.hour.count}/${this.limits.reads.perHour}`
      })
    }
  }

  /**
   * 期限切れカウンターをリセット
   */
  resetExpiredCounters () {
    const now = Date.now()

    // ツイートカウンターのリセット
    if (now >= this.usage.tweets.hour.resetTime) {
      this.usage.tweets.hour = { count: 0, resetTime: this.getNextHour() }
    }
    if (now >= this.usage.tweets.day.resetTime) {
      this.usage.tweets.day = { count: 0, resetTime: this.getNextDay() }
    }
    if (now >= this.usage.tweets.month.resetTime) {
      this.usage.tweets.month = { count: 0, resetTime: this.getNextMonth() }
    }

    // 読み込みカウンターのリセット
    if (now >= this.usage.reads.quarter.resetTime) {
      this.usage.reads.quarter = { count: 0, resetTime: this.getNext15Min() }
    }
    if (now >= this.usage.reads.hour.resetTime) {
      this.usage.reads.hour = { count: 0, resetTime: this.getNextHour() }
    }
  }

  /**
   * 現在の使用状況を取得
   * @returns {Object} 使用状況の詳細
   */
  getUsageStats () {
    this.resetExpiredCounters()

    return {
      tweets: {
        hourly: {
          current: this.usage.tweets.hour.count,
          limit: this.limits.tweets.perHour,
          percentage: (this.usage.tweets.hour.count / this.limits.tweets.perHour * 100).toFixed(1),
          resetTime: new Date(this.usage.tweets.hour.resetTime).toISOString()
        },
        daily: {
          current: this.usage.tweets.day.count,
          limit: this.limits.tweets.perDay,
          percentage: (this.usage.tweets.day.count / this.limits.tweets.perDay * 100).toFixed(1),
          resetTime: new Date(this.usage.tweets.day.resetTime).toISOString()
        },
        monthly: {
          current: this.usage.tweets.month.count,
          limit: this.limits.tweets.perMonth,
          percentage: (this.usage.tweets.month.count / this.limits.tweets.perMonth * 100).toFixed(1),
          resetTime: new Date(this.usage.tweets.month.resetTime).toISOString()
        }
      },
      reads: {
        quarter: {
          current: this.usage.reads.quarter.count,
          limit: this.limits.reads.per15min,
          percentage: (this.usage.reads.quarter.count / this.limits.reads.per15min * 100).toFixed(1),
          resetTime: new Date(this.usage.reads.quarter.resetTime).toISOString()
        },
        hourly: {
          current: this.usage.reads.hour.count,
          limit: this.limits.reads.perHour,
          percentage: (this.usage.reads.hour.count / this.limits.reads.perHour * 100).toFixed(1),
          resetTime: new Date(this.usage.reads.hour.resetTime).toISOString()
        }
      }
    }
  }

  /**
   * レート制限に達した場合の待機
   * @param {number} waitTime 待機時間（ミリ秒）
   * @returns {Promise} 待機完了Promise
   */
  async waitForReset (waitTime) {
    if (waitTime <= 0) return

    if (this.enableLogging) {
      this.logger.info(`Waiting for rate limit reset: ${waitTime}ms`)
    }

    return new Promise(resolve => setTimeout(resolve, waitTime))
  }

  /**
   * 時刻計算メソッド群
   */
  getNext15Min () {
    const now = new Date()
    const next = new Date(now)
    next.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
    return next.getTime()
  }

  getNextHour () {
    const now = new Date()
    const next = new Date(now)
    next.setHours(now.getHours() + 1, 0, 0, 0)
    return next.getTime()
  }

  getNextDay () {
    const now = new Date()
    const next = new Date(now)
    next.setDate(now.getDate() + 1)
    next.setHours(0, 0, 0, 0)
    return next.getTime()
  }

  getNextMonth () {
    const now = new Date()
    const next = new Date(now)
    next.setMonth(now.getMonth() + 1, 1)
    next.setHours(0, 0, 0, 0)
    return next.getTime()
  }

  /**
   * 設定を更新
   * @param {Object} newConfig 新しい設定
   */
  updateConfig (newConfig) {
    this.limits = { ...this.limits, ...newConfig.limits }
    this.enableLogging = newConfig.enableLogging !== undefined
      ? newConfig.enableLogging
      : this.enableLogging

    if (newConfig.logger) {
      this.logger = newConfig.logger
    }

    if (this.enableLogging) {
      this.logger.info('RateLimiter configuration updated', { limits: this.limits })
    }
  }

  /**
   * 使用量をリセット（テスト用）
   */
  reset () {
    this.usage = {
      tweets: {
        hour: { count: 0, resetTime: this.getNextHour() },
        day: { count: 0, resetTime: this.getNextDay() },
        month: { count: 0, resetTime: this.getNextMonth() }
      },
      reads: {
        quarter: { count: 0, resetTime: this.getNext15Min() },
        hour: { count: 0, resetTime: this.getNextHour() }
      }
    }

    if (this.enableLogging) {
      this.logger.info('RateLimiter usage counters reset')
    }
  }
}

module.exports = RateLimiter
