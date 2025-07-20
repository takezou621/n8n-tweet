/**
 * メトリクス収集器
 * システムパフォーマンスとビジネスメトリクスを収集
 *
 * Features:
 * - パフォーマンスメトリクス
 * - ビジネスメトリクス（ツイート数、フィード処理など）
 * - 時系列データ管理
 * - メトリクス分析
 */

const winston = require('winston')
const fs = require('fs').promises
const path = require('path')

class MetricsCollector {
  constructor (config = {}) {
    this.config = {
      // デフォルト設定
      collectInterval: 60000, // 1分
      maxHistory: 10000,
      enableCollection: true,
      metricsFile: './logs/metrics.json',
      logLevel: 'info',
      ...config
    }

    this.initializeLogger()
    this.metrics = new Map()
    this.timeSeries = new Map()
    this.isCollecting = false
    this.intervalId = null
    this.customMetrics = new Map()
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
   * カスタムメトリクスを登録
   */
  registerMetric (name, type = 'counter', description = '') {
    if (!name) {
      throw new Error('Metric name is required')
    }

    this.customMetrics.set(name, {
      name,
      type, // counter, gauge, histogram
      description,
      value: type === 'counter' ? 0 : null,
      history: [],
      created: new Date().toISOString()
    })

    this.logger.info('Custom metric registered', { name, type, description })
  }

  /**
   * メトリクス値を記録
   */
  recordMetric (name, value, tags = {}) {
    const timestamp = new Date().toISOString()

    if (!this.customMetrics.has(name)) {
      // 自動登録
      this.registerMetric(name, 'gauge', 'Auto-registered metric')
    }

    const metric = this.customMetrics.get(name)

    if (metric.type === 'counter') {
      metric.value += (typeof value === 'number' ? value : 1)
    } else {
      metric.value = value
    }

    // 履歴に追加
    metric.history.push({
      value: metric.type === 'counter' ? metric.value : value,
      timestamp,
      tags
    })

    // 履歴サイズを制限
    if (metric.history.length > this.config.maxHistory) {
      metric.history = metric.history.slice(-this.config.maxHistory)
    }

    // 時系列データに記録
    if (!this.timeSeries.has(name)) {
      this.timeSeries.set(name, [])
    }

    const timeSeries = this.timeSeries.get(name)
    timeSeries.push({
      timestamp,
      value: metric.type === 'counter' ? metric.value : value,
      tags
    })

    // 時系列データのサイズも制限
    if (timeSeries.length > this.config.maxHistory) {
      this.timeSeries.set(name, timeSeries.slice(-this.config.maxHistory))
    }

    this.logger.debug('Metric recorded', { name, value, tags })
  }

  /**
   * カウンターを増加
   */
  incrementCounter (name, amount = 1, tags = {}) {
    this.recordMetric(name, amount, tags)
  }

  /**
   * ゲージ値を設定
   */
  setGauge (name, value, tags = {}) {
    this.recordMetric(name, value, tags)
  }

  /**
   * 実行時間を測定してヒストグラムに記録
   */
  async measureExecutionTime (name, asyncFunction, tags = {}) {
    const startTime = Date.now()

    try {
      const result = await asyncFunction()
      const duration = Date.now() - startTime

      this.recordMetric(`${name}_duration_ms`, duration, {
        ...tags,
        status: 'success'
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      this.recordMetric(`${name}_duration_ms`, duration, {
        ...tags,
        status: 'error'
      })

      this.incrementCounter(`${name}_errors`, 1, tags)
      throw error
    }
  }

  /**
   * システムメトリクスを収集
   */
  collectSystemMetrics () {
    const memUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()

    // メモリメトリクス
    this.setGauge('system_memory_used_bytes', memUsage.used)
    this.setGauge('system_memory_heap_used_bytes', memUsage.heapUsed)
    this.setGauge('system_memory_heap_total_bytes', memUsage.heapTotal)
    this.setGauge('system_memory_external_bytes', memUsage.external)

    // CPU メトリクス
    this.setGauge('system_cpu_user_microseconds', cpuUsage.user)
    this.setGauge('system_cpu_system_microseconds', cpuUsage.system)

    // プロセスメトリクス
    this.setGauge('system_process_uptime_seconds', process.uptime())
  }

  /**
   * アプリケーションメトリクスを収集
   */
  collectApplicationMetrics (bot) {
    if (!bot) return

    try {
      // Twitter統計
      if (bot.twitterClient) {
        const twitterStats = bot.twitterClient.getStats()
        this.setGauge('twitter_total_posts', twitterStats.total)
        this.setGauge('twitter_successful_posts', twitterStats.successful)
        this.setGauge('twitter_failed_posts', twitterStats.failed)

        // 成功率
        const successRate = twitterStats.total > 0
          ? (twitterStats.successful / twitterStats.total) * 100
          : 0
        this.setGauge('twitter_success_rate_percentage', successRate)
      }

      // フィード処理統計（前回の結果から）
      if (bot.lastFeedResults) {
        this.setGauge('rss_items_processed', bot.lastFeedResults.allItems?.length || 0)
        this.setGauge('rss_items_filtered', bot.lastFeedResults.filteredItems?.length || 0)
        this.setGauge('rss_items_unique', bot.lastFeedResults.uniqueItems?.length || 0)
        this.setGauge('tweets_generated', bot.lastFeedResults.tweets?.length || 0)
        this.setGauge('tweets_optimal', bot.lastFeedResults.optimalTweets?.length || 0)
      }

      // コンポーネントステータス
      const componentCount = ['feedParser', 'contentFilter', 'duplicateChecker',
        'tweetGenerator', 'twitterClient'].length
      this.setGauge('components_total', componentCount)
    } catch (error) {
      this.logger.error('Failed to collect application metrics', {
        error: error.message
      })
    }
  }

  /**
   * 全メトリクスを収集
   */
  async collectAllMetrics (bot = null) {
    try {
      this.collectSystemMetrics()
      this.collectApplicationMetrics(bot)

      this.logger.debug('All metrics collected', {
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Failed to collect metrics', { error: error.message })
    }
  }

  /**
   * メトリクス統計を取得
   */
  getMetricStats (name, timeRange = 3600000) { // デフォルト1時間
    if (!this.timeSeries.has(name)) {
      return null
    }

    const cutoffTime = new Date(Date.now() - timeRange)
    const recentData = this.timeSeries.get(name).filter(
      point => new Date(point.timestamp) > cutoffTime
    )

    if (recentData.length === 0) {
      return null
    }

    const values = recentData.map(point => point.value).filter(v => typeof v === 'number')

    if (values.length === 0) {
      return null
    }

    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)

    // パーセンタイル計算
    const sorted = [...values].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)]
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]

    return {
      count: values.length,
      sum,
      avg: Math.round(avg * 100) / 100,
      min,
      max,
      p50,
      p95,
      p99,
      timeRange: timeRange / 1000, // 秒単位
      latest: values[values.length - 1]
    }
  }

  /**
   * 全メトリクスの要約を取得
   */
  getAllMetricsSummary (timeRange = 3600000) {
    const summary = {
      timestamp: new Date().toISOString(),
      timeRange: timeRange / 1000,
      metrics: {}
    }

    this.customMetrics.forEach((metric, name) => {
      const stats = this.getMetricStats(name, timeRange)
      summary.metrics[name] = {
        type: metric.type,
        description: metric.description,
        currentValue: metric.value,
        stats
      }
    })

    return summary
  }

  /**
   * 定期メトリクス収集開始
   */
  startPeriodicCollection (bot = null) {
    if (this.isCollecting) {
      this.logger.warn('Metrics collection is already running')
      return
    }

    if (!this.config.enableCollection) {
      this.logger.info('Metrics collection is disabled')
      return
    }

    this.logger.info('Starting periodic metrics collection', {
      interval: this.config.collectInterval
    })

    this.isCollecting = true
    this.intervalId = setInterval(async () => {
      try {
        await this.collectAllMetrics(bot)
      } catch (error) {
        this.logger.error('Periodic metrics collection failed', {
          error: error.message
        })
      }
    }, this.config.collectInterval)
  }

  /**
   * 定期メトリクス収集停止
   */
  stopPeriodicCollection () {
    if (!this.isCollecting) {
      return
    }

    this.logger.info('Stopping periodic metrics collection')

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.isCollecting = false
  }

  /**
   * メトリクスをファイルに保存
   */
  async saveMetricsToFile (filePath = null) {
    const targetPath = filePath || this.config.metricsFile

    try {
      const metricsData = {
        exported: new Date().toISOString(),
        config: this.config,
        metrics: Object.fromEntries(this.customMetrics),
        timeSeries: Object.fromEntries(this.timeSeries)
      }

      // ディレクトリを作成
      const dir = path.dirname(targetPath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(targetPath, JSON.stringify(metricsData, null, 2))

      this.logger.info('Metrics saved to file', {
        filePath: targetPath,
        metricCount: this.customMetrics.size
      })
    } catch (error) {
      this.logger.error('Failed to save metrics', {
        error: error.message,
        filePath: targetPath
      })
      throw error
    }
  }

  /**
   * メトリクスをファイルから読み込み
   */
  async loadMetricsFromFile (filePath = null) {
    const sourcePath = filePath || this.config.metricsFile

    try {
      const fileContent = await fs.readFile(sourcePath, 'utf8')
      const metricsData = JSON.parse(fileContent)

      if (metricsData.metrics) {
        this.customMetrics = new Map(Object.entries(metricsData.metrics))
      }

      if (metricsData.timeSeries) {
        this.timeSeries = new Map(Object.entries(metricsData.timeSeries))
      }

      this.logger.info('Metrics loaded from file', {
        filePath: sourcePath,
        metricCount: this.customMetrics.size
      })
    } catch (error) {
      this.logger.error('Failed to load metrics', {
        error: error.message,
        filePath: sourcePath
      })
      throw error
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup () {
    this.stopPeriodicCollection()

    // 最終保存
    if (this.config.enableCollection && this.customMetrics.size > 0) {
      try {
        await this.saveMetricsToFile()
      } catch (error) {
        this.logger.error('Failed to save metrics during cleanup', {
          error: error.message
        })
      }
    }

    this.customMetrics.clear()
    this.timeSeries.clear()

    this.logger.info('Metrics collector cleaned up')
  }
}

module.exports = MetricsCollector
