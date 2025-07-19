/**
 * Logger - 包括的ログシステム
 * Winston を使用した構造化ログ出力、レベル別管理、ファイル出力
 */

const winston = require('winston')
const path = require('path')
const fs = require('fs')

class Logger {
  constructor (config = {}) {
    this.config = config
    this.logDir = config.logDir || 'logs'
    this.category = config.category || 'general'

    // ログディレクトリを作成
    this.ensureLogDirectory()

    // Winston ロガーを設定
    this.setupLogger()
  }

  /**
   * ログディレクトリを確保
   */
  ensureLogDirectory () {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  /**
   * Winston ロガーをセットアップ
   */
  setupLogger () {
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(info => {
        const { timestamp, level, message, category, ...meta } = info
        const logObject = {
          timestamp,
          level,
          category: category || this.category,
          message,
          ...(Object.keys(meta).length > 0 && { meta })
        }
        return JSON.stringify(logObject)
      })
    )

    const transports = []

    // コンソール出力
    if (this.config.enableConsole !== false) {
      transports.push(new winston.transports.Console({
        level: this.config.consoleLevel || 'debug',
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf(info => {
            const { timestamp, level, message, category } = info
            return `${timestamp} [${level}] ${category || this.category}: ${message}`
          })
        )
      }))
    }

    // ファイル出力 - 全般ログ
    transports.push(new winston.transports.File({
      filename: path.join(this.logDir, 'app.log'),
      level: this.config.fileLevel || 'info',
      format: logFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true
    }))

    // ファイル出力 - エラーログ
    transports.push(new winston.transports.File({
      filename: path.join(this.logDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true
    }))

    // カテゴリ別ログファイル
    if (this.category !== 'general') {
      transports.push(new winston.transports.File({
        filename: path.join(this.logDir, `${this.category}.log`),
        level: this.config.categoryLevel || 'info',
        format: logFormat,
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 7,
        tailable: true
      }))
    }

    this.logger = winston.createLogger({
      level: this.config.level || 'info',
      format: logFormat,
      defaultMeta: { category: this.category },
      transports,
      exitOnError: false
    })

    // 未処理例外とPromise拒否をキャッチ
    this.logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(this.logDir, 'exceptions.log'),
        maxsize: 5 * 1024 * 1024,
        maxFiles: 3
      })
    )

    this.logger.rejections.handle(
      new winston.transports.File({
        filename: path.join(this.logDir, 'rejections.log'),
        maxsize: 5 * 1024 * 1024,
        maxFiles: 3
      })
    )
  }

  /**
   * 機密情報をサニタイズ
   */
  sanitizeData (data) {
    if (typeof data !== 'object' || data === null) {
      return data
    }

    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'credential',
      'authorization', 'auth', 'key', 'access_token'
    ]

    const sanitized = { ...data }

    const sanitizeObject = (obj) => {
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase()

        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          obj[key] = '[REDACTED]'
        } else if (typeof value === 'object' && value !== null) {
          sanitizeObject(value)
        }
      }
    }

    sanitizeObject(sanitized)
    return sanitized
  }

  /**
   * ログレベル別メソッド
   */
  debug (message, meta = {}) {
    this.logger.debug(message, this.sanitizeData(meta))
  }

  info (message, meta = {}) {
    this.logger.info(message, this.sanitizeData(meta))
  }

  warn (message, meta = {}) {
    this.logger.warn(message, this.sanitizeData(meta))
  }

  error (message, meta = {}) {
    this.logger.error(message, this.sanitizeData(meta))
  }

  /**
   * 特定目的のログメソッド
   */

  /**
   * RSS関連ログ
   */
  rss (level, message, meta = {}) {
    this.logger.log(level, message, {
      ...this.sanitizeData(meta),
      category: 'rss',
      type: 'rss_operation'
    })
  }

  /**
   * Twitter関連ログ
   */
  twitter (level, message, meta = {}) {
    this.logger.log(level, message, {
      ...this.sanitizeData(meta),
      category: 'twitter',
      type: 'twitter_operation'
    })
  }

  /**
   * フィルタリング関連ログ
   */
  filtering (level, message, meta = {}) {
    this.logger.log(level, message, {
      ...this.sanitizeData(meta),
      category: 'filtering',
      type: 'content_filtering'
    })
  }

  /**
   * 監視関連ログ
   */
  monitoring (level, message, meta = {}) {
    this.logger.log(level, message, {
      ...this.sanitizeData(meta),
      category: 'monitoring',
      type: 'system_monitoring'
    })
  }

  /**
   * セキュリティ関連ログ
   */
  security (level, message, meta = {}) {
    this.logger.log(level, message, {
      ...this.sanitizeData(meta),
      category: 'security',
      type: 'security_event'
    })
  }

  /**
   * パフォーマンス関連ログ
   */
  performance (message, metrics = {}) {
    this.logger.info(message, {
      ...metrics,
      category: 'performance',
      type: 'performance_metric'
    })
  }

  /**
   * API呼び出しログ
   */
  api (method, url, status, duration, meta = {}) {
    this.logger.info('API call', {
      method,
      url,
      status,
      duration: `${duration}ms`,
      ...this.sanitizeData(meta),
      type: 'api_call'
    })
  }

  /**
   * データベース操作ログ
   */
  database (operation, table, duration, meta = {}) {
    this.logger.info('Database operation', {
      operation,
      table,
      duration: `${duration}ms`,
      ...this.sanitizeData(meta),
      type: 'database_operation'
    })
  }

  /**
   * ユーザーアクションログ
   */
  userAction (userId, action, resource, meta = {}) {
    this.logger.info('User action', {
      userId,
      action,
      resource,
      ...this.sanitizeData(meta),
      type: 'user_action'
    })
  }

  /**
   * ビジネスロジックログ
   */
  business (event, data = {}) {
    this.logger.info(`Business event: ${event}`, {
      event,
      ...this.sanitizeData(data),
      type: 'business_event'
    })
  }

  /**
   * 統計・メトリクスログ
   */
  metrics (name, value, unit = '', tags = {}) {
    this.logger.info('Metric recorded', {
      metric: name,
      value,
      unit,
      tags,
      type: 'metric'
    })
  }

  /**
   * ヘルスチェックログ
   */
  health (component, status, responseTime, meta = {}) {
    this.logger.info('Health check', {
      component,
      status,
      responseTime: `${responseTime}ms`,
      ...meta,
      type: 'health_check'
    })
  }

  /**
   * ログレベルを動的に変更
   */
  setLevel (level) {
    this.logger.level = level
    this.logger.transports.forEach(transport => {
      if (transport.name === 'console') {
        transport.level = level
      }
    })
  }

  /**
   * 新しいカテゴリのロガーを作成
   */
  child (category, additionalConfig = {}) {
    return new Logger({
      ...this.config,
      ...additionalConfig,
      category,
      logDir: this.logDir
    })
  }

  /**
   * ログファイルを手動でローテーション
   */
  rotate () {
    this.logger.transports.forEach(transport => {
      if (transport.rotate) {
        transport.rotate()
      }
    })
  }

  /**
   * ログをクリーンアップ
   */
  cleanup () {
    if (this.logger) {
      this.logger.close()
    }
  }

  /**
   * 統計情報を取得
   */
  getStats () {
    const stats = {
      logDir: this.logDir,
      category: this.category,
      level: this.logger.level,
      transportsCount: this.logger.transports.length
    }

    // ログファイルサイズを取得
    try {
      const files = fs.readdirSync(this.logDir)
      stats.files = files.map(file => {
        const filePath = path.join(this.logDir, file)
        const stat = fs.statSync(filePath)
        return {
          name: file,
          size: stat.size,
          modified: stat.mtime
        }
      })
    } catch (error) {
      stats.files = []
    }

    return stats
  }
}

// ファクトリー関数
function createLogger (category = 'general', config = {}) {
  return new Logger({ ...config, category })
}

// デフォルトロガーインスタンス
const defaultLogger = new Logger()

module.exports = {
  Logger,
  createLogger,
  default: defaultLogger
}
