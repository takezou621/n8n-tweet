/**
 * DoSProtectionLimiter - DoS攻撃防止とセキュリティ制限
 * IPベースの制限、連続失敗の追跡、自動BAN機能を提供
 */

const BaseRateLimiter = require('./base-rate-limiter')

class DoSProtectionLimiter extends BaseRateLimiter {
  constructor (config = {}) {
    super(config)

    // DoS攻撃防止の制限設定
    this.protectionLimits = {
      perSecond: config.perSecond || 10,
      perMinute: config.perMinute || 100,
      perHour: config.perHour || 1000,
      burst: config.burst || 50,
      maxConsecutiveFailures: config.maxConsecutiveFailures || 5,
      failuresPerMinute: config.failuresPerMinute || 10,
      banDuration: config.banDuration || 300000, // 5分
      suspiciousThreshold: config.suspiciousThreshold || 0.8, // 80%失敗率
      ...config.protectionLimits
    }

    // IPベースの追跡
    this.ipTracking = new Map() // IP -> tracking data
    this.bannedIPs = new Map() // IP -> ban info
    this.suspiciousIPs = new Set() // 疑わしいIPのセット

    // 失敗追跡
    this.failureTracking = new Map() // identifier -> failure data

    // バーストトークンバケット
    this.burstTokens = this.protectionLimits.burst
    this.lastTokenRefill = Date.now()

    // クリーンアップタイマー
    this.cleanupInterval = setInterval(() => {
      this.performCleanup()
    }, 60000) // 1分ごと

    if (this.enableLogging) {
      this.logger.info('DoSProtectionLimiter initialized', {
        perSecond: this.protectionLimits.perSecond,
        perMinute: this.protectionLimits.perMinute,
        banDuration: this.protectionLimits.banDuration
      })
    }
  }

  /**
   * IPベースの制限をチェック
   * @param {string} ip IPアドレス
   * @param {string} type リクエストタイプ
   * @returns {Object} 制限チェック結果
   */
  async checkIPLimit (ip, type = 'general') {
    const now = Date.now()

    // BANチェック
    if (this.isBanned(ip)) {
      const banInfo = this.bannedIPs.get(ip)
      const remainingBanTime = banInfo.expiresAt - now

      if (remainingBanTime <= 0) {
        this.unbanIP(ip)
      } else {
        return {
          allowed: false,
          reason: 'IP is banned',
          waitTime: remainingBanTime,
          details: {
            banReason: banInfo.reason,
            bannedAt: new Date(banInfo.bannedAt).toISOString(),
            expiresAt: new Date(banInfo.expiresAt).toISOString()
          }
        }
      }
    }

    // IP追跡データを取得または作成
    if (!this.ipTracking.has(ip)) {
      this.ipTracking.set(ip, {
        requests: [],
        failures: [],
        firstSeen: now,
        lastSeen: now,
        totalRequests: 0,
        totalFailures: 0
      })
    }

    const ipData = this.ipTracking.get(ip)
    ipData.lastSeen = now

    // 古いリクエストをクリーンアップ
    this.cleanupIPRequests(ip, now)

    // 秒単位制限
    const requestsInLastSecond = this.getIPRequestCount(ip, this.config.timeWindowSecond)
    if (requestsInLastSecond >= this.protectionLimits.perSecond) {
      this.recordSuspiciousActivity(ip, 'High frequency requests (per second)')
      return {
        allowed: false,
        reason: 'Too many requests per second',
        waitTime: this.getWaitTime(this.config.timeWindowSecond),
        details: {
          current: requestsInLastSecond,
          limit: this.protectionLimits.perSecond,
          timeWindow: '1 second'
        }
      }
    }

    // 分単位制限
    const requestsInLastMinute = this.getIPRequestCount(ip, this.config.timeWindowMinute)
    if (requestsInLastMinute >= this.protectionLimits.perMinute) {
      this.recordSuspiciousActivity(ip, 'High frequency requests (per minute)')
      return {
        allowed: false,
        reason: 'Too many requests per minute',
        waitTime: this.getWaitTime(this.config.timeWindowMinute),
        details: {
          current: requestsInLastMinute,
          limit: this.protectionLimits.perMinute,
          timeWindow: '1 minute'
        }
      }
    }

    // バーストトークンチェック
    this.refillBurstTokens()
    if (this.burstTokens <= 0) {
      return {
        allowed: false,
        reason: 'Burst limit exceeded',
        waitTime: 1000, // 1秒待機
        details: {
          burstLimit: this.protectionLimits.burst,
          message: 'Please slow down your requests'
        }
      }
    }

    // 疑わしい活動パターンをチェック
    if (this.isIPSuspicious(ip)) {
      return {
        allowed: false,
        reason: 'Suspicious activity detected',
        waitTime: 30000, // 30秒待機
        details: {
          suspiciousPatterns: this.getSuspiciousPatterns(ip)
        }
      }
    }

    return { allowed: true }
  }

  /**
   * リクエストを記録（IP追跡付き）
   * @param {string} ip IPアドレス
   * @param {string} type リクエストタイプ
   * @param {boolean} success 成功フラグ
   * @param {Object} metadata 追加メタデータ
   */
  async recordIPRequest (ip, type = 'general', success = true, metadata = {}) {
    const now = Date.now()

    // 基底クラスの記録も実行
    await this.recordRequest(type, success, { ip, ...metadata })

    // IP固有の記録
    if (!this.ipTracking.has(ip)) {
      this.ipTracking.set(ip, {
        requests: [],
        failures: [],
        firstSeen: now,
        lastSeen: now,
        totalRequests: 0,
        totalFailures: 0
      })
    }

    const ipData = this.ipTracking.get(ip)
    ipData.requests.push({ timestamp: now, type, success, ...metadata })
    ipData.totalRequests++
    ipData.lastSeen = now

    if (!success) {
      ipData.failures.push({ timestamp: now, type, ...metadata })
      ipData.totalFailures++
      await this.handleFailure(ip, type, metadata)
    }

    // バーストトークンを消費
    if (this.burstTokens > 0) {
      this.burstTokens--
    }

    if (this.enableLogging) {
      this.logger.info('IP request recorded', {
        ip,
        type,
        success,
        totalRequests: ipData.totalRequests,
        totalFailures: ipData.totalFailures
      })
    }
  }

  /**
   * 失敗を処理
   * @param {string} ip IPアドレス
   * @param {string} type リクエストタイプ
   * @param {Object} metadata メタデータ
   */
  async handleFailure (ip, type, metadata = {}) {
    const now = Date.now()
    const ipData = this.ipTracking.get(ip)

    // 連続失敗をチェック
    const recentFailures = ipData.failures.filter(
      f => now - f.timestamp < this.config.timeWindowMinute
    )

    // 短時間での連続失敗が閾値を超えた場合
    if (recentFailures.length >= this.protectionLimits.maxConsecutiveFailures) {
      await this.banIP(ip, 'Too many consecutive failures', {
        failureCount: recentFailures.length,
        timeWindow: '1 minute',
        lastFailure: metadata
      })
      return
    }

    // 分単位での失敗率をチェック
    const requestsInLastMinute = this.getIPRequestCount(ip, this.config.timeWindowMinute)
    const failureRate = requestsInLastMinute > 0 ? recentFailures.length / requestsInLastMinute : 0

    if (failureRate >= this.protectionLimits.suspiciousThreshold) {
      this.recordSuspiciousActivity(ip, `High failure rate: ${(failureRate * 100).toFixed(1)}%`)
    }
  }

  /**
   * IPをBANする
   * @param {string} ip IPアドレス
   * @param {string} reason BAN理由
   * @param {Object} details 詳細情報
   */
  async banIP (ip, reason, details = {}) {
    const now = Date.now()
    const expiresAt = now + this.protectionLimits.banDuration

    this.bannedIPs.set(ip, {
      ip,
      reason,
      bannedAt: now,
      expiresAt,
      details
    })

    // 疑わしいIPセットからも削除（BANの方が強い制限）
    this.suspiciousIPs.delete(ip)

    if (this.enableLogging) {
      this.logger.warn('IP banned', {
        ip,
        reason,
        duration: this.protectionLimits.banDuration,
        expiresAt: new Date(expiresAt).toISOString(),
        details
      })
    }
  }

  /**
   * IPのBAN解除
   * @param {string} ip IPアドレス
   */
  unbanIP (ip) {
    const banInfo = this.bannedIPs.get(ip)
    this.bannedIPs.delete(ip)

    if (this.enableLogging && banInfo) {
      this.logger.info('IP unbanned', {
        ip,
        originalReason: banInfo.reason,
        bannedDuration: Date.now() - banInfo.bannedAt
      })
    }
  }

  /**
   * IPがBANされているかチェック
   * @param {string} ip IPアドレス
   * @returns {boolean} BAN状態
   */
  isBanned (ip) {
    return this.bannedIPs.has(ip)
  }

  /**
   * 疑わしい活動を記録
   * @param {string} ip IPアドレス
   * @param {string} pattern 疑わしいパターン
   */
  recordSuspiciousActivity (ip, pattern) {
    this.suspiciousIPs.add(ip)

    if (this.enableLogging) {
      this.logger.warn('Suspicious activity detected', { ip, pattern })
    }
  }

  /**
   * IPが疑わしいかチェック
   * @param {string} ip IPアドレス
   * @returns {boolean} 疑わしいフラグ
   */
  isIPSuspicious (ip) {
    return this.suspiciousIPs.has(ip)
  }

  /**
   * 疑わしいパターンを取得
   * @param {string} ip IPアドレス
   * @returns {Array} パターンリスト
   */
  getSuspiciousPatterns (ip) {
    const patterns = []
    const ipData = this.ipTracking.get(ip)

    if (!ipData) return patterns

    const now = Date.now()
    const recentRequests = ipData.requests.filter(
      r => now - r.timestamp < this.config.timeWindowMinute
    )
    const recentFailures = ipData.failures.filter(
      f => now - f.timestamp < this.config.timeWindowMinute
    )

    if (recentRequests.length > this.protectionLimits.perMinute * 0.8) {
      patterns.push('High request frequency')
    }

    if (recentFailures.length > 0) {
      const failureRate = recentFailures.length / recentRequests.length
      if (failureRate > this.protectionLimits.suspiciousThreshold) {
        patterns.push(`High failure rate (${(failureRate * 100).toFixed(1)}%)`)
      }
    }

    return patterns
  }

  /**
   * 指定期間内のIPリクエスト数を取得
   * @param {string} ip IPアドレス
   * @param {number} timeWindow 時間窓
   * @returns {number} リクエスト数
   */
  getIPRequestCount (ip, timeWindow) {
    const ipData = this.ipTracking.get(ip)
    if (!ipData) return 0

    const now = Date.now()
    return ipData.requests.filter(r => now - r.timestamp < timeWindow).length
  }

  /**
   * IPの古いリクエストをクリーンアップ
   * @param {string} ip IPアドレス
   * @param {number} now 現在時刻
   */
  cleanupIPRequests (ip, now) {
    const ipData = this.ipTracking.get(ip)
    if (!ipData) return

    // 1時間以上古いリクエストを削除
    const cutoff = now - this.config.timeWindowHour
    ipData.requests = ipData.requests.filter(r => r.timestamp > cutoff)
    ipData.failures = ipData.failures.filter(f => f.timestamp > cutoff)
  }

  /**
   * バーストトークンを補充
   */
  refillBurstTokens () {
    const now = Date.now()
    const elapsed = now - this.lastTokenRefill
    const tokensToAdd = Math.floor(elapsed / 1000) // 1秒ごとに1トークン

    if (tokensToAdd > 0) {
      this.burstTokens = Math.min(this.protectionLimits.burst, this.burstTokens + tokensToAdd)
      this.lastTokenRefill = now
    }
  }

  /**
   * 定期クリーンアップ処理
   */
  performCleanup () {
    const now = Date.now()

    // 期限切れのBANを削除
    for (const [ip, banInfo] of this.bannedIPs.entries()) {
      if (now >= banInfo.expiresAt) {
        this.unbanIP(ip)
      }
    }

    // 古いIP追跡データを削除
    for (const [ip, ipData] of this.ipTracking.entries()) {
      // 24時間以上アクセスがないIPデータを削除
      if (now - ipData.lastSeen > 24 * 60 * 60 * 1000) {
        this.ipTracking.delete(ip)
        this.suspiciousIPs.delete(ip)
      } else {
        this.cleanupIPRequests(ip, now)
      }
    }

    if (this.enableLogging) {
      this.logger.info('DoS protection cleanup completed', {
        activeIPs: this.ipTracking.size,
        bannedIPs: this.bannedIPs.size,
        suspiciousIPs: this.suspiciousIPs.size
      })
    }
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getProtectionStats () {
    const baseStats = this.getStats()

    return {
      ...baseStats,
      protection: {
        activeIPs: this.ipTracking.size,
        bannedIPs: this.bannedIPs.size,
        suspiciousIPs: this.suspiciousIPs.size,
        burstTokens: this.burstTokens,
        limits: this.protectionLimits
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * クリーンアップとリソース解放
   */
  cleanup () {
    super.cleanup()

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.ipTracking.clear()
    this.bannedIPs.clear()
    this.suspiciousIPs.clear()
    this.failureTracking.clear()

    if (this.enableLogging) {
      this.logger.info('DoSProtectionLimiter cleanup completed')
    }
  }
}

module.exports = DoSProtectionLimiter
