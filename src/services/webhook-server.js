const express = require('express')
const cors = require('cors')
const logger = require('../utils/logger').default
const config = require('../../config/production.json')
const feedParser = require('../utils/feed-parser')
const contentFilter = require('../filters/content-filter')
const tweetGenerator = require('../generators/tweet-generator')
const twitterClient = require('../integrations/twitter-client')
const healthChecker = require('../monitoring/health-checker')
const metricsCollector = require('../monitoring/metrics-collector')

class WebhookServer {
  constructor () {
    this.app = express()
    this.server = null
    this.isRunning = false
    this.config = config.api
    this.webhookConfig = config.webhooks
  }

  initialize () {
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true }))
    this.app.use(cors())

    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`)
      next()
    })

    this.setupRoutes()
    this.setupErrorHandling()
  }

  setupRoutes () {
    this.app.get('/healthz', this.healthCheck.bind(this))
    this.app.get('/metrics', this.getMetrics.bind(this))
    this.app.get('/status', this.getStatus.bind(this))

    if (this.webhookConfig.enabled) {
      this.app.post('/webhook/rss-trigger', this.handleRssTrigger.bind(this))
      this.app.post('/webhook/manual-trigger', this.handleManualTrigger.bind(this))
      this.app.post('/webhook/test', this.handleTest.bind(this))
    }

    this.app.get('/', (req, res) => {
      res.json({
        name: 'n8n-tweet API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/healthz',
          metrics: '/metrics',
          status: '/status',
          webhooks: this.webhookConfig.enabled
            ? {
                rssTrigger: '/webhook/rss-trigger',
                manualTrigger: '/webhook/manual-trigger',
                test: '/webhook/test'
              }
            : 'disabled'
        }
      })
    })
  }

  setupErrorHandling () {
    this.app.use((err, req, res, next) => {
      logger.error('Express error:', err)
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      })
    })

    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`
      })
    })
  }

  async start () {
    if (this.isRunning) {
      logger.warn('Webhook server already running')
      return
    }

    try {
      this.initialize()

      this.server = this.app.listen(this.config.port, this.config.host, () => {
        this.isRunning = true
        logger.info(`Webhook server running on ${this.config.host}:${this.config.port}`)
      })

      this.server.on('error', (error) => {
        logger.error('Webhook server error:', error)
        this.isRunning = false
      })
    } catch (error) {
      logger.error('Failed to start webhook server:', error)
      throw error
    }
  }

  async stop () {
    if (!this.isRunning || !this.server) {
      logger.warn('Webhook server not running')
      return
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false
        logger.info('Webhook server stopped')
        resolve()
      })
    })
  }

  async healthCheck (req, res) {
    try {
      const health = await healthChecker.checkHealth()
      const status = health.status === 'healthy' ? 200 : 503
      res.status(status).json(health)
    } catch (error) {
      logger.error('Health check error:', error)
      res.status(503).json({
        status: 'unhealthy',
        error: error.message
      })
    }
  }

  async getMetrics (req, res) {
    try {
      const metrics = await metricsCollector.getMetrics()
      res.json(metrics)
    } catch (error) {
      logger.error('Metrics error:', error)
      res.status(500).json({
        error: 'Failed to get metrics',
        message: error.message
      })
    }
  }

  async getStatus (req, res) {
    try {
      const status = {
        server: {
          running: this.isRunning,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          pid: process.pid
        },
        services: await this.getServiceStatus(),
        timestamp: new Date().toISOString()
      }
      res.json(status)
    } catch (error) {
      logger.error('Status error:', error)
      res.status(500).json({
        error: 'Failed to get status',
        message: error.message
      })
    }
  }

  async getServiceStatus () {
    const services = {}

    try {
      services.twitter = await twitterClient.testConnection()
      services.health = await healthChecker.checkHealth()
      services.cache = 'N/A'
    } catch (error) {
      logger.error('Service status check error:', error)
    }

    return services
  }

  async handleRssTrigger (req, res) {
    try {
      logger.info('RSS trigger webhook received')
      const { feedUrl, maxItems = 10 } = req.body

      if (!feedUrl) {
        return res.status(400).json({
          error: 'Missing feedUrl parameter'
        })
      }

      const result = await this.processRssFeed(feedUrl, maxItems)
      res.json(result)
    } catch (error) {
      logger.error('RSS trigger error:', error)
      res.status(500).json({
        error: 'RSS trigger failed',
        message: error.message
      })
    }
  }

  async handleManualTrigger (req, res) {
    try {
      logger.info('Manual trigger webhook received')
      const { content, category = 'general' } = req.body

      if (!content) {
        return res.status(400).json({
          error: 'Missing content parameter'
        })
      }

      const result = await this.processManualContent(content, category)
      res.json(result)
    } catch (error) {
      logger.error('Manual trigger error:', error)
      res.status(500).json({
        error: 'Manual trigger failed',
        message: error.message
      })
    }
  }

  async handleTest (req, res) {
    try {
      logger.info('Test webhook received')
      const testResult = {
        message: 'Test webhook successful',
        timestamp: new Date().toISOString(),
        server: {
          running: this.isRunning,
          uptime: process.uptime()
        }
      }
      res.json(testResult)
    } catch (error) {
      logger.error('Test webhook error:', error)
      res.status(500).json({
        error: 'Test webhook failed',
        message: error.message
      })
    }
  }

  async processRssFeed (feedUrl, maxItems) {
    const feedItems = await feedParser.parseFeed(feedUrl)
    const limitedItems = feedItems.slice(0, maxItems)

    const results = []
    for (const item of limitedItems) {
      const filtered = await contentFilter.filterContent(item)
      if (filtered.isRelevant) {
        const tweet = await tweetGenerator.generateTweet(item)
        const posted = await twitterClient.postTweet(tweet)

        results.push({
          title: item.title,
          tweet: tweet.text,
          posted: posted.success,
          tweetId: posted.tweetId
        })
      }
    }

    return {
      feedUrl,
      processedItems: limitedItems.length,
      postedTweets: results.length,
      results
    }
  }

  async processManualContent (content, category) {
    const mockItem = {
      title: content.substring(0, 100),
      description: content,
      category,
      link: '',
      pubDate: new Date().toISOString()
    }

    const filtered = await contentFilter.filterContent(mockItem)
    if (!filtered.isRelevant) {
      return {
        message: 'Content filtered out as not relevant',
        content: content.substring(0, 100)
      }
    }

    const tweet = await tweetGenerator.generateTweet(mockItem)
    const posted = await twitterClient.postTweet(tweet)

    return {
      message: 'Manual content processed',
      content: content.substring(0, 100),
      tweet: tweet.text,
      posted: posted.success,
      tweetId: posted.tweetId
    }
  }
}

module.exports = new WebhookServer()
