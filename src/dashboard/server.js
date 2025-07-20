#!/usr/bin/env node

/**
 * n8n-tweet Dashboard Server Startup Script
 *
 * Standalone script to start the dashboard API server
 */

const DashboardServer = require('./index')
const winston = require('winston')

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
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

// Create dashboard server instance
const dashboard = new DashboardServer()

// Graceful shutdown handler
async function shutdown (signal) {
  logger.info(`${signal} received, shutting down gracefully...`)

  try {
    if (dashboard) {
      await dashboard.stop()
    }
    logger.info('Dashboard server stopped successfully')
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message })
    process.exit(1)
  }
}

// Start the server
async function main () {
  try {
    logger.info('Starting n8n-tweet Dashboard Server...')

    await dashboard.start()

    logger.info('✅ Dashboard server is running')
    logger.info(
      `🌐 API available at: http://localhost:${dashboard.config.port}${dashboard.config.apiPrefix}`
    )
    logger.info(
      `📊 Health check: http://localhost:${dashboard.config.port}` +
      `${dashboard.config.apiPrefix}/health`
    )

    // Register shutdown handlers
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  } catch (error) {
    logger.error('Failed to start dashboard server', { error: error.message })
    process.exit(1)
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise })
  process.exit(1)
})

// Start the application
if (require.main === module) {
  main()
}

module.exports = { dashboard, shutdown }
