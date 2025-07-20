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

class HealthChecker {
  constructor (config = {}) {
    this.config = {
      // デフォルト設定
      checkInterval: 300000, // 5分
      healthThreshold: 0.8, // 80%
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

    // Auto-register components if provided in config
    if (this.config.components) {
      Object.entries(this.config.components).forEach(([name, component]) => {
        this.registerComponent(name, component)
      })
    }
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

      // コンポーネントがhealthCheckまたはisHealthyメソッドを持っている場合
      if (typeof component.instance?.healthCheck === 'function') {
        const result = await Promise.race([
          component.instance.healthCheck(),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 10000)
          )
        ])

        status = result.status || 'healthy'
        metrics = result.metrics || {}
        error = result.error || null
      } else if (typeof component.instance?.isHealthy === 'function') {
        // Alternative isHealthy method
        await Promise.race([
          component.instance.isHealthy(),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 10000)
          )
        ])

        status = 'healthy'
        metrics = { available: true }
      } else if (component.instance) {
        // 基本的な存在チェック
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
   * ヘルスチェック実行 (integration test用エイリアス)
   */
  async checkHealth () {
    return this.performHealthCheck()
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

    // Convert components array to object keyed by component name
    const componentsObj = {}
    results.forEach(result => {
      componentsObj[result.name] = result
    })

    const overallHealth = {
      overall: {
        status: this.determineOverallStatus(healthScore, totalCount),
        score: healthScore,
        totalComponents: totalCount,
        healthyComponents: healthyCount,
        unhealthyComponents: totalCount - healthyCount
      },
      components: componentsObj,
      checkDuration: Date.now() - checkStartTime,
      timestamp: new Date().toISOString()
    }

    // 履歴に追加
    this.addToHistory(overallHealth)

    // アラートチェック
    await this.checkAlerts(overallHealth)

    this.logger.info('Health check completed', {
      status: overallHealth.overall.status,
      score: overallHealth.overall.score,
      duration: overallHealth.checkDuration
    })

    return overallHealth
  }

  /**
   * 全体ステータスを判定
   */
  determineOverallStatus (score, totalComponents = 0) {
    // コンポーネントがない場合は健全とみなす
    if (totalComponents === 0) {
      return 'healthy'
    }

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
    const criticalIssues = Object.values(healthData.components).filter(
      c => c.status === 'unhealthy'
    )

    if (criticalIssues.length > 0 && healthData.overall.score < this.config.alertThreshold) {
      await this.sendAlert({
        type: 'critical',
        message: `System health critical: ${criticalIssues.length} components failing`,
        score: healthData.overall.score,
        failedComponents: criticalIssues.map(c => c.name),
        timestamp: healthData.timestamp
      })
    } else if (healthData.overall.status === 'degraded') {
      // 性能劣化をチェック
      await this.sendAlert({
        type: 'warning',
        message: `System performance degraded: health score ${
          (healthData.overall.score * 100).toFixed(1)
        }%`,
        score: healthData.overall.score,
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
        lastCheck: null,
        totalChecks: 0
      }
    }

    const averageScore = recentHistory.reduce((sum, h) => sum + h.overall.score, 0) /
      recentHistory.length
    const healthyChecks = recentHistory.filter(h => h.overall.status === 'healthy').length
    const uptimePercentage = healthyChecks / recentHistory.length

    const incidentCount = recentHistory.filter(h => h.overall.status === 'unhealthy').length

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
