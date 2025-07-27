const UrlShortener = require('../../src/services/url-shortener')
const axios = require('axios')
const logger = require('../../src/utils/logger').default

// Mock dependencies
jest.mock('axios')
jest.mock('../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

describe('UrlShortener', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset service config and cache
    UrlShortener.config = {
      enabled: true,
      provider: 'tinyurl',
      bitly: {
        accessToken: 'test-token'
      },
      custom: {
        apiUrl: 'https://custom.short/api',
        responseField: 'data.shortUrl',
        headers: {
          'X-API-Key': 'test-key'
        },
        payload: {
          domain: 'custom.short'
        }
      }
    }
    UrlShortener.cache.clear()
  })

  describe('shortenUrl', () => {
    it('should return original URL when shortening is disabled', async () => {
      UrlShortener.config.enabled = false

      const result = await UrlShortener.shortenUrl('https://example.com')

      expect(result).toBe('https://example.com')
      expect(logger.debug).toHaveBeenCalledWith('URL shortening disabled, returning original URL')
    })

    it('should return cached URL if available', async () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://tinyurl.com/test'
      UrlShortener.cache.set(longUrl, shortUrl)

      const result = await UrlShortener.shortenUrl(longUrl)

      expect(result).toBe(shortUrl)
      expect(logger.debug).toHaveBeenCalledWith('URL found in cache')
    })

    it('should shorten URL and cache result', async () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://tinyurl.com/test'

      jest.spyOn(UrlShortener, 'performShortening').mockResolvedValue(shortUrl)

      const result = await UrlShortener.shortenUrl(longUrl)

      expect(result).toBe(shortUrl)
      expect(UrlShortener.cache.get(longUrl)).toBe(shortUrl)
      expect(logger.info).toHaveBeenCalledWith(`URL shortened: ${longUrl} -> ${shortUrl}`)
    })

    it('should return original URL on shortening failure', async () => {
      const longUrl = 'https://example.com'
      const error = new Error('Shortening failed')

      jest.spyOn(UrlShortener, 'performShortening').mockRejectedValue(error)

      const result = await UrlShortener.shortenUrl(longUrl)

      expect(result).toBe(longUrl)
      expect(logger.error).toHaveBeenCalledWith('URL shortening failed:', error)
    })
  })

  describe('performShortening', () => {
    beforeEach(() => {
      // Reset spies before each test
      jest.restoreAllMocks()
    })

    it('should call TinyURL provider by default', async () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://tinyurl.com/test'

      jest.spyOn(UrlShortener, 'shortenWithTinyUrl').mockResolvedValue(shortUrl)

      const result = await UrlShortener.performShortening(longUrl)

      expect(UrlShortener.shortenWithTinyUrl).toHaveBeenCalledWith(longUrl)
      expect(result).toBe(shortUrl)
    })

    it('should call Bitly provider when configured', async () => {
      UrlShortener.config.provider = 'bitly'
      const longUrl = 'https://example.com'
      const shortUrl = 'https://bit.ly/test'

      jest.spyOn(UrlShortener, 'shortenWithBitly').mockResolvedValue(shortUrl)

      const result = await UrlShortener.performShortening(longUrl)

      expect(UrlShortener.shortenWithBitly).toHaveBeenCalledWith(longUrl)
      expect(result).toBe(shortUrl)
    })

    it('should call Is.gd provider when configured', async () => {
      UrlShortener.config.provider = 'isgd'
      const longUrl = 'https://example.com'
      const shortUrl = 'https://is.gd/test'

      jest.spyOn(UrlShortener, 'shortenWithIsGd').mockResolvedValue(shortUrl)

      const result = await UrlShortener.performShortening(longUrl)

      expect(UrlShortener.shortenWithIsGd).toHaveBeenCalledWith(longUrl)
      expect(result).toBe(shortUrl)
    })

    it('should call custom provider when configured', async () => {
      UrlShortener.config.provider = 'custom'
      const longUrl = 'https://example.com'
      const shortUrl = 'https://custom.short/test'

      jest.spyOn(UrlShortener, 'shortenWithCustom').mockResolvedValue(shortUrl)

      const result = await UrlShortener.performShortening(longUrl)

      expect(UrlShortener.shortenWithCustom).toHaveBeenCalledWith(longUrl)
      expect(result).toBe(shortUrl)
    })

    it('should throw error for unsupported provider', async () => {
      UrlShortener.config.provider = 'unsupported'

      await expect(UrlShortener.performShortening('https://example.com'))
        .rejects.toThrow('Unsupported URL shortening provider: unsupported')
    })
  })

  describe('shortenWithTinyUrl', () => {
    beforeEach(() => {
      jest.restoreAllMocks()
    })

    it('should shorten URL with TinyURL', async () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://tinyurl.com/test'

      axios.get.mockResolvedValue({ data: shortUrl })

      const result = await UrlShortener.shortenWithTinyUrl(longUrl)

      expect(axios.get).toHaveBeenCalledWith(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
        { timeout: 5000 }
      )
      expect(result).toBe(shortUrl)
    })

    it('should handle TinyURL errors', async () => {
      const longUrl = 'https://example.com'

      axios.get.mockResolvedValue({ data: 'Error: Invalid URL' })

      await expect(UrlShortener.shortenWithTinyUrl(longUrl))
        .rejects.toThrow('TinyURL error: Error: Invalid URL')
    })
  })

  describe('shortenWithBitly', () => {
    beforeEach(() => {
      jest.restoreAllMocks()
    })

    it('should shorten URL with Bitly', async () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://bit.ly/test'

      axios.post.mockResolvedValue({ data: { link: shortUrl } })

      const result = await UrlShortener.shortenWithBitly(longUrl)

      expect(axios.post).toHaveBeenCalledWith(
        'https://api-ssl.bitly.com/v4/shorten',
        { long_url: longUrl },
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      )
      expect(result).toBe(shortUrl)
    })

    it('should throw error when access token is not configured', async () => {
      delete UrlShortener.config.bitly.accessToken

      await expect(UrlShortener.shortenWithBitly('https://example.com'))
        .rejects.toThrow('Bitly access token not configured')
    })
  })

  describe('shortenWithIsGd', () => {
    beforeEach(() => {
      jest.restoreAllMocks()
    })

    it('should shorten URL with Is.gd', async () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://is.gd/test'

      axios.post.mockResolvedValue({ data: shortUrl })

      const result = await UrlShortener.shortenWithIsGd(longUrl)

      expect(axios.post).toHaveBeenCalledWith(
        'https://is.gd/create.php',
        `format=simple&url=${encodeURIComponent(longUrl)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 5000
        }
      )
      expect(result).toBe(shortUrl)
    })

    it('should handle Is.gd errors', async () => {
      const longUrl = 'https://example.com'

      axios.post.mockResolvedValue({ data: 'Error: Invalid URL' })

      await expect(UrlShortener.shortenWithIsGd(longUrl))
        .rejects.toThrow('Is.gd error: Error: Invalid URL')
    })
  })

  describe('shortenWithCustom', () => {
    beforeEach(() => {
      jest.restoreAllMocks()
    })

    it('should shorten URL with custom provider', async () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://custom.short/test'

      axios.post.mockResolvedValue({
        data: {
          data: {
            shortUrl
          }
        }
      })

      const result = await UrlShortener.shortenWithCustom(longUrl)

      expect(axios.post).toHaveBeenCalledWith(
        'https://custom.short/api',
        {
          url: longUrl,
          domain: 'custom.short'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key'
          },
          timeout: 5000
        }
      )
      expect(result).toBe(shortUrl)
    })

    it('should throw error when API URL is not configured', async () => {
      delete UrlShortener.config.custom.apiUrl

      await expect(UrlShortener.shortenWithCustom('https://example.com'))
        .rejects.toThrow('Custom URL shortener API URL not configured')
    })

    it('should throw error when short URL not found in response', async () => {
      axios.post.mockResolvedValue({ data: { error: 'Failed' } })

      await expect(UrlShortener.shortenWithCustom('https://example.com'))
        .rejects.toThrow('Short URL not found in response')
    })
  })

  describe('extractShortUrl', () => {
    it('should extract simple field', () => {
      const data = { shortUrl: 'https://short.ly/test' }

      const result = UrlShortener.extractShortUrl(data, 'shortUrl')

      expect(result).toBe('https://short.ly/test')
    })

    it('should extract nested field', () => {
      const data = { data: { shortUrl: 'https://short.ly/test' } }

      const result = UrlShortener.extractShortUrl(data, 'data.shortUrl')

      expect(result).toBe('https://short.ly/test')
    })

    it('should return entire response when no field specified', () => {
      const data = 'https://short.ly/test'

      const result = UrlShortener.extractShortUrl(data, null)

      expect(result).toBe('https://short.ly/test')
    })

    it('should return null for missing field', () => {
      const data = { error: 'Failed' }

      const result = UrlShortener.extractShortUrl(data, 'data.shortUrl')

      expect(result).toBeNull()
    })
  })

  describe('addToCache', () => {
    it('should add URL to cache', () => {
      const longUrl = 'https://example.com'
      const shortUrl = 'https://short.ly/test'

      UrlShortener.addToCache(longUrl, shortUrl)

      expect(UrlShortener.cache.get(longUrl)).toBe(shortUrl)
    })

    it('should remove oldest entry when cache is full', () => {
      UrlShortener.maxCacheSize = 2

      UrlShortener.addToCache('url1', 'short1')
      UrlShortener.addToCache('url2', 'short2')
      UrlShortener.addToCache('url3', 'short3')

      expect(UrlShortener.cache.has('url1')).toBe(false)
      expect(UrlShortener.cache.has('url2')).toBe(true)
      expect(UrlShortener.cache.has('url3')).toBe(true)
    })
  })

  describe('clearCache', () => {
    it('should clear cache', () => {
      UrlShortener.cache.set('test', 'value')

      UrlShortener.clearCache()

      expect(UrlShortener.cache.size).toBe(0)
      expect(logger.info).toHaveBeenCalledWith('URL shortener cache cleared')
    })
  })

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      UrlShortener.cache.set('test1', 'value1')
      UrlShortener.cache.set('test2', 'value2')

      const stats = UrlShortener.getCacheStats()

      expect(stats).toEqual({
        size: 2,
        maxSize: UrlShortener.maxCacheSize,
        hitRate: 0
      })
    })
  })

  describe('expandUrl', () => {
    it('should expand short URL', async () => {
      const shortUrl = 'https://short.ly/test'
      const longUrl = 'https://example.com'

      axios.head.mockResolvedValue({
        headers: { location: longUrl }
      })

      const result = await UrlShortener.expandUrl(shortUrl)

      expect(axios.head).toHaveBeenCalledWith(shortUrl, {
        maxRedirects: 0,
        validateStatus: expect.any(Function)
      })
      expect(result).toBe(longUrl)
    })

    it('should return original URL when no redirect', async () => {
      const shortUrl = 'https://short.ly/test'

      axios.head.mockResolvedValue({ headers: {} })

      const result = await UrlShortener.expandUrl(shortUrl)

      expect(result).toBe(shortUrl)
    })

    it('should handle expansion errors', async () => {
      const shortUrl = 'https://short.ly/test'
      const longUrl = 'https://example.com'
      const error = new Error('Request failed')
      error.response = { headers: { location: longUrl } }

      axios.head.mockRejectedValue(error)

      const result = await UrlShortener.expandUrl(shortUrl)

      expect(result).toBe(longUrl)
    })

    it('should return original URL on expansion failure', async () => {
      const shortUrl = 'https://short.ly/test'
      const error = new Error('Request failed')

      axios.head.mockRejectedValue(error)

      const result = await UrlShortener.expandUrl(shortUrl)

      expect(result).toBe(shortUrl)
      expect(logger.error).toHaveBeenCalledWith('URL expansion failed:', error)
    })
  })

  describe('validateUrl', () => {
    it('should validate valid URLs', async () => {
      const validUrls = [
        'https://example.com',
        'http://test.org',
        'https://sub.domain.com/path?query=value'
      ]

      for (const url of validUrls) {
        const result = await UrlShortener.validateUrl(url)
        expect(result).toBe(true)
      }
    })

    it('should reject invalid URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        '',
        null,
        undefined
      ]

      for (const url of invalidUrls) {
        const result = await UrlShortener.validateUrl(url)
        expect(result).toBe(false)
      }
    })
  })

  describe('shortenUrlsInText', () => {
    it('should shorten URLs found in text', async () => {
      const text = 'Check out https://example.com and https://test.org for more info'
      const expectedText = 'Check out https://short.ly/1 and https://short.ly/2 for more info'

      jest.spyOn(UrlShortener, 'shortenUrl')
        .mockResolvedValueOnce('https://short.ly/1')
        .mockResolvedValueOnce('https://short.ly/2')

      const result = await UrlShortener.shortenUrlsInText(text)

      expect(UrlShortener.shortenUrl).toHaveBeenCalledWith('https://example.com')
      expect(UrlShortener.shortenUrl).toHaveBeenCalledWith('https://test.org')
      expect(result).toBe(expectedText)
    })

    it('should return original text when no URLs found', async () => {
      const text = 'This text has no URLs in it'

      const result = await UrlShortener.shortenUrlsInText(text)

      expect(result).toBe(text)
    })

    it('should handle shortening errors gracefully', async () => {
      const text = 'Check out https://example.com'
      const error = new Error('Shortening failed')

      jest.spyOn(UrlShortener, 'shortenUrl').mockRejectedValue(error)

      const result = await UrlShortener.shortenUrlsInText(text)

      expect(result).toBe(text) // Original text should be returned
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to shorten URL in text: https://example.com',
        error
      )
    })
  })

  describe('bulkShortenUrls', () => {
    it('should shorten multiple URLs', async () => {
      const urls = ['https://example.com', 'https://test.org']

      jest.spyOn(UrlShortener, 'shortenUrl')
        .mockResolvedValueOnce('https://short.ly/1')
        .mockResolvedValueOnce('https://short.ly/2')

      const results = await UrlShortener.bulkShortenUrls(urls)

      expect(results).toEqual([
        {
          original: 'https://example.com',
          shortened: 'https://short.ly/1',
          success: true
        },
        {
          original: 'https://test.org',
          shortened: 'https://short.ly/2',
          success: true
        }
      ])
    })

    it('should handle failures in bulk shortening', async () => {
      const urls = ['https://example.com', 'https://invalid.url']
      const error = new Error('Shortening failed')

      jest.spyOn(UrlShortener, 'shortenUrl')
        .mockResolvedValueOnce('https://short.ly/1')
        .mockRejectedValueOnce(error)

      const results = await UrlShortener.bulkShortenUrls(urls)

      expect(results).toEqual([
        {
          original: 'https://example.com',
          shortened: 'https://short.ly/1',
          success: true
        },
        {
          original: 'https://invalid.url',
          shortened: 'https://invalid.url',
          success: false,
          error: 'Shortening failed'
        }
      ])
    })
  })

  describe('getProviderStats', () => {
    it('should return provider statistics', () => {
      const stats = UrlShortener.getProviderStats()

      expect(stats).toEqual({
        provider: 'tinyurl',
        enabled: true,
        cache: expect.objectContaining({
          size: expect.any(Number),
          maxSize: expect.any(Number),
          hitRate: expect.any(Number)
        }),
        config: {
          provider: 'tinyurl',
          maxCacheSize: UrlShortener.maxCacheSize
        }
      })
    })
  })

  describe('testProvider', () => {
    it('should test provider successfully', async () => {
      const shortUrl = 'https://short.ly/test'

      jest.spyOn(UrlShortener, 'shortenUrl').mockResolvedValue(shortUrl)

      const result = await UrlShortener.testProvider()

      expect(result).toEqual({
        success: true,
        testUrl: 'https://example.com/test',
        shortUrl,
        provider: 'tinyurl'
      })
    })

    it('should handle provider test failure', async () => {
      const error = new Error('Provider test failed')

      jest.spyOn(UrlShortener, 'shortenUrl').mockRejectedValue(error)

      const result = await UrlShortener.testProvider()

      expect(result).toEqual({
        success: false,
        testUrl: 'https://example.com/test',
        error: 'Provider test failed',
        provider: 'tinyurl'
      })
    })
  })
})
