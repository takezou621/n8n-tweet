const AlertingService = require('../../src/services/alerting-service')
const axios = require('axios')
const logger = require('../../src/utils/logger').default

// Mock dependencies
jest.mock('axios')
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn()
}))
jest.mock('os', () => ({
  hostname: jest.fn().mockReturnValue('test-hostname')
}))
jest.mock('../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

describe('AlertingService', () => {
  let mockTransporter

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock nodemailer transporter
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
    }

    const nodemailer = require('nodemailer')
    nodemailer.createTransporter.mockReturnValue(mockTransporter)

    // Reset service config and history
    AlertingService.config = {
      enabled: true,
      email: {
        enabled: true,
        from: 'test@example.com',
        to: 'alerts@example.com',
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          user: 'test@example.com',
          pass: 'password'
        }
      },
      slack: {
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/test'
      },
      webhook: {
        enabled: true,
        url: 'https://webhook.example.com/alerts'
      }
    }
    AlertingService.alertHistory = []
  })

  describe('sendAlert', () => {
    it('should send alert to all enabled channels', async () => {
      axios.post.mockResolvedValue({ status: 200 })

      const result = await AlertingService.sendAlert(
        'test_type',
        'Test message',
        'warning',
        { testData: 'value' }
      )

      expect(result.success).toBe(true)
      expect(result.channels.email).toBe(true)
      expect(result.channels.slack).toBe(true)
      expect(result.channels.webhook).toBe(true)
      expect(AlertingService.alertHistory).toHaveLength(1)
      expect(logger.info).toHaveBeenCalledWith('Sending alert: test_type - Test message')
    })

    it('should skip alert when service is disabled', async () => {
      AlertingService.config.enabled = false

      const result = await AlertingService.sendAlert('test_type', 'Test message')

      expect(result).toBeUndefined()
      expect(logger.info).toHaveBeenCalledWith('Alerting service disabled')
      expect(mockTransporter.sendMail).not.toHaveBeenCalled()
      expect(axios.post).not.toHaveBeenCalled()
    })

    it('should handle partial failures gracefully', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Email failed'))
      axios.post.mockImplementation((url) => {
        if (url.includes('slack')) {
          return Promise.resolve({ status: 200 })
        }
        return Promise.reject(new Error('Webhook failed'))
      })

      const result = await AlertingService.sendAlert('test_type', 'Test message')

      expect(result.success).toBe(true) // At least one channel succeeded
      expect(result.channels.email).toBe(false)
      expect(result.channels.slack).toBe(true)
      expect(result.channels.webhook).toBe(false)
    })

    it('should generate proper alert structure', async () => {
      axios.post.mockResolvedValue({ status: 200 })

      const result = await AlertingService.sendAlert(
        'test_type',
        'Test message',
        'error',
        { key: 'value' }
      )

      expect(result.alert).toMatchObject({
        id: expect.stringMatching(/^alert-\d+-[a-z0-9]+$/),
        type: 'test_type',
        message: 'Test message',
        severity: 'error',
        metadata: { key: 'value' },
        timestamp: expect.any(String),
        hostname: 'test-hostname',
        service: 'n8n-tweet'
      })
    })
  })

  describe('sendEmailAlert', () => {
    it('should send email alert successfully', async () => {
      const alert = {
        id: 'test-alert',
        type: 'test_type',
        message: 'Test message',
        severity: 'warning',
        metadata: { key: 'value' },
        timestamp: '2024-01-01T00:00:00Z',
        hostname: 'test-hostname',
        service: 'n8n-tweet'
      }

      await AlertingService.sendEmailAlert(alert)

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: 'alerts@example.com',
        subject: '[WARNING] test_type - n8n-tweet',
        text: expect.stringContaining('Alert: test_type'),
        html: expect.stringContaining('<h2>Alert: test_type</h2>')
      })
      expect(logger.info).toHaveBeenCalledWith('Email alert sent successfully')
    })

    it('should skip email when disabled', async () => {
      AlertingService.config.email.enabled = false

      const alert = { type: 'test', message: 'test' }
      await AlertingService.sendEmailAlert(alert)

      expect(mockTransporter.sendMail).not.toHaveBeenCalled()
    })

    it('should handle email errors', async () => {
      const error = new Error('SMTP connection failed')
      mockTransporter.sendMail.mockRejectedValue(error)

      const alert = {
        type: 'test',
        message: 'test',
        severity: 'info',
        metadata: {},
        timestamp: '2024-01-01T00:00:00Z',
        hostname: 'test-hostname',
        service: 'n8n-tweet'
      }

      await expect(AlertingService.sendEmailAlert(alert))
        .rejects.toThrow('SMTP connection failed')

      expect(logger.error).toHaveBeenCalledWith('Email alert failed:', error)
    })
  })

  describe('sendSlackAlert', () => {
    it('should send Slack alert successfully', async () => {
      axios.post.mockResolvedValue({ status: 200 })

      const alert = {
        type: 'test_type',
        message: 'Test message',
        severity: 'error',
        metadata: { key: 'value' },
        timestamp: '2024-01-01T00:00:00Z',
        hostname: 'test-hostname',
        service: 'n8n-tweet'
      }

      await AlertingService.sendSlackAlert(alert)

      expect(axios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: '[ERROR] test_type',
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: '#ff4444',
              fields: expect.arrayContaining([
                { title: 'Message', value: 'Test message', short: false },
                { title: 'Service', value: 'n8n-tweet', short: true },
                { title: 'Hostname', value: 'test-hostname', short: true },
                { title: 'Timestamp', value: '2024-01-01T00:00:00Z', short: true },
                { title: 'Metadata', value: expect.stringContaining('key'), short: false }
              ])
            })
          ])
        })
      )
      expect(logger.info).toHaveBeenCalledWith('Slack alert sent successfully')
    })

    it('should skip Slack when disabled', async () => {
      AlertingService.config.slack.enabled = false

      const alert = { type: 'test', message: 'test' }
      await AlertingService.sendSlackAlert(alert)

      expect(axios.post).not.toHaveBeenCalled()
    })

    it('should handle Slack errors', async () => {
      const error = new Error('Webhook URL invalid')
      axios.post.mockRejectedValue(error)

      const alert = { type: 'test', message: 'test', severity: 'info', metadata: {} }

      await expect(AlertingService.sendSlackAlert(alert))
        .rejects.toThrow('Webhook URL invalid')

      expect(logger.error).toHaveBeenCalledWith('Slack alert failed:', error)
    })

    it('should handle alert without metadata', async () => {
      axios.post.mockResolvedValue({ status: 200 })

      const alert = {
        type: 'test',
        message: 'test',
        severity: 'info',
        metadata: {},
        service: 'n8n-tweet',
        hostname: 'test-hostname',
        timestamp: '2024-01-01T00:00:00Z'
      }

      await AlertingService.sendSlackAlert(alert)

      const payload = axios.post.mock.calls[0][1]
      const metadataField = payload.attachments[0].fields.find(f => f.title === 'Metadata')
      expect(metadataField).toBeUndefined()
    })
  })

  describe('sendWebhookAlert', () => {
    it('should send webhook alert successfully', async () => {
      axios.post.mockResolvedValue({ status: 200 })

      const alert = { type: 'test', message: 'test', severity: 'info' }

      await AlertingService.sendWebhookAlert(alert)

      expect(axios.post).toHaveBeenCalledWith(
        'https://webhook.example.com/alerts',
        {
          alert,
          service: 'n8n-tweet',
          version: '1.0.0'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'n8n-tweet-alerting/1.0.0'
          },
          timeout: 5000
        }
      )
      expect(logger.info).toHaveBeenCalledWith('Webhook alert sent successfully')
    })

    it('should skip webhook when disabled', async () => {
      AlertingService.config.webhook.enabled = false

      const alert = { type: 'test', message: 'test' }
      await AlertingService.sendWebhookAlert(alert)

      expect(axios.post).not.toHaveBeenCalled()
    })

    it('should handle webhook errors', async () => {
      const error = new Error('Connection timeout')
      axios.post.mockRejectedValue(error)

      const alert = { type: 'test', message: 'test' }

      await expect(AlertingService.sendWebhookAlert(alert))
        .rejects.toThrow('Connection timeout')

      expect(logger.error).toHaveBeenCalledWith('Webhook alert failed:', error)
    })
  })

  describe('formatEmailText', () => {
    it('should format email text correctly', () => {
      const alert = {
        type: 'test_type',
        message: 'Test message',
        severity: 'warning',
        metadata: { key: 'value' },
        timestamp: '2024-01-01T00:00:00Z',
        hostname: 'test-hostname',
        service: 'n8n-tweet'
      }

      const result = AlertingService.formatEmailText(alert)

      expect(result).toContain('Alert: test_type')
      expect(result).toContain('Severity: warning')
      expect(result).toContain('Message: Test message')
      expect(result).toContain('Service: n8n-tweet')
      expect(result).toContain('Hostname: test-hostname')
      expect(result).toContain('Timestamp: 2024-01-01T00:00:00Z')
      expect(result).toContain('Metadata:')
      expect(result).toContain('key')
    })

    it('should handle empty metadata', () => {
      const alert = {
        type: 'test',
        message: 'test',
        severity: 'info',
        metadata: {},
        timestamp: '2024-01-01T00:00:00Z',
        hostname: 'test-hostname',
        service: 'n8n-tweet'
      }

      const result = AlertingService.formatEmailText(alert)

      expect(result).not.toContain('Metadata:')
    })
  })

  describe('formatEmailHtml', () => {
    it('should format email HTML correctly', () => {
      const alert = {
        type: 'test_type',
        message: 'Test message',
        severity: 'warning',
        metadata: { key: 'value' },
        timestamp: '2024-01-01T00:00:00Z',
        hostname: 'test-hostname',
        service: 'n8n-tweet'
      }

      const result = AlertingService.formatEmailHtml(alert)

      expect(result).toContain('<h2>Alert: test_type</h2>')
      expect(result).toContain('<td>warning</td>')
      expect(result).toContain('<td>Test message</td>')
      expect(result).toContain('<h3>Metadata:</h3>')
      expect(result).toContain('<pre>')
    })
  })

  describe('getSeverityColor', () => {
    it('should return correct colors for severities', () => {
      expect(AlertingService.getSeverityColor('info')).toBe('#36a64f')
      expect(AlertingService.getSeverityColor('warning')).toBe('#ffb84d')
      expect(AlertingService.getSeverityColor('error')).toBe('#ff4444')
      expect(AlertingService.getSeverityColor('critical')).toBe('#cc0000')
      expect(AlertingService.getSeverityColor('unknown')).toBe('#cccccc')
    })
  })

  describe('generateAlertId', () => {
    it('should generate unique alert IDs', () => {
      const id1 = AlertingService.generateAlertId()
      const id2 = AlertingService.generateAlertId()

      expect(id1).toMatch(/^alert-\d+-[a-z0-9]+$/)
      expect(id2).toMatch(/^alert-\d+-[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })
  })

  describe('addToHistory', () => {
    it('should add alert to history', () => {
      const alert = { id: 'test-alert', type: 'test' }

      AlertingService.addToHistory(alert)

      expect(AlertingService.alertHistory).toContain(alert)
    })

    it('should maintain maximum history size', () => {
      const maxSize = AlertingService.maxHistorySize

      // Add more alerts than the maximum
      for (let i = 0; i < maxSize + 5; i++) {
        AlertingService.addToHistory({ id: `alert-${i}`, type: 'test' })
      }

      expect(AlertingService.alertHistory).toHaveLength(maxSize)
      expect(AlertingService.alertHistory[0].id).toBe('alert-5') // First 5 should be removed
    })
  })

  describe('getAlertHistory', () => {
    it('should return recent alerts in reverse order', () => {
      const alerts = [
        { id: 'alert-1', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'alert-2', timestamp: '2024-01-01T01:00:00Z' },
        { id: 'alert-3', timestamp: '2024-01-01T02:00:00Z' }
      ]

      alerts.forEach(alert => AlertingService.addToHistory(alert))

      const result = AlertingService.getAlertHistory(2)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('alert-3') // Most recent first
      expect(result[1].id).toBe('alert-2')
    })
  })

  describe('specialized alert methods', () => {
    beforeEach(() => {
      jest.spyOn(AlertingService, 'sendAlert').mockResolvedValue({})
    })

    it('should send health alert for unhealthy status', async () => {
      const healthStatus = {
        status: 'unhealthy',
        checks: [
          { name: 'redis', status: true },
          { name: 'database', status: false },
          { name: 'api', status: false }
        ]
      }

      await AlertingService.sendHealthAlert(healthStatus)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'health_check_failed',
        'Health check failed: 2 services unhealthy',
        'error',
        { health: healthStatus }
      )
    })

    it('should skip health alert for healthy status', async () => {
      const healthStatus = { status: 'healthy', checks: [] }

      await AlertingService.sendHealthAlert(healthStatus)

      expect(AlertingService.sendAlert).not.toHaveBeenCalled()
    })

    it('should send error alert', async () => {
      const error = new Error('Test error')
      const context = { component: 'feed-parser' }

      await AlertingService.sendErrorAlert(error, context)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'error',
        'Error occurred: Test error',
        'error',
        {
          error: {
            message: 'Test error',
            stack: error.stack,
            name: 'Error'
          },
          context
        }
      )
    })

    it('should send RSS alert', async () => {
      const error = new Error('Feed not found')

      await AlertingService.sendRssAlert('arxiv-feed', error)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'rss_feed_failed',
        'RSS feed processing failed: arxiv-feed',
        'warning',
        {
          feed: 'arxiv-feed',
          error: 'Feed not found'
        }
      )
    })

    it('should send Twitter alert', async () => {
      const error = new Error('Rate limit exceeded')
      const tweetData = { text: 'Test tweet' }

      await AlertingService.sendTwitterAlert(error, tweetData)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'twitter_post_failed',
        'Twitter posting failed: Rate limit exceeded',
        'warning',
        {
          error: 'Rate limit exceeded',
          tweet: tweetData
        }
      )
    })

    it('should send backup success alert', async () => {
      const details = { path: '/backup/file.tar.gz', size: 1024 }

      await AlertingService.sendBackupAlert(true, details)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'backup_status',
        'Backup completed successfully',
        'info',
        details
      )
    })

    it('should send backup failure alert', async () => {
      const details = { error: 'Disk full' }

      await AlertingService.sendBackupAlert(false, details)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'backup_status',
        'Backup failed',
        'error',
        details
      )
    })

    it('should send rate limit alert', async () => {
      const details = { limit: 100, used: 101 }

      await AlertingService.sendRateLimitAlert('twitter-api', details)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'rate_limit_exceeded',
        'Rate limit exceeded for twitter-api',
        'warning',
        {
          service: 'twitter-api',
          ...details
        }
      )
    })

    it('should send system alert', async () => {
      await AlertingService.sendSystemAlert('cpu_usage', 85, 80)

      expect(AlertingService.sendAlert).toHaveBeenCalledWith(
        'system_metric_exceeded',
        'System metric cpu_usage exceeded threshold: 85 > 80',
        'warning',
        {
          metric: 'cpu_usage',
          value: 85,
          threshold: 80
        }
      )
    })
  })

  describe('testAlerts', () => {
    it('should test all alert channels', async () => {
      axios.post.mockResolvedValue({ status: 200 })

      const result = await AlertingService.testAlerts()

      expect(result).toEqual({
        email: true,
        slack: true,
        webhook: true
      })
      expect(mockTransporter.sendMail).toHaveBeenCalled()
      expect(axios.post).toHaveBeenCalledTimes(2) // Slack + Webhook
    })

    it('should handle test failures', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Email failed'))
      axios.post.mockRejectedValue(new Error('HTTP failed'))

      const result = await AlertingService.testAlerts()

      expect(result).toEqual({
        email: false,
        slack: false,
        webhook: false
      })
    })
  })
})
