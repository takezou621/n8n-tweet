/**
 * Rate Limiter - API レート制限管理とDoS攻撃防止
 * Twitter API v2のレート制限管理に加えて、一般的なレート制限とDoS攻撃防止機能を提供
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
      // 汎用レート制限（DoS攻撃防止用）
      general: {
        perSecond: 10, // 1秒あたりリクエスト数
        perMinute: 100, // 1分あたりリクエスト数
        perHour: 1000, // 1時間あたりリクエスト数
        burst: 50 // バーストリクエスト許可数
      },
      // IPベースの制限
      perIP: {
        perSecond: 5,
        perMinute: 50,
        perHour: 500
      },
      // 失敗リクエストの制限
      failures: {
        maxConsecutive: 5, // 連続失敗許可数
        perMinute: 10, // 1分あたり失敗許可数
        banDuration: 300000 // BANする時間（5分）
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
      },
      // 汎用レート制限用
      general: {
        second: { count: 0, resetTime: this.getNextSecond() },
        minute: { count: 0, resetTime: this.getNextMinute() },
        hour: { count: 0, resetTime: this.getNextHour() },
        burst: { count: 0, resetTime: this.getNextSecond() }
      }
    }

    // IPベースの使用状況追跡
    this.ipUsage = new Map() // IP -> usage object

    // 失敗追跡とBAN管理
    this.failures = new Map() // key -> failure info
    this.bannedClients = new Map() // key -> ban info

    // バーストトークンバケット
    this.burstTokens = this.limits.general.burst
    this.lastTokenRefill = Date.now()

    // ログ設定
    this.enableLogging = config.enableLogging !== false
    this.logger = config.logger || console
    this.enableSecurity = config.enableSecurity !== false
  }

  /**
   * 汎用レート制限チェック（DoS攻撃防止用）
   * @param {string} key クライアント識別子（IP、ユーザーIDなど）
   * @param {string} type リクエストタイプ
   * @returns {Object} { allowed: boolean, waitTime: number, reason: string }
   */
  async checkLimit (key, type = 'general') {
    const now = Date.now()

    // BANチェック
    if (this.isBanned(key)) {
      const banInfo = this.bannedClients.get(key)
      const remainingBanTime = banInfo.expiresAt - now

      if (this.enableLogging) {
        this.logger.warn('Request from banned client', {
          key,
          remainingBanTime,
          reason: banInfo.reason
        })
      }

      return {
        allowed: false,
        waitTime: remainingBanTime,
        reason: `Client banned: ${banInfo.reason}`,
        statusCode: 429
      }
    }

    // 一般的なレート制限チェック
    this.resetExpiredCounters()
    this.refillBurstTokens()

    // バーストトークンチェック
    if (this.burstTokens <= 0) {
      return {
        allowed: false,
        waitTime: 1000, // 1秒待機
        reason: 'Burst limit exceeded',
        statusCode: 429
      }
    }

    // レート制限チェック
    const checks = [
      {
        name: 'per-second',
        current: this.usage.general.second.count,
        limit: this.limits.general.perSecond,
        resetTime: this.usage.general.second.resetTime
      },
      {
        name: 'per-minute',
        current: this.usage.general.minute.count,
        limit: this.limits.general.perMinute,
        resetTime: this.usage.general.minute.resetTime
      },
      {
        name: 'per-hour',
        current: this.usage.general.hour.count,
        limit: this.limits.general.perHour,
        resetTime: this.usage.general.hour.resetTime
      }
    ]

    for (const check of checks) {
      if (check.current >= check.limit) {
        const waitTime = check.resetTime - now

        if (this.enableLogging) {
          this.logger.warn(`Rate limit exceeded: ${check.name}`, {
            key,
            current: check.current,
            limit: check.limit,
            waitTimeMs: waitTime
          })
        }

        return {
          allowed: false,
          waitTime: Math.max(0, waitTime),
          reason: `${check.name} limit exceeded (${check.current}/${check.limit})`,
          statusCode: 429
        }
      }
    }

    // IPベースの制限チェック
    if (this.enableSecurity) {
      const ipCheck = await this.checkIPLimit(key)
      if (!ipCheck.allowed) {
        return ipCheck
      }
    }

    return { allowed: true, waitTime: 0, reason: 'OK' }
  }

  /**
   * IPベースのレート制限チェック
   * @param {string} ip IPアドレス
   * @returns {Object} { allowed: boolean, waitTime: number, reason: string }
   */
  async checkIPLimit (ip) {
    const now = Date.now()

    if (!this.ipUsage.has(ip)) {
      this.ipUsage.set(ip, {
        second: { count: 0, resetTime: this.getNextSecond() },
        minute: { count: 0, resetTime: this.getNextMinute() },
        hour: { count: 0, resetTime: this.getNextHour() }
      })
    }

    const usage = this.ipUsage.get(ip)

    // 期限切れカウンターをリセット
    this.resetIPCounters(ip, usage, now)

    const checks = [
      {
        name: 'per-second-ip',
        current: usage.second.count,
        limit: this.limits.perIP.perSecond,
        resetTime: usage.second.resetTime
      },
      {
        name: 'per-minute-ip',
        current: usage.minute.count,
        limit: this.limits.perIP.perMinute,
        resetTime: usage.minute.resetTime
      },
      {
        name: 'per-hour-ip',
        current: usage.hour.count,
        limit: this.limits.perIP.perHour,
        resetTime: usage.hour.resetTime
      }
    ]

    for (const check of checks) {
      if (check.current >= check.limit) {
        const waitTime = check.resetTime - now

        if (this.enableLogging) {
          this.logger.warn(`IP rate limit exceeded: ${check.name}`, {
            ip,
            current: check.current,
            limit: check.limit,
            waitTimeMs: waitTime
          })
        }

        return {
          allowed: false,
          waitTime: Math.max(0, waitTime),
          reason: `${check.name} limit exceeded for IP ${ip}`,
          statusCode: 429
        }
      }
    }

    return { allowed: true, waitTime: 0, reason: 'OK' }
  }

  /**
   * リクエストを記録
   * @param {string} key クライアント識別子
   * @param {boolean} success リクエストが成功したか
   * @param {string} type リクエストタイプ
   */
  recordRequest (key, success = true, type = 'general') {
    // Note: 'type' parameter is currently unused but kept for future extensibility
    // const now = Date.now() // Reserved for future timestamp functionality
    this.resetExpiredCounters()

    // 一般的な使用量を記録
    this.usage.general.second.count++
    this.usage.general.minute.count++
    this.usage.general.hour.count++

    // バーストトークンを消費
    if (this.burstTokens > 0) {
      this.burstTokens--
    }

    // IPベースの記録
    if (this.enableSecurity) {
      this.recordIPRequest(key)
    }

    // 失敗の記録
    if (!success) {
      this.recordFailure(key)
    } else {
      // 成功時は失敗カウンターをリセット
      this.resetFailures(key)
    }

    if (this.enableLogging) {
      this.logger.debug('Request recorded', {
        key,
        success,
        type,
        burstTokens: this.burstTokens,
        generalUsage: `${this.usage.general.minute.count}/${this.limits.general.perMinute}`
      })
    }
  }

  /**
   * IPリクエストを記録
   * @param {string} ip IPアドレス
   */
  recordIPRequest (ip) {
    if (!this.ipUsage.has(ip)) {
      this.ipUsage.set(ip, {
        second: { count: 0, resetTime: this.getNextSecond() },
        minute: { count: 0, resetTime: this.getNextMinute() },
        hour: { count: 0, resetTime: this.getNextHour() }
      })
    }

    const usage = this.ipUsage.get(ip)
    usage.second.count++
    usage.minute.count++
    usage.hour.count++
  }

  /**
   * 失敗を記録
   * @param {string} key クライアント識別子
   */
  recordFailure (key) {
    const now = Date.now()

    if (!this.failures.has(key)) {
      this.failures.set(key, {
        consecutive: 0,
        total: 0,
        lastFailure: now,
        resetTime: now + 60000 // 1分後にリセット
      })
    }

    const failure = this.failures.get(key)
    failure.consecutive++
    failure.total++
    failure.lastFailure = now

    // 連続失敗が閾値を超えた場合、一時的にBAN
    if (failure.consecutive >= this.limits.failures.maxConsecutive) {
      this.banClient(key, 'Too many consecutive failures', this.limits.failures.banDuration)
    }

    if (this.enableLogging) {
      this.logger.warn('Request failure recorded', {
        key,
        consecutive: failure.consecutive,
        total: failure.total
      })
    }
  }

  /**
   * クライアントをBAN
   * @param {string} key クライアント識別子
   * @param {string} reason BAN理由
   * @param {number} duration BAN期間（ミリ秒）
   */
  banClient (key, reason, duration = this.limits.failures.banDuration) {
    const now = Date.now()
    const expiresAt = now + duration

    this.bannedClients.set(key, {
      reason,
      bannedAt: now,
      expiresAt,
      duration
    })

    if (this.enableLogging) {
      this.logger.error('Client banned', {
        key,
        reason,
        duration,
        expiresAt: new Date(expiresAt).toISOString()
      })
    }
  }

  /**
   * クライアントがBANされているかチェック
   * @param {string} key クライアント識別子
   * @returns {boolean}
   */
  isBanned (key) {
    if (!this.bannedClients.has(key)) {
      return false
    }

    const banInfo = this.bannedClients.get(key)
    const now = Date.now()

    if (now >= banInfo.expiresAt) {
      // BAN期限切れ
      this.bannedClients.delete(key)
      this.resetFailures(key)
      return false
    }

    return true
  }

  /**
   * 失敗カウンターをリセット
   * @param {string} key クライアント識別子
   */
  resetFailures (key) {
    if (this.failures.has(key)) {
      const failure = this.failures.get(key)
      failure.consecutive = 0
    }
  }

  /**
   * バーストトークンを補充
   */
  refillBurstTokens () {
    const now = Date.now()
    const timePassed = now - this.lastTokenRefill

    if (timePassed >= 1000) { // 1秒ごとに補充
      const tokensToAdd = Math.floor(timePassed / 1000) * (this.limits.general.perSecond / 10)
      this.burstTokens = Math.min(
        this.limits.general.burst,
        this.burstTokens + tokensToAdd
      )
      this.lastTokenRefill = now
    }
  }

  /**
   * IPカウンターをリセット
   * @param {string} ip IPアドレス
   * @param {Object} usage 使用状況オブジェクト
   * @param {number} now 現在時刻
   */
  resetIPCounters (ip, usage, now) {
    if (now >= usage.second.resetTime) {
      usage.second = { count: 0, resetTime: this.getNextSecond() }
    }
    if (now >= usage.minute.resetTime) {
      usage.minute = { count: 0, resetTime: this.getNextMinute() }
    }
    if (now >= usage.hour.resetTime) {
      usage.hour = { count: 0, resetTime: this.getNextHour() }
    }
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

    // 汎用カウンターのリセット
    if (now >= this.usage.general.second.resetTime) {
      this.usage.general.second = { count: 0, resetTime: this.getNextSecond() }
    }
    if (now >= this.usage.general.minute.resetTime) {
      this.usage.general.minute = { count: 0, resetTime: this.getNextMinute() }
    }
    if (now >= this.usage.general.hour.resetTime) {
      this.usage.general.hour = { count: 0, resetTime: this.getNextHour() }
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
          percentage: (
            (this.usage.tweets.month.count / this.limits.tweets.perMonth) * 100
          ).toFixed(1),
          resetTime: new Date(this.usage.tweets.month.resetTime).toISOString()
        }
      },
      reads: {
        quarter: {
          current: this.usage.reads.quarter.count,
          limit: this.limits.reads.per15min,
          percentage: (
            (this.usage.reads.quarter.count / this.limits.reads.per15min) * 100
          ).toFixed(1),
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
  getNextSecond () {
    const now = Date.now()
    return now + 1000 - (now % 1000)
  }

  getNextMinute () {
    const now = new Date()
    const next = new Date(now)
    next.setSeconds(0, 0)
    next.setMinutes(now.getMinutes() + 1)
    return next.getTime()
  }

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
   * セキュリティ統計を取得
   * @returns {Object} セキュリティ統計情報
   */
  getSecurityStats () {
    const now = Date.now()

    // 期限切れエントリをクリーンアップ
    this.cleanupExpiredEntries()

    const stats = {
      bannedClients: this.bannedClients.size,
      activeBans: Array.from(this.bannedClients.entries()).map(([key, ban]) => ({
        key,
        reason: ban.reason,
        remainingTime: Math.max(0, ban.expiresAt - now),
        bannedAt: new Date(ban.bannedAt).toISOString()
      })),
      failureTracking: this.failures.size,
      activeFailures: Array.from(this.failures.entries()).map(([key, failure]) => ({
        key,
        consecutive: failure.consecutive,
        total: failure.total,
        lastFailure: new Date(failure.lastFailure).toISOString()
      })),
      ipTracking: this.ipUsage.size,
      burstTokens: this.burstTokens,
      maxBurstTokens: this.limits.general.burst
    }

    return stats
  }

  /**
   * 期限切れエントリをクリーンアップ
   */
  cleanupExpiredEntries () {
    const now = Date.now()

    // 期限切れBANを削除
    for (const [key, ban] of this.bannedClients.entries()) {
      if (now >= ban.expiresAt) {
        this.bannedClients.delete(key)
        this.resetFailures(key)
      }
    }

    // 古い失敗記録を削除
    for (const [key, failure] of this.failures.entries()) {
      if (now >= failure.resetTime) {
        this.failures.delete(key)
      }
    }

    // 古いIP使用記録を削除（1時間後）
    for (const [ip, usage] of this.ipUsage.entries()) {
      if (now >= usage.hour.resetTime) {
        this.ipUsage.delete(ip)
      }
    }
  }

  /**
   * クライアントのBAN解除
   * @param {string} key クライアント識別子
   */
  unbanClient (key) {
    if (this.bannedClients.has(key)) {
      this.bannedClients.delete(key)
      this.resetFailures(key)

      if (this.enableLogging) {
        this.logger.info('Client unbanned', { key })
      }
    }
  }

  /**
   * 全統計情報を取得
   * @returns {Object} 全統計情報
   */
  getAllStats () {
    this.resetExpiredCounters()
    this.cleanupExpiredEntries()

    return {
      usage: this.getUsageStats(),
      security: this.getSecurityStats(),
      limits: this.limits,
      config: {
        enableLogging: this.enableLogging,
        enableSecurity: this.enableSecurity
      },
      timestamp: new Date().toISOString()
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
      },
      general: {
        second: { count: 0, resetTime: this.getNextSecond() },
        minute: { count: 0, resetTime: this.getNextMinute() },
        hour: { count: 0, resetTime: this.getNextHour() },
        burst: { count: 0, resetTime: this.getNextSecond() }
      }
    }

    // セキュリティ関連もリセット
    this.ipUsage.clear()
    this.failures.clear()
    this.bannedClients.clear()
    this.burstTokens = this.limits.general.burst
    this.lastTokenRefill = Date.now()

    if (this.enableLogging) {
      this.logger.info('RateLimiter usage counters and security state reset')
    }
  }
}

module.exports = RateLimiter
