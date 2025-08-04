/**
 * RateLimiter - 統合レート制限管理クラス
 * TwitterRateLimiterとDoSProtectionLimiterを組み合わせて使用
 * 既存のAPIとの互換性を保ちつつ、責任分離された新しいアーキテクチャを提供
 */

const TwitterRateLimiter = require('./twitter-rate-limiter')
const DoSProtectionLimiter = require('./dos-protection-limiter')

class RateLimiter {
  constructor (config = {}) {
    this.config = {
      enableLogging: true,
      logger: console,
      ...config
    }

    // 各制限管理器を初期化
    this.twitterLimiter = new TwitterRateLimiter({
      tweetsPerHour: config.tweetsPerHour || 50,
      tweetsPerDay: config.tweetsPerDay || 1000,
      requestsPerMinute: config.requestsPerMinute || 100,
      cooldownPeriod: config.cooldownPeriod || 15,
      enableLogging: this.config.enableLogging,
      logger: this.config.logger,
      ...config.twitterConfig
    })

    this.dosProtection = new DoSProtectionLimiter({
      perSecond: config.perSecond || 10,
      perMinute: config.perMinute || 100,
      perHour: config.perHour || 1000,
      burst: config.burst || 50,
      maxConsecutiveFailures: config.maxConsecutiveFailures || 5,
      banDuration: config.banDuration || 300000,
      enableLogging: this.config.enableLogging,
      logger: this.config.logger,
      ...config.dosConfig
    })

    // 後方互換性のためのリクエスト履歴
    this.requestHistory = {
      tweets: [],
      reads: [],
      general: []
    }

    if (this.config.enableLogging) {
      this.config.logger.info('Unified RateLimiter initialized with separated concerns')
    }
  }

  /**
   * Twitter特化の制限チェック（後方互換性API）
   * @param {string} type リクエストタイプ ('tweets', 'reads')
   * @param {string} clientIP クライアントIP（オプション）
   * @returns {Object} 制限チェック結果
   */
  async checkLimit (type = 'general', clientIP = null) {
    // DoS攻撃防止チェック（IPが提供されている場合）
    if (clientIP) {
      const dosCheck = await this.dosProtection.checkIPLimit(clientIP, type)
      if (!dosCheck.allowed) {
        return dosCheck
      }
    }

    // Twitter特化のチェック
    switch (type) {
      case 'tweets':
        return await this.twitterLimiter.checkTweetLimit()
      case 'reads':
        return await this.twitterLimiter.checkReadLimit()
      default:
        // 汎用制限チェック（DoS攻撃防止で代用）
        return { allowed: true }
    }
  }

  /**
   * リクエストを記録（後方互換性API）
   * @param {string} type リクエストタイプ
   * @param {boolean} success 成功フラグ
   * @param {Object} metadata 追加メタデータ
   */
  async recordRequest (type = 'general', success = true, metadata = {}) {
    // 後方互換性のための履歴更新
    this.requestHistory[type] = this.requestHistory[type] || []
    this.requestHistory[type].push({
      timestamp: Date.now(),
      success,
      ...metadata
    })

    // 各制限管理器に記録
    switch (type) {
      case 'tweets':
        await this.twitterLimiter.recordTweet(metadata, success)
        break
      case 'reads':
        await this.twitterLimiter.recordRead(metadata, success)
        break
      default:
        // 汎用リクエストはDoS攻撃防止のみ
        if (metadata.clientIP) {
          await this.dosProtection.recordIPRequest(metadata.clientIP, type, success, metadata)
        }
        break
    }
  }

  /**
   * IP特化のリクエスト記録
   * @param {string} ip IPアドレス
   * @param {string} type リクエストタイプ
   * @param {boolean} success 成功フラグ
   * @param {Object} metadata 追加メタデータ
   */
  async recordIPRequest (ip, type = 'general', success = true, metadata = {}) {
    await this.dosProtection.recordIPRequest(ip, type, success, metadata)

    // Twitter特化のリクエストも同時に記録
    if (type === 'tweets') {
      await this.twitterLimiter.recordTweet(metadata, success)
    } else if (type === 'reads') {
      await this.twitterLimiter.recordRead(metadata, success)
    }
  }

  /**
   * 統計情報を取得（後方互換性API）
   * @returns {Object} 統合統計情報
   */
  getStats () {
    const twitterStats = this.twitterLimiter.getTwitterStats()
    const dosStats = this.dosProtection.getProtectionStats()

    // 後方互換性のための形式変換
    return {
      tweets: {
        total: twitterStats.tweets.total || 0,
        successful: twitterStats.tweets.successful || 0,
        failed: twitterStats.tweets.failed || 0,
        remaining: twitterStats.tweets.remaining,
        limits: twitterStats.tweets.limits,
        successRate: twitterStats.tweets.successRate || '0%'
      },
      reads: {
        total: twitterStats.reads.total || 0,
        successful: twitterStats.reads.successful || 0,
        failed: twitterStats.reads.failed || 0,
        remaining: twitterStats.reads.remaining,
        limits: twitterStats.reads.limits,
        successRate: twitterStats.reads.successRate || '0%'
      },
      protection: dosStats.protection,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * ヘルスチェック（後方互換性API）
   * @returns {Object} ヘルス情報
   */
  getHealth () {
    const twitterHealth = this.twitterLimiter.getHealth()
    const dosStats = this.dosProtection.getProtectionStats()

    return {
      status: twitterHealth.status,
      usage: twitterHealth.usage,
      limits: twitterHealth.limits,
      remaining: twitterHealth.remaining,
      protection: {
        activeIPs: dosStats.protection.activeIPs,
        bannedIPs: dosStats.protection.bannedIPs,
        suspiciousIPs: dosStats.protection.suspiciousIPs,
        burstTokens: dosStats.protection.burstTokens
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Twitter特化の統計情報を取得
   * @returns {Object} Twitter統計情報
   */
  getTwitterStats () {
    return this.twitterLimiter.getTwitterStats()
  }

  /**
   * DoS攻撃防止の統計情報を取得
   * @returns {Object} DoS攻撃防止統計情報
   */
  getProtectionStats () {
    return this.dosProtection.getProtectionStats()
  }

  /**
   * IPをBANする
   * @param {string} ip IPアドレス
   * @param {string} reason BAN理由
   * @param {Object} details 詳細情報
   */
  async banIP (ip, reason, details = {}) {
    await this.dosProtection.banIP(ip, reason, details)
  }

  /**
   * IPのBAN解除
   * @param {string} ip IPアドレス
   */
  unbanIP (ip) {
    this.dosProtection.unbanIP(ip)
  }

  /**
   * IPがBANされているかチェック
   * @param {string} ip IPアドレス
   * @returns {boolean} BAN状態
   */
  isBanned (ip) {
    return this.dosProtection.isBanned(ip)
  }

  /**
   * 設定を更新
   * @param {Object} newConfig 新しい設定
   */
  updateConfig (newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    }

    // 各制限管理器の設定も更新
    if (newConfig.twitterConfig) {
      this.twitterLimiter.updateConfig(newConfig.twitterConfig)
    }

    if (newConfig.dosConfig) {
      // DoSProtectionLimiter用の設定更新は必要に応じて実装
    }

    if (this.config.enableLogging) {
      this.config.logger.info('Unified RateLimiter configuration updated')
    }
  }

  /**
   * クリーンアップとリソース解放
   */
  cleanup () {
    this.twitterLimiter.cleanup()
    this.dosProtection.cleanup()
    this.requestHistory = { tweets: [], reads: [], general: [] }

    if (this.config.enableLogging) {
      this.config.logger.info('Unified RateLimiter cleanup completed')
    }
  }

  // 後方互換性のための追加メソッド

  /**
   * 期限切れのエントリをクリーンアップ（後方互換性）
   */
  cleanupExpiredEntries () {
    // 新しいアーキテクチャでは自動的にクリーンアップされる
    // 明示的なクリーンアップが必要な場合のためのメソッド
    this.twitterLimiter.cleanup()
    this.dosProtection.performCleanup()
  }

  /**
   * タイムウィンドウ設定（後方互換性）
   */
  get timeWindowHour () {
    return this.twitterLimiter.config.timeWindowHour
  }

  get timeWindowMinute () {
    return this.twitterLimiter.config.timeWindowMinute
  }

  get timeWindowSecond () {
    return this.twitterLimiter.config.timeWindowSecond
  }
}

module.exports = RateLimiter
