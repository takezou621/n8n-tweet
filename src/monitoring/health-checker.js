/**
 * ヘルスチェッカー
 * システム全体の健全性を監視
 *
 * Features:
 * - システムコンポーネントの監視
 * - パフォーマンスメトリクス収集
 * - アラート通知
 * - 自動回復機能
 */

const winston = require('winston')
const fs = require('fs').promises
const path = require('path')

class HealthChecker {
  constructor (config = {}) {
    this.config = {
      // デフォルト設定
      checkInterval: 300000, // 5分
      healthThreshold: 0.8, // 80%以上で健全
      alertThreshold: 0.5, // 50%以下でアラート
      maxHistory: 1000,
      enableAlerts: true,
      logLevel: 'info',
      ...config
    }

    this.initializeLogger()
    this.healthHistory = []
    this.components = new Map()
    this.isRunning = false
    this.intervalId = null
    this.lastAlert = null
  }

  /**
   * ロガーを初期化
   */
  initializeLogger () {
    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          silent: process.env.NODE_ENV === 'test',
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })
  }

  /**
   * コンポーネントを登録
   */
  registerComponent (name, component) {
    if (!name || !component) {
      throw new Error('Component name and instance are required')
    }

    this.components.set(name, {
      instance: component,
      lastCheck: null,
      status: 'unknown',
      error: null,
      metrics: {}
    })

    this.logger.info('Component registered for health monitoring', {
      componentName: name
    })
  }

  /**
   * コンポーネントの登録を解除
   */
  unregisterComponent (name) {
    if (this.components.has(name)) {
      this.components.delete(name)
      this.logger.info('Component unregistered from health monitoring', {
        componentName: name
      })
    }
  }

  /**
   * 個別コンポーネントのヘルスチェック
   */
  async checkComponent (name, component) {
    const startTime = Date.now()

    try {
      let status = 'healthy'
      let metrics = {}
      let error = null

      // コンポーネントがhealthCheckメソッドを持っている場合
      if (typeof component.instance?.healthCheck === 'function') {
        const result = await Promise.race([
          component.instance.healthCheck(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 10000)
          )
        ])

        status = result.status || 'healthy'
        metrics = result.metrics || {}
        error = result.error || null
      }
      // 基本的な存在チェック
      else if (component.instance) {
        status = 'healthy'
        metrics = { available: true }
      } else {
        status = 'unhealthy'
        error = 'Component instance not available'
      }

      const responseTime = Date.now() - startTime

      return {
        name,
        status,
        responseTime,
        error,
        metrics,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      const responseTime = Date.now() - startTime

      return {
        name,
        status: 'unhealthy',
        responseTime,
        error: error.message,
        metrics: {},
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 全コンポーネントのヘルスチェック実行
   */
  async performHealthCheck () {
    const checkStartTime = Date.now()
    const results = []

    this.logger.info('Starting system health check', {
      componentCount: this.components.size
    })

    // 全コンポーネントを並列でチェック
    const componentChecks = Array.from(this.components.entries()).map(
      ([name, component]) => this.checkComponent(name, component)
    )

    try {
      const componentResults = await Promise.allSettled(componentChecks)

      componentResults.forEach((result, index) => {
        const componentName = Array.from(this.components.keys())[index]

        if (result.status === 'fulfilled') {
          results.push(result.value)

          // コンポーネント状態を更新
          const component = this.components.get(componentName)
          component.lastCheck = new Date().toISOString()
          component.status = result.value.status
          component.error = result.value.error
          component.metrics = result.value.metrics
        } else {
          results.push({
            name: componentName,
            status: 'unhealthy',
            responseTime: 0,
            error: result.reason?.message || 'Unknown error',
            metrics: {},
            timestamp: new Date().toISOString()
          })
        }
      })
    } catch (error) {
      this.logger.error('Health check execution failed', {
        error: error.message
      })
    }

    // 全体の健全性を計算
    const healthyCount = results.filter(r => r.status === 'healthy').length
    const totalCount = results.length
    const healthScore = totalCount > 0 ? healthyCount / totalCount : 0

    const overallHealth = {
      status: this.determineOverallStatus(healthScore),
      score: healthScore,
      totalComponents: totalCount,
      healthyComponents: healthyCount,
      unhealthyComponents: totalCount - healthyCount,
      checkDuration: Date.now() - checkStartTime,
      timestamp: new Date().toISOString(),
      components: results
    }

    // 履歴に追加
    this.addToHistory(overallHealth)

    // アラートチェック
    await this.checkAlerts(overallHealth)

    this.logger.info('Health check completed', {
      status: overallHealth.status,
      score: overallHealth.score,
      duration: overallHealth.checkDuration
    })

    return overallHealth
  }

  /**
   * 全体ステータスを判定
   */
  determineOverallStatus (score) {
    if (score >= this.config.healthThreshold) {
      return 'healthy'
    } else if (score >= this.config.alertThreshold) {
      return 'degraded'
    } else {
      return 'unhealthy'
    }
  }

  /**
   * 履歴に追加
   */
  addToHistory (healthData) {
    this.healthHistory.push(healthData)

    // 履歴サイズを制限
    if (this.healthHistory.length > this.config.maxHistory) {
      this.healthHistory = this.healthHistory.slice(-this.config.maxHistory)
    }
  }

  /**
   * アラートチェック
   */
  async checkAlerts (healthData) {
    if (!this.config.enableAlerts) {
      return
    }

    // 重大な問題をチェック
    const criticalIssues = healthData.components.filter(
      c => c.status === 'unhealthy'
    )

    if (criticalIssues.length > 0 && healthData.score < this.config.alertThreshold) {
      await this.sendAlert({
        type: 'critical',
        message: `System health critical: ${criticalIssues.length} components failing`,
        score: healthData.score,
        failedComponents: criticalIssues.map(c => c.name),
        timestamp: healthData.timestamp
      })
    }

    // 性能劣化をチェック
    else if (healthData.status === 'degraded') {
      await this.sendAlert({
        type: 'warning',
        message: `System performance degraded: health score ${(healthData.score * 100).toFixed(1)}%`,
        score: healthData.score,
        timestamp: healthData.timestamp
      })
    }
  }

  /**
   * アラート送信
   */
  async sendAlert (alertData) {
    const now = Date.now()
    const alertCooldown = 300000 // 5分のクールダウン

    // クールダウン中かチェック
    if (this.lastAlert && (now - this.lastAlert) < alertCooldown) {
      return
    }

    this.logger.error('Health alert triggered', alertData)

    this.lastAlert = now

    // 将来的にはSlack、メール、Webhookなどの通知を実装
    // 現在はログ出力のみ
  }

  /**
   * 統計情報を取得
   */
  getHealthStats (timeRange = 3600000) { // デフォルト1時間
    const cutoffTime = new Date(Date.now() - timeRange)
    const recentHistory = this.healthHistory.filter(
      h => new Date(h.timestamp) > cutoffTime
    )

    if (recentHistory.length === 0) {
      return {
        averageScore: 0,
        uptimePercentage: 0,
        incidentCount: 0,
        lastCheck: null
      }
    }

    const averageScore = recentHistory.reduce((sum, h) => sum + h.score, 0) / recentHistory.length
    const healthyChecks = recentHistory.filter(h => h.status === 'healthy').length
    const uptimePercentage = healthyChecks / recentHistory.length

    const incidentCount = recentHistory.filter(h => h.status === 'unhealthy').length

    return {
      averageScore: Math.round(averageScore * 100) / 100,
      uptimePercentage: Math.round(uptimePercentage * 10000) / 100,
      incidentCount,
      lastCheck: recentHistory[recentHistory.length - 1]?.timestamp || null,
      totalChecks: recentHistory.length
    }
  }

  /**
   * 定期ヘルスチェック開始
   */
  startPeriodicChecks () {
    if (this.isRunning) {
      this.logger.warn('Health checker is already running')
      return
    }

    this.logger.info('Starting periodic health checks', {
      interval: this.config.checkInterval
    })

    this.isRunning = true
    this.intervalId = setInterval(async () => {
      try {
        await this.performHealthCheck()
      } catch (error) {
        this.logger.error('Periodic health check failed', {
          error: error.message
        })
      }
    }, this.config.checkInterval)
  }

  /**
   * 定期ヘルスチェック停止
   */
  stopPeriodicChecks () {
    if (!this.isRunning) {
      return
    }

    this.logger.info('Stopping periodic health checks')

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.isRunning = false
  }

  /**
   * 履歴をファイルに保存
   */
  async saveHistoryToFile (filePath) {
    try {
      const historyData = {
        exported: new Date().toISOString(),
        config: this.config,
        history: this.healthHistory
      }

      await fs.writeFile(filePath, JSON.stringify(historyData, null, 2))

      this.logger.info('Health history saved to file', {
        filePath,
        recordCount: this.healthHistory.length
      })
    } catch (error) {
      this.logger.error('Failed to save health history', {
        error: error.message,
        filePath
      })
      throw error
    }
  }

  /**
   * 履歴をファイルから読み込み
   */
  async loadHistoryFromFile (filePath) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf8')
      const historyData = JSON.parse(fileContent)

      this.healthHistory = historyData.history || []

      this.logger.info('Health history loaded from file', {
        filePath,
        recordCount: this.healthHistory.length
      })
    } catch (error) {
      this.logger.error('Failed to load health history', {
        error: error.message,
        filePath
      })
      throw error
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup () {
    this.stopPeriodicChecks()
    this.components.clear()
    this.healthHistory = []

    this.logger.info('Health checker cleaned up')
  }
}

module.exports = HealthChecker
