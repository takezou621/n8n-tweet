/**
 * n8n-tweet Dashboard API Server
 * 
 * REST API endpoints for monitoring and managing the n8n-tweet system
 * - Health checks
 * - Metrics collection
 * - Tweet history
 * - Statistics
 */

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const winston = require('winston')
const path = require('path')

// Import components
const HealthChecker = require('../monitoring/health-checker')
const MetricsCollector = require('../monitoring/metrics-collector')
const TweetHistory = require('../storage/tweet-history')

class DashboardServer {
  constructor (config = {}) {
    this.config = {
      port: process.env.DASHBOARD_PORT || 3000,
      host: process.env.DASHBOARD_HOST || '0.0.0.0',
      enableCors: true,
      corsOrigin: process.env.CORS_ORIGIN || '*',
      apiPrefix: '/api/v1',
      // Component configurations
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379
      },
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME || 'n8n',
        user: process.env.DB_USER || 'n8n',
        password: process.env.DB_PASSWORD || 'n8n'
      },
      ...config
    }

    this.initializeLogger()
    this.initializeComponents()
    this.setupServer()
  }

  /**
   * Initialize logger
   */
  initializeLogger () {
    const logLevel = process.env.LOG_LEVEL || 'info'
    
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })

    if (process.env.NODE_ENV !== 'test') {
      this.logger.add(new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'dashboard.log')
      }))
    }
  }

  /**
   * Initialize system components
   */
  initializeComponents () {
    try {
      // Initialize health checker
      this.healthChecker = new HealthChecker({
        logLevel: this.config.logLevel || 'info'
      })

      // Initialize metrics collector
      this.metricsCollector = new MetricsCollector({
        logLevel: this.config.logLevel || 'info'
      })

      // Initialize tweet history
      this.tweetHistory = new TweetHistory({
        logLevel: this.config.logLevel || 'info'
      })

      this.logger.info('Dashboard components initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize dashboard components', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * Setup Express server and routes
   */
  setupServer () {
    this.app = express()

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }))

    // CORS middleware
    if (this.config.enableCors) {
      this.app.use(cors({
        origin: this.config.corsOrigin,
        credentials: true
      }))
    }

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Request logging middleware
    this.app.use((req, res, next) => {
      this.logger.info('API Request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })
      next()
    })

    // Setup routes
    this.setupRoutes()

    // Error handling middleware
    this.app.use(this.errorHandler.bind(this))
  }

  /**
   * Setup API routes
   */
  setupRoutes () {
    const router = express.Router()

    // Health check endpoints
    router.get('/health', this.getSystemHealth.bind(this))
    router.get('/health/:component', this.getComponentHealth.bind(this))

    // Metrics endpoints
    router.get('/metrics', this.getMetrics.bind(this))

    // Statistics endpoints
    router.get('/statistics', this.getStatistics.bind(this))

    // Tweet history endpoints
    router.get('/tweets', this.getTweets.bind(this))

    // RSS feeds endpoints
    router.get('/feeds', this.getFeeds.bind(this))

    // Mount router with API prefix
    this.app.use(this.config.apiPrefix, router)

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'n8n-tweet Dashboard API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: `${this.config.apiPrefix}/health`,
          metrics: `${this.config.apiPrefix}/metrics`,
          statistics: `${this.config.apiPrefix}/statistics`,
          tweets: `${this.config.apiPrefix}/tweets`,
          feeds: `${this.config.apiPrefix}/feeds`
        }
      })
    })
  }

  /**
   * Get system health status
   */
  async getSystemHealth (req, res) {
    try {
      const health = await this.healthChecker.performHealthCheck()
      
      res.json({
        status: 'success',
        data: health,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message })
      res.status(500).json({
        status: 'error',
        message: 'Health check failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Get component-specific health status
   */
  async getComponentHealth (req, res) {
    try {
      const { component } = req.params
      const health = await this.healthChecker.checkComponent(component)
      
      if (!health) {
        return res.status(404).json({
          status: 'error',
          message: `Component '${component}' not found`,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        status: 'success',
        data: health,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Component health check failed', { 
        component: req.params.component,
        error: error.message 
      })
      res.status(500).json({
        status: 'error',
        message: 'Component health check failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Get system metrics
   */
  async getMetrics (req, res) {
    try {
      const { timeRange = '1h' } = req.query
      const metrics = await this.metricsCollector.getMetrics(timeRange)
      
      res.json({
        status: 'success',
        data: metrics,
        timeRange,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Metrics collection failed', { error: error.message })
      res.status(500).json({
        status: 'error',
        message: 'Metrics collection failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Get system statistics
   */
  async getStatistics (req, res) {
    try {
      const { period = 'last_24_hours' } = req.query
      const stats = await this.tweetHistory.getStatistics()
      
      // Add additional statistics based on period
      const periodStats = {
        period,
        tweets: stats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      }
      
      res.json({
        status: 'success',
        data: periodStats,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Statistics collection failed', { error: error.message })
      res.status(500).json({
        status: 'error',
        message: 'Statistics collection failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Get tweet history
   */
  async getTweets (req, res) {
    try {
      const {
        status,
        category,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query

      const options = {
        status,
        category,
        startDate,
        endDate,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }

      const tweets = await this.tweetHistory.getTweets(options)
      
      res.json({
        status: 'success',
        data: tweets,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: tweets.length
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Tweet history retrieval failed', { error: error.message })
      res.status(500).json({
        status: 'error',
        message: 'Tweet history retrieval failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Get RSS feeds status
   */
  async getFeeds (req, res) {
    try {
      // Mock RSS feeds data - in real implementation, this would come from feed parser
      const feeds = [
        {
          name: 'ArXiv AI',
          url: 'http://export.arxiv.org/rss/cs.AI',
          status: 'active',
          lastUpdate: new Date().toISOString(),
          itemCount: 25,
          enabled: true
        },
        {
          name: 'OpenAI Blog',
          url: 'https://openai.com/blog/rss.xml',
          status: 'active',
          lastUpdate: new Date().toISOString(),
          itemCount: 10,
          enabled: true
        },
        {
          name: 'Google AI Blog',
          url: 'https://ai.googleblog.com/feeds/posts/default',
          status: 'active',
          lastUpdate: new Date().toISOString(),
          itemCount: 15,
          enabled: true
        }
      ]
      
      res.json({
        status: 'success',
        data: feeds,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Feeds status retrieval failed', { error: error.message })
      res.status(500).json({
        status: 'error',
        message: 'Feeds status retrieval failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Error handling middleware
   */
  errorHandler (err, req, res, next) {
    this.logger.error('Dashboard API error', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method
    })

    res.status(err.status || 500).json({
      status: 'error',
      message: err.message || 'Internal server error',
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Start the dashboard server
   */
  async start () {
    try {
      // Load tweet history
      await this.tweetHistory.loadHistory()
      
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        this.logger.info('Dashboard server started', {
          host: this.config.host,
          port: this.config.port,
          apiPrefix: this.config.apiPrefix
        })
      })

      return this.server
    } catch (error) {
      this.logger.error('Failed to start dashboard server', { error: error.message })
      throw error
    }
  }

  /**
   * Stop the dashboard server
   */
  async stop () {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('Dashboard server stopped')
          resolve()
        })
      })
    }
  }
}

module.exports = DashboardServer