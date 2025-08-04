/**
 * TwitterRateLimiter - Twitter API v2専用レート制限管理
 * Twitter APIの具体的な制限値と仕様に特化
 */

const BaseRateLimiter = require('./base-rate-limiter')

class TwitterRateLimiter extends BaseRateLimiter {
  constructor (config = {}) {
    super(config)

    // Twitter API v2の具体的な制限値
    this.twitterLimits = {
      tweetsPerHour: config.tweetsPerHour || 50,
      tweetsPerDay: config.tweetsPerDay || 1000,
      requestsPerMinute: config.requestsPerMinute || 100,
      cooldownPeriod: config.cooldownPeriod || 15, // 分
      ...config.twitterLimits
    }

    // Twitter特有の統計情報
    this.tweetStats = {
      lastTweetTime: null,
      consecutiveTweets: 0,
      dailyTweetCount: 0,
      lastDayReset: this.getNextDay()
    }

    if (this.enableLogging) {
      this.logger.info('TwitterRateLimiter initialized', {
        tweetsPerHour: this.twitterLimits.tweetsPerHour,
        tweetsPerDay: this.twitterLimits.tweetsPerDay
      })
    }
  }

  /**
   * ツイート投稿の制限をチェック
   * @returns {Object} { allowed: boolean, reason?: string, waitTime?: number }
   */
  async checkTweetLimit () {
    const now = Date.now()

    // 日次リセットチェック
    if (now >= this.tweetStats.lastDayReset) {
      this.tweetStats.dailyTweetCount = 0
      this.tweetStats.lastDayReset = this.getNextDay()
    }

    // 1時間あたりの制限チェック
    const tweetsInLastHour = this.getRequestCount('tweets', this.config.timeWindowHour)
    if (tweetsInLastHour >= this.twitterLimits.tweetsPerHour) {
      const waitTime = this.getWaitTime(this.config.timeWindowHour)
      return {
        allowed: false,
        reason: 'Hourly tweet limit exceeded',
        waitTime,
        details: {
          current: tweetsInLastHour,
          limit: this.twitterLimits.tweetsPerHour,
          resetIn: Math.ceil(waitTime / 60000) + ' minutes'
        }
      }
    }

    // 1日あたりの制限チェック
    if (this.tweetStats.dailyTweetCount >= this.twitterLimits.tweetsPerDay) {
      const waitTime = this.tweetStats.lastDayReset - now
      return {
        allowed: false,
        reason: 'Daily tweet limit exceeded',
        waitTime,
        details: {
          current: this.tweetStats.dailyTweetCount,
          limit: this.twitterLimits.tweetsPerDay,
          resetIn: Math.ceil(waitTime / 3600000) + ' hours'
        }
      }
    }

    // クールダウン期間チェック
    if (this.tweetStats.lastTweetTime) {
      const timeSinceLastTweet = now - this.tweetStats.lastTweetTime
      const minCooldown = this.twitterLimits.cooldownPeriod * 60000 // 分をミリ秒に変換

      if (timeSinceLastTweet < minCooldown) {
        const waitTime = minCooldown - timeSinceLastTweet
        return {
          allowed: false,
          reason: 'Tweet cooldown period active',
          waitTime,
          details: {
            cooldownPeriod: this.twitterLimits.cooldownPeriod + ' minutes',
            remainingTime: Math.ceil(waitTime / 60000) + ' minutes'
          }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * ツイート投稿を記録
   * @param {Object} tweetData ツイートデータ
   * @param {boolean} success 投稿成功フラグ
   */
  async recordTweet (tweetData = {}, success = true) {
    const now = Date.now()

    await this.recordRequest('tweets', success, {
      textLength: tweetData.text?.length || 0,
      hasMedia: !!tweetData.media,
      tweetId: tweetData.id
    })

    if (success) {
      this.tweetStats.lastTweetTime = now
      this.tweetStats.dailyTweetCount++
      this.tweetStats.consecutiveTweets = success ? this.tweetStats.consecutiveTweets + 1 : 0
    }

    if (this.enableLogging) {
      this.logger.info('Tweet recorded', {
        success,
        dailyCount: this.tweetStats.dailyTweetCount,
        textLength: tweetData.text?.length || 0
      })
    }
  }

  /**
   * Twitter API読み取り制限をチェック
   * @returns {Object} 制限チェック結果
   */
  async checkReadLimit () {
    const requestsInLastMinute = this.getRequestCount('reads', this.config.timeWindowMinute)

    if (requestsInLastMinute >= this.twitterLimits.requestsPerMinute) {
      const waitTime = this.getWaitTime(this.config.timeWindowMinute)
      return {
        allowed: false,
        reason: 'Read rate limit exceeded',
        waitTime,
        details: {
          current: requestsInLastMinute,
          limit: this.twitterLimits.requestsPerMinute,
          resetIn: Math.ceil(waitTime / 1000) + ' seconds'
        }
      }
    }

    return { allowed: true }
  }

  /**
   * API読み取りを記録
   * @param {Object} metadata 追加メタデータ
   * @param {boolean} success 成功フラグ
   */
  async recordRead (metadata = {}, success = true) {
    await this.recordRequest('reads', success, metadata)
  }

  /**
   * Twitter特化の統計情報を取得
   * @returns {Object} Twitter統計情報
   */
  getTwitterStats () {
    const baseStats = this.getStats()

    // 制限情報を追加
    const tweetStats = {
      ...baseStats.tweets,
      remaining: {
        hour: this.getRemainingRequests(
          'tweets', this.twitterLimits.tweetsPerHour, this.config.timeWindowHour
        ),
        day: this.twitterLimits.tweetsPerDay - this.tweetStats.dailyTweetCount
      },
      limits: {
        hour: this.twitterLimits.tweetsPerHour,
        day: this.twitterLimits.tweetsPerDay
      },
      lastTweetTime: this.tweetStats.lastTweetTime
        ? new Date(this.tweetStats.lastTweetTime).toISOString() : null,
      dailyCount: this.tweetStats.dailyTweetCount,
      nextDayReset: new Date(this.tweetStats.lastDayReset).toISOString()
    }

    const readStats = {
      ...baseStats.reads,
      remaining: {
        minute: this.getRemainingRequests(
          'reads', this.twitterLimits.requestsPerMinute, this.config.timeWindowMinute
        )
      },
      limits: {
        minute: this.twitterLimits.requestsPerMinute
      }
    }

    return {
      tweets: tweetStats,
      reads: readStats,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * ヘルスチェック
   * @returns {Object} ヘルス情報
   */
  getHealth () {
    const stats = this.getTwitterStats()

    // 使用率を計算
    const hourlyUsage = stats.tweets.limits.hour > 0
      ? ((stats.tweets.limits.hour - stats.tweets.remaining.hour) / stats.tweets.limits.hour) * 100
      : 0

    const dailyUsage = stats.tweets.limits.day > 0
      ? (stats.tweets.dailyCount / stats.tweets.limits.day) * 100
      : 0

    const maxUsage = Math.max(hourlyUsage, dailyUsage)

    let status = 'healthy'
    if (maxUsage >= 90) {
      status = 'unhealthy'
    } else if (maxUsage >= 80) {
      status = 'warning'
    }

    return {
      status,
      usage: {
        hourly: parseFloat(hourlyUsage.toFixed(2)),
        daily: parseFloat(dailyUsage.toFixed(2)),
        average: parseFloat(maxUsage.toFixed(2))
      },
      limits: stats.tweets.limits,
      remaining: stats.tweets.remaining,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 設定を更新
   * @param {Object} newConfig 新しい設定
   */
  updateConfig (newConfig) {
    this.twitterLimits = {
      ...this.twitterLimits,
      ...newConfig.twitterLimits
    }

    this.config = {
      ...this.config,
      ...newConfig
    }

    if (this.enableLogging) {
      this.logger.info('TwitterRateLimiter configuration updated', {
        tweetsPerHour: this.twitterLimits.tweetsPerHour,
        tweetsPerDay: this.twitterLimits.tweetsPerDay,
        cooldownPeriod: this.twitterLimits.cooldownPeriod
      })
    }
  }
}

module.exports = TwitterRateLimiter
