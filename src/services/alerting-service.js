const axios = require('axios')
const logger = require('../utils/logger').default
const config = require('../../config/production.json')

class AlertingService {
  constructor () {
    this.config = config.alerts
    this.alertHistory = []
    this.maxHistorySize = 100
  }

  async sendAlert (type, message, severity = 'warning', metadata = {}) {
    if (!this.config.enabled) {
      logger.info('Alerting service disabled')
      return
    }

    const alert = {
      id: this.generateAlertId(),
      type,
      message,
      severity,
      metadata,
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      service: 'n8n-tweet'
    }

    this.addToHistory(alert)
    logger.info(`Sending alert: ${type} - ${message}`)

    const results = await Promise.allSettled([
      this.sendEmailAlert(alert),
      this.sendSlackAlert(alert),
      this.sendWebhookAlert(alert)
    ])

    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failureCount = results.filter(r => r.status === 'rejected').length

    logger.info(`Alert sent to ${successCount} channels, ${failureCount} failures`)

    return {
      alert,
      success: successCount > 0,
      channels: {
        email: results[0].status === 'fulfilled',
        slack: results[1].status === 'fulfilled',
        webhook: results[2].status === 'fulfilled'
      }
    }
  }

  async sendEmailAlert (alert) {
    if (!this.config.email.enabled) {
      return
    }

    const nodemailer = require('nodemailer')

    const transporter = nodemailer.createTransporter({
      host: this.config.email.smtp.host,
      port: this.config.email.smtp.port,
      secure: this.config.email.smtp.secure,
      auth: {
        user: this.config.email.smtp.user,
        pass: this.config.email.smtp.pass
      }
    })

    const subject = `[${alert.severity.toUpperCase()}] ${alert.type} - n8n-tweet`
    const text = this.formatEmailText(alert)
    const html = this.formatEmailHtml(alert)

    const mailOptions = {
      from: this.config.email.from,
      to: this.config.email.to,
      subject,
      text,
      html
    }

    try {
      await transporter.sendMail(mailOptions)
      logger.info('Email alert sent successfully')
    } catch (error) {
      logger.error('Email alert failed:', error)
      throw error
    }
  }

  async sendSlackAlert (alert) {
    if (!this.config.slack.enabled) {
      return
    }

    const payload = {
      text: `[${alert.severity.toUpperCase()}] ${alert.type}`,
      attachments: [
        {
          color: this.getSeverityColor(alert.severity),
          fields: [
            {
              title: 'Message',
              value: alert.message,
              short: false
            },
            {
              title: 'Service',
              value: alert.service,
              short: true
            },
            {
              title: 'Hostname',
              value: alert.hostname,
              short: true
            },
            {
              title: 'Timestamp',
              value: alert.timestamp,
              short: true
            }
          ]
        }
      ]
    }

    if (Object.keys(alert.metadata).length > 0) {
      payload.attachments[0].fields.push({
        title: 'Metadata',
        value: JSON.stringify(alert.metadata, null, 2),
        short: false
      })
    }

    try {
      await axios.post(this.config.slack.webhookUrl, payload)
      logger.info('Slack alert sent successfully')
    } catch (error) {
      logger.error('Slack alert failed:', error)
      throw error
    }
  }

  async sendWebhookAlert (alert) {
    if (!this.config.webhook.enabled) {
      return
    }

    const payload = {
      alert,
      service: 'n8n-tweet',
      version: '1.0.0'
    }

    try {
      await axios.post(this.config.webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'n8n-tweet-alerting/1.0.0'
        },
        timeout: 5000
      })
      logger.info('Webhook alert sent successfully')
    } catch (error) {
      logger.error('Webhook alert failed:', error)
      throw error
    }
  }

  formatEmailText (alert) {
    return `
Alert: ${alert.type}
Severity: ${alert.severity}
Message: ${alert.message}
Service: ${alert.service}
Hostname: ${alert.hostname}
Timestamp: ${alert.timestamp}

${Object.keys(alert.metadata).length > 0
  ? `Metadata:\n${JSON.stringify(alert.metadata, null, 2)}`
: ''}
`
  }

  formatEmailHtml (alert) {
    return `
<html>
<body>
<h2>Alert: ${alert.type}</h2>
<table>
<tr><td><strong>Severity:</strong></td><td>${alert.severity}</td></tr>
<tr><td><strong>Message:</strong></td><td>${alert.message}</td></tr>
<tr><td><strong>Service:</strong></td><td>${alert.service}</td></tr>
<tr><td><strong>Hostname:</strong></td><td>${alert.hostname}</td></tr>
<tr><td><strong>Timestamp:</strong></td><td>${alert.timestamp}</td></tr>
</table>
${Object.keys(alert.metadata).length > 0
  ? `<h3>Metadata:</h3><pre>${JSON.stringify(alert.metadata, null, 2)}</pre>`
: ''}
</body>
</html>
`
  }

  getSeverityColor (severity) {
    const colors = {
      info: '#36a64f',
      warning: '#ffb84d',
      error: '#ff4444',
      critical: '#cc0000'
    }
    return colors[severity] || '#cccccc'
  }

  generateAlertId () {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  addToHistory (alert) {
    this.alertHistory.push(alert)

    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift()
    }
  }

  getAlertHistory (limit = 10) {
    return this.alertHistory
      .slice(-limit)
      .reverse()
  }

  async sendHealthAlert (healthStatus) {
    if (healthStatus.status === 'healthy') {
      return
    }

    const unhealthyCount = healthStatus.checks.filter(c => !c.status).length
    const message = `Health check failed: ${unhealthyCount} services unhealthy`

    await this.sendAlert('health_check_failed', message, 'error', {
      health: healthStatus
    })
  }

  async sendErrorAlert (error, context = {}) {
    const message = `Error occurred: ${error.message}`

    await this.sendAlert('error', message, 'error', {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context
    })
  }

  async sendRssAlert (feedName, error) {
    const message = `RSS feed processing failed: ${feedName}`

    await this.sendAlert('rss_feed_failed', message, 'warning', {
      feed: feedName,
      error: error.message
    })
  }

  async sendTwitterAlert (error, tweetData = {}) {
    const message = `Twitter posting failed: ${error.message}`

    await this.sendAlert('twitter_post_failed', message, 'warning', {
      error: error.message,
      tweet: tweetData
    })
  }

  async sendBackupAlert (success, details = {}) {
    const message = success ? 'Backup completed successfully' : 'Backup failed'
    const severity = success ? 'info' : 'error'

    await this.sendAlert('backup_status', message, severity, details)
  }

  async sendRateLimitAlert (service, details = {}) {
    const message = `Rate limit exceeded for ${service}`

    await this.sendAlert('rate_limit_exceeded', message, 'warning', {
      service,
      ...details
    })
  }

  async sendSystemAlert (metric, value, threshold) {
    const message = `System metric ${metric} exceeded threshold: ${value} > ${threshold}`

    await this.sendAlert('system_metric_exceeded', message, 'warning', {
      metric,
      value,
      threshold
    })
  }

  async testAlerts () {
    logger.info('Testing alert channels...')

    const testAlert = {
      id: 'test-alert',
      type: 'test',
      message: 'This is a test alert from n8n-tweet service',
      severity: 'info',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      service: 'n8n-tweet'
    }

    const results = await Promise.allSettled([
      this.sendEmailAlert(testAlert),
      this.sendSlackAlert(testAlert),
      this.sendWebhookAlert(testAlert)
    ])

    return {
      email: results[0].status === 'fulfilled',
      slack: results[1].status === 'fulfilled',
      webhook: results[2].status === 'fulfilled'
    }
  }
}

module.exports = new AlertingService()
