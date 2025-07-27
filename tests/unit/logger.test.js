/**
 * Logger クラスのユニットテスト
 * TDD方式での包括的テスト実装
 */

const { Logger, createLogger } = require('../../src/utils/logger')
const fs = require('fs')
const path = require('path')

describe('Logger', () => {
  let logger
  let testLogDir

  beforeEach(() => {
    // テスト用の一時ログディレクトリ
    testLogDir = path.join(__dirname, '..', 'temp-logs')

    // 既存のテストログディレクトリを削除
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true })
    }

    logger = new Logger({
      logDir: testLogDir,
      category: 'test',
      enableConsole: false // テスト中はコンソール出力を無効化
    })
  })

  afterEach(() => {
    // クリーンアップ
    if (logger) {
      logger.cleanup()
    }

    // テストログディレクトリを削除
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true })
    }
  })

  describe('初期化', () => {
    test('デフォルト設定でLoggerインスタンスが作成できる', () => {
      const defaultLogger = new Logger()
      expect(defaultLogger).toBeInstanceOf(Logger)
      expect(defaultLogger.category).toBe('general')
      expect(defaultLogger.logDir).toBe('logs')
      defaultLogger.cleanup()
    })

    test('カスタム設定でLoggerインスタンスが作成できる', () => {
      expect(logger).toBeInstanceOf(Logger)
      expect(logger.category).toBe('test')
      expect(logger.logDir).toBe(testLogDir)
    })

    test('ログディレクトリが自動作成される', () => {
      expect(fs.existsSync(testLogDir)).toBe(true)
    })
  })

  describe('ログレベル出力', () => {
    test('debugレベルのログが出力できる', () => {
      const message = 'Debug test message'
      const meta = { test: 'debug' }

      expect(() => {
        logger.debug(message, meta)
      }).not.toThrow()
    })

    test('infoレベルのログが出力できる', () => {
      const message = 'Info test message'
      const meta = { test: 'info' }

      expect(() => {
        logger.info(message, meta)
      }).not.toThrow()
    })

    test('warnレベルのログが出力できる', () => {
      const message = 'Warning test message'
      const meta = { test: 'warn' }

      expect(() => {
        logger.warn(message, meta)
      }).not.toThrow()
    })

    test('errorレベルのログが出力できる', () => {
      const message = 'Error test message'
      const meta = { test: 'error' }

      expect(() => {
        logger.error(message, meta)
      }).not.toThrow()
    })
  })

  describe('機密情報サニタイズ', () => {
    test('パスワードフィールドがマスクされる', () => {
      const sensitiveData = {
        username: 'testuser',
        password: 'secret123',
        profile: {
          token: 'sensitive-token'
        }
      }

      const sanitized = logger.sanitizeData(sensitiveData)

      expect(sanitized.username).toBe('testuser')
      expect(sanitized.password).toBe('[REDACTED]')
      expect(sanitized.profile.token).toBe('[REDACTED]')
    })

    test('APIキーフィールドがマスクされる', () => {
      const sensitiveData = {
        apiKey: 'api-key-123',
        secret: 'app-secret',
        credential: 'user-credential'
      }

      const sanitized = logger.sanitizeData(sensitiveData)

      expect(sanitized.apiKey).toBe('[REDACTED]')
      expect(sanitized.secret).toBe('[REDACTED]')
      expect(sanitized.credential).toBe('[REDACTED]')
    })

    test('非オブジェクトデータがそのまま返される', () => {
      expect(logger.sanitizeData('string')).toBe('string')
      expect(logger.sanitizeData(123)).toBe(123)
      expect(logger.sanitizeData(null)).toBe(null)
    })
  })

  describe('特定目的のログメソッド', () => {
    test('RSS関連ログが出力できる', () => {
      expect(() => {
        logger.rss('info', 'RSS feed processed', { feedUrl: 'https://example.com/feed' })
      }).not.toThrow()
    })

    test('Twitter関連ログが出力できる', () => {
      expect(() => {
        logger.twitter('info', 'Tweet posted', { tweetId: '123456' })
      }).not.toThrow()
    })

    test('フィルタリング関連ログが出力できる', () => {
      expect(() => {
        logger.filtering('debug', 'Content filtered', { reason: 'spam' })
      }).not.toThrow()
    })

    test('監視関連ログが出力できる', () => {
      expect(() => {
        logger.monitoring('info', 'Health check passed', { component: 'database' })
      }).not.toThrow()
    })

    test('セキュリティ関連ログが出力できる', () => {
      expect(() => {
        logger.security('warn', 'Suspicious activity detected', { ip: '192.168.1.1' })
      }).not.toThrow()
    })
  })

  describe('パフォーマンス・メトリクスログ', () => {
    test('パフォーマンスログが出力できる', () => {
      const metrics = { responseTime: 150, memory: '45MB' }

      expect(() => {
        logger.performance('API response time', metrics)
      }).not.toThrow()
    })

    test('API呼び出しログが出力できる', () => {
      expect(() => {
        logger.api('POST', '/api/tweets', 200, 120, { userId: 'user123' })
      }).not.toThrow()
    })

    test('データベース操作ログが出力できる', () => {
      expect(() => {
        logger.database('SELECT', 'tweets', 45, { rowCount: 10 })
      }).not.toThrow()
    })

    test('メトリクスログが出力できる', () => {
      expect(() => {
        logger.metrics('cpu_usage', 75.5, '%', { server: 'app1' })
      }).not.toThrow()
    })

    test('ヘルスチェックログが出力できる', () => {
      expect(() => {
        logger.health('database', 'healthy', 25, { connection: 'active' })
      }).not.toThrow()
    })
  })

  describe('ユーティリティメソッド', () => {
    test('ログレベルを動的に変更できる', () => {
      expect(() => {
        logger.setLevel('error')
      }).not.toThrow()
    })

    test('子ロガーを作成できる', () => {
      const childLogger = logger.child('child-category')

      expect(childLogger).toBeInstanceOf(Logger)
      expect(childLogger.category).toBe('child-category')

      childLogger.cleanup()
    })

    test('統計情報を取得できる', () => {
      const stats = logger.getStats()

      expect(stats).toHaveProperty('logDir')
      expect(stats).toHaveProperty('category')
      expect(stats).toHaveProperty('level')
      expect(stats).toHaveProperty('transportsCount')
      expect(stats).toHaveProperty('files')

      expect(stats.logDir).toBe(testLogDir)
      expect(stats.category).toBe('test')
    })
  })

  describe('ファイル出力', () => {
    test('アプリケーションログファイルが作成される', async () => {
      logger.info('Test log message')

      // 少し待ってファイル書き込みを確認
      await new Promise(resolve => setTimeout(resolve, 100))

      const appLogPath = path.join(testLogDir, 'app.log')
      expect(fs.existsSync(appLogPath)).toBe(true)
    })

    test('エラーログファイルが作成される', async () => {
      logger.error('Test error message')

      // 少し待ってファイル書き込みを確認
      await new Promise(resolve => setTimeout(resolve, 100))

      const errorLogPath = path.join(testLogDir, 'error.log')
      expect(fs.existsSync(errorLogPath)).toBe(true)
    })

    test('カテゴリ別ログファイルが作成される', async () => {
      logger.info('Test category message')

      // 少し待ってファイル書き込みを確認
      await new Promise(resolve => setTimeout(resolve, 100))

      const categoryLogPath = path.join(testLogDir, 'test.log')
      expect(fs.existsSync(categoryLogPath)).toBe(true)
    })
  })

  describe('ファクトリー関数', () => {
    test('createLogger関数でLoggerインスタンスを作成できる', () => {
      const factoryLogger = createLogger('factory-test', {
        logDir: testLogDir,
        enableConsole: false
      })

      expect(factoryLogger).toBeInstanceOf(Logger)
      expect(factoryLogger.category).toBe('factory-test')

      factoryLogger.cleanup()
    })
  })

  describe('エラーハンドリング', () => {
    test('存在しないログディレクトリでもエラーなく動作する', () => {
      const nonExistentDir = path.join(__dirname, 'non-existent-dir')

      expect(() => {
        const testLogger = new Logger({
          logDir: nonExistentDir,
          enableConsole: false
        })
        testLogger.info('Test message')
        testLogger.cleanup()

        // クリーンアップ
        if (fs.existsSync(nonExistentDir)) {
          fs.rmSync(nonExistentDir, { recursive: true, force: true })
        }
      }).not.toThrow()
    })

    test('不正なメタデータでもサニタイズが正常動作する', () => {
      const circularObj = {}
      circularObj.self = circularObj

      expect(() => {
        logger.sanitizeData(circularObj)
      }).not.toThrow()
    })
  })
})
