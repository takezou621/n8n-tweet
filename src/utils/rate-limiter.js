const { createLogger } = require('./logger')

class RateLimiter {
  constructor (config = {}) {
    this.limits = {
      tweetsPerHour: 50,
      tweetsPerDay: 1000,
      requestsPerMinute: 100,
      cooldownPeriod: 15,
      ...config
    }

    this.logger = createLogger('rate-limiter', { enableConsole: false })

    // リクエスト履歴を管理
    this.requestHistory = {
      tweets: [],
      requests: []
    }

    // 統計情報
    this.stats = {
      tweets: { total: 0, successful: 0, failed: 0, history: [] },
      requests: { total: 0, successful: 0, failed: 0, history: [] }
    }

    // バックオフ管理
    this.backoffCounters = {
      tweets: 0,
      requests: 0
    }

    // 時間窓設定（ミリ秒）
    this.timeWindows = {
      minute: config.timeWindowMinute || 60 * 1000,
      hour: config.timeWindowHour || 60 * 60 * 1000,
      day: config.timeWindowDay || 24 * 60 * 60 * 1000
    }
  }

  async checkLimit (type = 'requests') {
    try {
      const now = Date.now()
      this.cleanOldRecords(type, now)

      const history = this.requestHistory[type] || []

      // 分単位チェック
      if (type === 'requests') {
        const recentRequests = history.filter(
          record => now - record.timestamp < this.timeWindows.minute
        )
        if (recentRequests.length >= this.limits.requestsPerMinute) {
          return false
        }
      }

      // 時間単位チェック
      if (type === 'tweets') {
        const recentTweets = history.filter(
          record => now - record.timestamp < this.timeWindows.hour
        )
        if (recentTweets.length >= this.limits.tweetsPerHour) {
          return false
        }

        // 日単位チェック
        const dailyTweets = history.filter(
          record => now - record.timestamp < this.timeWindows.day
        )
        if (dailyTweets.length >= this.limits.tweetsPerDay) {
          return false
        }
      }

      return true
    } catch (error) {
      this.logger.error('Error checking rate limit', { error: error.message, type })
      return true // エラー時は許可
    }
  }

  async recordRequest (type = 'requests', success = true) {
    try {
      const now = Date.now()
      const record = {
        timestamp: now,
        success
      }

      // 履歴に追加
      if (!this.requestHistory[type]) {
        this.requestHistory[type] = []
      }
      this.requestHistory[type].push(record)

      // 統計更新
      if (!this.stats[type]) {
        this.stats[type] = { total: 0, successful: 0, failed: 0, history: [] }
      }

      this.stats[type].total++
      if (success) {
        this.stats[type].successful++
        this.backoffCounters[type] = 0 // 成功時はバックオフリセット
      } else {
        this.stats[type].failed++
        this.backoffCounters[type]++
      }

      this.stats[type].history.push(record)

      // 履歴サイズ制限
      if (this.stats[type].history.length > 1000) {
        this.stats[type].history = this.stats[type].history.slice(-500)
      }

      this.cleanOldRecords(type, now)
    } catch (error) {
      this.logger.error('Error recording request', { error: error.message, type })
    }
  }

  async getWaitTime (type = 'requests') {
    try {
      const now = Date.now()
      this.cleanOldRecords(type, now)

      const history = this.requestHistory[type] || []

      if (type === 'requests') {
        const recentRequests = history.filter(
          record => now - record.timestamp < this.timeWindows.minute
        )
        if (recentRequests.length >= this.limits.requestsPerMinute) {
          const oldestRecent = Math.min(...recentRequests.map(r => r.timestamp))
          return this.timeWindows.minute - (now - oldestRecent)
        }
      }

      if (type === 'tweets') {
        const recentTweets = history.filter(
          record => now - record.timestamp < this.timeWindows.hour
        )
        if (recentTweets.length >= this.limits.tweetsPerHour) {
          const oldestRecent = Math.min(...recentTweets.map(r => r.timestamp))
          return this.timeWindows.hour - (now - oldestRecent)
        }
      }

      return 0
    } catch (error) {
      this.logger.error('Error calculating wait time', { error: error.message, type })
      return 0
    }
  }

  async resetLimits (type) {
    try {
      if (type) {
        this.requestHistory[type] = []
        this.stats[type] = { total: 0, successful: 0, failed: 0, history: [] }
        this.backoffCounters[type] = 0
      } else {
        this.resetAllLimits()
      }
    } catch (error) {
      this.logger.error('Error resetting limits', { error: error.message, type })
    }
  }

  async resetAllLimits () {
    try {
      this.requestHistory = { tweets: [], requests: [] }
      this.stats = {
        tweets: { total: 0, successful: 0, failed: 0, history: [] },
        requests: { total: 0, successful: 0, failed: 0, history: [] }
      }
      this.backoffCounters = { tweets: 0, requests: 0 }
    } catch (error) {
      this.logger.error('Error resetting all limits', { error: error.message })
    }
  }

  getStats () {
    const now = Date.now()

    const result = {}

    for (const [type, typeStats] of Object.entries(this.stats)) {
      this.cleanOldRecords(type, now)

      const history = this.requestHistory[type] || []

      let remaining = {}
      if (type === 'tweets') {
        const hourlyRequests = history.filter(
          record => now - record.timestamp < this.timeWindows.hour
        ).length
        const dailyRequests = history.filter(
          record => now - record.timestamp < this.timeWindows.day
        ).length

        remaining = {
          hour: Math.max(0, this.limits.tweetsPerHour - hourlyRequests),
          day: Math.max(0, this.limits.tweetsPerDay - dailyRequests)
        }
      } else if (type === 'requests') {
        const minuteRequests = history.filter(
          record => now - record.timestamp < this.timeWindows.minute
        ).length

        remaining = {
          minute: Math.max(0, this.limits.requestsPerMinute - minuteRequests)
        }
      }

      const successRate = typeStats.total > 0
        ? Math.round((typeStats.successful / typeStats.total) * 10000) / 100
        : 0

      result[type] = {
        total: typeStats.total,
        successful: typeStats.successful,
        failed: typeStats.failed,
        successRate,
        remaining,
        resetTime: this.getNextResetTime(type),
        history: typeStats.history.slice(-10) // 最新10件
      }
    }

    return result
  }

  getBackoffTime (type) {
    const failureCount = this.backoffCounters[type] || 0
    if (failureCount === 0) return 0

    // 指数バックオフ: 2^failures * 1000ms, 最大60秒
    return Math.min(Math.pow(2, failureCount) * 1000, 60000)
  }

  getHealth () {
    const stats = this.getStats()
    let maxUsage = 0

    // 各タイプの使用率を計算し、最大値を使用
    for (const [type, typeStats] of Object.entries(stats)) {
      if (type === 'tweets') {
        const hourUsage = this.limits.tweetsPerHour - typeStats.remaining.hour
        const usagePercent = (hourUsage / this.limits.tweetsPerHour) * 100
        maxUsage = Math.max(maxUsage, usagePercent)
      } else if (type === 'requests') {
        const minuteUsage = this.limits.requestsPerMinute - typeStats.remaining.minute
        const usagePercent = (minuteUsage / this.limits.requestsPerMinute) * 100
        maxUsage = Math.max(maxUsage, usagePercent)
      }
    }

    let status = 'healthy'
    if (maxUsage >= 90) {
      status = 'unhealthy'
    } else if (maxUsage >= 80) {
      status = 'warning'
    }

    return {
      status,
      limits: this.limits,
      usage: {
        maximum: Math.round(maxUsage * 100) / 100,
        details: stats
      }
    }
  }

  cleanOldRecords (type, now) {
    if (!this.requestHistory[type]) return

    // 24時間より古い記録を削除
    this.requestHistory[type] = this.requestHistory[type].filter(
      record => now - record.timestamp < this.timeWindows.day
    )
  }

  getNextResetTime (type) {
    const now = Date.now()

    if (type === 'tweets') {
      // 次の時間の開始時刻
      const nextHour = new Date(now)
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
      return nextHour.toISOString()
    } else if (type === 'requests') {
      // 次の分の開始時刻
      const nextMinute = new Date(now)
      nextMinute.setMinutes(nextMinute.getMinutes() + 1, 0, 0)
      return nextMinute.toISOString()
    }

    return new Date(now).toISOString()
  }

  cleanup () {
    try {
      this.resetAllLimits()
    } catch (error) {
      this.logger.error('Error during cleanup', { error: error.message })
    }
  }
}

module.exports = RateLimiter
