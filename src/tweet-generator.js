/**
 * ツイート生成器
 * AI記事から魅力的なツイートを生成
 */

const winston = require('winston')

class TweetGenerator {
  constructor (config = {}) {
    this.config = {
      maxTweetLength: 280,
      includeHashtags: true,
      hashtagLimit: 3,
      includeUrl: true,
      logLevel: 'info',
      ...config
    }

    this.initializeLogger()
    this.initializeTemplates()
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

  initializeTemplates () {
    this.templates = [
      '📢 {title}\n\n{summary}\n\n{hashtags}',
      '🤖 最新AI情報\n\n{title}\n{summary}\n\n{hashtags}',
      '💡 {category}の最新動向\n\n{title}\n\n{hashtags}',
      '🔍 注目記事\n\n{title}\n\n要点: {summary}\n\n{hashtags}'
    ]

    this.hashtags = {
      LLM: ['#LLM', '#大規模言語モデル', '#AI'],
      'Computer Vision': ['#ComputerVision', '#画像認識', '#AI'],
      Robotics: ['#Robotics', '#ロボット', '#AI'],
      'Machine Learning': ['#MachineLearning', '#機械学習', '#AI'],
      'AI General': ['#AI', '#人工知能', '#Tech']
    }
  }

  /**
   * ツイートを生成
   */
  async generateTweet (article) {
    if (!article || !article.title) {
      throw new Error('Article with title is required')
    }

    this.logger.info('Generating tweet', {
      title: article.title,
      category: article.category
    })

    try {
      // テンプレートをランダムに選択
      const template = this.templates[Math.floor(Math.random() * this.templates.length)]

      // サマリーを生成
      const summary = this.generateSummary(article)

      // ハッシュタグを選択
      const hashtags = this.selectHashtags(article)

      // ツイートを組み立て
      let tweet = template
        .replace('{title}', article.title)
        .replace('{summary}', summary)
        .replace('{category}', article.category || 'AI')
        .replace('{hashtags}', hashtags.join(' '))

      // URLを追加
      if (this.config.includeUrl && article.url) {
        tweet += `\n\n${article.url}`
      }

      // 文字数制限をチェック
      tweet = this.truncateTweet(tweet, article.url)

      return {
        text: tweet,
        metadata: {
          articleTitle: article.title,
          articleUrl: article.url,
          category: article.category,
          hashtags,
          template: this.templates.indexOf(template)
        }
      }
    } catch (error) {
      this.logger.error('Failed to generate tweet', {
        error: error.message,
        article: article.title
      })
      throw error
    }
  }

  /**
   * 記事のサマリーを生成
   */
  generateSummary (article) {
    const description = article.description || article.content || ''
    const maxLength = 100

    if (description.length <= maxLength) {
      return description
    }

    // 最初の100文字で文の区切りを探す
    const truncated = description.substring(0, maxLength)
    const lastPeriod = truncated.lastIndexOf('。')
    const lastSpace = truncated.lastIndexOf(' ')

    if (lastPeriod > 50) {
      return truncated.substring(0, lastPeriod + 1)
    } else if (lastSpace > 50) {
      return truncated.substring(0, lastSpace) + '...'
    } else {
      return truncated + '...'
    }
  }

  /**
   * ハッシュタグを選択
   */
  selectHashtags (article) {
    if (!this.config.includeHashtags) {
      return []
    }

    const category = article.category || 'AI General'
    const categoryHashtags = this.hashtags[category] || this.hashtags['AI General']

    // カテゴリーのハッシュタグから制限数まで選択
    return categoryHashtags.slice(0, this.config.hashtagLimit)
  }

  /**
   * ツイートを文字数制限内に収める
   */
  truncateTweet (tweet, url) {
    const urlLength = url ? url.length + 2 : 0 // 改行を含む
    const maxContentLength = this.config.maxTweetLength - urlLength

    if (tweet.length <= maxContentLength) {
      return tweet
    }

    // ハッシュタグを保持しながら本文を短縮
    const hashtagMatch = tweet.match(/(#\S+\s*)+$/)
    const hashtags = hashtagMatch ? hashtagMatch[0] : ''
    const mainContent = hashtags ? tweet.replace(hashtags, '') : tweet

    const truncatedMain = mainContent.substring(0, maxContentLength - hashtags.length - 3) + '...'

    return truncatedMain + (hashtags ? '\n' + hashtags : '')
  }

  /**
   * ヘルスチェック
   */
  async healthCheck () {
    return {
      status: 'healthy',
      metrics: {
        available: true,
        templateCount: this.templates.length,
        categoryCount: Object.keys(this.hashtags).length
      }
    }
  }
}

module.exports = TweetGenerator
