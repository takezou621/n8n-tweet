/**
 * ツイート履歴管理
 * ツイートの保存、重複チェック、分析機能を提供
 * 
 * Features:
 * - ツイート履歴の永続化
 * - 重複ツイートの検出
 * - 統計分析機能
 * - データのクリーンアップ
 */

const winston = require('winston')
const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')

class TweetHistory {
  constructor(config = {}) {
    this.config = {
      // デフォルト設定
      storageFile: './cache/tweet-history.json',
      maxEntries: 10000,
      retentionDays: 90,
      enableCompression: true,
      autoSave: true,
      saveInterval: 300000, // 5分
      logLevel: 'info',
      ...config
    }
    
    this.initializeLogger()
    this.tweetHistory = []
    this.hashIndex = new Map() // 高速重複検索用
    this.isLoaded = false
    this.saveIntervalId = null
    this.isDirty = false
  }

  /**
   * ロガーを初期化
   */
  initializeLogger() {
    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          silent: process.env.NODE_ENV === 'test',
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })
  }

  /**
   * ツイートのハッシュを生成
   */
  generateTweetHash(text) {
    // ツイートテキストを正規化してハッシュ化
    const normalized = text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\w\s]/g, '') // 特殊文字を除去
    
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')
  }

  /**
   * 履歴データを読み込み
   */
  async loadHistory() {
    try {
      this.logger.info('Loading tweet history', { 
        storageFile: this.config.storageFile 
      })

      // ディレクトリを作成
      const dir = path.dirname(this.config.storageFile)
      await fs.mkdir(dir, { recursive: true })

      // ファイルが存在するかチェック
      try {
        await fs.access(this.config.storageFile)
      } catch (error) {
        // ファイルが存在しない場合は空の履歴で開始
        this.logger.info('Tweet history file not found, starting with empty history')
        this.isLoaded = true
        return
      }

      // ファイルを読み込み
      const fileContent = await fs.readFile(this.config.storageFile, 'utf8')
      const historyData = JSON.parse(fileContent)

      // バージョン互換性チェック
      if (historyData.version !== '1.0') {
        this.logger.warn('Tweet history file version mismatch, may need migration')
      }

      this.tweetHistory = historyData.tweets || []
      
      // ハッシュインデックスを再構築
      this.rebuildHashIndex()

      // 古いエントリを削除
      await this.cleanupOldEntries()

      this.isLoaded = true

      this.logger.info('Tweet history loaded successfully', {
        totalTweets: this.tweetHistory.length,
        uniqueHashes: this.hashIndex.size
      })

      // 自動保存を開始
      if (this.config.autoSave) {
        this.startAutoSave()
      }

    } catch (error) {
      this.logger.error('Failed to load tweet history', { 
        error: error.message,
        storageFile: this.config.storageFile 
      })
      
      // エラーの場合は空の履歴で開始
      this.tweetHistory = []
      this.hashIndex.clear()
      this.isLoaded = true
    }
  }

  /**
   * ハッシュインデックスを再構築
   */
  rebuildHashIndex() {
    this.hashIndex.clear()
    
    this.tweetHistory.forEach((tweet, index) => {
      if (tweet.hash) {
        this.hashIndex.set(tweet.hash, index)
      } else {
        // 古いエントリにハッシュがない場合は生成
        tweet.hash = this.generateTweetHash(tweet.text)
        this.hashIndex.set(tweet.hash, index)
      }
    })

    this.logger.debug('Hash index rebuilt', { 
      totalEntries: this.hashIndex.size 
    })
  }

  /**
   * ツイートを履歴に追加
   */
  async addTweet(tweetData) {
    try {
      if (!this.isLoaded) {
        await this.loadHistory()
      }

      // 必須フィールドチェック
      if (!tweetData.text) {
        throw new Error('Tweet text is required')
      }

      // ハッシュ生成
      const hash = this.generateTweetHash(tweetData.text)

      // 重複チェック
      if (this.hashIndex.has(hash)) {
        const existingIndex = this.hashIndex.get(hash)
        const existingTweet = this.tweetHistory[existingIndex]
        
        this.logger.warn('Duplicate tweet detected', {
          text: tweetData.text.substring(0, 50) + '...',
          existingDate: existingTweet.timestamp
        })
        
        return {
          success: false,
          duplicate: true,
          existingTweet
        }
      }

      // 新しいツイートエントリを作成
      const tweetEntry = {
        id: tweetData.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: tweetData.text,
        hash,
        timestamp: tweetData.timestamp || new Date().toISOString(),
        source: tweetData.source || 'ai-tweet-bot',
        metadata: {
          posted: tweetData.posted || false,
          platform: tweetData.platform || 'twitter',
          category: tweetData.category || 'general',
          tags: tweetData.tags || [],
          length: tweetData.text.length,
          ...tweetData.metadata
        }
      }

      // 履歴に追加
      this.tweetHistory.push(tweetEntry)
      this.hashIndex.set(hash, this.tweetHistory.length - 1)

      // サイズ制限チェック
      await this.enforceMaxEntries()

      this.isDirty = true

      this.logger.info('Tweet added to history', {
        id: tweetEntry.id,
        textLength: tweetEntry.text.length,
        category: tweetEntry.metadata.category
      })

      return {
        success: true,
        tweetEntry
      }

    } catch (error) {
      this.logger.error('Failed to add tweet to history', { 
        error: error.message 
      })
      throw error
    }
  }

  /**
   * 重複ツイートをチェック
   */
  checkDuplicate(text) {
    if (!this.isLoaded) {
      throw new Error('Tweet history not loaded. Call loadHistory() first.')
    }

    const hash = this.generateTweetHash(text)
    
    if (this.hashIndex.has(hash)) {
      const index = this.hashIndex.get(hash)
      return {
        isDuplicate: true,
        existingTweet: this.tweetHistory[index]
      }
    }

    return {
      isDuplicate: false
    }
  }

  /**
   * 履歴を保存
   */
  async saveHistory() {
    try {
      if (!this.isDirty && this.isLoaded) {
        this.logger.debug('Tweet history is up to date, skipping save')
        return
      }

      this.logger.info('Saving tweet history', {
        totalTweets: this.tweetHistory.length
      })

      const historyData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        config: {
          maxEntries: this.config.maxEntries,
          retentionDays: this.config.retentionDays
        },
        stats: {
          totalTweets: this.tweetHistory.length,
          uniqueHashes: this.hashIndex.size
        },
        tweets: this.tweetHistory
      }

      // ディレクトリを作成
      const dir = path.dirname(this.config.storageFile)
      await fs.mkdir(dir, { recursive: true })

      // JSON として保存
      const jsonData = JSON.stringify(historyData, null, this.config.enableCompression ? 0 : 2)
      await fs.writeFile(this.config.storageFile, jsonData, 'utf8')

      this.isDirty = false

      this.logger.info('Tweet history saved successfully', {
        fileSize: jsonData.length,
        storageFile: this.config.storageFile
      })

    } catch (error) {
      this.logger.error('Failed to save tweet history', { 
        error: error.message 
      })
      throw error
    }
  }

  /**
   * 最大エントリ数制限を適用
   */
  async enforceMaxEntries() {
    if (this.tweetHistory.length <= this.config.maxEntries) {
      return
    }

    const excessCount = this.tweetHistory.length - this.config.maxEntries
    
    this.logger.info('Enforcing max entries limit', {
      currentCount: this.tweetHistory.length,
      maxEntries: this.config.maxEntries,
      toRemove: excessCount
    })

    // 古いエントリから削除（FIFOベース）
    const removedTweets = this.tweetHistory.splice(0, excessCount)
    
    // ハッシュインデックスを再構築
    this.rebuildHashIndex()

    this.isDirty = true

    this.logger.info('Old tweets removed to enforce limit', {
      removedCount: removedTweets.length,
      remainingCount: this.tweetHistory.length
    })
  }

  /**
   * 古いエントリをクリーンアップ
   */
  async cleanupOldEntries() {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays)

    const initialCount = this.tweetHistory.length
    
    this.tweetHistory = this.tweetHistory.filter(tweet => {
      return new Date(tweet.timestamp) > cutoffDate
    })

    const removedCount = initialCount - this.tweetHistory.length

    if (removedCount > 0) {
      // ハッシュインデックスを再構築
      this.rebuildHashIndex()
      this.isDirty = true

      this.logger.info('Old tweets cleaned up', {
        removedCount,
        retentionDays: this.config.retentionDays,
        remainingCount: this.tweetHistory.length
      })
    }
  }

  /**
   * 統計情報を取得
   */
  getStats(timeRange = 86400000) { // デフォルト24時間
    if (!this.isLoaded) {
      throw new Error('Tweet history not loaded. Call loadHistory() first.')
    }

    const cutoffTime = new Date(Date.now() - timeRange)
    const recentTweets = this.tweetHistory.filter(
      tweet => new Date(tweet.timestamp) > cutoffTime
    )

    // カテゴリ別統計
    const categoryStats = {}
    recentTweets.forEach(tweet => {
      const category = tweet.metadata.category || 'unknown'
      categoryStats[category] = (categoryStats[category] || 0) + 1
    })

    // 投稿済み/未投稿統計
    const postedTweets = recentTweets.filter(tweet => tweet.metadata.posted)
    const unpostedTweets = recentTweets.filter(tweet => !tweet.metadata.posted)

    return {
      timeRange: timeRange / 1000, // 秒単位
      total: {
        all: this.tweetHistory.length,
        recent: recentTweets.length
      },
      posting: {
        posted: postedTweets.length,
        unposted: unpostedTweets.length,
        postingRate: recentTweets.length > 0 ? 
          (postedTweets.length / recentTweets.length * 100).toFixed(2) + '%' : '0%'
      },
      categories: categoryStats,
      duplicates: {
        totalHashes: this.hashIndex.size,
        uniqueRatio: this.tweetHistory.length > 0 ? 
          (this.hashIndex.size / this.tweetHistory.length * 100).toFixed(2) + '%' : '100%'
      },
      timestamps: {
        oldest: this.tweetHistory.length > 0 ? this.tweetHistory[0].timestamp : null,
        newest: this.tweetHistory.length > 0 ? 
          this.tweetHistory[this.tweetHistory.length - 1].timestamp : null
      }
    }
  }

  /**
   * ツイート履歴を検索
   */
  searchTweets(query = {}) {
    if (!this.isLoaded) {
      throw new Error('Tweet history not loaded. Call loadHistory() first.')
    }

    let results = [...this.tweetHistory]

    // テキスト検索
    if (query.text) {
      const searchText = query.text.toLowerCase()
      results = results.filter(tweet => 
        tweet.text.toLowerCase().includes(searchText)
      )
    }

    // カテゴリフィルタ
    if (query.category) {
      results = results.filter(tweet => 
        tweet.metadata.category === query.category
      )
    }

    // 投稿状態フィルタ
    if (query.posted !== undefined) {
      results = results.filter(tweet => 
        tweet.metadata.posted === query.posted
      )
    }

    // 日付範囲フィルタ
    if (query.startDate) {
      const startDate = new Date(query.startDate)
      results = results.filter(tweet => 
        new Date(tweet.timestamp) >= startDate
      )
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate)
      results = results.filter(tweet => 
        new Date(tweet.timestamp) <= endDate
      )
    }

    // ソート
    if (query.sortBy) {
      const sortField = query.sortBy
      const sortOrder = query.sortOrder || 'desc'
      
      results.sort((a, b) => {
        let valueA, valueB
        
        if (sortField === 'timestamp') {
          valueA = new Date(a.timestamp)
          valueB = new Date(b.timestamp)
        } else if (sortField === 'length') {
          valueA = a.text.length
          valueB = b.text.length
        } else {
          valueA = a[sortField] || ''
          valueB = b[sortField] || ''
        }

        if (sortOrder === 'asc') {
          return valueA > valueB ? 1 : -1
        } else {
          return valueA < valueB ? 1 : -1
        }
      })
    }

    // 制限
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit)
    }

    return {
      total: results.length,
      results
    }
  }

  /**
   * 自動保存を開始
   */
  startAutoSave() {
    if (this.saveIntervalId) {
      return
    }

    this.logger.info('Starting auto-save for tweet history', {
      interval: this.config.saveInterval
    })

    this.saveIntervalId = setInterval(async () => {
      try {
        if (this.isDirty) {
          await this.saveHistory()
        }
      } catch (error) {
        this.logger.error('Auto-save failed', { error: error.message })
      }
    }, this.config.saveInterval)
  }

  /**
   * 自動保存を停止
   */
  stopAutoSave() {
    if (this.saveIntervalId) {
      clearInterval(this.saveIntervalId)
      this.saveIntervalId = null
      
      this.logger.info('Auto-save stopped for tweet history')
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck() {
    try {
      const stats = this.getStats()
      
      return {
        status: 'healthy',
        loaded: this.isLoaded,
        stats: {
          totalTweets: stats.total.all,
          recentTweets: stats.total.recent,
          duplicateRatio: stats.duplicates.uniqueRatio
        },
        config: {
          maxEntries: this.config.maxEntries,
          retentionDays: this.config.retentionDays,
          autoSave: this.config.autoSave
        },
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        loaded: this.isLoaded,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    try {
      this.stopAutoSave()
      
      if (this.isDirty) {
        await this.saveHistory()
      }
      
      this.tweetHistory = []
      this.hashIndex.clear()
      this.isLoaded = false
      
      this.logger.info('Tweet history cleaned up')
    } catch (error) {
      this.logger.error('Cleanup failed', { error: error.message })
      throw error
    }
  }
}

module.exports = TweetHistory
