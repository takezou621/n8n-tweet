#!/usr/bin/env node

/**
 * Dashboard Server Startup Script
 *
 * Standalone script to run the dashboard API server
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
  defaultMeta: { service: 'dashboard-startup' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
})

// Handle shutdown gracefully
let server = null

async function shutdown (signal) {
  logger.info(`${signal} received, shutting down gracefully...`)

  if (server) {
    try {
      await server.stop()
      logger.info('Dashboard server stopped successfully')
    } catch (error) {
      logger.error('Error stopping server', { error: error.message })
    }
  }

  process.exit(0)
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack })
  shutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise })
  shutdown('unhandledRejection')
})

// Start the server
async function main () {
  try {
    logger.info('Starting dashboard server...')

    // Load configuration
    const config = {
      port: process.env.DASHBOARD_PORT || 3000,
      host: process.env.DASHBOARD_HOST || '0.0.0.0',
      enableCors: process.env.ENABLE_CORS !== 'false',
      corsOrigin: process.env.CORS_ORIGIN || '*',
      apiPrefix: process.env.API_PREFIX || '/api/v1',
      logLevel: process.env.LOG_LEVEL || 'info'
    }

    // Create and start server
    server = new DashboardServer(config)
    await server.start()

    logger.info('Dashboard server is ready', {
      url: `http://${config.host}:${config.port}`,
      apiUrl: `http://${config.host}:${config.port}${config.apiPrefix}`
    })
  } catch (error) {
    logger.error('Failed to start dashboard server', {
      error: error.message,
      stack: error.stack
    })
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

module.exports = { main }
