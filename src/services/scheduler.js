const cron = require('node-cron')
const logger = require('../utils/logger').default
const config = require('../../config/production.json')
const feedParser = require('../utils/feed-parser')
const contentFilter = require('../filters/content-filter')
const tweetGenerator = require('../generators/tweet-generator')
const twitterClient = require('../integrations/twitter-client')
const healthChecker = require('../monitoring/health-checker')
const metricsCollector = require('../monitoring/metrics-collector')

class Scheduler {
  constructor () {
    this.jobs = new Map()
    this.config = config.scheduler
    this.rssSources = require('../../config/rss-feeds.json')
  }

  start () {
    logger.info('Starting scheduler...')

    this.scheduleRssCollection()
    this.scheduleHealthCheck()
    this.scheduleMetricsCollection()
    this.scheduleBackup()
    this.scheduleCleanup()
    this.scheduleStatusReport()

    logger.info(`Scheduler started with ${this.jobs.size} jobs`)
  }

  stop () {
    logger.info('Stopping scheduler...')

    this.jobs.forEach((job, name) => {
      job.destroy()
      logger.info(`Stopped job: ${name}`)
    })

    this.jobs.clear()
    logger.info('Scheduler stopped')
  }

  scheduleRssCollection () {
    const schedule = this.config.rss.schedule || '*/15 * * * *'

    const job = cron.schedule(schedule, async () => {
      logger.info('Starting scheduled RSS collection')
      try {
        await this.processAllRssFeeds()
      } catch (error) {
        logger.error('Scheduled RSS collection failed:', error)
      }
    }, {
      scheduled: true,
      timezone: this.config.timezone || 'UTC'
    })

    this.jobs.set('rss-collection', job)
    logger.info(`RSS collection scheduled: ${schedule}`)
  }

  scheduleHealthCheck () {
    const schedule = this.config.health.schedule || '*/5 * * * *'

    const job = cron.schedule(schedule, async () => {
      try {
        const health = await healthChecker.checkHealth()
        if (health.status !== 'healthy') {
          logger.warn('Health check failed:', health)
        }
      } catch (error) {
        logger.error('Health check error:', error)
      }
    }, {
      scheduled: true,
      timezone: this.config.timezone || 'UTC'
    })

    this.jobs.set('health-check', job)
    logger.info(`Health check scheduled: ${schedule}`)
  }

  scheduleMetricsCollection () {
    const schedule = this.config.metrics.schedule || '*/10 * * * *'

    const job = cron.schedule(schedule, async () => {
      try {
        await metricsCollector.collectMetrics()
      } catch (error) {
        logger.error('Metrics collection error:', error)
      }
    }, {
      scheduled: true,
      timezone: this.config.timezone || 'UTC'
    })

    this.jobs.set('metrics-collection', job)
    logger.info(`Metrics collection scheduled: ${schedule}`)
  }

  scheduleBackup () {
    const schedule = this.config.backup.schedule || '0 2 * * *'

    const job = cron.schedule(schedule, async () => {
      logger.info('Starting scheduled backup')
      try {
        await this.performBackup()
      } catch (error) {
        logger.error('Scheduled backup failed:', error)
      }
    }, {
      scheduled: true,
      timezone: this.config.timezone || 'UTC'
    })

    this.jobs.set('backup', job)
    logger.info(`Backup scheduled: ${schedule}`)
  }

  scheduleCleanup () {
    const schedule = this.config.cleanup.schedule || '0 3 * * *'

    const job = cron.schedule(schedule, async () => {
      logger.info('Starting scheduled cleanup')
      try {
        await this.performCleanup()
      } catch (error) {
        logger.error('Scheduled cleanup failed:', error)
      }
    }, {
      scheduled: true,
      timezone: this.config.timezone || 'UTC'
    })

    this.jobs.set('cleanup', job)
    logger.info(`Cleanup scheduled: ${schedule}`)
  }

  scheduleStatusReport () {
    const schedule = this.config.statusReport.schedule || '0 9 * * *'

    const job = cron.schedule(schedule, async () => {
      logger.info('Starting scheduled status report')
      try {
        await this.generateStatusReport()
      } catch (error) {
        logger.error('Scheduled status report failed:', error)
      }
    }, {
      scheduled: true,
      timezone: this.config.timezone || 'UTC'
    })

    this.jobs.set('status-report', job)
    logger.info(`Status report scheduled: ${schedule}`)
  }

  async processAllRssFeeds () {
    const startTime = Date.now()
    let totalProcessed = 0
    let totalPosted = 0
    const results = []

    logger.info(`Processing ${this.rssSources.length} RSS feeds`)

    for (const source of this.rssSources) {
      try {
        const result = await this.processRssFeed(source)
        results.push(result)
        totalProcessed += result.processed
        totalPosted += result.posted

        await this.delay(this.config.rss.delayBetweenFeeds || 5000)
      } catch (error) {
        logger.error(`Failed to process RSS feed ${source.name}:`, error)
        results.push({
          source: source.name,
          error: error.message,
          processed: 0,
          posted: 0
        })
      }
    }

    const duration = Date.now() - startTime
    logger.info(`RSS collection completed in ${duration}ms: ${totalProcessed} processed, ${totalPosted} posted`)

    await metricsCollector.recordMetric('rss_collection', {
      duration,
      totalProcessed,
      totalPosted,
      feedsProcessed: results.length
    })

    return results
  }

  async processRssFeed (source) {
    logger.info(`Processing RSS feed: ${source.name}`)

    const feedItems = await feedParser.parseFeed(source.url)
    const maxItems = this.config.rss.maxItemsPerFeed || 10
    const limitedItems = feedItems.slice(0, maxItems)

    let processed = 0
    let posted = 0

    for (const item of limitedItems) {
      try {
        const filtered = await contentFilter.filterContent(item)
        processed++

        if (filtered.isRelevant) {
          const tweet = await tweetGenerator.generateTweet(item)
          const postResult = await twitterClient.postTweet(tweet)

          if (postResult.success) {
            posted++
            logger.info(`Tweet posted: ${postResult.tweetId}`)
          }

          await this.delay(this.config.rss.delayBetweenTweets || 30000)
        }
      } catch (error) {
        logger.error(`Failed to process item: ${item.title}`, error)
      }
    }

    return {
      source: source.name,
      processed,
      posted,
      totalItems: feedItems.length
    }
  }

  async performBackup () {
    const backupService = require('./backup-service')
    await backupService.createBackup()
  }

  async performCleanup () {
    const fs = require('fs').promises
    const path = require('path')

    const cleanupTasks = [
      this.cleanupOldLogs(),
      this.cleanupOldMetrics(),
      this.cleanupOldBackups(),
      this.cleanupCache()
    ]

    const results = await Promise.allSettled(cleanupTasks)

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error(`Cleanup task ${index} failed:`, result.reason)
      }
    })

    logger.info('Cleanup completed')
  }

  async cleanupOldLogs () {
    const fs = require('fs').promises
    const path = require('path')
    const logsDir = path.join(process.cwd(), 'logs')

    try {
      const files = await fs.readdir(logsDir)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 7)

      let deletedCount = 0

      for (const file of files) {
        const filePath = path.join(logsDir, file)
        const stat = await fs.stat(filePath)

        if (stat.mtime < cutoffDate) {
          await fs.unlink(filePath)
          deletedCount++
        }
      }

      logger.info(`Cleaned up ${deletedCount} old log files`)
    } catch (error) {
      logger.error('Log cleanup failed:', error)
    }
  }

  async cleanupOldMetrics () {
    const fs = require('fs').promises
    const path = require('path')
    const metricsFile = path.join(process.cwd(), 'logs', 'metrics.json')

    try {
      const data = await fs.readFile(metricsFile, 'utf8')
      const metrics = JSON.parse(data)

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 30)

      const filteredMetrics = metrics.filter(metric =>
        new Date(metric.timestamp) > cutoffDate
      )

      await fs.writeFile(metricsFile, JSON.stringify(filteredMetrics, null, 2))
      logger.info(`Cleaned up ${metrics.length - filteredMetrics.length} old metrics`)
    } catch (error) {
      logger.error('Metrics cleanup failed:', error)
    }
  }

  async cleanupOldBackups () {
    const fs = require('fs').promises
    const path = require('path')
    const backupsDir = path.join(process.cwd(), 'backups')

    try {
      const files = await fs.readdir(backupsDir)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 30)

      let deletedCount = 0

      for (const file of files) {
        const filePath = path.join(backupsDir, file)
        const stat = await fs.stat(filePath)

        if (stat.mtime < cutoffDate) {
          await fs.unlink(filePath)
          deletedCount++
        }
      }

      logger.info(`Cleaned up ${deletedCount} old backup files`)
    } catch (error) {
      logger.error('Backup cleanup failed:', error)
    }
  }

  async cleanupCache () {
    const fs = require('fs').promises
    const path = require('path')
    const cacheDir = path.join(process.cwd(), 'cache')

    try {
      const files = await fs.readdir(cacheDir)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 7)

      let deletedCount = 0

      for (const file of files) {
        const filePath = path.join(cacheDir, file)
        const stat = await fs.stat(filePath)

        if (stat.mtime < cutoffDate) {
          await fs.unlink(filePath)
          deletedCount++
        }
      }

      logger.info(`Cleaned up ${deletedCount} old cache files`)
    } catch (error) {
      logger.error('Cache cleanup failed:', error)
    }
  }

  async generateStatusReport () {
    const health = await healthChecker.checkHealth()
    const metrics = await metricsCollector.getMetrics()

    const report = {
      timestamp: new Date().toISOString(),
      health,
      metrics,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      jobs: Array.from(this.jobs.keys())
    }

    logger.info('Daily status report:', report)

    await this.saveStatusReport(report)
  }

  async saveStatusReport (report) {
    const fs = require('fs').promises
    const path = require('path')

    const reportsDir = path.join(process.cwd(), 'reports')
    await fs.mkdir(reportsDir, { recursive: true })

    const filename = `status-report-${new Date().toISOString().split('T')[0]}.json`
    const filepath = path.join(reportsDir, filename)

    await fs.writeFile(filepath, JSON.stringify(report, null, 2))
    logger.info(`Status report saved: ${filepath}`)
  }

  delay (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getJobStatus () {
    const status = {}

    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        lastRun: job.lastRun,
        nextRun: job.nextRun
      }
    })

    return status
  }
}

module.exports = new Scheduler()
