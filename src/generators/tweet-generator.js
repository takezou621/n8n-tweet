/**
 * Tweet Generator
 * フィルタリングされたコンテンツからTwitter投稿用ツイートを生成
 *
 * Features:
 * - 280文字制限対応
 * - カテゴリ別ハッシュタグ自動追加
 * - エンゲージメント最適化
 * - 複数テンプレート対応
 */

const winston = require('winston')

class TweetGenerator {
  /**
   * TweetGenerator constructor
   * @param {Object} config - ツイート生成設定
   */
  constructor (config = {}) {
    this.config = {
      maxLength: 280,
      includeUrl: true,
      hashtagLimit: 3,
      emojiEnabled: true,
      reserveUrlLength: 23, // Twitter's t.co length
      includeMetrics: false,
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

    // Tweet templates by category
    this.templates = {
      research: [
        '🔬 New research: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '📊 Study alert: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '🧪 Research breakthrough: {title}\n\n{summary}\n\n{hashtags}\n{url}'
      ],
      industry: [
        '🚀 Industry update: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '💡 New from {source}: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '📢 Announcement: {title}\n\n{summary}\n\n{hashtags}\n{url}'
      ],
      news: [
        '📰 AI News: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '⚡ Breaking: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '🔥 Trending: {title}\n\n{summary}\n\n{hashtags}\n{url}'
      ],
      community: [
        '💬 Community: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '🌟 Featured: {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '👥 Discussion: {title}\n\n{summary}\n\n{hashtags}\n{url}'
      ],
      default: [
        '🤖 {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '💻 {title}\n\n{summary}\n\n{hashtags}\n{url}',
        '🔹 {title}\n\n{summary}\n\n{hashtags}\n{url}'
      ]
    }

    // Emojis by category
    this.categoryEmojis = {
      research: ['🔬', '📊', '🧪', '📝', '🎯'],
      industry: ['🚀', '💡', '📢', '🏢', '💼'],
      news: ['📰', '⚡', '🔥', '📺', '🌟'],
      community: ['💬', '🌟', '👥', '🗣️', '💭'],
      default: ['🤖', '💻', '🔹', '⭐', '🎯']
    }
  }

  /**
   * 複数のアイテムからツイートを生成
   * @param {Array} items - ツイート生成対象アイテム配列
   * @param {Object} categories - カテゴリ設定
   * @returns {Promise<Array>} 生成されたツイート配列
   */
  async generateTweets (items, categories = {}) {
    try {
      this.logger.info('Starting tweet generation', { itemCount: items.length })

      const tweets = []
      const generationStats = {
        total: items.length,
        generated: 0,
        failed: 0,
        averageLength: 0
      }

      for (const item of items) {
        try {
          const tweet = await this.generateSingleTweet(item, categories)
          if (tweet) {
            tweets.push(tweet)
            generationStats.generated++
          } else {
            generationStats.failed++
          }
        } catch (error) {
          this.logger.warn('Failed to generate tweet for item', {
            itemTitle: item.title?.substring(0, 50) || 'No title',
            error: error.message
          })
          generationStats.failed++
        }
      }

      // Calculate average length
      if (tweets.length > 0) {
        const totalLength = tweets.reduce((sum, tweet) => sum + tweet.content.length, 0)
        generationStats.averageLength = Math.round(totalLength / tweets.length)
      }

      // Sort by priority and engagement potential
      tweets.sort((a, b) => {
        return (b.metadata.engagementScore || 0) - (a.metadata.engagementScore || 0)
      })

      this.logger.info('Tweet generation completed', generationStats)

      return tweets
    } catch (error) {
      this.logger.error('Tweet generation failed', { error: error.message })
      throw error
    }
  }

  /**
   * 単一アイテムからツイートを生成
   * @param {Object} item - ツイート生成対象アイテム
   * @param {Object} categories - カテゴリ設定
   * @returns {Promise<Object>} 生成されたツイートオブジェクト
   */
  async generateSingleTweet (item, categories = {}) {
    try {
      // 1. Generate summary
      const summary = this.generateSummary(item)

      // 2. Select appropriate template
      const template = this.selectTemplate(item.category)

      // 3. Generate hashtags
      const hashtags = this.generateHashtags(item, categories)

      // 4. Build tweet content
      const tweetContent = this.buildTweetContent({
        item,
        summary,
        template,
        hashtags
      })

      // 5. Validate and optimize length
      const optimizedContent = this.optimizeTweetLength(tweetContent)

      // 6. Calculate engagement score
      const engagementScore = this.calculateEngagementScore(item, optimizedContent)

      const tweet = {
        content: optimizedContent,
        originalItem: {
          title: item.title,
          url: item.link,
          source: item.feedName,
          category: item.category,
          pubDate: item.pubDate
        },
        metadata: {
          length: optimizedContent.length,
          engagementScore,
          hashtags,
          template,
          generatedAt: new Date().toISOString(),
          version: '1.0.0'
        },
        stats: {
          relevanceScore: item.scores?.relevance || 0,
          qualityScore: item.scores?.quality || 0,
          combinedScore: item.scores?.combined || 0
        }
      }

      return tweet
    } catch (error) {
      this.logger.error('Failed to generate single tweet', {
        itemTitle: item.title?.substring(0, 50) || 'No title',
        error: error.message
      })
      return null
    }
  }

  /**
   * アイテムから要約を生成
   * @param {Object} item - 対象アイテム
   * @returns {string} 生成された要約
   */
  generateSummary (item) {
    let summary = ''

    if (item.description) {
      // Clean description
      const description = item.description
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()

      // Extract first sentence or limit to reasonable length
      const sentences = description.split(/[.!?]+/)
      if (sentences.length > 0 && sentences[0].length > 10) {
        summary = sentences[0].trim()
      } else {
        summary = description
      }

      // Limit summary length (reserve space for other elements)
      const maxSummaryLength = 120
      if (summary.length > maxSummaryLength) {
        summary = summary.substring(0, maxSummaryLength - 3) + '...'
      }
    }

    return summary
  }

  /**
   * カテゴリに応じたテンプレートを選択
   * @param {string} category - カテゴリ名
   * @returns {string} 選択されたテンプレート
   */
  selectTemplate (category) {
    const templates = this.templates[category] || this.templates.default
    const randomIndex = Math.floor(Math.random() * templates.length)
    return templates[randomIndex]
  }

  /**
   * ハッシュタグを生成
   * @param {Object} item - 対象アイテム
   * @param {Object} categories - カテゴリ設定
   * @returns {Array} ハッシュタグ配列
   */
  generateHashtags (item, categories = {}) {
    const hashtags = []

    // Category-specific hashtag
    if (item.category && categories[item.category]) {
      const categoryPrefix = categories[item.category].hashtagPrefix
      if (categoryPrefix) {
        hashtags.push(categoryPrefix)
      }
    }

    // Content-based hashtags
    const contentKeywords = this.extractKeywords(item)
    contentKeywords.forEach(keyword => {
      if (hashtags.length < this.config.hashtagLimit) {
        const hashtag = this.keywordToHashtag(keyword)
        if (hashtag && !hashtags.includes(hashtag)) {
          hashtags.push(hashtag)
        }
      }
    })

    // Default hashtags if none generated
    if (hashtags.length === 0) {
      hashtags.push('#AI', '#Technology')
    }

    return hashtags.slice(0, this.config.hashtagLimit)
  }

  /**
   * アイテムからキーワードを抽出
   * @param {Object} item - 対象アイテム
   * @returns {Array} キーワード配列
   */
  extractKeywords (item) {
    const text = `${item.title || ''} ${item.description || ''}`.toLowerCase()
    const keywords = []

    // Common AI/ML keywords
    const aiKeywords = [
      'machine learning', 'deep learning', 'neural network', 'artificial intelligence',
      'natural language processing', 'computer vision', 'reinforcement learning',
      'transformer', 'gpt', 'bert', 'llm', 'generative ai'
    ]

    aiKeywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        keywords.push(keyword)
      }
    })

    // Extract technology names
    const techKeywords = [
      'pytorch', 'tensorflow', 'openai', 'anthropic', 'google', 'microsoft',
      'nvidia', 'hugging face', 'github', 'arxiv'
    ]

    techKeywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        keywords.push(keyword)
      }
    })

    return keywords.slice(0, 3) // Limit to 3 keywords
  }

  /**
   * キーワードをハッシュタグに変換
   * @param {string} keyword - キーワード
   * @returns {string} ハッシュタグ
   */
  keywordToHashtag (keyword) {
    if (!keyword) return null

    // Convert to hashtag format
    const hashtag = '#' + keyword
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '') // Remove spaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')

    // Validate hashtag
    if (hashtag.length > 1 && hashtag.length <= 25) {
      return hashtag
    }

    return null
  }

  /**
   * ツイートコンテンツを構築
   * @param {Object} params - 構築パラメータ
   * @returns {string} 構築されたツイートコンテンツ
   */
  buildTweetContent ({ item, summary, template, hashtags }) {
    const source = item.feedName || 'AI News'
    const hashtagString = hashtags.join(' ')

    // Replace template placeholders
    let content = template
      .replace('{title}', this.truncateTitle(item.title || ''))
      .replace('{summary}', summary)
      .replace('{source}', source)
      .replace('{hashtags}', hashtagString)
      .replace('{url}', this.config.includeUrl ? item.link || '' : '')

    // Clean up any double spaces or line breaks
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()

    return content
  }

  /**
   * ツイート長を最適化
   * @param {string} content - 元のコンテンツ
   * @returns {string} 最適化されたコンテンツ
   */
  optimizeTweetLength (content) {
    if (content.length <= this.config.maxLength) {
      return content
    }

    // Calculate available space (reserve space for URL)
    const urlSpace = this.config.includeUrl ? this.config.reserveUrlLength + 1 : 0
    const availableLength = this.config.maxLength - urlSpace

    // Split content into parts
    const parts = content.split('\n')
    let optimized = ''

    for (const part of parts) {
      if (part.includes('http')) {
        // Keep URLs as-is
        optimized += part + '\n'
      } else {
        // Truncate other parts if needed
        if ((optimized + part).length > availableLength) {
          const remainingSpace = availableLength - optimized.length - 3 // Reserve for "..."
          if (remainingSpace > 10) {
            optimized += part.substring(0, remainingSpace) + '...\n'
          }
          break
        } else {
          optimized += part + '\n'
        }
      }
    }

    return optimized.trim()
  }

  /**
   * タイトルを適切な長さに切り詰め
   * @param {string} title - 元のタイトル
   * @returns {string} 切り詰められたタイトル
   */
  truncateTitle (title) {
    const maxTitleLength = 100

    if (title.length <= maxTitleLength) {
      return title
    }

    // Try to truncate at word boundary
    const truncated = title.substring(0, maxTitleLength)
    const lastSpace = truncated.lastIndexOf(' ')

    if (lastSpace > maxTitleLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...'
    }

    return truncated + '...'
  }

  /**
   * エンゲージメントスコアを計算
   * @param {Object} item - 対象アイテム
   * @param {string} content - ツイートコンテンツ
   * @returns {number} エンゲージメントスコア (0-1)
   */
  calculateEngagementScore (item, content) {
    let score = 0.5 // Base score

    // Content quality factors
    if (content.length >= 100 && content.length <= 250) {
      score += 0.1 // Optimal length
    }

    // Emoji usage
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu) || []).length
    if (emojiCount >= 1 && emojiCount <= 3) {
      score += 0.1
    }

    // Hashtag usage
    const hashtagCount = (content.match(/#\w+/g) || []).length
    if (hashtagCount >= 1 && hashtagCount <= 3) {
      score += 0.1
    }

    // Source credibility
    if (item.feedName) {
      const credibleSources = ['arxiv', 'openai', 'google', 'mit', 'stanford']
      const isCredible = credibleSources.some(source =>
        item.feedName.toLowerCase().includes(source)
      )
      if (isCredible) {
        score += 0.1
      }
    }

    // Recency bonus
    if (item.pubDate) {
      const hoursOld = (Date.now() - new Date(item.pubDate)) / (1000 * 60 * 60)
      if (hoursOld <= 24) {
        score += 0.1
      } else if (hoursOld <= 72) {
        score += 0.05
      }
    }

    // Content relevance
    if (item.scores && item.scores.relevance) {
      score += item.scores.relevance * 0.2
    }

    return Math.max(0, Math.min(1, score))
  }

  /**
   * ツイート統計を取得
   * @param {Array} tweets - ツイート配列
   * @returns {Object} 統計情報
   */
  getTweetStats (tweets) {
    if (!tweets || tweets.length === 0) {
      return {
        count: 0,
        averageLength: 0,
        averageEngagement: 0,
        categoryDistribution: {},
        hashtagUsage: {}
      }
    }

    const stats = {
      count: tweets.length,
      averageLength: 0,
      averageEngagement: 0,
      categoryDistribution: {},
      hashtagUsage: {}
    }

    let totalLength = 0
    let totalEngagement = 0

    tweets.forEach(tweet => {
      // Length stats
      totalLength += tweet.metadata.length || 0

      // Engagement stats
      totalEngagement += tweet.metadata.engagementScore || 0

      // Category distribution
      const category = tweet.originalItem.category || 'unknown'
      stats.categoryDistribution[category] = (stats.categoryDistribution[category] || 0) + 1

      // Hashtag usage
      if (tweet.metadata.hashtags) {
        tweet.metadata.hashtags.forEach(hashtag => {
          stats.hashtagUsage[hashtag] = (stats.hashtagUsage[hashtag] || 0) + 1
        })
      }
    })

    stats.averageLength = Math.round(totalLength / tweets.length)
    stats.averageEngagement = Math.round((totalEngagement / tweets.length) * 100) / 100

    return stats
  }

  /**
   * カスタムテンプレートを追加
   * @param {string} category - カテゴリ名
   * @param {Array} templates - テンプレート配列
   */
  addCustomTemplates (category, templates) {
    if (!Array.isArray(templates)) {
      throw new Error('Templates must be an array')
    }

    if (!this.templates[category]) {
      this.templates[category] = []
    }

    this.templates[category].push(...templates)
    this.logger.info('Custom templates added', {
      category,
      count: templates.length,
      totalCount: this.templates[category].length
    })
  }

  /**
   * 設定を更新
   * @param {Object} newConfig - 新しい設定
   */
  updateConfig (newConfig) {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('Tweet generator configuration updated', this.config)
  }

  /**
   * 特定の時間帯に最適化されたツイートを選択
   * @param {Array} tweets - ツイート配列
   * @param {number} count - 選択する数
   * @returns {Array} 選択されたツイート配列
   */
  selectOptimalTweets (tweets, count = 5) {
    // Sort by engagement score and recency
    const sorted = tweets.sort((a, b) => {
      const scoreA = a.metadata.engagementScore || 0
      const scoreB = b.metadata.engagementScore || 0

      if (scoreA !== scoreB) {
        return scoreB - scoreA // Higher engagement first
      }

      // If engagement is similar, prefer more recent content
      const dateA = new Date(a.originalItem.pubDate || 0)
      const dateB = new Date(b.originalItem.pubDate || 0)
      return dateB - dateA
    })

    return sorted.slice(0, count)
  }
}

module.exports = TweetGenerator
