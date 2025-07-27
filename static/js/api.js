/**
 * Dashboard API Client
 * 
 * ダッシュボード用API通信ライブラリ
 * RESTful APIとのデータ通信を管理
 */

class DashboardAPI {
  constructor() {
    this.baseURL = window.location.origin + '/api/v1'
    this.timeout = 10000 // 10秒タイムアウト
  }

  /**
   * 汎用HTTP リクエスト
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: this.timeout,
      ...options
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)
      
      const response = await fetch(url, {
        ...config,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error)
      throw error
    }
  }

  /**
   * システムヘルス取得
   */
  async getSystemHealth() {
    return await this.request('/health')
  }

  /**
   * コンポーネント別ヘルス取得
   */
  async getComponentHealth(component) {
    return await this.request(`/health/${component}`)
  }

  /**
   * システムメトリクス取得
   */
  async getMetrics(timeRange = '1h') {
    return await this.request(`/metrics?timeRange=${timeRange}`)
  }

  /**
   * 統計情報取得
   */
  async getStatistics(period = 'last_24_hours') {
    return await this.request(`/statistics?period=${period}`)
  }

  /**
   * ツイート履歴取得
   */
  async getTweets(options = {}) {
    const params = new URLSearchParams()
    
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value)
      }
    })

    const queryString = params.toString()
    const endpoint = queryString ? `/tweets?${queryString}` : '/tweets'
    
    return await this.request(endpoint)
  }

  /**
   * RSSフィード状況取得
   */
  async getFeeds() {
    return await this.request('/feeds')
  }
}

/**
 * データフォーマッター
 * 
 * API レスポンスを UI 表示用に変換
 */
class DataFormatters {
  /**
   * ヘルスデータフォーマット
   */
  static formatHealthData(response) {
    if (!response || !response.data) {
      return {
        overall: 'error',
        components: {}
      }
    }

    const data = response.data
    
    return {
      overall: data.overall || 'unknown',
      components: {
        system: {
          status: data.system?.status || 'unknown',
          responseTime: data.system?.responseTime,
          uptime: data.system?.uptime,
          version: data.system?.version
        },
        redis: {
          status: data.redis?.status || 'unknown',
          responseTime: data.redis?.responseTime,
          version: data.redis?.version
        },
        n8n: {
          status: data.n8n?.status || 'unknown',
          responseTime: data.n8n?.responseTime,
          version: data.n8n?.version
        },
        twitter: {
          status: data.twitter?.status || 'unknown',
          responseTime: data.twitter?.responseTime,
          rateLimitRemaining: data.twitter?.rateLimitRemaining
        }
      }
    }
  }

  /**
   * メトリクスデータフォーマット
   */
  static formatMetricsData(response) {
    if (!response || !response.data) {
      return {
        memory: { used: 0, percentage: 0 },
        cpu: { usage: 0 },
        uptime: 0,
        tweets: { today: 0 }
      }
    }

    const data = response.data
    
    return {
      memory: {
        used: data.memory?.used || 0,
        total: data.memory?.total || 0,
        percentage: data.memory?.percentage || 0
      },
      cpu: {
        usage: data.cpu?.usage || 0,
        loadAverage: data.cpu?.loadAverage || 0
      },
      uptime: data.uptime || 0,
      tweets: {
        today: data.tweets?.today || 0,
        total: data.tweets?.total || 0,
        success: data.tweets?.success || 0,
        failed: data.tweets?.failed || 0
      },
      network: {
        bytesReceived: data.network?.bytesReceived || 0,
        bytesSent: data.network?.bytesSent || 0
      }
    }
  }

  /**
   * ツイートデータフォーマット
   */
  static formatTweetData(response) {
    if (!response || !response.data || !Array.isArray(response.data)) {
      return []
    }

    return response.data.map(tweet => ({
      id: tweet.id,
      content: tweet.content || tweet.text || '',
      status: tweet.status || 'unknown',
      category: tweet.category || 'uncategorized',
      createdAt: tweet.createdAt || tweet.timestamp,
      url: tweet.url || tweet.link,
      metrics: {
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0
      },
      source: {
        feedName: tweet.feedName,
        originalUrl: tweet.originalUrl
      }
    }))
  }

  /**
   * フィードデータフォーマット
   */
  static formatFeedsData(response) {
    if (!response || !response.data || !Array.isArray(response.data)) {
      return []
    }

    return response.data.map(feed => ({
      id: feed.id,
      name: feed.name || 'Unknown Feed',
      url: feed.url,
      status: feed.status || 'unknown',
      enabled: feed.enabled !== false,
      lastUpdate: feed.lastUpdate || feed.lastFetch,
      itemCount: feed.itemCount || feed.items?.length || 0,
      errorCount: feed.errorCount || 0,
      successRate: feed.successRate || 0,
      averageResponseTime: feed.averageResponseTime || 0,
      categories: feed.categories || [],
      lastError: feed.lastError
    }))
  }

  /**
   * 統計データフォーマット
   */
  static formatStatisticsData(response) {
    if (!response || !response.data) {
      return {
        tweets: { total: 0, successful: 0, failed: 0 },
        system: { uptime: 0, memory: 0, cpu: 0 },
        feeds: { active: 0, total: 0, errors: 0 }
      }
    }

    const data = response.data

    return {
      tweets: {
        total: data.tweets?.total || 0,
        successful: data.tweets?.successful || 0,
        failed: data.tweets?.failed || 0,
        pending: data.tweets?.pending || 0
      },
      system: {
        uptime: data.system?.uptime || 0,
        memory: data.system?.memory?.used || 0,
        cpu: data.system?.cpu?.usage || 0
      },
      feeds: {
        active: data.feeds?.active || 0,
        total: data.feeds?.total || 0,
        errors: data.feeds?.errors || 0
      },
      performance: {
        averageResponseTime: data.performance?.averageResponseTime || 0,
        successRate: data.performance?.successRate || 0
      }
    }
  }

  /**
   * エラーレスポンスフォーマット
   */
  static formatErrorResponse(error) {
    return {
      type: 'error',
      message: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      details: error.details || null
    }
  }

  /**
   * 時間フォーマット
   */
  static formatTime(timestamp) {
    if (!timestamp) return '不明'
    
    try {
      const date = new Date(timestamp)
      return date.toLocaleString('ja-JP')
    } catch (error) {
      return '不正な時刻'
    }
  }

  /**
   * バイト数フォーマット
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * パーセンテージフォーマット
   */
  static formatPercentage(value, decimals = 1) {
    return `${Number(value).toFixed(decimals)}%`
  }

  /**
   * 数値フォーマット（カンマ区切り）
   */
  static formatNumber(value) {
    return Number(value).toLocaleString('ja-JP')
  }
}

// Global export for browser environment
if (typeof window !== 'undefined') {
  window.DashboardAPI = DashboardAPI
  window.DataFormatters = DataFormatters
}

// CommonJS export for Node.js environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DashboardAPI, DataFormatters }
}