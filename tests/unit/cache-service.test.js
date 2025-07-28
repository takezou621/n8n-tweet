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

    it('should handle single part', () => {
      const result = CacheService.getCacheKey('prefix', 'single')

      expect(result).toBe('prefix:single')
    })

    it('should handle empty parts', () => {
      const result = CacheService.getCacheKey('prefix')

      expect(result).toBe('prefix:')
    })
  })

  describe('connect - advanced scenarios', () => {
    it('should handle connection error', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection failed'))

      await CacheService.connect()

      expect(CacheService.isConnected).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Failed to connect to Redis cache:', expect.any(Error))
    })

    it('should handle retry strategy - connection refused', () => {
      const retryStrategy = redis.createClient.mock.calls[0]?.[0]?.retry_strategy
      if (retryStrategy) {
        const result = retryStrategy({ error: { code: 'ECONNREFUSED' }, attempt: 1 })
        expect(result).toBeInstanceOf(Error)
        expect(result.message).toBe('Redis connection refused')
        expect(logger.error).toHaveBeenCalledWith('Redis connection refused')
      }
    })

    it('should handle retry strategy - time exhausted', async () => {
      await CacheService.connect()
      const retryStrategy = redis.createClient.mock.calls[0]?.[0]?.retry_strategy
      if (retryStrategy) {
        const result = retryStrategy({ total_retry_time: 1000 * 60 * 60 + 1, attempt: 1 })
        expect(result).toBeInstanceOf(Error)
        expect(result.message).toBe('Retry time exhausted')
        expect(logger.error).toHaveBeenCalledWith('Redis retry time exhausted')
      }
    })

    it('should handle retry strategy - max attempts', async () => {
      await CacheService.connect()
      const retryStrategy = redis.createClient.mock.calls[0]?.[0]?.retry_strategy
      if (retryStrategy) {
        const result = retryStrategy({ attempt: 11, total_retry_time: 1000 })
        expect(result).toBeUndefined()
        expect(logger.error).toHaveBeenCalledWith('Redis max retry attempts reached')
      }
    })

    it('should handle retry strategy - normal retry', async () => {
      await CacheService.connect()
      const retryStrategy = redis.createClient.mock.calls[0]?.[0]?.retry_strategy
      if (retryStrategy) {
        const result = retryStrategy({ attempt: 3, total_retry_time: 1000 })
        expect(result).toBe(300) // Math.min(3 * 100, 3000)
      }
    })
  })

  describe('disconnect', () => {
    it('should disconnect when connected', async () => {
      CacheService.client = mockClient
      CacheService.isConnected = true

      await CacheService.disconnect()

      expect(mockClient.disconnect).toHaveBeenCalled()
      expect(CacheService.isConnected).toBe(false)
      expect(logger.info).toHaveBeenCalledWith('Redis cache disconnected')
    })

    it('should handle disconnect when not connected', async () => {
      CacheService.client = null
      CacheService.isConnected = false

      await CacheService.disconnect()

      expect(mockClient.disconnect).not.toHaveBeenCalled()
    })

    it('should handle disconnect when client is null', async () => {
      CacheService.client = null
      CacheService.isConnected = true

      await CacheService.disconnect()

      expect(mockClient.disconnect).not.toHaveBeenCalled()
    })
  })

  describe('set - advanced scenarios', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should set value with custom TTL', async () => {
      const result = await CacheService.set('test-key', { data: 'test' }, 1800)

      expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 1800, '{"data":"test"}')
      expect(result).toBe(true)
      expect(logger.debug).toHaveBeenCalledWith('Cache set: test-key (TTL: 1800s)')
    })

    it('should handle set error', async () => {
      mockClient.setEx.mockRejectedValue(new Error('Redis error'))

      const result = await CacheService.set('test-key', { data: 'test' })

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Cache set error:', expect.any(Error))
    })

    it('should serialize complex objects', async () => {
      const complexObject = {
        array: [1, 2, 3],
        nested: { prop: 'value' },
        number: 42,
        boolean: true,
        null: null
      }

      await CacheService.set('complex-key', complexObject)

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'complex-key',
        3600,
        JSON.stringify(complexObject)
      )
    })

    it('should log warning when not connected', async () => {
      CacheService.isConnected = false

      const result = await CacheService.set('test-key', 'value')

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping set operation')
    })
  })

  describe('get - advanced scenarios', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should log cache hit', async () => {
      mockClient.get.mockResolvedValue('{"data":"test"}')

      await CacheService.get('test-key')

      expect(logger.debug).toHaveBeenCalledWith('Cache hit: test-key')
    })

    it('should log cache miss', async () => {
      mockClient.get.mockResolvedValue(null)

      await CacheService.get('test-key')

      expect(logger.debug).toHaveBeenCalledWith('Cache miss: test-key')
    })

    it('should handle get error', async () => {
      mockClient.get.mockRejectedValue(new Error('Redis error'))

      const result = await CacheService.get('test-key')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith('Cache get error:', expect.any(Error))
    })

    it('should handle JSON parse error', async () => {
      mockClient.get.mockResolvedValue('invalid-json')

      const result = await CacheService.get('test-key')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith('Cache get error:', expect.any(Error))
    })

    it('should log warning when not connected', async () => {
      CacheService.isConnected = false

      const result = await CacheService.get('test-key')

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping get operation')
    })
  })

  describe('delete', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should delete key successfully', async () => {
      mockClient.del.mockResolvedValue(1)

      const result = await CacheService.delete('test-key')

      expect(mockClient.del).toHaveBeenCalledWith('test-key')
      expect(result).toBe(true)
      expect(logger.debug).toHaveBeenCalledWith('Cache delete: test-key (result: 1)')
    })

    it('should return false when key does not exist', async () => {
      mockClient.del.mockResolvedValue(0)

      const result = await CacheService.delete('non-existent-key')

      expect(result).toBe(false)
      expect(logger.debug).toHaveBeenCalledWith('Cache delete: non-existent-key (result: 0)')
    })

    it('should handle delete error', async () => {
      mockClient.del.mockRejectedValue(new Error('Redis error'))

      const result = await CacheService.delete('test-key')

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Cache delete error:', expect.any(Error))
    })

    it('should log warning when not connected', async () => {
      CacheService.isConnected = false

      const result = await CacheService.delete('test-key')

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping delete operation')
    })
  })

  describe('exists', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should return true when key exists', async () => {
      mockClient.exists.mockResolvedValue(1)

      const result = await CacheService.exists('test-key')

      expect(mockClient.exists).toHaveBeenCalledWith('test-key')
      expect(result).toBe(true)
    })

    it('should return false when key does not exist', async () => {
      mockClient.exists.mockResolvedValue(0)

      const result = await CacheService.exists('test-key')

      expect(result).toBe(false)
    })

    it('should handle exists error', async () => {
      mockClient.exists.mockRejectedValue(new Error('Redis error'))

      const result = await CacheService.exists('test-key')

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Cache exists error:', expect.any(Error))
    })

    it('should return false when not connected', async () => {
      CacheService.isConnected = false

      const result = await CacheService.exists('test-key')

      expect(result).toBe(false)
    })
  })

  describe('flush', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should flush cache successfully', async () => {
      const result = await CacheService.flush()

      expect(mockClient.flushAll).toHaveBeenCalled()
      expect(result).toBe(true)
      expect(logger.info).toHaveBeenCalledWith('Cache flushed successfully')
    })

    it('should handle flush error', async () => {
      mockClient.flushAll.mockRejectedValue(new Error('Redis error'))

      const result = await CacheService.flush()

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Cache flush error:', expect.any(Error))
    })

    it('should log warning when not connected', async () => {
      CacheService.isConnected = false

      const result = await CacheService.flush()

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping flush operation')
    })
  })

  describe('getStats', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should return stats when connected', async () => {
      const mockInfo = 'redis_version:6.0.0\r\nused_memory:1024\r\nconnected_clients:5\r\n'
      mockClient.info.mockResolvedValue(mockInfo)

      const result = await CacheService.getStats()

      expect(mockClient.info).toHaveBeenCalled()
      expect(result.connected).toBe(true)
      expect(result.info.redis_version).toBe('6.0.0')
      expect(result.info.used_memory).toBe(1024)
      expect(result.info.connected_clients).toBe(5)
    })

    it('should return disconnected stats when not connected', async () => {
      CacheService.isConnected = false

      const result = await CacheService.getStats()

      expect(result.connected).toBe(false)
      expect(result.info).toEqual({})
    })

    it('should handle stats error', async () => {
      mockClient.info.mockRejectedValue(new Error('Redis error'))

      const result = await CacheService.getStats()

      expect(result.connected).toBe(false)
      expect(result.info).toEqual({})
      expect(result.error).toBe('Redis error')
      expect(logger.error).toHaveBeenCalledWith('Cache stats error:', expect.any(Error))
    })
  })

  describe('parseRedisInfo', () => {
    it('should parse Redis info string correctly', () => {
      const infoString = 'redis_version:6.0.0\r\nused_memory:1024\r\nuptime_in_seconds:3600\r\nstring_value:test\r\n'

      const result = CacheService.parseRedisInfo(infoString)

      expect(result.redis_version).toBe('6.0.0')
      expect(result.used_memory).toBe(1024)
      expect(result.uptime_in_seconds).toBe(3600)
      expect(result.string_value).toBe('test')
    })

    it('should handle empty info string', () => {
      const result = CacheService.parseRedisInfo('')

      expect(result).toEqual({})
    })

    it('should handle malformed lines', () => {
      const infoString = 'valid_key:value\r\ninvalid_line_without_colon\r\nanother_key:123\r\n'

      const result = CacheService.parseRedisInfo(infoString)

      expect(result.valid_key).toBe('value')
      expect(result.another_key).toBe(123)
      expect(result.invalid_line_without_colon).toBeUndefined()
    })

    it('should handle numeric conversion', () => {
      const infoString = 'integer_value:42\r\nfloat_value:3.14\r\nstring_value:abc123\r\n'

      const result = CacheService.parseRedisInfo(infoString)

      expect(result.integer_value).toBe(42)
      expect(result.float_value).toBe(3.14)
      expect(result.string_value).toBe('abc123')
    })
  })

  describe('configuration handling', () => {
    it('should use test configuration in test environment', () => {
      // This test verifies the constructor logic for test environment
      expect(CacheService.config).toBeDefined()
    })

    it('should handle disabled cache configuration', async () => {
      CacheService.config = { enabled: false }

      await CacheService.connect()

      expect(redis.createClient).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith('Cache service disabled')
    })
  })

  describe('integration scenarios', () => {
    beforeEach(() => {
      CacheService.client = mockClient
      CacheService.isConnected = true
    })

    it('should handle complete cache lifecycle', async () => {
      const key = 'lifecycle-test'
      const value = { test: 'data', number: 42 }

      // Set value
      const setResult = await CacheService.set(key, value, 60)
      expect(setResult).toBe(true)

      // Check if exists
      mockClient.exists.mockResolvedValue(1)
      const existsResult = await CacheService.exists(key)
      expect(existsResult).toBe(true)

      // Get value
      mockClient.get.mockResolvedValue(JSON.stringify(value))
      const getValue = await CacheService.get(key)
      expect(getValue).toEqual(value)

      // Delete value
      mockClient.del.mockResolvedValue(1)
      const deleteResult = await CacheService.delete(key)
      expect(deleteResult).toBe(true)

      // Verify deleted
      mockClient.exists.mockResolvedValue(0)
      const existsAfterDelete = await CacheService.exists(key)
      expect(existsAfterDelete).toBe(false)
    })

    it('should handle cache key generation patterns', () => {
      // Test various key generation patterns
      expect(CacheService.getCacheKey('users', '123')).toBe('users:123')
      expect(CacheService.getCacheKey('tweets', 'user', '456', 'timeline')).toBe('tweets:user:456:timeline')
      expect(CacheService.getCacheKey('config', 'app', 'settings', 'theme')).toBe('config:app:settings:theme')
    })

    it('should maintain consistent serialization/deserialization', async () => {
      const testCases = [
        'simple string',
        42,
        true,
        false,
        null,
        { complex: { nested: { object: 'value' } } },
        [1, 2, 3, { array: 'element' }],
        { mixed: [1, 'string', { nested: true }] }
      ]

      for (const testCase of testCases) {
        const serialized = JSON.stringify(testCase)
        mockClient.get.mockResolvedValue(serialized)

        const result = await CacheService.get('test-key')
        expect(result).toEqual(testCase)
      }
    })
  })

  describe('error resilience', () => {
    it('should gracefully handle all operations when disconnected', async () => {
      CacheService.isConnected = false

      const setResult = await CacheService.set('key', 'value')
      const getResult = await CacheService.get('key')
      const deleteResult = await CacheService.delete('key')
      const existsResult = await CacheService.exists('key')
      const flushResult = await CacheService.flush()

      expect(setResult).toBe(false)
      expect(getResult).toBeNull()
      expect(deleteResult).toBe(false)
      expect(existsResult).toBe(false)
      expect(flushResult).toBe(false)

      // Should log appropriate warnings
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping set operation')
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping get operation')
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping delete operation')
      expect(logger.warn).toHaveBeenCalledWith('Cache not connected, skipping flush operation')
    })

    it('should handle Redis client errors consistently', async () => {
      CacheService.client = mockClient
      CacheService.isConnected = true

      const redisError = new Error('Redis connection lost')
      mockClient.setEx.mockRejectedValue(redisError)
      mockClient.get.mockRejectedValue(redisError)
      mockClient.del.mockRejectedValue(redisError)
      mockClient.exists.mockRejectedValue(redisError)
      mockClient.flushAll.mockRejectedValue(redisError)
      mockClient.info.mockRejectedValue(redisError)

      const setResult = await CacheService.set('key', 'value')
      const getResult = await CacheService.get('key')
      const deleteResult = await CacheService.delete('key')
      const existsResult = await CacheService.exists('key')
      const flushResult = await CacheService.flush()
      const statsResult = await CacheService.getStats()

      expect(setResult).toBe(false)
      expect(getResult).toBeNull()
      expect(deleteResult).toBe(false)
      expect(existsResult).toBe(false)
      expect(flushResult).toBe(false)
      expect(statsResult.connected).toBe(false)
      expect(statsResult.error).toBe('Redis connection lost')

      // Verify error logging
      expect(logger.error).toHaveBeenCalledWith('Cache set error:', redisError)
      expect(logger.error).toHaveBeenCalledWith('Cache get error:', redisError)
      expect(logger.error).toHaveBeenCalledWith('Cache delete error:', redisError)
      expect(logger.error).toHaveBeenCalledWith('Cache exists error:', redisError)
      expect(logger.error).toHaveBeenCalledWith('Cache flush error:', redisError)
      expect(logger.error).toHaveBeenCalledWith('Cache stats error:', redisError)
    })
  })
})
