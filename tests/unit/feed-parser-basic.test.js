/**
 * Simple FeedParser test to verify basic functionality
 */

const FeedParser = require('../../src/utils/feed-parser')

describe('FeedParser - Basic Tests', () => {
  let feedParser

  beforeEach(() => {
    feedParser = new FeedParser({
      timeout: 5000,
      retryAttempts: 1
    })
  })

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(feedParser.config.timeout).toBe(5000)
      expect(feedParser.config.retryAttempts).toBe(1)
      expect(feedParser.logger).toBeDefined()
    })
  })

  describe('validateFeedConfig', () => {
    it('should validate correct feed configuration', () => {
      const validConfig = {
        name: 'Test Feed',
        url: 'https://example.com/rss',
        category: 'test'
      }

      expect(() => feedParser.validateFeedConfig(validConfig)).not.toThrow()
    })

    it('should reject invalid feed configuration', () => {
      const invalidConfig = {
        name: '',
        url: 'https://example.com/rss'
      }

      expect(() => feedParser.validateFeedConfig(invalidConfig))
        .toThrow('Invalid feed configuration')
    })
  })

  describe('calculateWordCount', () => {
    it('should calculate word count correctly', () => {
      const text = 'This is a test with five words'
      const count = feedParser.calculateWordCount(text)
      expect(count).toBe(7) // "This", "is", "a", "test", "with", "five", "words"
    })

    it('should handle empty text', () => {
      expect(feedParser.calculateWordCount('')).toBe(0)
      expect(feedParser.calculateWordCount(null)).toBe(0)
      expect(feedParser.calculateWordCount(undefined)).toBe(0)
    })
  })

  describe('enrichFeedItems', () => {
    it('should enrich feed items with metadata', () => {
      const rawItems = [
        {
          title: 'Test Article',
          description: 'This is a test description',
          link: 'https://example.com/test'
        }
      ]

      const feedConfig = {
        name: 'Test Feed',
        category: 'test',
        priority: 'high'
      }

      const enrichedItems = feedParser.enrichFeedItems(rawItems, feedConfig)

      expect(enrichedItems).toHaveLength(1)
      expect(enrichedItems[0]).toHaveProperty('feedName', 'Test Feed')
      expect(enrichedItems[0]).toHaveProperty('category', 'test')
      expect(enrichedItems[0]).toHaveProperty('priority', 'high')
      expect(enrichedItems[0]).toHaveProperty('wordCount')
      expect(enrichedItems[0]).toHaveProperty('estimatedReadTime')
    })
  })
})
