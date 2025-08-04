/**
 * BaseRateLimiter - レート制限機能の基底クラス
 * 共通のレート制限ロジックを提供
 */

class BaseRateLimiter {
  constructor (config = {}) {
    this.config = {
      enableLogging: true,
      logger: console,
      timeWindowHour: 3600000, // 1時間（ミリ秒）
      timeWindowMinute: 60000, // 1分（ミリ秒）
      timeWindowSecond: 1000, // 1秒（ミリ秒）
      ...config
    }

    // リクエスト履歴を保存
    this.requestHistory = {}

    // ロガー設定
    this.logger = this.config.logger
    this.enableLogging = this.config.enableLogging
  }

  /**
   * 指定されたタイプのリクエスト履歴を初期化
   */
  initializeHistory (type) {
    if (!this.requestHistory[type]) {
      this.requestHistory[type] = []
    }
  }

  /**
   * 古いリクエスト記録をクリーンアップ
   * @param {string} type リクエストタイプ
   * @param {number} timeWindow 時間窓（ミリ秒）
   */
  cleanupOldRequests (type, timeWindow) {
    if (!this.requestHistory[type]) return

    const now = Date.now()
    this.requestHistory[type] = this.requestHistory[type].filter(
      record => now - record.timestamp < timeWindow
    )
  }

  /**
   * リクエストを記録
   * @param {string} type リクエストタイプ
   * @param {boolean} success 成功フラグ
   * @param {Object} metadata 追加メタデータ
   */
  async recordRequest (type, success = true, metadata = {}) {
    this.initializeHistory(type)

    const record = {
      timestamp: Date.now(),
      success,
      ...metadata
    }

    this.requestHistory[type].push(record)

    if (this.enableLogging) {
      this.logger.info(`Request recorded: ${type}`, {
        success,
        totalRequests: this.requestHistory[type].length
      })
    }
  }

  /**
   * 指定期間内のリクエスト数を取得
   * @param {string} type リクエストタイプ
   * @param {number} timeWindow 時間窓（ミリ秒）
   * @returns {number} リクエスト数
   */
  getRequestCount (type, timeWindow) {
    this.cleanupOldRequests(type, timeWindow)
    return this.requestHistory[type] ? this.requestHistory[type].length : 0
  }

  /**
   * 残りリクエスト数を計算
   * @param {string} type リクエストタイプ
   * @param {number} limit 制限数
   * @param {number} timeWindow 時間窓
   * @returns {number} 残りリクエスト数
   */
  getRemainingRequests (type, limit, timeWindow) {
    const used = this.getRequestCount(type, timeWindow)
    return Math.max(0, limit - used)
  }

  /**
   * 次の時間窓までの待機時間を計算
   * @param {number} timeWindow 時間窓（ミリ秒）
   * @returns {number} 待機時間（ミリ秒）
   */
  getWaitTime (timeWindow) {
    const now = Date.now()
    return timeWindow - (now % timeWindow)
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats () {
    const stats = {}

    for (const [type, requests] of Object.entries(this.requestHistory)) {
      const total = requests.length
      const successful = requests.filter(r => r.success).length
      const failed = total - successful

      stats[type] = {
        total,
        successful,
        failed,
        successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%'
      }
    }

    return stats
  }

  /**
   * クリーンアップ処理
   */
  cleanup () {
    this.requestHistory = {}

    if (this.enableLogging) {
      this.logger.info('Rate limiter cleanup completed')
    }
  }

  /**
   * 現在の時刻から指定された時間窓の次のリセット時間を計算
   * @param {number} interval 間隔（ミリ秒）
   * @returns {number} 次のリセット時間（Unix timestamp）
   */
  getNextResetTime (interval) {
    const now = Date.now()
    return now + (interval - (now % interval))
  }

  /**
   * 時間関連のユーティリティメソッド
   */
  getNextSecond () {
    return this.getNextResetTime(this.config.timeWindowSecond)
  }

  getNextMinute () {
    return this.getNextResetTime(this.config.timeWindowMinute)
  }

  getNextHour () {
    return this.getNextResetTime(this.config.timeWindowHour)
  }

  getNext15Min () {
    return this.getNextResetTime(15 * 60 * 1000) // 15分
  }

  getNextDay () {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.getTime()
  }

  getNextMonth () {
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return nextMonth.getTime()
  }
}

module.exports = BaseRateLimiter
