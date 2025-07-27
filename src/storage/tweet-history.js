const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const { createLogger } = require('../utils/logger')

class TweetHistory {
  constructor (config = {}) {
    this.config = {
      storagePath: path.join(process.cwd(), 'data', 'tweets'),
      maxHistorySize: 1000,
      enablePersistence: true,
      autoSave: false,
      autoSaveInterval: 5 * 60 * 1000, // 5分
      ...config
    }

    this.logger = createLogger('tweet-history', { enableConsole: false })
    this.tweets = []
    this.initialized = false
    this.autoSaveTimer = null
  }

  async initialize () {
    try {
      if (this.initialized) return

      // ストレージディレクトリを作成
      await fs.mkdir(this.config.storagePath, { recursive: true })

      // 既存のデータを読み込み
      if (this.config.enablePersistence) {
        await this.load()
      }

      // 自動保存を開始
      if (this.config.autoSave) {
        this.startAutoSave()
      }

      this.initialized = true
      this.logger.info('TweetHistory initialized', {
        storagePath: this.config.storagePath,
        enablePersistence: this.config.enablePersistence,
        autoSave: this.config.autoSave
      })
    } catch (error) {
      this.logger.error('Failed to initialize TweetHistory', { error: error.message })
      throw error
    }
  }

  async addTweet (tweetData) {
    try {
      if (!tweetData.text) {
        throw new Error('Tweet text is required')
      }

      const tweet = {
        id: tweetData.id || this.generateId(),
        text: tweetData.text,
        status: tweetData.status || 'pending',
        createdAt: tweetData.createdAt || new Date().toISOString(),
        contentHash: this.generateContentHash(tweetData.text),
        ...tweetData
      }

      // 履歴の先頭に追加（最新が先頭）
      this.tweets.unshift(tweet)

      // サイズ制限
      if (this.tweets.length > this.config.maxHistorySize) {
        this.tweets = this.tweets.slice(0, this.config.maxHistorySize)
      }

      this.logger.debug('Tweet added to history', {
        id: tweet.id,
        status: tweet.status,
        textLength: tweet.text.length
      })

      return tweet
    } catch (error) {
      this.logger.error('Failed to add tweet', { error: error.message })
      throw error
    }
  }

  async isDuplicate (text) {
    try {
      const normalizedText = text.trim().toLowerCase()
      return this.tweets.some(tweet =>
        tweet.text.trim().toLowerCase() === normalizedText
      )
    } catch (error) {
      this.logger.error('Error checking duplicate', { error: error.message })
      return false
    }
  }

  async isDuplicateHash (hash) {
    try {
      return this.tweets.some(tweet => tweet.contentHash === hash)
    } catch (error) {
      this.logger.error('Error checking duplicate hash', { error: error.message })
      return false
    }
  }

  generateContentHash (text) {
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
  }

  generateId () {
    return Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9)
  }

  getHistory (filters = {}) {
    try {
      let results = [...this.tweets]

      // ステータスフィルタ
      if (filters.status) {
        results = results.filter(tweet => tweet.status === filters.status)
      }

      // 日付範囲フィルタ
      if (filters.startDate || filters.endDate) {
        results = results.filter(tweet => {
          const tweetDate = new Date(tweet.createdAt)

          if (filters.startDate && tweetDate < new Date(filters.startDate)) {
            return false
          }

          if (filters.endDate && tweetDate > new Date(filters.endDate)) {
            return false
          }

          return true
        })
      }

      // キーワード検索
      if (filters.keyword) {
        const keyword = filters.keyword.toLowerCase()
        results = results.filter(tweet =>
          tweet.text.toLowerCase().includes(keyword)
        )
      }

      // 制限数
      if (filters.limit) {
        results = results.slice(0, filters.limit)
      }

      return results
    } catch (error) {
      this.logger.error('Error getting history', { error: error.message })
      return []
    }
  }

  searchByKeyword (keyword) {
    try {
      const searchTerm = keyword.toLowerCase()
      return this.tweets.filter(tweet =>
        tweet.text.toLowerCase().includes(searchTerm)
      )
    } catch (error) {
      this.logger.error('Error searching by keyword', { error: error.message, keyword })
      return []
    }
  }

  getStats (filters = {}) {
    try {
      const tweets = this.getHistory(filters)

      const total = tweets.length
      const successful = tweets.filter(t => t.status === 'success').length
      const failed = tweets.filter(t => t.status === 'failed').length
      const pending = tweets.filter(t => t.status === 'pending').length

      return {
        total,
        successful,
        failed,
        pending,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0
      }
    } catch (error) {
      this.logger.error('Error calculating stats', { error: error.message })
      return { total: 0, successful: 0, failed: 0, pending: 0, successRate: 0 }
    }
  }

  getHourlyStats () {
    try {
      const hourlyData = new Map()

      this.tweets.forEach(tweet => {
        const hour = new Date(tweet.createdAt).getHours()
        if (!hourlyData.has(hour)) {
          hourlyData.set(hour, { hour, count: 0, successful: 0, failed: 0 })
        }

        const data = hourlyData.get(hour)
        data.count++

        if (tweet.status === 'success') data.successful++
        if (tweet.status === 'failed') data.failed++
      })

      return Array.from(hourlyData.values()).sort((a, b) => a.hour - b.hour)
    } catch (error) {
      this.logger.error('Error calculating hourly stats', { error: error.message })
      return []
    }
  }

  getDailyStats () {
    try {
      const dailyData = new Map()

      this.tweets.forEach(tweet => {
        const date = new Date(tweet.createdAt).toISOString().split('T')[0]
        if (!dailyData.has(date)) {
          dailyData.set(date, { date, count: 0, successful: 0, failed: 0 })
        }

        const data = dailyData.get(date)
        data.count++

        if (tweet.status === 'success') data.successful++
        if (tweet.status === 'failed') data.failed++
      })

      return Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date))
    } catch (error) {
      this.logger.error('Error calculating daily stats', { error: error.message })
      return []
    }
  }

  async cleanupOldData (days = 30) {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      const initialLength = this.tweets.length
      this.tweets = this.tweets.filter(tweet =>
        new Date(tweet.createdAt) > cutoffDate
      )

      const deletedCount = initialLength - this.tweets.length

      this.logger.info('Cleaned up old data', {
        deletedCount,
        remaining: this.tweets.length,
        cutoffDate: cutoffDate.toISOString()
      })

      return deletedCount
    } catch (error) {
      this.logger.error('Error cleaning up old data', { error: error.message })
      return 0
    }
  }

  async cleanupByStatus (status) {
    try {
      const initialLength = this.tweets.length
      this.tweets = this.tweets.filter(tweet => tweet.status !== status)

      const deletedCount = initialLength - this.tweets.length

      this.logger.info('Cleaned up by status', {
        status,
        deletedCount,
        remaining: this.tweets.length
      })

      return deletedCount
    } catch (error) {
      this.logger.error('Error cleaning up by status', { error: error.message, status })
      return 0
    }
  }

  async save () {
    try {
      if (!this.config.enablePersistence) return

      const filePath = path.join(this.config.storagePath, 'tweet-history.json')
      const data = {
        version: '1.0.0',
        saved: new Date().toISOString(),
        config: this.config,
        tweets: this.tweets
      }

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')

      this.logger.debug('History saved to file', {
        filePath,
        tweetCount: this.tweets.length
      })
    } catch (error) {
      this.logger.error('Failed to save history', { error: error.message })
      throw error
    }
  }

  async load () {
    try {
      if (!this.config.enablePersistence) return

      const filePath = path.join(this.config.storagePath, 'tweet-history.json')

      try {
        const fileContent = await fs.readFile(filePath, 'utf8')
        const data = JSON.parse(fileContent)

        if (data.tweets && Array.isArray(data.tweets)) {
          this.tweets = data.tweets

          this.logger.info('History loaded from file', {
            filePath,
            tweetCount: this.tweets.length
          })
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error
        }
        // ファイルが存在しない場合は無視
        this.logger.info('No existing history file found, starting fresh')
      }
    } catch (error) {
      this.logger.error('Failed to load history', { error: error.message })
      throw error
    }
  }

  async exportToJSON () {
    try {
      const exportData = {
        version: '1.0.0',
        exported: new Date().toISOString(),
        metadata: {
          totalTweets: this.tweets.length,
          stats: this.getStats()
        },
        tweets: this.tweets
      }

      return JSON.stringify(exportData, null, 2)
    } catch (error) {
      this.logger.error('Failed to export to JSON', { error: error.message })
      throw error
    }
  }

  async importFromJSON (jsonData) {
    try {
      const data = JSON.parse(jsonData)

      if (!data.tweets || !Array.isArray(data.tweets)) {
        throw new Error('Invalid JSON format: tweets array not found')
      }

      // 重複を避けるため、既存のハッシュを取得
      const existingHashes = new Set(this.tweets.map(t => t.contentHash))

      const importedTweets = data.tweets.filter(tweet => {
        if (!tweet.contentHash) {
          tweet.contentHash = this.generateContentHash(tweet.text)
        }
        return !existingHashes.has(tweet.contentHash)
      })

      // インポートしたツイートを追加
      this.tweets = [...importedTweets, ...this.tweets]

      // サイズ制限
      if (this.tweets.length > this.config.maxHistorySize) {
        this.tweets = this.tweets.slice(0, this.config.maxHistorySize)
      }

      this.logger.info('History imported from JSON', {
        importedCount: importedTweets.length,
        totalCount: this.tweets.length
      })

      return importedTweets.length
    } catch (error) {
      this.logger.error('Failed to import from JSON', { error: error.message })
      throw error
    }
  }

  startAutoSave () {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
    }

    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.save()
      } catch (error) {
        this.logger.error('Auto-save failed', { error: error.message })
      }
    }, this.config.autoSaveInterval)

    this.logger.debug('Auto-save started', {
      interval: this.config.autoSaveInterval
    })
  }

  stopAutoSave () {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
      this.logger.debug('Auto-save stopped')
    }
  }

  async cleanup () {
    try {
      this.stopAutoSave()
      this.tweets = []
      this.initialized = false

      this.logger.info('TweetHistory cleanup completed')
    } catch (error) {
      this.logger.error('Error during cleanup', { error: error.message })
    }
  }

  // Alias for load method to match API expectations
  async loadHistory () {
    return this.load()
  }
}

module.exports = TweetHistory
