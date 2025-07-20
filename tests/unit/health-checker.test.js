/**
 * HealthChecker クラスのユニットテスト
 * TDD方式での包括的テスト実装
 */

const HealthChecker = require('../../src/monitoring/health-checker')
const fs = require('fs').promises

describe('HealthChecker', () => {
  let healthChecker
  let mockComponents

  beforeEach(() => {
    // モックコンポーネントを作成
    mockComponents = {
      database: {
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          metrics: { connections: 5, responseTime: 10 }
        })
      },
      redis: {
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          metrics: { memory: '50MB', clients: 3 }
        })
      },
      twitter: {
        isHealthy: jest.fn().mockResolvedValue(true)
      },
      simple: {
        available: true
      }
    }

    healthChecker = new HealthChecker({
      checkInterval: 1000,
      healthThreshold: 0.8,
      alertThreshold: 0.5,
      maxHistory: 100,
      enableAlerts: false, // テスト中はアラートを無効化
      logLevel: 'error', // テスト中はエラーレベルのみ
      components: mockComponents
    })
  })

  afterEach(() => {
    if (healthChecker) {
      healthChecker.stopPeriodicChecks()
    }
    jest.clearAllMocks()
  })

  describe('初期化', () => {
    test('デフォルト設定でHealthCheckerインスタンスが作成できる', () => {
      const defaultChecker = new HealthChecker()
      expect(defaultChecker).toBeInstanceOf(HealthChecker)
      expect(defaultChecker.config.checkInterval).toBe(300000)
      expect(defaultChecker.config.healthThreshold).toBe(0.8) // test環境では0.9だが、デフォルトは0.8
      expect(defaultChecker.config.maxHistory).toBe(1000)
      defaultChecker.stopPeriodicChecks()
    })

    test('カスタム設定でHealthCheckerインスタンスが作成できる', () => {
      expect(healthChecker).toBeInstanceOf(HealthChecker)
      expect(healthChecker.config.checkInterval).toBe(1000)
      expect(healthChecker.config.healthThreshold).toBe(0.8)
      expect(healthChecker.config.alertThreshold).toBe(0.5)
    })

    test('初期設定でコンポーネントが登録される', () => {
      expect(healthChecker.components.size).toBe(4)
      expect(healthChecker.components.has('database')).toBe(true)
      expect(healthChecker.components.has('redis')).toBe(true)
      expect(healthChecker.components.has('twitter')).toBe(true)
      expect(healthChecker.components.has('simple')).toBe(true)
    })
  })

  describe('コンポーネント管理', () => {
    test('新しいコンポーネントを登録できる', () => {
      const newComponent = { test: true }
      
      healthChecker.registerComponent('testComponent', newComponent)
      
      expect(healthChecker.components.has('testComponent')).toBe(true)
      expect(healthChecker.components.get('testComponent').instance).toBe(newComponent)
      expect(healthChecker.components.get('testComponent').status).toBe('unknown')
    })

    test('コンポーネント登録時に引数チェックが行われる', () => {
      expect(() => {
        healthChecker.registerComponent(null, {})
      }).toThrow('Component name and instance are required')

      expect(() => {
        healthChecker.registerComponent('test', null)
      }).toThrow('Component name and instance are required')
    })

    test('コンポーネントの登録を解除できる', () => {
      healthChecker.unregisterComponent('database')
      
      expect(healthChecker.components.has('database')).toBe(false)
    })

    test('存在しないコンポーネントの登録解除はエラーなく処理される', () => {
      expect(() => {
        healthChecker.unregisterComponent('nonexistent')
      }).not.toThrow()
    })
  })

  describe('個別コンポーネントのヘルスチェック', () => {
    test('healthCheckメソッドを持つコンポーネントをチェックできる', async () => {
      const component = healthChecker.components.get('database')
      
      const result = await healthChecker.checkComponent('database', component)
      
      expect(result.name).toBe('database')
      expect(result.status).toBe('healthy')
      expect(result.responseTime).toBeGreaterThanOrEqual(0)
      expect(result.metrics).toEqual({ connections: 5, responseTime: 10 })
      expect(result.timestamp).toBeDefined()
      expect(mockComponents.database.healthCheck).toHaveBeenCalled()
    })

    test('isHealthyメソッドを持つコンポーネントをチェックできる', async () => {
      const component = healthChecker.components.get('twitter')
      
      const result = await healthChecker.checkComponent('twitter', component)
      
      expect(result.name).toBe('twitter')
      expect(result.status).toBe('healthy')
      expect(result.metrics).toEqual({ available: true })
      expect(mockComponents.twitter.isHealthy).toHaveBeenCalled()
    })

    test('基本的なコンポーネントをチェックできる', async () => {
      const component = healthChecker.components.get('simple')
      
      const result = await healthChecker.checkComponent('simple', component)
      
      expect(result.name).toBe('simple')
      expect(result.status).toBe('healthy')
      expect(result.metrics).toEqual({ available: true })
    })

    test('利用できないコンポーネントは不健全と判定される', async () => {
      const component = { instance: null }
      
      const result = await healthChecker.checkComponent('unavailable', component)
      
      expect(result.name).toBe('unavailable')
      expect(result.status).toBe('unhealthy')
      expect(result.error).toBe('Component instance not available')
    })

    test('エラーが発生したコンポーネントは不健全と判定される', async () => {
      const errorComponent = {
        instance: {
          healthCheck: jest.fn().mockRejectedValue(new Error('Health check failed'))
        }
      }
      
      const result = await healthChecker.checkComponent('error', errorComponent)
      
      expect(result.name).toBe('error')
      expect(result.status).toBe('unhealthy')
      expect(result.error).toBe('Health check failed')
    })

    test('タイムアウトが発生したコンポーネントは不健全と判定される', async () => {
      const slowComponent = {
        instance: {
          healthCheck: jest.fn().mockImplementation(
            () => new Promise(resolve => setTimeout(resolve, 15000))
          )
        }
      }
      
      const result = await healthChecker.checkComponent('slow', slowComponent)
      
      expect(result.name).toBe('slow')
      expect(result.status).toBe('unhealthy')
      expect(result.error).toBe('Health check timeout')
    })
  })

  describe('全体ヘルスチェック', () => {
    test('全コンポーネントが健全な場合のヘルスチェック', async () => {
      const result = await healthChecker.performHealthCheck()
      
      expect(result.overall.status).toBe('healthy')
      expect(result.overall.score).toBe(1.0)
      expect(result.overall.totalComponents).toBe(4)
      expect(result.overall.healthyComponents).toBe(4)
      expect(result.overall.unhealthyComponents).toBe(0)
      expect(result.components).toHaveProperty('database')
      expect(result.components).toHaveProperty('redis')
      expect(result.components).toHaveProperty('twitter')
      expect(result.components).toHaveProperty('simple')
      expect(result.checkDuration).toBeGreaterThanOrEqual(0)
    })

    test('一部コンポーネントが不健全な場合のヘルスチェック', async () => {
      // databaseコンポーネントを不健全にする
      mockComponents.database.healthCheck.mockRejectedValue(new Error('DB connection failed'))
      
      const result = await healthChecker.performHealthCheck()
      
      expect(result.overall.status).toBe('degraded')
      expect(result.overall.score).toBe(0.75) // 3/4 = 0.75
      expect(result.overall.totalComponents).toBe(4)
      expect(result.overall.healthyComponents).toBe(3)
      expect(result.overall.unhealthyComponents).toBe(1)
      expect(result.components.database.status).toBe('unhealthy')
    })

    test('多くのコンポーネントが不健全な場合は全体が不健全と判定される', async () => {
      // 複数のコンポーネントを不健全にする
      mockComponents.database.healthCheck.mockRejectedValue(new Error('DB failed'))
      mockComponents.redis.healthCheck.mockRejectedValue(new Error('Redis failed'))
      mockComponents.twitter.isHealthy.mockRejectedValue(new Error('Twitter failed'))
      
      const result = await healthChecker.performHealthCheck()
      
      expect(result.overall.status).toBe('unhealthy')
      expect(result.overall.score).toBe(0.25) // 1/4 = 0.25
      expect(result.overall.healthyComponents).toBe(1)
      expect(result.overall.unhealthyComponents).toBe(3)
    })

    test('コンポーネントがない場合のヘルスチェック', async () => {
      const emptyChecker = new HealthChecker({ enableAlerts: false })
      
      const result = await emptyChecker.performHealthCheck()
      
      expect(result.overall.status).toBe('healthy')
      expect(result.overall.score).toBe(0)
      expect(result.overall.totalComponents).toBe(0)
      
      emptyChecker.stopPeriodicChecks()
    })

    test('checkHealthメソッドがperformHealthCheckのエイリアスとして動作する', async () => {
      const result = await healthChecker.checkHealth()
      
      expect(result.overall).toBeDefined()
      expect(result.components).toBeDefined()
      expect(result.checkDuration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('ステータス判定', () => {
    test('健全性スコアによるステータス判定', () => {
      expect(healthChecker.determineOverallStatus(1.0, 1)).toBe('healthy')
      expect(healthChecker.determineOverallStatus(0.9, 1)).toBe('healthy')
      expect(healthChecker.determineOverallStatus(0.8, 1)).toBe('healthy')
      expect(healthChecker.determineOverallStatus(0.7, 1)).toBe('degraded')
      expect(healthChecker.determineOverallStatus(0.5, 1)).toBe('degraded')
      expect(healthChecker.determineOverallStatus(0.4, 1)).toBe('unhealthy')
      expect(healthChecker.determineOverallStatus(0.0, 1)).toBe('unhealthy')
    })
  })

  describe('履歴管理', () => {
    test('ヘルスチェック結果が履歴に追加される', async () => {
      expect(healthChecker.healthHistory.length).toBe(0)
      
      await healthChecker.performHealthCheck()
      
      expect(healthChecker.healthHistory.length).toBe(1)
      expect(healthChecker.healthHistory[0].overall).toBeDefined()
    })

    test('履歴サイズが制限される', async () => {
      // maxHistoryを2に設定
      healthChecker.config.maxHistory = 2
      
      // 3回ヘルスチェックを実行
      await healthChecker.performHealthCheck()
      await healthChecker.performHealthCheck()
      await healthChecker.performHealthCheck()
      
      expect(healthChecker.healthHistory.length).toBe(2)
    })
  })

  describe('統計情報', () => {
    test('統計情報を取得できる', async () => {
      // ヘルスチェックを実行して履歴を作成
      await healthChecker.performHealthCheck()
      
      const stats = healthChecker.getHealthStats()
      
      expect(stats.averageScore).toBeGreaterThanOrEqual(0)
      expect(stats.uptimePercentage).toBeGreaterThanOrEqual(0)
      expect(stats.incidentCount).toBeGreaterThanOrEqual(0)
      expect(stats.totalChecks).toBe(1)
      expect(stats.lastCheck).toBeDefined()
    })

    test('履歴がない場合の統計情報', () => {
      const stats = healthChecker.getHealthStats()
      
      expect(stats.averageScore).toBe(0)
      expect(stats.uptimePercentage).toBe(0)
      expect(stats.incidentCount).toBe(0)
      expect(stats.lastCheck).toBe(null)
    })

    test('指定時間範囲の統計情報を取得できる', async () => {
      await healthChecker.performHealthCheck()
      
      // 少し待ってから極端に短い時間範囲で統計取得
      await new Promise(resolve => setTimeout(resolve, 5))
      const stats = healthChecker.getHealthStats(1) // 1ms
      
      expect(stats.totalChecks).toBe(0)
    })
  })

  describe('定期ヘルスチェック', () => {
    test('定期ヘルスチェックを開始できる', () => {
      expect(healthChecker.isRunning).toBe(false)
      
      healthChecker.startPeriodicChecks()
      
      expect(healthChecker.isRunning).toBe(true)
      expect(healthChecker.intervalId).toBeDefined()
    })

    test('すでに実行中の場合は重複開始しない', () => {
      healthChecker.startPeriodicChecks()
      const firstIntervalId = healthChecker.intervalId
      
      healthChecker.startPeriodicChecks()
      
      expect(healthChecker.intervalId).toBe(firstIntervalId)
    })

    test('定期ヘルスチェックを停止できる', () => {
      healthChecker.startPeriodicChecks()
      expect(healthChecker.isRunning).toBe(true)
      
      healthChecker.stopPeriodicChecks()
      
      expect(healthChecker.isRunning).toBe(false)
      expect(healthChecker.intervalId).toBe(null)
    })

    test('停止されていない場合の停止処理はエラーなく実行される', () => {
      expect(() => {
        healthChecker.stopPeriodicChecks()
      }).not.toThrow()
    })
  })

  describe('ファイル操作', () => {
    const testFilePath = '/tmp/health-history-test.json'

    afterEach(async () => {
      // テストファイルをクリーンアップ
      try {
        await fs.unlink(testFilePath)
      } catch (error) {
        // ファイルが存在しない場合は無視
      }
    })

    test('履歴をファイルに保存できる', async () => {
      await healthChecker.performHealthCheck()
      
      await healthChecker.saveHistoryToFile(testFilePath)
      
      const fileContent = await fs.readFile(testFilePath, 'utf8')
      const data = JSON.parse(fileContent)
      
      expect(data.exported).toBeDefined()
      expect(data.config).toBeDefined()
      expect(data.history).toHaveLength(1)
    })

    test('履歴をファイルから読み込める', async () => {
      // まず履歴を保存
      await healthChecker.performHealthCheck()
      await healthChecker.saveHistoryToFile(testFilePath)
      
      // 新しいHealthCheckerインスタンスを作成
      const newChecker = new HealthChecker({ enableAlerts: false })
      expect(newChecker.healthHistory.length).toBe(0)
      
      // 履歴を読み込み
      await newChecker.loadHistoryFromFile(testFilePath)
      
      expect(newChecker.healthHistory.length).toBe(1)
      
      newChecker.stopPeriodicChecks()
    })

    test('存在しないファイルの読み込みはエラーをスローする', async () => {
      await expect(
        healthChecker.loadHistoryFromFile('/nonexistent/path/file.json')
      ).rejects.toThrow()
    })
  })

  describe('クリーンアップ', () => {
    test('クリーンアップ処理が正常に実行される', async () => {
      healthChecker.startPeriodicChecks()
      await healthChecker.performHealthCheck()
      
      expect(healthChecker.isRunning).toBe(true)
      expect(healthChecker.components.size).toBeGreaterThan(0)
      expect(healthChecker.healthHistory.length).toBeGreaterThan(0)
      
      await healthChecker.cleanup()
      
      expect(healthChecker.isRunning).toBe(false)
      expect(healthChecker.components.size).toBe(0)
      expect(healthChecker.healthHistory.length).toBe(0)
    })
  })

  describe('アラート機能', () => {
    test('アラートが無効化されている場合は送信されない', async () => {
      // 不健全なコンポーネントを作成
      mockComponents.database.healthCheck.mockRejectedValue(new Error('DB failed'))
      mockComponents.redis.healthCheck.mockRejectedValue(new Error('Redis failed'))
      
      // アラート送信をスパイ
      const alertSpy = jest.spyOn(healthChecker, 'sendAlert')
      
      await healthChecker.performHealthCheck()
      
      expect(alertSpy).not.toHaveBeenCalled()
    })

    test('アラートクールダウンが機能する', async () => {
      healthChecker.config.enableAlerts = true
      
      const alertData = { type: 'test', message: 'Test alert' }
      
      // 最初のアラート
      await healthChecker.sendAlert(alertData)
      const firstAlertTime = healthChecker.lastAlert
      
      // すぐに次のアラートを送信（クールダウン中）
      await healthChecker.sendAlert(alertData)
      
      expect(healthChecker.lastAlert).toBe(firstAlertTime)
    })
  })
})