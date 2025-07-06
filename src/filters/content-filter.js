/**
 * Content Filter
 * AI関連コンテンツのフィルタリングと品質スコアリング
 * 
 * Features:
 * - キーワードベースフィルタリング
 * - コンテンツ品質スコアリング
 * - カテゴリ別重み付け
 * - 複数言語対応
 */

const winston = require('winston')

class ContentFilter {
  /**
   * ContentFilter constructor
   * @param {Object} config - フィルタリング設定
   */
  constructor(config = {}) {
    this.config = {
      scoreThreshold: 0.7,
      maxDuplicates: 0,
      minQualityScore: 0.5,
      enableLanguageDetection: true,
      preferredLanguages: ['en', 'ja'],
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

    // AI関連キーワード（日本語・英語）
    this.aiKeywords = {
      primary: [
        // 英語
        'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
        'natural language processing', 'computer vision', 'reinforcement learning',
        'generative ai', 'large language model', 'transformer', 'gpt', 'bert',
        'ai model', 'ai research', 'ai development', 'ai application',
        // 日本語
        '人工知能', '機械学習', 'ディープラーニング', '深層学習', 'ニューラルネットワーク',
        '自然言語処理', 'コンピュータビジョン', '強化学習', '生成AI', '大規模言語モデル'
      ],
      secondary: [
        // 技術用語
        'algorithm', 'dataset', 'training', 'inference', 'optimization',
        'classification', 'regression', 'clustering', 'feature', 'embedding',
        'pytorch', 'tensorflow', 'hugging face', 'openai', 'anthropic',
        // 応用分野
        'autonomous', 'robotics', 'chatbot', 'recommendation', 'prediction',
        'automation', 'analytics', 'intelligence', 'cognitive', 'smart'
      ],
      negative: [
        // ノイズワード
        'spam', 'advertisement', 'promotion', 'buy now', 'click here',
        'subscription', 'newsletter', 'unsubscribe', 'privacy policy'
      ]
    }
  }

  /**
   * 複数のコンテンツアイテムをフィルタリング
   * @param {Array} items - フィルタリング対象アイテム配列
   * @param {Object} categories - カテゴリ設定
   * @returns {Promise<Array>} フィルタリング済みアイテム配列
   */  async filterRelevantContent(items, categories = {}) {
    try {
      this.logger.info('Starting content filtering', { 
        itemCount: items.length,
        categoriesCount: Object.keys(categories).length 
      })

      const filteredItems = []
      const filterStats = {
        total: items.length,
        relevant: 0,
        filtered: 0,
        qualityFiltered: 0
      }

      for (const item of items) {
        try {
          // 1. Calculate relevance score
          const relevanceScore = this.calculateRelevanceScore(item, categories)
          
          // 2. Calculate quality score  
          const qualityScore = this.calculateQualityScore(item)
          
          // 3. Apply filters
          if (relevanceScore >= this.config.scoreThreshold) {
            if (qualityScore >= this.config.minQualityScore) {
              // Add scoring metadata
              const enrichedItem = {
                ...item,
                scores: {
                  relevance: relevanceScore,
                  quality: qualityScore,
                  combined: (relevanceScore + qualityScore) / 2
                },
                filteredAt: new Date().toISOString(),
                filterVersion: '1.0.0'
              }
              
              filteredItems.push(enrichedItem)
              filterStats.relevant++
            } else {
              filterStats.qualityFiltered++
            }
          } else {
            filterStats.filtered++
          }
        } catch (error) {
          this.logger.warn('Failed to filter individual item', {
            itemTitle: item.title?.substring(0, 50) || 'No title',
            error: error.message
          })
        }
      }

      // Sort by combined score (highest first)
      filteredItems.sort((a, b) => b.scores.combined - a.scores.combined)

      this.logger.info('Content filtering completed', filterStats)
      
      return filteredItems
    } catch (error) {
      this.logger.error('Content filtering failed', { error: error.message })
      throw error
    }
  }

  /**
   * コンテンツの関連性スコアを計算
   * @param {Object} item - 評価対象アイテム
   * @param {Object} categories - カテゴリ設定
   * @returns {number} 関連性スコア (0-1)
   */
  calculateRelevanceScore(item, categories = {}) {
    const content = this.extractTextContent(item)
    let score = 0
    
    // Primary keywords (high weight)
    const primaryMatches = this.countKeywordMatches(content, this.aiKeywords.primary)
    score += Math.min(primaryMatches * 0.3, 0.6)
    
    // Secondary keywords (medium weight)  
    const secondaryMatches = this.countKeywordMatches(content, this.aiKeywords.secondary)
    score += Math.min(secondaryMatches * 0.1, 0.3)
    
    // Category-specific keywords
    if (item.category && categories[item.category]) {
      const categoryKeywords = categories[item.category].keywords || []
      const categoryMatches = this.countKeywordMatches(content, categoryKeywords)
      const categoryWeight = categories[item.category].weight || 0.5
      score += Math.min(categoryMatches * 0.1 * categoryWeight, 0.2)
    }
    
    // Negative keywords (penalty)
    const negativeMatches = this.countKeywordMatches(content, this.aiKeywords.negative)
    score -= negativeMatches * 0.2
    
    // Ensure score is within bounds
    return Math.max(0, Math.min(1, score))
  }

  /**
   * コンテンツの品質スコアを計算
   * @param {Object} item - 評価対象アイテム
   * @returns {number} 品質スコア (0-1)
   */
  calculateQualityScore(item) {
    let score = 0.5 // Base score
    
    // Title quality
    if (item.title) {
      const titleLength = item.title.length
      if (titleLength >= 10 && titleLength <= 200) {
        score += 0.2
      }
      
      // Title should not be all caps
      if (item.title !== item.title.toUpperCase()) {
        score += 0.1
      }
    }
    
    // Description quality
    if (item.description) {
      const descLength = item.description.length
      if (descLength >= 50 && descLength <= 2000) {
        score += 0.2
      }
    }
    
    // URL quality
    if (item.link) {
      try {
        const url = new URL(item.link)
        // Prefer academic and official sources
        if (this.isHighQualityDomain(url.hostname)) {
          score += 0.1
        }
      } catch (error) {
        score -= 0.1 // Invalid URL penalty
      }
    }
    
    // Recency bonus
    if (item.pubDate) {
      const daysOld = (Date.now() - new Date(item.pubDate)) / (1000 * 60 * 60 * 24)
      if (daysOld <= 7) {
        score += 0.1
      } else if (daysOld <= 30) {
        score += 0.05
      }
    }
    
    return Math.max(0, Math.min(1, score))
  }
  /**
   * アイテムからテキストコンテンツを抽出
   * @param {Object} item - 対象アイテム
   * @returns {string} 結合されたテキストコンテンツ
   */
  extractTextContent(item) {
    const parts = []
    
    if (item.title) parts.push(item.title)
    if (item.description) parts.push(item.description)
    if (item.categories && Array.isArray(item.categories)) {
      parts.push(item.categories.join(' '))
    }
    
    return parts.join(' ').toLowerCase()
  }

  /**
   * キーワードマッチ数をカウント
   * @param {string} content - 検索対象テキスト
   * @param {Array} keywords - キーワード配列
   * @returns {number} マッチ数
   */
  countKeywordMatches(content, keywords) {
    if (!content || !Array.isArray(keywords)) return 0
    
    let matchCount = 0
    const lowerContent = content.toLowerCase()
    
    keywords.forEach(keyword => {
      if (typeof keyword === 'string') {
        const keywordLower = keyword.toLowerCase()
        if (lowerContent.includes(keywordLower)) {
          matchCount++
        }
      }
    })
    
    return matchCount
  }

  /**
   * 高品質ドメインかどうかを判定
   * @param {string} hostname - ドメイン名
   * @returns {boolean} 高品質ドメインかどうか
   */
  isHighQualityDomain(hostname) {
    const qualityDomains = [
      // Academic
      'arxiv.org', 'acm.org', 'ieee.org', 'nature.com', 'science.org',
      // Official AI organizations
      'openai.com', 'deepmind.com', 'anthropic.com', 'ai.google',
      // Tech companies
      'blog.google', 'ai.facebook.com', 'microsoft.com', 'apple.com',
      // Research institutions
      'mit.edu', 'stanford.edu', 'berkeley.edu', 'cmu.edu',
      // News sources
      'techcrunch.com', 'technologyreview.com', 'wired.com', 'arstechnica.com'
    ]
    
    return qualityDomains.some(domain => hostname.includes(domain))
  }

  /**
   * 言語を検出（簡易版）
   * @param {string} text - 対象テキスト
   * @returns {string} 言語コード
   */
  detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'unknown'
    
    // 日本語文字の正規表現
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/
    
    if (japaneseRegex.test(text)) {
      return 'ja'
    }
    
    // デフォルトは英語と仮定
    return 'en'
  }

  /**
   * フィルタリング統計を取得
   * @param {Array} originalItems - 元のアイテム配列
   * @param {Array} filteredItems - フィルタリング後のアイテム配列
   * @returns {Object} 統計情報
   */
  getFilteringStats(originalItems, filteredItems) {
    const stats = {
      total: originalItems.length,
      filtered: filteredItems.length,
      filterRate: originalItems.length > 0 ? (filteredItems.length / originalItems.length) : 0,
      averageScore: 0,
      scoreDistribution: {
        high: 0,    // 0.8+
        medium: 0,  // 0.5-0.8
        low: 0      // <0.5
      }
    }
    
    if (filteredItems.length > 0) {
      // Calculate average score
      const totalScore = filteredItems.reduce((sum, item) => {
        return sum + (item.scores?.combined || 0)
      }, 0)
      stats.averageScore = totalScore / filteredItems.length
      
      // Score distribution
      filteredItems.forEach(item => {
        const score = item.scores?.combined || 0
        if (score >= 0.8) {
          stats.scoreDistribution.high++
        } else if (score >= 0.5) {
          stats.scoreDistribution.medium++
        } else {
          stats.scoreDistribution.low++
        }
      })
    }
    
    return stats
  }

  /**
   * カスタムキーワードを追加
   * @param {Array} keywords - 追加するキーワード配列
   * @param {string} type - キーワードタイプ (primary/secondary/negative)
   */
  addCustomKeywords(keywords, type = 'secondary') {
    if (!Array.isArray(keywords) || !this.aiKeywords[type]) {
      throw new Error(`Invalid keywords or type: ${type}`)
    }
    
    this.aiKeywords[type].push(...keywords)
    this.logger.info('Custom keywords added', { 
      type, 
      count: keywords.length,
      totalCount: this.aiKeywords[type].length 
    })
  }

  /**
   * フィルター設定を更新
   * @param {Object} newConfig - 新しい設定オブジェクト
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('Filter configuration updated', this.config)
  }
}

module.exports = ContentFilter
