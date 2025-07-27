/**
 * ErrorHandler クラスのユニットテスト
 * TDD方式での包括的テスト実装
 */

const { ErrorHandler, createErrorHandler } = require('../../src/utils/error-handler')

describe('ErrorHandler', () => {
  let errorHandler
  let mockLogger

  beforeEach(() => {
    // モックロガーを作成
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }

    errorHandler = new ErrorHandler({
      logger: mockLogger,
      enableRetry: true,
      maxRetries: 2,
      retryDelay: 100,
      enableNotifications: false,
      criticalThreshold: 2,
      criticalTimeWindow: 5000
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('初期化', () => {
    test('デフォルト設定でErrorHandlerインスタンスが作成できる', () => {
      const defaultHandler = new ErrorHandler()
      expect(defaultHandler).toBeInstanceOf(ErrorHandler)
      expect(defaultHandler.maxRetries).toBe(3)
      expect(defaultHandler.retryDelay).toBe(1000)
      expect(defaultHandler.enableRetry).toBe(true)
    })

    test('カスタム設定でErrorHandlerインスタンスが作成できる', () => {
      expect(errorHandler).toBeInstanceOf(ErrorHandler)
      expect(errorHandler.maxRetries).toBe(2)
      expect(errorHandler.retryDelay).toBe(100)
      expect(errorHandler.criticalThreshold).toBe(2)
    })

    test('エラー統計が初期化される', () => {
      const stats = errorHandler.getStats()
      expect(stats.total).toBe(0)
      expect(stats.byType).toEqual({})
      expect(stats.byCategory).toEqual({})
    })
  })

  describe('エラー分類', () => {
    test('ネットワークエラーが正しく分類される', () => {
      const networkError = new Error('Connection failed')
      networkError.code = 'ECONNRESET'

      const classification = errorHandler.classifyError(networkError)

      expect(classification.category).toBe('network')
      expect(classification.severity).toBe('medium')
      expect(classification.recoverable).toBe(true)
      expect(classification.retryable).toBe(true)
    })

    test('HTTPサーバーエラーが正しく分類される', () => {
      const serverError = new Error('Internal server error')
      serverError.status = 500

      const classification = errorHandler.classifyError(serverError)

      expect(classification.category).toBe('server')
      expect(classification.severity).toBe('high')
      expect(classification.recoverable).toBe(true)
      expect(classification.retryable).toBe(true)
    })

    test('HTTPクライアントエラーが正しく分類される', () => {
      const clientError = new Error('Bad request')
      clientError.status = 400

      const classification = errorHandler.classifyError(clientError)

      expect(classification.category).toBe('client')
      expect(classification.severity).toBe('medium')
      expect(classification.recoverable).toBe(false)
      expect(classification.retryable).toBe(false)
    })

    test('レート制限エラーが正しく分類される', () => {
      const rateLimitError = new Error('Too many requests')
      rateLimitError.status = 429

      const classification = errorHandler.classifyError(rateLimitError)

      expect(classification.category).toBe('rate_limit')
      expect(classification.severity).toBe('medium')
      expect(classification.retryable).toBe(true)
    })

    test('Twitter APIエラーが正しく分類される', () => {
      const twitterError = new Error('Twitter API error: Tweet failed')

      const classification = errorHandler.classifyError(twitterError)

      expect(classification.category).toBe('twitter_api')
      expect(classification.severity).toBe('medium')
      expect(classification.retryable).toBe(true)
    })

    test('RSSエラーが正しく分類される', () => {
      const rssError = new Error('RSS feed parsing failed')

      const classification = errorHandler.classifyError(rssError)

      expect(classification.category).toBe('rss')
      expect(classification.severity).toBe('medium')
      expect(classification.retryable).toBe(true)
    })

    test('バリデーションエラーが正しく分類される', () => {
      const validationError = new Error('Validation failed')
      validationError.name = 'ValidationError'

      const classification = errorHandler.classifyError(validationError)

      expect(classification.category).toBe('validation')
      expect(classification.severity).toBe('low')
      expect(classification.recoverable).toBe(false)
      expect(classification.retryable).toBe(false)
    })

    test('メモリエラーが正しく分類される', () => {
      const memoryError = new Error('JavaScript heap out of memory')

      const classification = errorHandler.classifyError(memoryError)

      expect(classification.category).toBe('memory')
      expect(classification.severity).toBe('critical')
      expect(classification.recoverable).toBe(false)
      expect(classification.retryable).toBe(false)
    })

    test('不明なエラーがデフォルト分類される', () => {
      const unknownError = new Error('Some unknown error')

      const classification = errorHandler.classifyError(unknownError)

      expect(classification.category).toBe('unknown')
      expect(classification.severity).toBe('medium')
      expect(classification.recoverable).toBe(false)
      expect(classification.retryable).toBe(false)
    })
  })

  describe('エラーハンドリング', () => {
    test('基本的なエラーハンドリングが動作する', async () => {
      const error = new Error('Test error')
      const context = { operation: 'test' }

      const result = await errorHandler.handleError('test_error', error, context)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error.type).toBe('test_error')
      expect(result.error.message).toBe('Test error')
      expect(result.error.context).toEqual(context)
      expect(result.retry).toBe(false)

      // ログが呼ばれたことを確認
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    test('リトライ可能なエラーはretry: trueを返す', async () => {
      const networkError = new Error('Connection failed')
      networkError.code = 'ECONNRESET'

      const result = await errorHandler.handleError('network_error', networkError)

      expect(result.success).toBe(false)
      expect(result.retry).toBe(true)
    })

    test('重大エラーが検出される', async () => {
      const memoryError = new Error('JavaScript heap out of memory')

      const result = await errorHandler.handleError('memory_error', memoryError)

      expect(result.success).toBe(false)
      expect(result.retry).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL ERROR DETECTED',
        expect.objectContaining({
          type: 'memory_error'
        })
      )
    })

    test('エラー統計が更新される', async () => {
      const error = new Error('Test error')

      await errorHandler.handleError('test_error', error)

      const stats = errorHandler.getStats()
      expect(stats.total).toBe(1)
      expect(stats.byType.test_error).toBe(1)
      expect(stats.byCategory.unknown).toBe(1)
    })
  })

  describe('重大エラー処理', () => {
    test('重大エラーのしきい値チェックが動作する', () => {
      const criticalError = new Error('Critical error')

      // しきい値未満
      errorHandler.handleCriticalError('critical_test', criticalError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL ERROR DETECTED',
        expect.objectContaining({
          criticalErrorsInWindow: 1
        })
      )

      // しきい値到達
      errorHandler.handleCriticalError('critical_test', criticalError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL ERROR THRESHOLD EXCEEDED',
        expect.objectContaining({
          threshold: 2
        })
      )
    })

    test('古い重大エラーが時間窓から除外される', async () => {
      const criticalError = new Error('Critical error')

      errorHandler.handleCriticalError('critical_test', criticalError)

      // 時間窓を短くして古いエラーをクリア
      errorHandler.criticalTimeWindow = 10

      await new Promise((resolve) => {
        setTimeout(() => {
          errorHandler.handleCriticalError('critical_test', criticalError)

          // 古いエラーは除外されているはず
          const currentErrors = errorHandler.criticalErrors.filter(
            e => Date.now() - e.timestamp < errorHandler.criticalTimeWindow
          )
          expect(currentErrors.length).toBe(1)
          resolve()
        }, 20)
      })
    })
  })

  describe('リトライ機能', () => {
    test('成功する関数はリトライなしで完了する', async () => {
      const successfulFunction = jest.fn().mockResolvedValue('success')

      const result = await errorHandler.withRetry(successfulFunction)

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.attempts).toBe(1)
      expect(successfulFunction).toHaveBeenCalledTimes(1)
    })

    test('失敗する関数がリトライされる', async () => {
      const networkError = new Error('Connection failed')
      networkError.code = 'ECONNRESET'

      const failingFunction = jest.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('success')

      const result = await errorHandler.withRetry(failingFunction)

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.attempts).toBe(3)
      expect(failingFunction).toHaveBeenCalledTimes(3)
    })

    test('リトライ不可能なエラーはすぐに失敗する', async () => {
      const validationError = new Error('Validation failed')
      validationError.name = 'ValidationError'

      const failingFunction = jest.fn().mockRejectedValue(validationError)

      const result = await errorHandler.withRetry(failingFunction)

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(1)
      expect(failingFunction).toHaveBeenCalledTimes(1)
    })

    test('最大リトライ回数に達すると失敗する', async () => {
      const networkError = new Error('Connection failed')
      networkError.code = 'ECONNRESET'

      const failingFunction = jest.fn().mockRejectedValue(networkError)

      const result = await errorHandler.withRetry(failingFunction)

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(3) // maxRetries(2) + 1
      expect(failingFunction).toHaveBeenCalledTimes(3)
    })

    test('カスタムリトライ設定が適用される', async () => {
      const networkError = new Error('Connection failed')
      networkError.code = 'ECONNRESET'

      const failingFunction = jest.fn().mockRejectedValue(networkError)

      const result = await errorHandler.withRetry(
        failingFunction,
        { operation: 'custom' },
        { maxRetries: 1, delay: 50 }
      )

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(2) // maxRetries(1) + 1
      expect(failingFunction).toHaveBeenCalledTimes(2)
    })
  })

  describe('回復処理', () => {
    test('デフォルト回復戦略が実行される', async () => {
      const result = await errorHandler.recover('test_error', 'default')

      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Attempting error recovery',
        expect.objectContaining({
          errorType: 'test_error',
          strategy: 'default'
        })
      )
    })

    test('サービス再起動戦略が実行される', async () => {
      const result = await errorHandler.recover('service_error', 'restart_service')

      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith('Service restart initiated')
    })

    test('キャッシュクリア戦略が実行される', async () => {
      const result = await errorHandler.recover('cache_error', 'clear_cache')

      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith('Cache clearing initiated')
    })

    test('接続リセット戦略が実行される', async () => {
      const result = await errorHandler.recover('connection_error', 'reset_connections')

      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith('Connection reset initiated')
    })
  })

  describe('統計・ヘルスチェック', () => {
    test('エラー統計を取得できる', async () => {
      const error1 = new Error('Test error 1')
      const error2 = new Error('Test error 2')
      error2.code = 'ECONNRESET'

      await errorHandler.handleError('test_error', error1)
      await errorHandler.handleError('network_error', error2)

      const stats = errorHandler.getStats()

      expect(stats.total).toBe(2)
      expect(stats.byType.test_error).toBe(1)
      expect(stats.byType.network_error).toBe(1)
      expect(stats.byCategory.unknown).toBe(1)
      expect(stats.byCategory.network).toBe(1)
      expect(stats.uptime).toBeGreaterThanOrEqual(0)
    })

    test('トップエラーを取得できる', async () => {
      const error = new Error('Test error')

      // 複数のエラーを発生させる
      await errorHandler.handleError('frequent_error', error)
      await errorHandler.handleError('frequent_error', error)
      await errorHandler.handleError('rare_error', error)

      const stats = errorHandler.getStats()

      expect(stats.topErrorTypes[0].type).toBe('frequent_error')
      expect(stats.topErrorTypes[0].count).toBe(2)
      expect(stats.topErrorTypes[1].type).toBe('rare_error')
      expect(stats.topErrorTypes[1].count).toBe(1)
    })

    test('統計をリセットできる', async () => {
      const error = new Error('Test error')
      await errorHandler.handleError('test_error', error)

      errorHandler.resetStats()

      const stats = errorHandler.getStats()
      expect(stats.total).toBe(0)
      expect(stats.byType).toEqual({})
      expect(stats.byCategory).toEqual({})
    })

    test('ヘルスチェックが正常状態を返す', () => {
      const health = errorHandler.getHealth()

      expect(health.status).toBe('healthy')
      expect(health.errorRate).toBe(0)
      expect(health.totalErrors).toBe(0)
      expect(health.criticalErrors).toBe(0)
    })
  })

  describe('ファクトリー関数', () => {
    test('createErrorHandler関数でインスタンスを作成できる', () => {
      const factoryHandler = createErrorHandler({
        maxRetries: 5,
        retryDelay: 500
      })

      expect(factoryHandler).toBeInstanceOf(ErrorHandler)
      expect(factoryHandler.maxRetries).toBe(5)
      expect(factoryHandler.retryDelay).toBe(500)
    })
  })

  describe('遅延ユーティリティ', () => {
    test('delay関数が指定時間待機する', async () => {
      const startTime = Date.now()
      await errorHandler.delay(100)
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(90) // 少し余裕を持つ
    })
  })
})
