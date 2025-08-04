/**
 * FeedParser unit tests
 * RSS フィード解析機能のテスト
 * TDD Red → Green → Refactor approach
 */

const FeedParser = require('../../src/utils/feed-parser')
const path = require('path')

describe('FeedParser', () => {
  let feedParser
  let mockConfig

  beforeEach(() => {
    mockConfig = {
      timeout: 30000,
      retryAttempts: 2,
      retryDelay: 5000,
      userAgent: 'test-bot/1.0.0',
      rateLimitDelay: 100,
      maxConcurrentFeeds: 5,
      logLevel: 'info',
      maxRetries: 3
    }
    feedParser = new FeedParser(mockConfig)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(feedParser.config).toEqual(mockConfig)
      expect(feedParser.logger).toBeDefined()
    })

    it('should use default config when none provided', () => {
      const defaultParser = new FeedParser()
      expect(defaultParser.config.timeout).toBe(30000)
      expect(defaultParser.config.retryAttempts).toBe(2)
      expect(defaultParser.config.maxRetries).toBe(3)
      expect(defaultParser.config.logLevel).toBe('info')
    })
  })

  describe('loadFeedConfig', () => {
    it('should load RSS feed configuration from file', async () => {
      const configPath = path.join(__dirname, '../../config/rss-feeds.json')
      const config = await feedParser.loadFeedConfig(configPath)

      expect(config).toHaveProperty('feeds')
      expect(config).toHaveProperty('globalSettings')
      expect(config).toHaveProperty('categories')
      expect(Array.isArray(config.feeds)).toBe(true)
      expect(config.feeds.length).toBeGreaterThan(0)
    })

    it('should handle missing config file gracefully', async () => {
      const invalidPath = '/non/existent/path.json'

      await expect(feedParser.loadFeedConfig(invalidPath))
        .rejects.toThrow('Failed to load feed configuration')
    })
  })

  describe('validateFeedConfig', () => {
    it('should validate correct feed configuration', () => {
      const validConfig = {
        name: 'Test Feed',
        url: 'https://example.com/rss',
        category: 'test',
        enabled: true,
        timeout: 30000,
        retryAttempts: 2
      }

      expect(() => feedParser.validateFeedConfig(validConfig)).not.toThrow()
    })

    it('should reject invalid feed configuration', () => {
      const invalidConfigs = [
        { name: '', url: 'https://example.com/rss' }, // empty name
        { name: 'Test', url: '' }, // empty URL
        { name: 'Test', url: 'invalid-url' }, // invalid URL format
        { name: 'Test', url: 'https://example.com/rss', timeout: -1 }, // negative timeout
        { name: 'Test', url: 'https://example.com/rss', retryAttempts: -1 } // negative retry
      ]

      invalidConfigs.forEach(config => {
        expect(() => feedParser.validateFeedConfig(config))
          .toThrow('Invalid feed configuration')
      })
    })
  })

  describe('parseFeed', () => {
    const mockFeedData = {
      title: 'Test Feed',
      description: 'Test feed description',
      items: [
        {
          title: 'Test Article 1',
          description: 'This is a test article about artificial intelligence',
          link: 'https://example.com/article1',
          pubDate: new Date('2025-07-06T00:00:00Z'),
          guid: 'test-guid-1'
        },
        {
          title: 'Test Article 2',
          description: 'Another AI research article',
          link: 'https://example.com/article2',
          pubDate: new Date('2025-07-05T00:00:00Z'),
          guid: 'test-guid-2'
        }
      ]
    }

    it('should parse RSS feed successfully', async () => {
      // Mock the rss-parser directly on the instance
      feedParser.rssParser.parseURL = jest.fn().mockResolvedValue(mockFeedData)

      const feedUrl = 'https://example.com/rss'
      const feedConfig = {
        name: 'Test Feed',
        url: feedUrl,
        category: 'test',
        timeout: 30000
      }

      const result = await feedParser.parseFeed(feedConfig)

      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('items')
      expect(result.metadata.title).toBe('Test Feed')
      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toHaveProperty('title')
      expect(result.items[0]).toHaveProperty('description')
      expect(result.items[0]).toHaveProperty('link')
      expect(result.items[0]).toHaveProperty('pubDate')
      expect(result.items[0]).toHaveProperty('guid')
    })

    it('should handle feed parsing errors', async () => {
      feedParser.rssParser.parseURL = jest.fn().mockRejectedValue(new Error('Network error'))

      const feedConfig = {
        name: 'Test Feed',
        url: 'https://invalid-url.com/rss',
        category: 'test'
      }

      await expect(feedParser.parseFeed(feedConfig))
        .rejects.toThrow('Failed to parse RSS feed')
    })

    it('should handle timeout errors', async () => {
      feedParser.rssParser.parseURL = jest.fn().mockImplementation(() =>
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      )

      const feedConfig = {
        name: 'Test Feed',
        url: 'https://slow-feed.com/rss',
        category: 'test',
        timeout: 50
      }

      await expect(feedParser.parseFeed(feedConfig))
        .rejects.toThrow('Failed to parse RSS feed')
    })
  })

  describe('enrichFeedItems', () => {
    it('should enrich feed items with metadata', () => {
      const rawItems = [
        {
          title: 'AI Research Paper',
          description: 'New breakthrough in machine learning',
          link: 'https://example.com/paper',
          pubDate: new Date('2025-07-06T00:00:00Z'),
          guid: 'paper-1'
        }
      ]

      const feedConfig = {
        name: 'Research Feed',
        category: 'research',
        priority: 'high'
      }

      const enrichedItems = feedParser.enrichFeedItems(rawItems, feedConfig)

      expect(enrichedItems).toHaveLength(1)
      expect(enrichedItems[0]).toHaveProperty('feedName', 'Research Feed')
      expect(enrichedItems[0]).toHaveProperty('category', 'research')
      expect(enrichedItems[0]).toHaveProperty('priority', 'high')
      expect(enrichedItems[0]).toHaveProperty('processedAt')
      expect(enrichedItems[0]).toHaveProperty('wordCount')
      expect(enrichedItems[0]).toHaveProperty('estimatedReadTime')
    })

    it('should calculate word count and reading time', () => {
      const rawItems = [
        {
          title: 'Test Article',
          description: 'This is a test description with multiple words for testing purposes',
          link: 'https://example.com/test'
        }
      ]

      const feedConfig = { name: 'Test', category: 'test' }
      const enrichedItems = feedParser.enrichFeedItems(rawItems, feedConfig)

      expect(enrichedItems[0].wordCount).toBeGreaterThan(0)
      expect(enrichedItems[0].estimatedReadTime).toBeGreaterThan(0)
    })
  })

  describe('parseMultipleFeeds', () => {
    it('should parse multiple feeds concurrently', async () => {
      const feedConfigs = [
        {
          name: 'Feed 1',
          url: 'https://example1.com/rss',
          category: 'test',
          enabled: true
        },
        {
          name: 'Feed 2',
          url: 'https://example2.com/rss',
          category: 'test',
          enabled: true
        },
        {
          name: 'Feed 3',
          url: 'https://example3.com/rss',
          category: 'test',
          enabled: false // disabled feed
        }
      ]

      // Mock successful parsing for enabled feeds
      feedParser.parseFeed = jest.fn()
        .mockResolvedValueOnce({
          metadata: { title: 'Feed 1' },
          items: [{ title: 'Article 1' }]
        })
        .mockResolvedValueOnce({
          metadata: { title: 'Feed 2' },
          items: [{ title: 'Article 2' }]
        })

      const results = await feedParser.parseMultipleFeeds(feedConfigs)

      expect(results).toHaveLength(2) // Only enabled feeds
      expect(feedParser.parseFeed).toHaveBeenCalledTimes(2)
    })

    it('should handle individual feed failures gracefully', async () => {
      const feedConfigs = [
        {
          name: 'Good Feed',
          url: 'https://good.com/rss',
          category: 'test',
          enabled: true
        },
        {
          name: 'Bad Feed',
          url: 'https://bad.com/rss',
          category: 'test',
          enabled: true
        }
      ]

      feedParser.parseWithRetry = jest.fn()
        .mockResolvedValueOnce({
          metadata: { title: 'Good Feed' },
          items: [{ title: 'Good Article' }]
        })
        .mockRejectedValueOnce(new Error('Bad feed error'))

      const results = await feedParser.parseMultipleFeeds(feedConfigs)

      expect(results).toHaveLength(2) // Both successful and failed feeds returned
      expect(results[0].metadata.title).toBe('Good Feed')
      expect(results[1].success).toBe(false)
      expect(results[1].error).toBe('Bad feed error')
    })
  })

  describe('retry mechanism', () => {
    it('should retry failed requests according to config', async () => {
      const feedConfig = {
        name: 'Retry Feed',
        url: 'https://retry.com/rss',
        category: 'test',
        retryAttempts: 3
      }

      let attemptCount = 0
      feedParser.parseFeed = jest.fn().mockImplementation(async () => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('Temporary failure')
        }
        return { metadata: { title: 'Success' }, items: [] }
      })

      const result = await feedParser.parseWithRetry(feedConfig)

      expect(attemptCount).toBe(3)
      expect(result.metadata.title).toBe('Success')
    })

    it('should fail after maximum retry attempts', async () => {
      const feedConfig = {
        name: 'Failing Feed',
        url: 'https://failing.com/rss',
        category: 'test',
        retryAttempts: 2
      }

      feedParser.parseFeed = jest.fn()
        .mockRejectedValue(new Error('Persistent failure'))

      await expect(feedParser.parseWithRetry(feedConfig))
        .rejects.toThrow('Max retry attempts exceeded')

      expect(feedParser.parseFeed).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('should log errors appropriately', async () => {
      const loggerWarnSpy = jest.spyOn(feedParser.logger, 'warn')

      const feedConfig = {
        name: 'Error Feed',
        url: 'https://error.com/rss',
        category: 'test',
        retryAttempts: 2
      }

      feedParser.parseFeed = jest.fn()
        .mockRejectedValue(new Error('Test error'))

      try {
        await feedParser.parseWithRetry(feedConfig)
      } catch (error) {
        // Expected to fail
      }

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Feed parsing failed'),
        expect.objectContaining({
          feedName: 'Error Feed',
          error: expect.any(Error),
          attempt: expect.any(Number),
          maxRetries: expect.any(Number)
        })
      )
    })
  })
})
