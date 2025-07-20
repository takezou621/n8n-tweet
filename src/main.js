/**
 * n8n-tweet: AI情報収集・配信システム
 * 完全統合版メインアプリケーション
 */

require('dotenv').config()
const logger = require('./utils/logger').default
const config = require('../config/production.json')

// Core services
const cacheService = require('./services/cache-service')
const webhookServer = require('./services/webhook-server')
const scheduler = require('./services/scheduler')
const backupService = require('./services/backup-service')
const alertingService = require('./services/alerting-service')
const urlShortener = require('./services/url-shortener')

// Legacy core application
const AITweetBot = require('./index')

class MainApplication {
  constructor () {
    this.bot = null
    this.services = {}
    this.isRunning = false
    this.config = config
  }

  async initialize () {
    logger.info('Initializing main application...')

    try {
      // Initialize core bot
      this.bot = new AITweetBot()

      // Initialize services
      await this.initializeServices()

      // Setup health monitoring
      await this.setupHealthMonitoring()

      logger.info('Main application initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize main application:', error)
      await alertingService.sendErrorAlert(error, { component: 'main_initialization' })
      throw error
    }
  }

  async initializeServices () {
    logger.info('Initializing services...')

    // Initialize cache service
    if (this.config.storage.cache.enabled) {
      await cacheService.connect()
      this.services.cache = cacheService
    }

    // Initialize backup service
    if (this.config.backup.enabled) {
      await backupService.initialize()
      this.services.backup = backupService
    }

    // Initialize webhook server
    if (this.config.integration.webhooks.enabled) {
      this.services.webhookServer = webhookServer
    }

    // Initialize scheduler (always enabled)
    this.services.scheduler = scheduler

    // Initialize URL shortener
    if (this.config.tweetGeneration.optimization.enableUrlShortening) {
      this.services.urlShortener = urlShortener
    }

    // Initialize alerting service
    if (this.config.alerting.enabled) {
      this.services.alerting = alertingService
    }

    logger.info(`Initialized ${Object.keys(this.services).length} services`)
  }

  async setupHealthMonitoring () {
    // Setup health check alerts
    if (this.config.alerting.enabled) {
      setInterval(async () => {
        try {
          const health = await this.bot.healthCheck()
          if (health.status !== 'healthy') {
            await alertingService.sendHealthAlert(health)
          }
        } catch (error) {
          logger.error('Health monitoring error:', error)
        }
      }, this.config.monitoring.healthCheckInterval || 300000) // 5 minutes
    }
  }

  async start () {
    if (this.isRunning) {
      logger.warn('Application already running')
      return
    }

    try {
      logger.info('Starting main application...')

      // Start core bot
      await this.bot.start()

      // Start services
      await this.startServices()

      this.isRunning = true
      logger.info('Main application started successfully')

      // Send startup notification
      if (this.config.alerting.enabled) {
        await alertingService.sendAlert(
          'application_started',
          'n8n-tweet application started successfully',
          'info'
        )
      }
    } catch (error) {
      logger.error('Failed to start main application:', error)
      await alertingService.sendErrorAlert(error, { component: 'main_startup' })
      throw error
    }
  }

  async startServices () {
    logger.info('Starting services...')

    // Start webhook server
    if (this.services.webhookServer) {
      await this.services.webhookServer.start()
      logger.info('Webhook server started')
    }

    // Start scheduler
    if (this.services.scheduler) {
      this.services.scheduler.start()
      logger.info('Scheduler started')
    }

    logger.info('All services started')
  }

  async stop () {
    if (!this.isRunning) {
      logger.warn('Application not running')
      return
    }

    try {
      logger.info('Stopping main application...')

      // Stop services
      await this.stopServices()

      // Stop core bot
      await this.bot.stop()

      // Disconnect cache service
      if (this.services.cache) {
        await this.services.cache.disconnect()
      }

      this.isRunning = false
      logger.info('Main application stopped successfully')
    } catch (error) {
      logger.error('Failed to stop main application:', error)
      throw error
    }
  }

  async stopServices () {
    logger.info('Stopping services...')

    // Stop scheduler
    if (this.services.scheduler) {
      this.services.scheduler.stop()
      logger.info('Scheduler stopped')
    }

    // Stop webhook server
    if (this.services.webhookServer) {
      await this.services.webhookServer.stop()
      logger.info('Webhook server stopped')
    }

    logger.info('All services stopped')
  }

  async runWorkflow () {
    try {
      logger.info('Running complete workflow...')

      const result = await this.bot.runCompleteWorkflow()

      // Send success notification
      if (this.config.alerting.enabled) {
        await alertingService.sendAlert('workflow_completed',
          `Workflow completed successfully: ${result.tweetPosting.successful} tweets posted`,
          'info', result)
      }

      return result
    } catch (error) {
      logger.error('Workflow execution failed:', error)

      // Send failure notification
      if (this.config.alerting.enabled) {
        await alertingService.sendErrorAlert(error, { component: 'workflow_execution' })
      }

      throw error
    }
  }

  async createBackup () {
    if (!this.services.backup) {
      throw new Error('Backup service not initialized')
    }

    try {
      const result = await this.services.backup.createBackup()

      // Send backup notification
      if (this.config.alerting.enabled) {
        await alertingService.sendBackupAlert(true, { path: result })
      }

      return result
    } catch (error) {
      logger.error('Backup creation failed:', error)

      // Send backup failure notification
      if (this.config.alerting.enabled) {
        await alertingService.sendBackupAlert(false, { error: error.message })
      }

      throw error
    }
  }

  async getSystemStatus () {
    try {
      const status = {
        application: {
          running: this.isRunning,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          pid: process.pid,
          version: this.config.version
        },
        services: {},
        health: await this.bot.healthCheck()
      }

      // Get service status
      for (const [name, service] of Object.entries(this.services)) {
        try {
          if (service.getStatus) {
            status.services[name] = await service.getStatus()
          } else if (service.isRunning !== undefined) {
            status.services[name] = { running: service.isRunning }
          } else {
            status.services[name] = { initialized: true }
          }
        } catch (error) {
          status.services[name] = { error: error.message }
        }
      }

      return status
    } catch (error) {
      logger.error('Failed to get system status:', error)
      throw error
    }
  }

  async testServices () {
    logger.info('Testing services...')

    const results = {}

    // Test cache service
    if (this.services.cache) {
      try {
        await this.services.cache.set('test', 'value', 60)
        const value = await this.services.cache.get('test')
        results.cache = value === 'value'
        await this.services.cache.delete('test')
      } catch (error) {
        results.cache = false
        logger.error('Cache service test failed:', error)
      }
    }

    // Test URL shortener
    if (this.services.urlShortener) {
      try {
        const result = await this.services.urlShortener.testProvider()
        results.urlShortener = result.success
      } catch (error) {
        results.urlShortener = false
        logger.error('URL shortener test failed:', error)
      }
    }

    // Test alerting service
    if (this.services.alerting) {
      try {
        const result = await this.services.alerting.testAlerts()
        results.alerting = Object.values(result).some(r => r === true)
      } catch (error) {
        results.alerting = false
        logger.error('Alerting service test failed:', error)
      }
    }

    logger.info('Service tests completed:', results)
    return results
  }

  // CLI command handlers
  async handleCommand (command, args = []) {
    switch (command) {
      case 'start':
        await this.initialize()
        await this.start()
        break

      case 'stop':
        await this.stop()
        break

      case 'status':
        return await this.getSystemStatus()

      case 'workflow':
        return await this.runWorkflow()

      case 'backup':
        return await this.createBackup()

      case 'test':
        return await this.testServices()

      case 'health':
        return await this.bot.healthCheck()

      default:
        throw new Error(`Unknown command: ${command}`)
    }
  }
}

// CLI execution
if (require.main === module) {
  const app = new MainApplication()
  const command = process.argv[2] || 'start'
  const args = process.argv.slice(3)

  // Setup graceful shutdown
  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`)
    try {
      await app.stop()
      process.exit(0)
    } catch (error) {
      logger.error('Error during shutdown:', error)
      process.exit(1)
    }
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception:', error)
    if (app.services.alerting) {
      await alertingService.sendErrorAlert(error, { component: 'uncaught_exception' })
    }
    process.exit(1)
  })

  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason)
    if (app.services.alerting) {
      await alertingService.sendErrorAlert(new Error(reason), { component: 'unhandled_rejection' })
    }
    process.exit(1)
  })

  // Execute command
  app.handleCommand(command, args)
    .then((result) => {
      if (result && command !== 'start') {
        logger.info('Application result:', result)
      }
      if (command !== 'start') {
        process.exit(0)
      }
    })
    .catch((error) => {
      logger.error(`Command '${command}' failed:`, error)
      logger.error('Application error:', error.message)
      process.exit(1)
    })
}

module.exports = MainApplication
