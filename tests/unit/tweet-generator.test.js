/**
 * TweetGenerator クラスのユニットテスト
 * 包括的テストによる高いカバレッジを実現
 */

const TweetGenerator = require('../../src/tweet-generator')

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(() => 'combined-format'),
    timestamp: jest.fn(() => 'timestamp-format'),
    errors: jest.fn(() => 'errors-format'),
    json: jest.fn(() => 'json-format'),
    colorize: jest.fn(() => 'colorize-format'),
    simple: jest.fn(() => 'simple-format')
  },
  transports: {
    Console: jest.fn().mockImplementation(() => ({}))
  }
}))

describe('TweetGenerator', () => {
  let tweetGenerator
  let mockLogger

  beforeEach(() => {
    const winston = require('winston')
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }
    winston.createLogger.mockReturnValue(mockLogger)

    tweetGenerator = new TweetGenerator()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(tweetGenerator.config.maxTweetLength).toBe(280)
      expect(tweetGenerator.config.includeHashtags).toBe(true)
      expect(tweetGenerator.config.hashtagLimit).toBe(3)
      expect(tweetGenerator.config.includeUrl).toBe(true)
      expect(tweetGenerator.config.logLevel).toBe('info')
    })

    it('should initialize with custom configuration', () => {
      const customConfig = {
        maxTweetLength: 250,
        includeHashtags: false,
        hashtagLimit: 2,
        includeUrl: false,
        logLevel: 'debug'
      }

      const generator = new TweetGenerator(customConfig)

      expect(generator.config.maxTweetLength).toBe(250)
      expect(generator.config.includeHashtags).toBe(false)
      expect(generator.config.hashtagLimit).toBe(2)
      expect(generator.config.includeUrl).toBe(false)
      expect(generator.config.logLevel).toBe('debug')
    })
  })

  describe('initializeTemplates', () => {
    it('should initialize tweet templates', () => {
      expect(tweetGenerator.templates).toHaveLength(4)
      expect(tweetGenerator.templates[0]).toBe('📢 {title}\n\n{summary}\n\n{hashtags}')
      expect(tweetGenerator.templates[1]).toBe('🤖 最新AI情報\n\n{title}\n{summary}\n\n{hashtags}')
      expect(tweetGenerator.templates[2]).toBe('💡 {category}の最新動向\n\n{title}\n\n{hashtags}')
      expect(tweetGenerator.templates[3]).toBe('🔍 注目記事\n\n{title}\n\n要点: {summary}\n\n{hashtags}')
    })

    it('should initialize hashtags for each category', () => {
      expect(tweetGenerator.hashtags.LLM).toEqual(['#LLM', '#大規模言語モデル', '#AI'])
      expect(tweetGenerator.hashtags['Computer Vision']).toEqual(['#ComputerVision', '#画像認識', '#AI'])
      expect(tweetGenerator.hashtags.Robotics).toEqual(['#Robotics', '#ロボット', '#AI'])
      expect(tweetGenerator.hashtags['Machine Learning']).toEqual(['#MachineLearning', '#機械学習', '#AI'])
      expect(tweetGenerator.hashtags['AI General']).toEqual(['#AI', '#人工知能', '#Tech'])
    })
  })

  describe('generateTweet', () => {
    const mockArticle = {
      title: 'Revolutionary AI Breakthrough in Machine Learning',
      description: 'Scientists have developed a new machine learning algorithm that can learn faster than ever before.',
      url: 'https://example.com/article',
      category: 'Machine Learning'
    }

    it('should generate tweet successfully', async () => {
      const result = await tweetGenerator.generateTweet(mockArticle)

      expect(result.text).toBeDefined()
      expect(result.text.length).toBeLessThanOrEqual(280)
      expect(result.text).toContain(mockArticle.title)
      expect(result.text).toContain(mockArticle.url)
      expect(result.text).toContain('#MachineLearning')

      expect(result.metadata).toBeDefined()
      expect(result.metadata.articleTitle).toBe(mockArticle.title)
      expect(result.metadata.articleUrl).toBe(mockArticle.url)
      expect(result.metadata.category).toBe(mockArticle.category)
      expect(result.metadata.hashtags).toEqual(['#MachineLearning', '#機械学習', '#AI'])
      expect(result.metadata.template).toBeGreaterThanOrEqual(0)
      expect(result.metadata.template).toBeLessThan(4)

      expect(mockLogger.info).toHaveBeenCalledWith('Generating tweet', {
        title: mockArticle.title,
        category: mockArticle.category
      })
    })

    it('should throw error for missing article', async () => {
      await expect(tweetGenerator.generateTweet(null)).rejects.toThrow('Article with title is required')
    })

    it('should throw error for article without title', async () => {
      const articleWithoutTitle = {
        description: 'Some description',
        url: 'https://example.com'
      }

      await expect(tweetGenerator.generateTweet(articleWithoutTitle)).rejects.toThrow('Article with title is required')
    })

    it('should handle article without URL', async () => {
      const articleWithoutUrl = {
        title: 'Test Article',
        description: 'Test description',
        category: 'AI General'
      }

      const result = await tweetGenerator.generateTweet(articleWithoutUrl)

      expect(result.text).not.toContain('https://')
      expect(result.metadata.articleUrl).toBeUndefined()
    })

    it('should handle article without category', async () => {
      const articleWithoutCategory = {
        title: 'Test Article',
        description: 'Test description',
        url: 'https://example.com'
      }

      const result = await tweetGenerator.generateTweet(articleWithoutCategory)

      expect(result.metadata.hashtags).toEqual(['#AI', '#人工知能', '#Tech'])
    })

    it('should generate tweet without URL when includeUrl is false', async () => {
      tweetGenerator.config.includeUrl = false

      const result = await tweetGenerator.generateTweet(mockArticle)

      expect(result.text).not.toContain(mockArticle.url)
    })

    it('should generate tweet without hashtags when includeHashtags is false', async () => {
      tweetGenerator.config.includeHashtags = false

      const result = await tweetGenerator.generateTweet(mockArticle)

      expect(result.text).not.toContain('#')
      expect(result.metadata.hashtags).toEqual([])
    })

    it('should handle generation errors', async () => {
      // Mock Math.floor to cause an error in template selection
      const originalMathFloor = Math.floor
      Math.floor = jest.fn(() => {
        throw new Error('Template selection failed')
      })

      await expect(tweetGenerator.generateTweet(mockArticle)).rejects.toThrow('Template selection failed')

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to generate tweet', {
        error: 'Template selection failed',
        article: mockArticle.title
      })

      // Restore original Math.floor
      Math.floor = originalMathFloor
    })
  })

  describe('generateSummary', () => {
    it('should return full description if within max length', () => {
      const article = {
        description: 'Short description'
      }

      const summary = tweetGenerator.generateSummary(article)

      expect(summary).toBe('Short description')
    })

    it('should truncate at sentence boundary with period', () => {
      const article = {
        description: 'This is the first sentence。This is the second sentence that goes beyond the limit and should be truncated.'
      }

      const summary = tweetGenerator.generateSummary(article)

      expect(summary).toBe('This is the first sentence。')
    })

    it('should truncate at word boundary', () => {
      const article = {
        description: 'This is a very long description that exceeds the maximum length limit and needs to be truncated at word boundary.'
      }

      const summary = tweetGenerator.generateSummary(article)

      expect(summary).toContain('...')
      expect(summary.length).toBeLessThanOrEqual(103) // 100 + '...'
    })

    it('should truncate with ellipsis when no good break point', () => {
      const article = {
        description: 'Averylongwordthathasnospacesandexceedsthemaximumlengthsoitneedstobetruncatedwithellipsis'
      }

      const summary = tweetGenerator.generateSummary(article)

      expect(summary).toContain('...')
      expect(summary.length).toBe(103) // 100 + '...'
    })

    it('should use content if description is not available', () => {
      const article = {
        content: 'Content used as summary'
      }

      const summary = tweetGenerator.generateSummary(article)

      expect(summary).toBe('Content used as summary')
    })

    it('should return empty string if no description or content', () => {
      const article = {}

      const summary = tweetGenerator.generateSummary(article)

      expect(summary).toBe('')
    })

    it('should handle Japanese text with period', () => {
      const article = {
        description: 'これは最初の文章です。これは制限を超える長い二番目の文章で、切り捨てられるべきです。'
      }

      const summary = tweetGenerator.generateSummary(article)

      expect(summary).toBe('これは最初の文章です。')
    })
  })

  describe('selectHashtags', () => {
    it('should select hashtags for LLM category', () => {
      const article = { category: 'LLM' }

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toEqual(['#LLM', '#大規模言語モデル', '#AI'])
    })

    it('should select hashtags for Computer Vision category', () => {
      const article = { category: 'Computer Vision' }

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toEqual(['#ComputerVision', '#画像認識', '#AI'])
    })

    it('should select hashtags for Robotics category', () => {
      const article = { category: 'Robotics' }

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toEqual(['#Robotics', '#ロボット', '#AI'])
    })

    it('should select hashtags for Machine Learning category', () => {
      const article = { category: 'Machine Learning' }

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toEqual(['#MachineLearning', '#機械学習', '#AI'])
    })

    it('should use AI General hashtags for unknown category', () => {
      const article = { category: 'Unknown Category' }

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toEqual(['#AI', '#人工知能', '#Tech'])
    })

    it('should use AI General hashtags when category is undefined', () => {
      const article = {}

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toEqual(['#AI', '#人工知能', '#Tech'])
    })

    it('should respect hashtag limit', () => {
      tweetGenerator.config.hashtagLimit = 2
      const article = { category: 'LLM' }

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toHaveLength(2)
      expect(hashtags).toEqual(['#LLM', '#大規模言語モデル'])
    })

    it('should return empty array when hashtags are disabled', () => {
      tweetGenerator.config.includeHashtags = false
      const article = { category: 'LLM' }

      const hashtags = tweetGenerator.selectHashtags(article)

      expect(hashtags).toEqual([])
    })
  })

  describe('truncateTweet', () => {
    it('should return tweet as is if within limit', () => {
      const tweet = 'Short tweet with hashtags #AI #ML'
      const url = 'https://example.com'

      const result = tweetGenerator.truncateTweet(tweet, url)

      expect(result).toBe(tweet)
    })

    it('should truncate long tweet while preserving hashtags', () => {
      const longContent = 'This is a very long tweet content that exceeds the maximum length limit and needs to be truncated while preserving the hashtags at the end'
      const hashtags = '#AI #MachineLearning #Tech'
      const tweet = `${longContent} ${hashtags}`
      const url = 'https://example.com/very-long-url-that-takes-up-space'

      const result = tweetGenerator.truncateTweet(tweet, url)

      expect(result.length + url.length + 2).toBeLessThanOrEqual(280) // +2 for newlines
      expect(result).toContain('...')
      expect(result).toContain(hashtags)
    })

    it('should handle tweet without hashtags', () => {
      const longTweet = 'This is a very long tweet content that exceeds the maximum length limit and needs to be truncated but has no hashtags at the end so it should just be cut off'
      const url = 'https://example.com'

      const result = tweetGenerator.truncateTweet(longTweet, url)

      expect(result.length + url.length + 2).toBeLessThanOrEqual(280)
      expect(result).toContain('...')
    })

    it('should handle tweet without URL', () => {
      const longTweet = 'This is a very long tweet content that exceeds the maximum length limit and needs to be truncated when there is no URL to consider in the length calculation'

      const result = tweetGenerator.truncateTweet(longTweet)

      expect(result.length).toBeLessThanOrEqual(280)
      expect(result).toContain('...')
    })

    it('should preserve hashtags with newline separator', () => {
      const content = 'Long content that needs truncation'
      const hashtags = '#AI #MachineLearning #Tech'
      const tweet = `${content} ${hashtags}`
      const url = 'https://example.com'

      // Force truncation by setting a very short max length
      tweetGenerator.config.maxTweetLength = 50

      const result = tweetGenerator.truncateTweet(tweet, url)

      expect(result).toContain('...')
      expect(result).toContain('\n#AI #MachineLearning #Tech')
    })

    it('should handle edge case with exact length limit', () => {
      tweetGenerator.config.maxTweetLength = 50
      const tweet = 'Exactly fifty characters including hashtags #AI'
      const url = ''

      const result = tweetGenerator.truncateTweet(tweet, url)

      expect(result.length).toBeLessThanOrEqual(50)
    })
  })

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const health = await tweetGenerator.healthCheck()

      expect(health.status).toBe('healthy')
      expect(health.metrics.available).toBe(true)
      expect(health.metrics.templateCount).toBe(4)
      expect(health.metrics.categoryCount).toBe(5)
    })

    it('should return correct counts', async () => {
      const health = await tweetGenerator.healthCheck()

      expect(health.metrics.templateCount).toBe(tweetGenerator.templates.length)
      expect(health.metrics.categoryCount).toBe(Object.keys(tweetGenerator.hashtags).length)
    })
  })

  describe('integration scenarios', () => {
    it('should generate tweet for real-world LLM article', async () => {
      const article = {
        title: 'GPT-4 Turbo Shows Remarkable Performance in Code Generation',
        description: 'OpenAI\'s latest language model demonstrates unprecedented capabilities in generating clean, efficient code across multiple programming languages. The model shows significant improvements in reasoning and maintains better context over longer conversations.',
        url: 'https://openai.com/research/gpt-4-turbo',
        category: 'LLM'
      }

      const result = await tweetGenerator.generateTweet(article)

      expect(result.text).toContain('GPT-4 Turbo')
      expect(result.text).toContain('#LLM')
      expect(result.text).toContain(article.url)
      expect(result.text.length).toBeLessThanOrEqual(280)
      expect(result.metadata.category).toBe('LLM')
    })

    it('should generate tweet for Computer Vision article', async () => {
      const article = {
        title: 'New Computer Vision Model Achieves Human-Level Image Recognition',
        description: 'Researchers have developed a breakthrough computer vision system that can identify objects with 99.9% accuracy.',
        url: 'https://research.example.com/vision-breakthrough',
        category: 'Computer Vision'
      }

      const result = await tweetGenerator.generateTweet(article)

      expect(result.text).toContain('Computer Vision')
      expect(result.text).toContain('#ComputerVision')
      expect(result.metadata.hashtags).toContain('#画像認識')
    })

    it('should handle very long titles gracefully', async () => {
      const article = {
        title: 'This is an extremely long article title that exceeds normal limits and might cause issues with tweet generation if not handled properly by the truncation logic',
        description: 'Short description',
        url: 'https://example.com/very-long-title-article',
        category: 'AI General'
      }

      const result = await tweetGenerator.generateTweet(article)

      expect(result.text.length).toBeLessThanOrEqual(280)
      expect(result.text).toContain(article.url)
    })

    it('should handle articles with special characters', async () => {
      const article = {
        title: 'AI研究の新展開: 日本語処理の革新的アプローチ',
        description: '最新の自然言語処理技術により、日本語の理解精度が飛躍的に向上しました。',
        url: 'https://example.jp/ai-japanese-research',
        category: 'Machine Learning'
      }

      const result = await tweetGenerator.generateTweet(article)

      expect(result.text).toContain('AI研究の新展開')
      expect(result.text).toContain('#機械学習')
      expect(result.text.length).toBeLessThanOrEqual(280)
    })

    it('should generate different tweets for same article (randomness)', async () => {
      const article = {
        title: 'AI Breakthrough',
        description: 'Amazing AI development',
        url: 'https://example.com',
        category: 'AI General'
      }

      const tweets = []
      for (let i = 0; i < 10; i++) {
        const result = await tweetGenerator.generateTweet(article)
        tweets.push(result.text)
      }

      // Due to randomness in template selection, we should get some variety
      const uniqueTweets = new Set(tweets)
      expect(uniqueTweets.size).toBeGreaterThan(1)
    })

    it('should handle empty or minimal content gracefully', async () => {
      const minimalArticle = {
        title: 'AI',
        category: 'AI General'
      }

      const result = await tweetGenerator.generateTweet(minimalArticle)

      expect(result.text).toContain('AI')
      expect(result.text).toContain('#AI')
      expect(result.text.length).toBeLessThanOrEqual(280)
    })
  })
})