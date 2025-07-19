const redis = require('redis')
const logger = require('../utils/logger').default
const config = require('../../config/production.json')

class CacheService {
  constructor () {
    this.client = null
    this.isConnected = false
    this.config = config.cache
  }

  async connect () {
    if (!this.config.enabled) {
      logger.info('Cache service disabled')
      return
    }

    try {
      this.client = redis.createClient({
        host: this.config.host,
        port: this.config.port,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis connection refused')
            return new Error('Redis connection refused')
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted')
            return new Error('Retry time exhausted')
          }
          if (options.attempt > 10) {
            logger.error('Redis max retry attempts reached')
            return undefined
          }
          return Math.min(options.attempt * 100, 3000)
        }
      })

      await this.client.connect()
      this.isConnected = true
      logger.info('Redis cache connected successfully')
    } catch (error) {
      logger.error('Failed to connect to Redis cache:', error)
      this.isConnected = false
    }
  }

  async disconnect () {
    if (this.client && this.isConnected) {
      await this.client.disconnect()
      this.isConnected = false
      logger.info('Redis cache disconnected')
    }
  }

  async set (key, value, ttl = 3600) {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping set operation')
      return false
    }

    try {
      const serializedValue = JSON.stringify(value)
      await this.client.setEx(key, ttl, serializedValue)
      logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`)
      return true
    } catch (error) {
      logger.error('Cache set error:', error)
      return false
    }
  }

  async get (key) {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping get operation')
      return null
    }

    try {
      const value = await this.client.get(key)
      if (value === null) {
        logger.debug(`Cache miss: ${key}`)
        return null
      }
      logger.debug(`Cache hit: ${key}`)
      return JSON.parse(value)
    } catch (error) {
      logger.error('Cache get error:', error)
      return null
    }
  }

  async delete (key) {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping delete operation')
      return false
    }

    try {
      const result = await this.client.del(key)
      logger.debug(`Cache delete: ${key} (result: ${result})`)
      return result > 0
    } catch (error) {
      logger.error('Cache delete error:', error)
      return false
    }
  }

  async exists (key) {
    if (!this.isConnected) {
      return false
    }

    try {
      const result = await this.client.exists(key)
      return result === 1
    } catch (error) {
      logger.error('Cache exists error:', error)
      return false
    }
  }

  async flush () {
    if (!this.isConnected) {
      logger.warn('Cache not connected, skipping flush operation')
      return false
    }

    try {
      await this.client.flushAll()
      logger.info('Cache flushed successfully')
      return true
    } catch (error) {
      logger.error('Cache flush error:', error)
      return false
    }
  }

  async getStats () {
    if (!this.isConnected) {
      return {
        connected: false,
        info: {}
      }
    }

    try {
      const info = await this.client.info()
      return {
        connected: true,
        info: this.parseRedisInfo(info)
      }
    } catch (error) {
      logger.error('Cache stats error:', error)
      return {
        connected: false,
        info: {},
        error: error.message
      }
    }
  }

  parseRedisInfo (info) {
    const lines = info.split('\r\n')
    const parsed = {}

    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':')
        parsed[key] = isNaN(value) ? value : Number(value)
      }
    })

    return parsed
  }

  getCacheKey (prefix, ...parts) {
    return `${prefix}:${parts.join(':')}`
  }
}

module.exports = new CacheService()
