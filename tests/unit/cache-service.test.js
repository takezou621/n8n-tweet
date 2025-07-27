const CacheService = require('../../src/services/cache-service')
const redis = require('redis')
const logger = require('../../src/utils/logger').default

// Mock dependencies
jest.mock('redis')
jest.mock('../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

describe('CacheService', () => {
  let mockClient

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Redis client
    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      setEx: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(1),
      flushAll: jest.fn().mockResolvedValue('OK'),
      info: jest.fn().mockResolvedValue('redis_version:6.0.0\r\nused_memory:1024\r\n')
    }

    redis.createClient.mockReturnValue(mockClient)

    // Reset connection state
    CacheService.isConnected = false
    CacheService.client = null
    CacheService.config = { enabled: true }
  })

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(CacheService.client).toBeNull()
      expect(CacheService.isConnected).toBe(false)
      expect(CacheService).toBeDefined()
    })
  })

  describe('connect', () => {
    it('should connect to Redis successfully', async () => {
      await CacheService.connect()

      expect(redis.createClient).toHaveBeenCalled()
      expect(mockClient.connect).toHaveBeenCalled()
      expect(CacheService.isConnected).toBe(true)
      expect(logger.info).toHaveBeenCalledWith('Redis cache connected successfully')
    })

    it('should skip connection when cache is disabled', async () => {
      CacheService.config.enabled = false

      await CacheService.connect()

      expect(redis.createClient).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith('Cache service disabled')
    })
  })

  describe('set', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should set value with default TTL', async () => {
      const result = await CacheService.set('test-key', { data: 'test' })

      expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 3600, '{"data":"test"}')
      expect(result).toBe(true)
    })

    it('should handle set when not connected', async () => {
      CacheService.isConnected = false

      const result = await CacheService.set('test-key', { data: 'test' })

      expect(mockClient.setEx).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })
  })

  describe('get', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should get value successfully', async () => {
      mockClient.get.mockResolvedValue('{"data":"test"}')

      const result = await CacheService.get('test-key')

      expect(mockClient.get).toHaveBeenCalledWith('test-key')
      expect(result).toEqual({ data: 'test' })
    })

    it('should handle cache miss', async () => {
      mockClient.get.mockResolvedValue(null)

      const result = await CacheService.get('test-key')

      expect(result).toBeNull()
    })
  })

  describe('getCacheKey', () => {
    it('should generate cache key with prefix and parts', () => {
      const result = CacheService.getCacheKey('tweets', 'user', '123', 'feed')

      expect(result).toBe('tweets:user:123:feed')
    })
  })
})
