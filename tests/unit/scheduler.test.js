const Scheduler = require('../../src/services/scheduler')
const cron = require('node-cron')
const logger = require('../../src/utils/logger').default

// Mock dependencies
jest.mock('node-cron')
jest.mock('../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

describe('Scheduler', () => {
  let mockJob

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock cron job
    mockJob = {
      destroy: jest.fn(),
      running: false,
      lastRun: null,
      nextRun: null
    }
    cron.schedule.mockReturnValue(mockJob)

    // Reset scheduler jobs
    Scheduler.jobs.clear()

    // Mock config
    Scheduler.config = {
      timezone: 'UTC',
      rss: {
        schedule: '*/15 * * * *',
        delayBetweenFeeds: 5000,
        delayBetweenTweets: 30000,
        maxItemsPerFeed: 10
      },
      health: { schedule: '*/5 * * * *' },
      metrics: { schedule: '*/10 * * * *' },
      backup: { schedule: '0 2 * * *' },
      cleanup: { schedule: '0 3 * * *' },
      statusReport: { schedule: '0 9 * * *' }
    }

    // Mock RSS sources
    Scheduler.rssSources = [
      { name: 'test-feed-1', url: 'https://example.com/feed1.xml' },
      { name: 'test-feed-2', url: 'https://example.com/feed2.xml' }
    ]
  })

  describe('start', () => {
    it('should start all scheduled jobs', () => {
      Scheduler.start()

      expect(cron.schedule).toHaveBeenCalledTimes(6)
      expect(Scheduler.jobs.size).toBe(6)
      expect(Scheduler.jobs.has('rss-collection')).toBe(true)
      expect(Scheduler.jobs.has('health-check')).toBe(true)
      expect(Scheduler.jobs.has('metrics-collection')).toBe(true)
      expect(Scheduler.jobs.has('backup')).toBe(true)
      expect(Scheduler.jobs.has('cleanup')).toBe(true)
      expect(Scheduler.jobs.has('status-report')).toBe(true)

      expect(logger.info).toHaveBeenCalledWith('Starting scheduler...')
      expect(logger.info).toHaveBeenCalledWith('Scheduler started with 6 jobs')
    })

    it('should use default schedules when not configured', () => {
      Scheduler.config = {
        timezone: 'UTC',
        rss: {},
        health: {},
        metrics: {},
        backup: {},
        cleanup: {},
        statusReport: {}
      }

      Scheduler.start()

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/15 * * * *', // Default RSS schedule
        expect.any(Function),
        expect.objectContaining({ scheduled: true, timezone: 'UTC' })
      )
    })
  })

  describe('stop', () => {
    it('should stop all scheduled jobs', () => {
      Scheduler.jobs.set('test-job', mockJob)

      Scheduler.stop()

      expect(mockJob.destroy).toHaveBeenCalled()
      expect(Scheduler.jobs.size).toBe(0)
      expect(logger.info).toHaveBeenCalledWith('Stopping scheduler...')
      expect(logger.info).toHaveBeenCalledWith('Scheduler stopped')
    })
  })

  describe('scheduleRssCollection', () => {
    it('should schedule RSS collection job', () => {
      Scheduler.scheduleRssCollection()

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/15 * * * *',
        expect.any(Function),
        { scheduled: true, timezone: 'UTC' }
      )
      expect(Scheduler.jobs.has('rss-collection')).toBe(true)
      expect(logger.info).toHaveBeenCalledWith('RSS collection scheduled: */15 * * * *')
    })
  })

  describe('scheduleHealthCheck', () => {
    it('should schedule health check job', () => {
      Scheduler.scheduleHealthCheck()

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function),
        { scheduled: true, timezone: 'UTC' }
      )
      expect(Scheduler.jobs.has('health-check')).toBe(true)
    })
  })

  describe('delay', () => {
    it('should delay for specified milliseconds', async () => {
      jest.useFakeTimers()

      const delayPromise = Scheduler.delay(1000)
      jest.advanceTimersByTime(1000)

      await expect(delayPromise).resolves.toBeUndefined()

      jest.useRealTimers()
    })
  })

  describe('getJobStatus', () => {
    it('should return status of all jobs', () => {
      const mockJob1 = { running: true, lastRun: '2024-01-01', nextRun: '2024-01-02' }
      const mockJob2 = { running: false, lastRun: '2024-01-01', nextRun: '2024-01-02' }

      Scheduler.jobs.set('job1', mockJob1)
      Scheduler.jobs.set('job2', mockJob2)

      const status = Scheduler.getJobStatus()

      expect(status).toEqual({
        job1: {
          running: true,
          lastRun: '2024-01-01',
          nextRun: '2024-01-02'
        },
        job2: {
          running: false,
          lastRun: '2024-01-01',
          nextRun: '2024-01-02'
        }
      })
    })
  })
})
