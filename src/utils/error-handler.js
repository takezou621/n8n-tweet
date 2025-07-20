/**
 * Error Handler - 包括的エラーハンドリング
 * システム全体のエラー処理、分類、ログ出力、回復処理
 */

const { createLogger } = require('./logger')

class ErrorHandler {
  constructor (config = {}) {
    this.config = config
    this.logger = config.logger || createLogger('error')
    this.enableRetry = config.enableRetry !== false
    this.maxRetries = config.maxRetries || 3
    this.retryDelay = config.retryDelay || 1000
    this.enableNotifications = config.enableNotifications || false

    // エラー統計
    this.stats = {
      total: 0,
      byType: {},
      byCategory: {},
      lastReset: Date.now()
    }

    // 重大エラーのしきい値
    this.criticalThreshold = config.criticalThreshold || 5
    this.criticalTimeWindow = config.criticalTimeWindow || 300000 // 5分
    this.criticalErrors = []

    this.setupGlobalHandlers()
  }

  /**
   * グローバルエラーハンドラーを設定
   */
  setupGlobalHandlers () {
    // 未処理の例外をキャッチ
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('uncaught_exception', error, {
        message: 'Uncaught Exception detected - shutting down gracefully'
      })
      process.exit(1)
    })

    // 未処理のPromise拒否をキャッチ
    process.on('unhandledRejection', (reason, promise) => {
      this.handleError('unhandled_rejection', reason, {
        promise: promise.toString(),
        message: 'Unhandled Promise Rejection detected'
      })
    })

    // 警告をログに記録
    process.on('warning', (warning) => {
      this.logger.warn('Process warning', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      })
    })
  }

  /**
   * エラーを分類
   */
  classifyError (error) {
    const errorString = error.toString().toLowerCase()
    const errorCode = error.code
    const errorStatus = error.status || error.statusCode

    // ネットワークエラー
    if (errorCode && ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(errorCode)) {
      return {
        category: 'network',
        severity: 'medium',
        recoverable: true,
        retryable: true
      }
    }

    // HTTPエラー
    if (errorStatus) {
      if (errorStatus >= 500) {
        return {
          category: 'server',
          severity: 'high',
          recoverable: true,
          retryable: true
        }
      } else if (errorStatus === 429) {
        return {
          category: 'rate_limit',
          severity: 'medium',
          recoverable: true,
          retryable: true
        }
      } else if (errorStatus >= 400) {
        return {
          category: 'client',
          severity: 'medium',
          recoverable: false,
          retryable: false
        }
      }
    }

    // Twitter API固有エラー
    if (errorString.includes('twitter') || errorString.includes('tweet')) {
      return {
        category: 'twitter_api',
        severity: 'medium',
        recoverable: true,
        retryable: true
      }
    }

    // RSS関連エラー
    if (errorString.includes('rss') || errorString.includes('feed')) {
      return {
        category: 'rss',
        severity: 'medium',
        recoverable: true,
        retryable: true
      }
    }

    // ファイルシステムエラー
    if (errorCode && ['ENOENT', 'EACCES', 'EMFILE'].includes(errorCode)) {
      return {
        category: 'filesystem',
        severity: 'medium',
        recoverable: true,
        retryable: false
      }
    }

    // データベースエラー
    if (errorString.includes('database') || errorString.includes('sql')) {
      return {
        category: 'database',
        severity: 'high',
        recoverable: true,
        retryable: true
      }
    }

    // バリデーションエラー
    if (error.name === 'ValidationError' || errorString.includes('validation')) {
      return {
        category: 'validation',
        severity: 'low',
        recoverable: false,
        retryable: false
      }
    }

    // メモリエラー
    if (errorString.includes('memory') || errorString.includes('heap')) {
      return {
        category: 'memory',
        severity: 'critical',
        recoverable: false,
        retryable: false
      }
    }

    // デフォルト分類
    return {
      category: 'unknown',
      severity: 'medium',
      recoverable: false,
      retryable: false
    }
  }

  /**
   * メインエラーハンドリングメソッド
   */
  async handleError (type, error, context = {}) {
    const classification = this.classifyError(error)
    const errorInfo = {
      type,
      message: error.message || error.toString(),
      stack: error.stack,
      code: error.code,
      status: error.status || error.statusCode,
      timestamp: new Date().toISOString(),
      classification,
      context
    }

    // 統計を更新
    this.updateStats(type, classification.category)

    // ログに記録
    this.logError(errorInfo)

    // 重大エラーチェック
    if (classification.severity === 'critical') {
      this.handleCriticalError(type, error, context)
      return { success: false, error: errorInfo, retry: false }
    }

    // 通知送信
    if (this.enableNotifications && classification.severity === 'high') {
      await this.sendNotification(errorInfo)
    }

    // リトライ可能な場合の処理
    if (this.enableRetry && classification.retryable) {
      return { success: false, error: errorInfo, retry: true }
    }

    return { success: false, error: errorInfo, retry: false }
  }

  /**
   * 重大エラーの処理
   */
  handleCriticalError (type, error, context = {}) {
    const now = Date.now()
    this.criticalErrors.push({ type, error, context, timestamp: now })

    // 古い重大エラーを削除
    this.criticalErrors = this.criticalErrors.filter(
      e => now - e.timestamp < this.criticalTimeWindow
    )

    this.logger.error('CRITICAL ERROR DETECTED', {
      type,
      error: error.message,
      stack: error.stack,
      context,
      criticalErrorsInWindow: this.criticalErrors.length
    })

    // しきい値を超えた場合のアラート
    if (this.criticalErrors.length >= this.criticalThreshold) {
      this.logger.error('CRITICAL ERROR THRESHOLD EXCEEDED', {
        threshold: this.criticalThreshold,
        timeWindow: this.criticalTimeWindow,
        errors: this.criticalErrors.map(e => ({ type: e.type, message: e.error.message }))
      })
    }
  }

  /**
   * エラーをログに記録
   */
  logError (errorInfo) {
    const logLevel = this.getLogLevel(errorInfo.classification.severity)

    this.logger[logLevel]('Error occurred', {
      type: errorInfo.type,
      category: errorInfo.classification.category,
      severity: errorInfo.classification.severity,
      message: errorInfo.message,
      code: errorInfo.code,
      status: errorInfo.status,
      recoverable: errorInfo.classification.recoverable,
      retryable: errorInfo.classification.retryable,
      context: errorInfo.context,
      stack: errorInfo.stack
    })
  }

  /**
   * ログレベルを決定
   */
  getLogLevel (severity) {
    switch (severity) {
      case 'critical': return 'error'
      case 'high': return 'error'
      case 'medium': return 'warn'
      case 'low': return 'info'
      default: return 'warn'
    }
  }

  /**
   * 統計を更新
   */
  updateStats (type, category) {
    this.stats.total++
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1
    this.stats.byCategory[category] = (this.stats.byCategory[category] || 0) + 1
  }

  /**
   * 通知を送信
   */
  async sendNotification (errorInfo) {
    try {
      // Slack, Discord, メール等への通知実装
      this.logger.info('Error notification sent', {
        type: errorInfo.type,
        severity: errorInfo.classification.severity,
        message: errorInfo.message
      })
    } catch (notificationError) {
      this.logger.error('Failed to send error notification', {
        originalError: errorInfo.message,
        notificationError: notificationError.message
      })
    }
  }

  /**
   * リトライ機能付き関数実行
   */
  async withRetry (fn, context = {}, retryConfig = {}) {
    const maxRetries = retryConfig.maxRetries || this.maxRetries
    const delay = retryConfig.delay || this.retryDelay
    const backoffMultiplier = retryConfig.backoffMultiplier || 1.5

    let lastError
    let currentDelay = delay

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn()

        if (attempt > 0) {
          this.logger.info('Function succeeded after retry', {
            attempts: attempt + 1,
            context
          })
        }

        return { success: true, result, attempts: attempt + 1 }
      } catch (error) {
        lastError = error
        const classification = this.classifyError(error)

        this.logger.warn('Function failed, checking retry eligibility', {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          retryable: classification.retryable,
          error: error.message,
          context
        })

        // 最後の試行またはリトライ不可能な場合
        if (attempt === maxRetries || !classification.retryable) {
          break
        }

        // 待機
        await this.delay(currentDelay)
        currentDelay *= backoffMultiplier
      }
    }

    // 全てのリトライが失敗
    const errorResult = await this.handleError('retry_exhausted', lastError, context)
    return { success: false, error: errorResult.error, attempts: maxRetries + 1 }
  }

  /**
   * 遅延ユーティリティ
   */
  delay (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * エラー回復処理
   */
  async recover (errorType, recoveryStrategy = 'default') {
    this.logger.info('Attempting error recovery', {
      errorType,
      strategy: recoveryStrategy
    })

    try {
      switch (recoveryStrategy) {
        case 'restart_service':
          await this.restartService()
          break
        case 'clear_cache':
          await this.clearCache()
          break
        case 'reset_connections':
          await this.resetConnections()
          break
        default:
          this.logger.info('No specific recovery action defined')
      }

      this.logger.info('Error recovery completed', { errorType, strategy: recoveryStrategy })
      return true
    } catch (recoveryError) {
      this.logger.error('Error recovery failed', {
        errorType,
        strategy: recoveryStrategy,
        recoveryError: recoveryError.message
      })
      return false
    }
  }

  /**
   * サービス再起動（プレースホルダー）
   */
  async restartService () {
    this.logger.info('Service restart initiated')
    // 実際の再起動ロジックをここに実装
  }

  /**
   * キャッシュクリア（プレースホルダー）
   */
  async clearCache () {
    this.logger.info('Cache clearing initiated')
    // 実際のキャッシュクリアロジックをここに実装
  }

  /**
   * 接続リセット（プレースホルダー）
   */
  async resetConnections () {
    this.logger.info('Connection reset initiated')
    // 実際の接続リセットロジックをここに実装
  }

  /**
   * エラー統計を取得
   */
  getStats () {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.lastReset,
      criticalErrorsInWindow: this.criticalErrors.length,
      topErrorTypes: this.getTopErrors(this.stats.byType),
      topErrorCategories: this.getTopErrors(this.stats.byCategory)
    }
  }

  /**
   * トップエラーを取得
   */
  getTopErrors (errorMap, limit = 5) {
    return Object.entries(errorMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([type, count]) => ({ type, count }))
  }

  /**
   * 統計をリセット
   */
  resetStats () {
    this.stats = {
      total: 0,
      byType: {},
      byCategory: {},
      lastReset: Date.now()
    }
    this.criticalErrors = []
    this.logger.info('Error statistics reset')
  }

  /**
   * ヘルスチェック
   */
  getHealth () {
    const stats = this.getStats()
    // Calculate error rate per minute
    const recentErrorRate = this.criticalErrors.length / (this.criticalTimeWindow / 60000)

    return {
      status: recentErrorRate < 1 ? 'healthy' : 'degraded',
      errorRate: recentErrorRate,
      totalErrors: stats.total,
      criticalErrors: stats.criticalErrorsInWindow,
      uptime: stats.uptime
    }
  }
}

// ユーティリティ関数
function createErrorHandler (config = {}) {
  return new ErrorHandler(config)
}

// デフォルトエラーハンドラーインスタンス
const defaultErrorHandler = new ErrorHandler()

module.exports = {
  ErrorHandler,
  createErrorHandler,
  default: defaultErrorHandler
}
