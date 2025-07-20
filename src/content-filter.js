/**
 * コンテンツフィルター
 * AI関連記事のフィルタリング・分類
 */

const winston = require('winston')

class ContentFilter {
  constructor (config = {}) {
    this.config = {
      minRelevanceScore: 0.7,
      maxArticleAge: 7 * 24 * 60 * 60 * 1000, // 7日
      enableDuplicateCheck: true,
      logLevel: 'info',
      ...config
    }

    this.initializeLogger()
    this.initializeKeywords()
  }

  initializeLogger () {
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

  initializeKeywords () {
    this.aiKeywords = [
      'AI', 'artificial intelligence', '人工知能',
      'machine learning', '機械学習', 'deep learning',
      'neural network', 'GPT', 'LLM', 'transformer',
      'computer vision', 'NLP', 'robotics'
    ]

    this.techKeywords = [
      'technology', 'tech', 'software', 'hardware',
      'programming', 'development', 'innovation'
    ]
  }

  /**
   * 記事をフィルタリング
   */
  async filterArticles (articles) {
    if (!Array.isArray(articles)) {
      throw new Error('Articles must be an array')
    }

    this.logger.info('Filtering articles', { count: articles.length })

    const filteredArticles = []
    const now = Date.now()

    for (const article of articles) {
      try {
        // 古い記事をスキップ
        const articleDate = new Date(article.publishedDate || article.date)
        if (now - articleDate.getTime() > this.config.maxArticleAge) {
          continue
        }

        // 関連性スコアを計算
        const relevanceScore = this.calculateRelevanceScore(article)

        if (relevanceScore >= this.config.minRelevanceScore) {
          filteredArticles.push({
            ...article,
            relevanceScore,
            category: this.categorizeArticle(article)
          })
        }
      } catch (error) {
        this.logger.error('Failed to filter article', {
          title: article.title,
          error: error.message
        })
      }
    }

    this.logger.info('Articles filtered', {
      original: articles.length,
      filtered: filteredArticles.length
    })

    return filteredArticles
  }

  /**
   * 関連性スコアを計算
   */
  calculateRelevanceScore (article) {
    let score = 0
    const text = `${article.title || ''} ${article.description || ''} ${article.content || ''}`.toLowerCase()

    // AIキーワードのチェック
    for (const keyword of this.aiKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.3
      }
    }

    // テクノロジーキーワードのチェック
    for (const keyword of this.techKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 0.1
      }
    }

    return Math.min(score, 1.0)
  }

  /**
   * 記事をカテゴライズ
   */
  categorizeArticle (article) {
    const text = `${article.title || ''} ${article.description || ''}`.toLowerCase()

    if (text.includes('gpt') || text.includes('llm') || text.includes('言語モデル')) {
      return 'LLM'
    } else if (text.includes('画像') || text.includes('vision') || text.includes('image')) {
      return 'Computer Vision'
    } else if (text.includes('robot') || text.includes('ロボット')) {
      return 'Robotics'
    } else if (text.includes('machine learning') || text.includes('機械学習')) {
      return 'Machine Learning'
    } else {
      return 'AI General'
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck () {
    return {
      status: 'healthy',
      metrics: {
        available: true,
        keywordCount: this.aiKeywords.length + this.techKeywords.length
      }
    }
  }
}

module.exports = ContentFilter