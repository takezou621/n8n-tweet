const axios = require('axios')
const logger = require('../utils/logger').default
const config = require('../../config/production.json')

class UrlShortener {
  constructor () {
    this.config = config.urlShortening
    this.cache = new Map()
    this.maxCacheSize = 1000
  }

  async shortenUrl (longUrl) {
    if (!this.config.enabled) {
      logger.debug('URL shortening disabled, returning original URL')
      return longUrl
    }

    if (this.cache.has(longUrl)) {
      logger.debug('URL found in cache')
      return this.cache.get(longUrl)
    }

    try {
      const shortUrl = await this.performShortening(longUrl)
      this.addToCache(longUrl, shortUrl)
      logger.info(`URL shortened: ${longUrl} -> ${shortUrl}`)
      return shortUrl
    } catch (error) {
      logger.error('URL shortening failed:', error)
      return longUrl
    }
  }

  async performShortening (longUrl) {
    const provider = this.config.provider || 'tinyurl'

    switch (provider) {
      case 'tinyurl':
        return await this.shortenWithTinyUrl(longUrl)
      case 'bitly':
        return await this.shortenWithBitly(longUrl)
      case 'isgd':
        return await this.shortenWithIsGd(longUrl)
      case 'custom':
        return await this.shortenWithCustom(longUrl)
      default:
        throw new Error(`Unsupported URL shortening provider: ${provider}`)
    }
  }

  async shortenWithTinyUrl (longUrl) {
    const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`
    const response = await axios.get(apiUrl, {
      timeout: 5000
    })

    if (response.data.startsWith('Error')) {
      throw new Error(`TinyURL error: ${response.data}`)
    }

    return response.data
  }

  async shortenWithBitly (longUrl) {
    if (!this.config.bitly.accessToken) {
      throw new Error('Bitly access token not configured')
    }

    const response = await axios.post('https://api-ssl.bitly.com/v4/shorten', {
      long_url: longUrl
    }, {
      headers: {
        Authorization: `Bearer ${this.config.bitly.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    })

    return response.data.link
  }

  async shortenWithIsGd (longUrl) {
    const response = await axios.post('https://is.gd/create.php',
      `format=simple&url=${encodeURIComponent(longUrl)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000
      })

    if (response.data.startsWith('Error')) {
      throw new Error(`Is.gd error: ${response.data}`)
    }

    return response.data
  }

  async shortenWithCustom (longUrl) {
    if (!this.config.custom.apiUrl) {
      throw new Error('Custom URL shortener API URL not configured')
    }

    const payload = {
      url: longUrl,
      ...this.config.custom.payload
    }

    const headers = {
      'Content-Type': 'application/json',
      ...this.config.custom.headers
    }

    const response = await axios.post(this.config.custom.apiUrl, payload, {
      headers,
      timeout: 5000
    })

    const shortUrl = this.extractShortUrl(response.data, this.config.custom.responseField)

    if (!shortUrl) {
      throw new Error('Short URL not found in response')
    }

    return shortUrl
  }

  extractShortUrl (responseData, field) {
    if (!field) {
      return responseData
    }

    const fields = field.split('.')
    let value = responseData

    for (const f of fields) {
      if (value && typeof value === 'object' && f in value) {
        value = value[f]
      } else {
        return null
      }
    }

    return value
  }

  addToCache (longUrl, shortUrl) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(longUrl, shortUrl)
  }

  clearCache () {
    this.cache.clear()
    logger.info('URL shortener cache cleared')
  }

  getCacheStats () {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.calculateHitRate()
    }
  }

  calculateHitRate () {
    return 0
  }

  async expandUrl (shortUrl) {
    try {
      const response = await axios.head(shortUrl, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      })

      return response.headers.location || shortUrl
    } catch (error) {
      if (error.response && error.response.headers.location) {
        return error.response.headers.location
      }

      logger.error('URL expansion failed:', error)
      return shortUrl
    }
  }

  async validateUrl (url) {
    try {
      const parsedUrl = new URL(url)
      return Boolean(parsedUrl)
    } catch {
      return false
    }
  }

  async shortenUrlsInText (text) {
    const urlPattern = 'https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b'
    const pathPattern = '([-a-zA-Z0-9()@:%_+.~#?&//=]*)'
    const urlRegex = new RegExp(urlPattern + pathPattern, 'g')
    const urls = text.match(urlRegex)

    if (!urls) {
      return text
    }

    let modifiedText = text

    for (const url of urls) {
      try {
        const shortUrl = await this.shortenUrl(url)
        modifiedText = modifiedText.replace(url, shortUrl)
      } catch (error) {
        logger.error(`Failed to shorten URL in text: ${url}`, error)
      }
    }

    return modifiedText
  }

  async bulkShortenUrls (urls) {
    const results = []

    for (const url of urls) {
      try {
        const shortUrl = await this.shortenUrl(url)
        results.push({
          original: url,
          shortened: shortUrl,
          success: true
        })
      } catch (error) {
        results.push({
          original: url,
          shortened: url,
          success: false,
          error: error.message
        })
      }
    }

    return results
  }

  getProviderStats () {
    const provider = this.config.provider || 'tinyurl'

    return {
      provider,
      enabled: this.config.enabled,
      cache: this.getCacheStats(),
      config: {
        provider,
        maxCacheSize: this.maxCacheSize
      }
    }
  }

  async testProvider () {
    const testUrl = 'https://example.com/test'

    try {
      const shortUrl = await this.shortenUrl(testUrl)

      return {
        success: true,
        testUrl,
        shortUrl,
        provider: this.config.provider
      }
    } catch (error) {
      return {
        success: false,
        testUrl,
        error: error.message,
        provider: this.config.provider
      }
    }
  }
}

module.exports = new UrlShortener()
