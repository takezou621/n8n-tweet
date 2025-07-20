/**
 * Extended FeedParser tests for better coverage
 */

const FeedParser = require('../../src/utils/feed-parser')
const path = require('path')

describe('FeedParser - Extended Tests', () => {
  let feedParser

  beforeEach(() => {
    feedParser = new FeedParser({
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100
    })
  })

  describe('loadFeedConfig', () => {
    it('should load valid configuration file', async () => {
      const configPath = path.join(__dirname, '../../config/rss-feeds.json')
      const config = await feedParser.loadFeedConfig(configPath)

      expect(config).toHaveProperty('feeds')
      expect(config).toHaveProperty('globalSettings')
      expect(config).toHaveProperty('categories')
      expect(Array.isArray(config.feeds)).toBe(true)
    })

    it('should handle missing configuration file', async () => {
      const invalidPath = '/non/existent/config.json'

      await expect(feedParser.loadFeedConfig(invalidPath))
        .rejects.toThrow('Failed to load feed configuration')
    })
  })

  describe('parseFeed with mocked RSS parser', () => {
    beforeEach(() => {
      // Mock the RSS parser instance
      feedParser.rssParser = {
        parseURL: jest.fn()
      }
    })

    it('should parse feed successfully', async () => {
      const mockFeedData = {
        title: 'Test Feed',
        description: 'Test Description',
        items: [
          {
            title: 'Article 1',
            description: 'Article description',
            link: 'https://example.com/1',
            pubDate: new Date(),
            guid: 'article-1'
          }
        ]
      }

      feedParser.rssParser.parseURL.mockResolvedValue(mockFeedData)

      const feedConfig = {
        name: 'Test Feed',
        url: 'https://example.com/rss',
        category: 'test'
      }

      const result = await feedParser.parseFeed(feedConfig)

      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('items')
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toHaveProperty('title', 'Article 1')
    })

    it('should handle parsing errors', async () => {
      feedParser.rssParser.parseURL.mockRejectedValue(new Error('Network error'))

      const feedConfig = {
        name: 'Error Feed',
        url: 'https://error.com/rss',
        category: 'test'
      }

      await expect(feedParser.parseFeed(feedConfig))
        .rejects.toThrow('Failed to parse RSS feed')
    })

    it('should handle timeout', async () => {
      feedParser.rssParser.parseURL.mockImplementation(() =>
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 200)
        )
      )

      const feedConfig = {
        name: 'Slow Feed',
        url: 'https://slow.com/rss',
        category: 'test',
        timeout: 100
      }

      await expect(feedParser.parseFeed(feedConfig))
        .rejects.toThrow('Failed to parse RSS feed')
    })
  })

  describe('parseWithRetry', () => {
    beforeEach(() => {
      feedParser.parseFeed = jest.fn()
    })

    it('should succeed on first attempt', async () => {
      const mockResult = { metadata: {}, items: [] }
      feedParser.parseFeed.mockResolvedValue(mockResult)

      const feedConfig = { name: 'Test', url: 'https://test.com/rss' }
      const result = await feedParser.parseWithRetry(feedConfig)

      expect(result).toBe(mockResult)
      expect(feedParser.parseFeed).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure and eventually succeed', async () => {
      const mockResult = { metadata: {}, items: [] }
      feedParser.parseFeed
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(mockResult)

      const feedConfig = {
        name: 'Retry Test',
        url: 'https://retry.com/rss',
        retryAttempts: 2
      }
      const result = await feedParser.parseWithRetry(feedConfig)

      expect(result).toBe(mockResult)
      expect(feedParser.parseFeed).toHaveBeenCalledTimes(2)
    })

    it('should fail after max retries', async () => {
      feedParser.parseFeed.mockRejectedValue(new Error('Persistent error'))

      const feedConfig = {
        name: 'Fail Test',
        url: 'https://fail.com/rss',
        retryAttempts: 2
      }

      await expect(feedParser.parseWithRetry(feedConfig))
        .rejects.toThrow('Max retry attempts exceeded')

      expect(feedParser.parseFeed).toHaveBeenCalledTimes(2)
    })
  })

  describe('parseMultipleFeeds', () => {
    beforeEach(() => {
      feedParser.parseWithRetry = jest.fn()
    })

    it('should parse multiple enabled feeds', async () => {
      const mockResults = [
        { metadata: { title: 'Feed 1' }, items: [] },
        { metadata: { title: 'Feed 2' }, items: [] }
      ]

      feedParser.parseWithRetry
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])

      const feedConfigs = [
        { name: 'Feed 1', url: 'https://1.com/rss', enabled: true },
        { name: 'Feed 2', url: 'https://2.com/rss', enabled: true },
        { name: 'Feed 3', url: 'https://3.com/rss', enabled: false } // disabled
      ]

      const results = await feedParser.parseMultipleFeeds(feedConfigs)

      expect(results).toHaveLength(2)
      expect(feedParser.parseWithRetry).toHaveBeenCalledTimes(2)
    })

    it('should handle individual feed failures', async () => {
      feedParser.parseWithRetry
        .mockResolvedValueOnce({ metadata: { title: 'Good' }, items: [] })
        .mockRejectedValueOnce(new Error('Bad feed'))

      const feedConfigs = [
        { name: 'Good Feed', url: 'https://good.com/rss', enabled: true },
        { name: 'Bad Feed', url: 'https://bad.com/rss', enabled: true }
      ]

      const results = await feedParser.parseMultipleFeeds(feedConfigs)

      expect(results).toHaveLength(1)
      expect(results[0].metadata.title).toBe('Good')
    })
  })

  describe('delay', () => {
    it('should delay for specified time', async () => {
      const start = Date.now()
      await feedParser.delay(50)
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(45) // Allow some tolerance
    })
  })

  describe('getCategoryInfo', () => {
    it('should return category information', () => {
      const fullConfig = {
        categories: {
          research: {
            weight: 1.0,
            keywords: ['paper', 'study'],
            hashtagPrefix: '#Research'
          }
        }
      }

      const categoryInfo = feedParser.getCategoryInfo(fullConfig, 'research')

      expect(categoryInfo.weight).toBe(1.0)
      expect(categoryInfo.keywords).toContain('paper')
      expect(categoryInfo.hashtagPrefix).toBe('#Research')
    })

    it('should return default category for unknown category', () => {
      const fullConfig = { categories: {} }
      const categoryInfo = feedParser.getCategoryInfo(fullConfig, 'unknown')

      expect(categoryInfo.weight).toBe(0.5)
      expect(categoryInfo.hashtagPrefix).toBe('#AI')
    })
  })

  describe('checkFeedHealth', () => {
    it('should report healthy feed', () => {
      const feedResult = {
        metadata: { duration: 1000 },
        items: [
          { pubDate: new Date() }
        ]
      }

      const health = feedParser.checkFeedHealth(feedResult)

      expect(health.status).toBe('healthy')
      expect(health.score).toBeGreaterThan(0.8)
    })

    it('should report unhealthy feed with no items', () => {
      const feedResult = {
        metadata: { duration: 1000 },
        items: []
      }

      const health = feedParser.checkFeedHealth(feedResult)

      expect(health.status).toBe('warning')
      expect(health.issues).toContain('No items found in feed')
    })

    it('should report old content warning', () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 45) // 45 days ago

      const feedResult = {
        metadata: { duration: 1000 },
        items: [
          { pubDate: oldDate }
        ]
      }

      const health = feedParser.checkFeedHealth(feedResult)

      expect(health.issues).toContain('No recent content (older than 30 days)')
      expect(health.score).toBeLessThan(1.0)
    })

    it('should report very unhealthy feed', () => {
      const feedResult = {
        metadata: { duration: 35000 }, // slow
        items: [] // no items
      }

      const health = feedParser.checkFeedHealth(feedResult)

      expect(health.status).toBe('warning') // 0.5 score = warning status
      expect(health.score).toBeLessThan(0.8)
      expect(health.issues).toHaveLength(1) // no items
      expect(health.issues).toContain('No items found in feed')
    })
  })

  describe('additional validation tests', () => {
    it('should reject feed with invalid URL', () => {
      const invalidConfig = {
        name: 'Test',
        url: 'not-a-url'
      }

      expect(() => feedParser.validateFeedConfig(invalidConfig))
        .toThrow('Invalid feed configuration: invalid URL format')
    })

    it('should reject feed with negative timeout', () => {
      const invalidConfig = {
        name: 'Test',
        url: 'https://example.com/rss',
        timeout: -1000
      }

      expect(() => feedParser.validateFeedConfig(invalidConfig))
        .toThrow('Invalid feed configuration: timeout must be a positive number')
    })

    it('should reject feed with negative retry attempts', () => {
      const invalidConfig = {
        name: 'Test',
        url: 'https://example.com/rss',
        retryAttempts: -1
      }

      expect(() => feedParser.validateFeedConfig(invalidConfig))
        .toThrow('Invalid feed configuration: retryAttempts must be a positive number')
    })
  })
})
