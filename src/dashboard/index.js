/**
 * Dashboard API Server
 *
 * Features:
 * - REST API endpoints for metrics and system monitoring
 * - Real-time metrics data serving
 * - Health check endpoints
 * - Integration with MetricsCollector and HealthChecker
 */

const express = require('express')
const winston = require('winston')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const HealthChecker = require('../monitoring/health-checker')
const MetricsCollector = require('../monitoring/metrics-collector')
const TweetHistory = require('../storage/tweet-history')
const { loadConfig } = require('../utils/config-loader')

class DashboardServer {
  constructor (config = {}) {
    this.config = {
      port: process.env.DASHBOARD_PORT || 3000,
      host: process.env.DASHBOARD_HOST || '0.0.0.0',
      enableCors: true,
      corsOrigin: process.env.CORS_ORIGIN || '*',
      apiPrefix: '/api/v1',
      staticPath: path.join(__dirname, 'public'),
      logLevel: 'info',
      ...config
    }

    this.app = express()
    this.server = null
    this.isRunning = false
    this.initializeLogger()
    this.setupMiddleware()
    this.setupRoutes()
  }

  initializeLogger () {
    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'dashboard-server' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })
  }

  setupMiddleware () {
    // Security
    this.app.use(helmet())

    // CORS
    if (this.config.enableCors) {
      this.app.use(cors({
        origin: this.config.corsOrigin,
        credentials: true
      }))
    }

    // Body parsing
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.debug('Request received', {
        method: req.method,
        path: req.path,
        query: req.query
      })
      next()
    })

    // Error handling
    this.app.use((err, req, res, next) => {
      this.logger.error('Request error', {
        error: err.message,
        stack: err.stack,
        path: req.path
      })

      res.status(err.status || 500).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'Internal server error',
          timestamp: new Date().toISOString()
        }
      })
    })
  }

  setupRoutes () {
    const router = express.Router()

    // Health check endpoints
    router.get('/health', async (req, res) => {
      try {
        const healthChecker = new HealthChecker()
        const report = await healthChecker.performHealthCheck()

        const statusCode = report.score >= 0.8
          ? 200
          : report.score >= 0.5 ? 206 : 503

        res.status(statusCode).json({
          status: report.status,
          timestamp: report.timestamp,
          version: process.env.npm_package_version || '1.0.0',
          components: report.components,
          score: report.score
        })
      } catch (error) {
        this.logger.error('Health check failed', { error: error.message })
        res.status(503).json({
          status: 'unhealthy',
          error: error.message
        })
      }
    })

    router.get('/health/:component', async (req, res) => {
      try {
        const { component } = req.params
        const healthChecker = new HealthChecker()
        const componentHealth = await healthChecker.checkComponent(component)

        if (!componentHealth) {
          return res.status(404).json({
            error: {
              code: 'NOT_FOUND',
              message: `Component ${component} not found`
            }
          })
        }

        res.json(componentHealth)
      } catch (error) {
        this.logger.error('Component health check failed', {
          error: error.message,
          component: req.params.component
        })
        res.status(500).json({
          error: {
            code: 'HEALTH_CHECK_ERROR',
            message: error.message
          }
        })
      }
    })

    // Metrics endpoints
    router.get('/metrics', async (req, res) => {
      try {
        const { timeRange = '1h' } = req.query
        const metricsCollector = new MetricsCollector()

        // Convert time range to milliseconds
        const timeRangeMs = this.parseTimeRange(timeRange)
        const summary = metricsCollector.getAllMetricsSummary(timeRangeMs)

        res.json({
          timeRange,
          timestamp: summary.timestamp,
          metrics: this.formatMetrics(summary.metrics)
        })
      } catch (error) {
        this.logger.error('Failed to get metrics', { error: error.message })
        res.status(500).json({
          error: {
            code: 'METRICS_ERROR',
            message: error.message
          }
        })
      }
    })

    // Statistics endpoint
    router.get('/statistics', async (req, res) => {
      try {
        const { period = 'last_30_days' } = req.query
        const stats = await this.getStatistics(period)

        res.json({
          period,
          ...stats
        })
      } catch (error) {
        this.logger.error('Failed to get statistics', { error: error.message })
        res.status(500).json({
          error: {
            code: 'STATISTICS_ERROR',
            message: error.message
          }
        })
      }
    })

    // Tweet history endpoints
    router.get('/tweets', async (req, res) => {
      try {
        const {
          status,
          category,
          startDate,
          endDate,
          limit = 100,
          offset = 0
        } = req.query

        const tweetHistory = new TweetHistory()
        const tweets = await tweetHistory.getTweets({
          status,
          category,
          startDate,
          endDate,
          limit: parseInt(limit),
          offset: parseInt(offset)
        })

        const statistics = await tweetHistory.getStatistics()

        res.json({
          tweets,
          total: tweets.length,
          statistics,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasNext: tweets.length === parseInt(limit)
          }
        })
      } catch (error) {
        this.logger.error('Failed to get tweets', { error: error.message })
        res.status(500).json({
          error: {
            code: 'TWEETS_ERROR',
            message: error.message
          }
        })
      }
    })

    // Feed management endpoints
    router.get('/feeds', async (req, res) => {
      try {
        const config = await loadConfig()
        const feeds = config.rssFeeds || []

        const feedsWithStatus = feeds.map(feed => ({
          id: feed.name.toLowerCase().replace(/\s+/g, '-'),
          name: feed.name,
          url: feed.url,
          category: feed.category || 'general',
          enabled: feed.enabled !== false,
          status: 'active' // In real implementation, check actual status
        }))

        res.json({
          feeds: feedsWithStatus,
          total: feedsWithStatus.length
        })
      } catch (error) {
        this.logger.error('Failed to get feeds', { error: error.message })
        res.status(500).json({
          error: {
            code: 'FEEDS_ERROR',
            message: error.message
          }
        })
      }
    })

    // Mount routes
    this.app.use(this.config.apiPrefix, router)

    // Static files (if dashboard UI exists)
    this.app.use(express.static(this.config.staticPath))

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
          path: req.path
        }
      })
    })
  }

  parseTimeRange (timeRange) {
    const units = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    }

    const match = timeRange.match(/^(\d+)([smhd])$/)
    if (!match) {
      throw new Error('Invalid time range format')
    }

    const [, value, unit] = match
    return parseInt(value) * units[unit]
  }

  formatMetrics (metrics) {
    const formatted = {}

    Object.entries(metrics).forEach(([key, data]) => {
      formatted[key] = {
        value: data.currentValue,
        type: data.type,
        stats: data.stats
      }

      // Add percentage change if available
      if (data.stats && data.stats.count > 1) {
        const oldValue = data.stats.min
        const newValue = data.currentValue
        if (oldValue !== 0) {
          const change = ((newValue - oldValue) / oldValue) * 100
          formatted[key].change = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
        }
      }
    })

    return formatted
  }

  async getStatistics (period) {
    const tweetHistory = new TweetHistory()
    const history = await tweetHistory.getHistory()

    // Calculate date range
    const now = new Date()
    const startDate = new Date()

    switch (period) {
      case 'last_7_days':
        startDate.setDate(now.getDate() - 7)
        break
      case 'last_30_days':
        startDate.setDate(now.getDate() - 30)
        break
      case 'last_90_days':
        startDate.setDate(now.getDate() - 90)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    // Filter tweets by date range
    const recentTweets = history.filter(tweet =>
      new Date(tweet.timestamp) >= startDate
    )

    // Calculate statistics
    const stats = {
      tweets: {
        total: recentTweets.length,
        successful: recentTweets.filter(t => t.posted).length,
        failed: recentTweets.filter(t => !t.posted).length,
        successRate: 0
      },
      categories: {},
      topTweets: []
    }

    if (stats.tweets.total > 0) {
      stats.tweets.successRate =
        (stats.tweets.successful / stats.tweets.total) * 100
    }

    // Category breakdown
    recentTweets.forEach(tweet => {
      const category = tweet.category || 'uncategorized'
      if (!stats.categories[category]) {
        stats.categories[category] = 0
      }
      stats.categories[category]++
    })

    // Top tweets (by engagement if available)
    stats.topTweets = recentTweets
      .filter(t => t.posted)
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        text: t.text.substring(0, 100) + '...',
        category: t.category,
        timestamp: t.timestamp
      }))

    return stats
  }

  async start () {
    if (this.isRunning) {
      this.logger.warn('Dashboard server is already running')
      return
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(
          this.config.port,
          this.config.host,
          () => {
            this.isRunning = true
            this.logger.info('Dashboard server started', {
              host: this.config.host,
              port: this.config.port,
              apiPrefix: this.config.apiPrefix
            })
            resolve()
          }
        )

        this.server.on('error', (error) => {
          this.logger.error('Server error', { error: error.message })
          reject(error)
        })
      } catch (error) {
        this.logger.error('Failed to start server', { error: error.message })
        reject(error)
      }
    })
  }

  async stop () {
    if (!this.isRunning || !this.server) {
      return
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false
        this.logger.info('Dashboard server stopped')
        resolve()
      })
    })
  }
}

module.exports = DashboardServer
