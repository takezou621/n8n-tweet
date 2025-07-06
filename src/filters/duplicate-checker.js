/**
 * Duplicate Checker
 * 重複記事の検出と除去
 * 
 * Features:
 * - URL重複検出
 * - タイトル類似度検出
 * - コンテンツハッシュ比較
 * - 時系列管理
 */

const crypto = require('crypto')
const winston = require('winston')

class DuplicateChecker {
  /**
   * DuplicateChecker constructor
   * @param {Object} config - 重複チェック設定
   */
  constructor(config = {}) {
    this.config = {
      maxEntries: 50000,
      retentionHours: 24,
      similarityThreshold: 0.8,
      enableContentHashing: true,
      enableTitleSimilarity: true,
      enableUrlNormalization: true,
      ...config
    }

    // Logger setup
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          silent: process.env.NODE_ENV === 'test'
        })
      ]
    })

    // In-memory cache for seen items
    this.seenItems = new Map()
    this.urlCache = new Set()
    this.contentHashes = new Set()
    
    // Cleanup interval
    this.setupCleanupInterval()
  }

  /**
   * 重複を除去したアイテム配列を返す
   * @param {Array} items - チェック対象アイテム配列
   * @returns {Promise<Array>} 重複除去後のアイテム配列
   */
  async removeDuplicates(items) {
    try {
      this.logger.info('Starting duplicate removal', { itemCount: items.length })
      
      const uniqueItems = []
      const duplicateStats = {
        total: items.length,
        unique: 0,
        duplicateUrls: 0,
        duplicateTitles: 0,
        duplicateContent: 0
      }

      for (const item of items) {
        try {
          const isDuplicate = await this.isDuplicate(item)
          
          if (!isDuplicate) {
            // Add to cache
            await this.addToCache(item)
            uniqueItems.push(item)
            duplicateStats.unique++
          } else {
            // Log duplicate type for statistics
            if (this.isUrlDuplicate(item)) {
              duplicateStats.duplicateUrls++
            } else if (await this.isTitleSimilar(item)) {
              duplicateStats.duplicateTitles++
            } else if (this.isContentDuplicate(item)) {
              duplicateStats.duplicateContent++
            }
          }
        } catch (error) {
          this.logger.warn('Failed to check duplicate for item', {
            itemTitle: item.title?.substring(0, 50) || 'No title',
            error: error.message
          })
          // Include item if check fails (fail-safe)
          uniqueItems.push(item)
          duplicateStats.unique++
        }
      }

      this.logger.info('Duplicate removal completed', duplicateStats)
      
      return uniqueItems
    } catch (error) {
      this.logger.error('Duplicate removal failed', { error: error.message })
      throw error
    }
  }

  /**
   * アイテムが重複かどうかを判定
   * @param {Object} item - チェック対象アイテム
   * @returns {Promise<boolean>} 重複かどうか
   */
  async isDuplicate(item) {
    // 1. URL duplicate check
    if (this.isUrlDuplicate(item)) {
      return true
    }
    
    // 2. Title similarity check
    if (this.config.enableTitleSimilarity) {
      if (await this.isTitleSimilar(item)) {
        return true
      }
    }
    
    // 3. Content hash check
    if (this.config.enableContentHashing) {
      if (this.isContentDuplicate(item)) {
        return true
      }
    }
    
    return false
  }
  /**
   * URL重複をチェック
   * @param {Object} item - チェック対象アイテム
   * @returns {boolean} URL重複かどうか
   */
  isUrlDuplicate(item) {
    if (!item.link) return false
    
    const normalizedUrl = this.normalizeUrl(item.link)
    return this.urlCache.has(normalizedUrl)
  }

  /**
   * タイトル類似度をチェック
   * @param {Object} item - チェック対象アイテム
   * @returns {Promise<boolean>} タイトル類似かどうか
   */
  async isTitleSimilar(item) {
    if (!item.title) return false
    
    const normalizedTitle = this.normalizeTitle(item.title)
    
    // Check against cached titles
    for (const [cachedId, cachedItem] of this.seenItems) {
      if (cachedItem.title) {
        const cachedNormalizedTitle = this.normalizeTitle(cachedItem.title)
        const similarity = this.calculateStringSimilarity(normalizedTitle, cachedNormalizedTitle)
        
        if (similarity >= this.config.similarityThreshold) {
          return true
        }
      }
    }
    
    return false
  }

  /**
   * コンテンツハッシュ重複をチェック
   * @param {Object} item - チェック対象アイテム
   * @returns {boolean} コンテンツ重複かどうか
   */
  isContentDuplicate(item) {
    const contentHash = this.generateContentHash(item)
    return this.contentHashes.has(contentHash)
  }

  /**
   * アイテムをキャッシュに追加
   * @param {Object} item - 追加するアイテム
   * @returns {Promise<void>}
   */
  async addToCache(item) {
    const itemId = this.generateItemId(item)
    const cacheEntry = {
      ...item,
      addedAt: new Date().toISOString(),
      id: itemId
    }
    
    // Add to seen items
    this.seenItems.set(itemId, cacheEntry)
    
    // Add URL to cache
    if (item.link) {
      const normalizedUrl = this.normalizeUrl(item.link)
      this.urlCache.add(normalizedUrl)
    }
    
    // Add content hash
    if (this.config.enableContentHashing) {
      const contentHash = this.generateContentHash(item)
      this.contentHashes.add(contentHash)
    }
    
    // Cleanup if cache is too large
    if (this.seenItems.size > this.config.maxEntries) {
      this.cleanupOldEntries()
    }
  }

  /**
   * URLを正規化
   * @param {string} url - 正規化対象URL
   * @returns {string} 正規化されたURL
   */
  normalizeUrl(url) {
    if (!url) return ''
    
    try {
      const urlObj = new URL(url)
      
      // Remove common tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source']
      trackingParams.forEach(param => urlObj.searchParams.delete(param))
      
      // Remove fragment
      urlObj.hash = ''
      
      // Normalize case
      urlObj.hostname = urlObj.hostname.toLowerCase()
      
      return urlObj.toString()
    } catch (error) {
      // If URL parsing fails, return original
      return url.toLowerCase()
    }
  }

  /**
   * タイトルを正規化
   * @param {string} title - 正規化対象タイトル
   * @returns {string} 正規化されたタイトル
   */
  normalizeTitle(title) {
    if (!title) return ''
    
    return title
      .toLowerCase()
      .trim()
      // Remove common prefixes/suffixes
      .replace(/^(new:|update:|breaking:|latest:)/i, '')
      .replace(/(\s*-\s*[^-]+)$/, '') // Remove site name suffix
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters for comparison
      .replace(/[^\w\s]/g, '')
  }

  /**
   * 文字列類似度を計算（Levenshtein距離ベース）
   * @param {string} str1 - 文字列1
   * @param {string} str2 - 文字列2
   * @returns {number} 類似度 (0-1)
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0
    if (str1 === str2) return 1
    
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    if (longer.length === 0) return 1
    
    const editDistance = this.calculateLevenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  /**
   * Levenshtein距離を計算
   * @param {string} str1 - 文字列1
   * @param {string} str2 - 文字列2
   * @returns {number} Levenshtein距離
   */
  calculateLevenshteinDistance(str1, str2) {
    const matrix = []
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    
    return matrix[str2.length][str1.length]
  }
  /**
   * コンテンツハッシュを生成
   * @param {Object} item - 対象アイテム
   * @returns {string} コンテンツハッシュ
   */
  generateContentHash(item) {
    const content = [
      item.title || '',
      item.description || '',
      item.link || ''
    ].join('|')
    
    return crypto.createHash('md5').update(content).digest('hex')
  }

  /**
   * アイテムIDを生成
   * @param {Object} item - 対象アイテム
   * @returns {string} アイテムID
   */
  generateItemId(item) {
    const identifier = item.guid || item.link || item.title || Date.now().toString()
    return crypto.createHash('md5').update(identifier).digest('hex')
  }

  /**
   * 古いエントリをクリーンアップ
   */
  cleanupOldEntries() {
    const cutoffTime = new Date(Date.now() - this.config.retentionHours * 60 * 60 * 1000)
    let removedCount = 0
    
    for (const [itemId, item] of this.seenItems) {
      if (new Date(item.addedAt) < cutoffTime) {
        this.seenItems.delete(itemId)
        
        // Remove from URL cache if applicable
        if (item.link) {
          const normalizedUrl = this.normalizeUrl(item.link)
          this.urlCache.delete(normalizedUrl)
        }
        
        // Remove from content hash cache
        if (this.config.enableContentHashing) {
          const contentHash = this.generateContentHash(item)
          this.contentHashes.delete(contentHash)
        }
        
        removedCount++
      }
    }
    
    if (removedCount > 0) {
      this.logger.info('Cleaned up old cache entries', { 
        removedCount,
        remainingCount: this.seenItems.size 
      })
    }
  }

  /**
   * 定期クリーンアップの設定
   */
  setupCleanupInterval() {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries()
    }, 60 * 60 * 1000)
  }

  /**
   * キャッシュ統計を取得
   * @returns {Object} キャッシュ統計
   */
  getCacheStats() {
    return {
      seenItems: this.seenItems.size,
      urlCache: this.urlCache.size,
      contentHashes: this.contentHashes.size,
      maxEntries: this.config.maxEntries,
      retentionHours: this.config.retentionHours
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache() {
    this.seenItems.clear()
    this.urlCache.clear()
    this.contentHashes.clear()
    
    this.logger.info('Cache cleared successfully')
  }

  /**
   * 設定を更新
   * @param {Object} newConfig - 新しい設定
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('Duplicate checker configuration updated', this.config)
  }

  /**
   * リソースをクリーンアップ
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    
    this.clearCache()
    this.logger.info('Duplicate checker destroyed')
  }

  /**
   * 重複チェックの詳細結果を取得
   * @param {Object} item - チェック対象アイテム
   * @returns {Promise<Object>} 詳細結果
   */
  async getDuplicateDetails(item) {
    const details = {
      isDuplicate: false,
      duplicateTypes: [],
      similarity: {
        url: false,
        title: 0,
        content: false
      }
    }
    
    // URL check
    if (this.isUrlDuplicate(item)) {
      details.isDuplicate = true
      details.duplicateTypes.push('url')
      details.similarity.url = true
    }
    
    // Title similarity check
    if (this.config.enableTitleSimilarity && item.title) {
      let maxSimilarity = 0
      const normalizedTitle = this.normalizeTitle(item.title)
      
      for (const [, cachedItem] of this.seenItems) {
        if (cachedItem.title) {
          const cachedNormalizedTitle = this.normalizeTitle(cachedItem.title)
          const similarity = this.calculateStringSimilarity(normalizedTitle, cachedNormalizedTitle)
          maxSimilarity = Math.max(maxSimilarity, similarity)
        }
      }
      
      details.similarity.title = maxSimilarity
      if (maxSimilarity >= this.config.similarityThreshold) {
        details.isDuplicate = true
        details.duplicateTypes.push('title')
      }
    }
    
    // Content hash check
    if (this.config.enableContentHashing) {
      if (this.isContentDuplicate(item)) {
        details.isDuplicate = true
        details.duplicateTypes.push('content')
        details.similarity.content = true
      }
    }
    
    return details
  }
}

module.exports = DuplicateChecker
