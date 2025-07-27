/**
 * MetricsCollector クラスのユニットテスト
 * TDD方式での包括的テスト実装
 */

const MetricsCollector = require('../../src/monitoring/metrics-collector')
const fs = require('fs').promises

describe('MetricsCollector', () => {
  let metricsCollector
  let mockBot

  beforeEach(() => {
    // モックボットオブジェクトを作成
    mockBot = {
      twitterClient: {
        getStats: jest.fn().mockReturnValue({
          total: 100,
          successful: 95,
          failed: 5
        })
      },
      lastFeedResults: {
        allItems: new Array(50),
        filteredItems: new Array(30),
        uniqueItems: new Array(25),
        tweets: new Array(20),
        optimalTweets: new Array(15)
      }
    }

    metricsCollector = new MetricsCollector({
      collectInterval: 1000,
      maxHistory: 100,
      enableCollection: true,
      metricsFile: '/tmp/test-metrics.json',
      logLevel: 'error' // テスト中はエラーレベルのみ
    })
  })

  afterEach(() => {
    if (metricsCollector) {
      metricsCollector.stopPeriodicCollection()
    }
    jest.clearAllMocks()
  })

  describe('初期化', () => {
    test('デフォルト設定でMetricsCollectorインスタンスが作成できる', () => {
      const defaultCollector = new MetricsCollector()
      expect(defaultCollector).toBeInstanceOf(MetricsCollector)
      expect(defaultCollector.config.collectInterval).toBe(60000)
      expect(defaultCollector.config.maxHistory).toBe(10000)
      expect(defaultCollector.config.enableCollection).toBe(true)
      defaultCollector.stopPeriodicCollection()
    })

    test('カスタム設定でMetricsCollectorインスタンスが作成できる', () => {
      expect(metricsCollector).toBeInstanceOf(MetricsCollector)
      expect(metricsCollector.config.collectInterval).toBe(1000)
      expect(metricsCollector.config.maxHistory).toBe(100)
      expect(metricsCollector.config.metricsFile).toBe('/tmp/test-metrics.json')
    })

    test('初期状態では空のマップが設定されている', () => {
      expect(metricsCollector.metrics.size).toBe(0)
      expect(metricsCollector.customMetrics.size).toBe(0)
      expect(metricsCollector.timeSeries.size).toBe(0)
      expect(metricsCollector.isCollecting).toBe(false)
    })
  })

  describe('メトリクス登録', () => {
    test('カウンターメトリクスを登録できる', () => {
      metricsCollector.registerMetric('test_counter', 'counter', 'Test counter metric')

      expect(metricsCollector.customMetrics.has('test_counter')).toBe(true)

      const metric = metricsCollector.customMetrics.get('test_counter')
      expect(metric.name).toBe('test_counter')
      expect(metric.type).toBe('counter')
      expect(metric.description).toBe('Test counter metric')
      expect(metric.value).toBe(0)
      expect(metric.history).toEqual([])
    })

    test('ゲージメトリクスを登録できる', () => {
      metricsCollector.registerMetric('test_gauge', 'gauge', 'Test gauge metric')

      const metric = metricsCollector.customMetrics.get('test_gauge')
      expect(metric.type).toBe('gauge')
      expect(metric.value).toBe(null)
    })

    test('ヒストグラムメトリクスを登録できる', () => {
      metricsCollector.registerMetric('test_histogram', 'histogram', 'Test histogram metric')

      const metric = metricsCollector.customMetrics.get('test_histogram')
      expect(metric.type).toBe('histogram')
      expect(metric.value).toBe(null)
    })

    test('メトリクス名なしでの登録はエラーをスローする', () => {
      expect(() => {
        metricsCollector.registerMetric(null)
      }).toThrow('Metric name is required')

      expect(() => {
        metricsCollector.registerMetric('')
      }).toThrow('Metric name is required')
    })
  })

  describe('メトリクス記録', () => {
    test('カウンターメトリクスの値を記録できる', () => {
      metricsCollector.registerMetric('test_counter', 'counter')

      metricsCollector.recordMetric('test_counter', 5)

      const metric = metricsCollector.customMetrics.get('test_counter')
      expect(metric.value).toBe(5)
      expect(metric.history.length).toBe(1)
      expect(metric.history[0].value).toBe(5)
      expect(metric.history[0].tags).toEqual({})
    })

    test('カウンターメトリクスの値が累積される', () => {
      metricsCollector.registerMetric('test_counter', 'counter')

      metricsCollector.recordMetric('test_counter', 3)
      metricsCollector.recordMetric('test_counter', 2)

      const metric = metricsCollector.customMetrics.get('test_counter')
      expect(metric.value).toBe(5)
      expect(metric.history.length).toBe(2)
      expect(metric.history[1].value).toBe(5)
    })

    test('ゲージメトリクスの値を記録できる', () => {
      metricsCollector.registerMetric('test_gauge', 'gauge')

      metricsCollector.recordMetric('test_gauge', 42)

      const metric = metricsCollector.customMetrics.get('test_gauge')
      expect(metric.value).toBe(42)
    })

    test('タグ付きでメトリクスを記録できる', () => {
      metricsCollector.registerMetric('test_metric', 'gauge')

      const tags = { region: 'us-east-1', service: 'api' }
      metricsCollector.recordMetric('test_metric', 100, tags)

      const metric = metricsCollector.customMetrics.get('test_metric')
      expect(metric.history[0].tags).toEqual(tags)
    })

    test('未登録のメトリクスは自動登録される', () => {
      expect(metricsCollector.customMetrics.has('auto_metric')).toBe(false)

      metricsCollector.recordMetric('auto_metric', 123)

      expect(metricsCollector.customMetrics.has('auto_metric')).toBe(true)
      const metric = metricsCollector.customMetrics.get('auto_metric')
      expect(metric.type).toBe('gauge')
      expect(metric.description).toBe('Auto-registered metric')
      expect(metric.value).toBe(123)
    })

    test('時系列データが記録される', () => {
      metricsCollector.registerMetric('timeseries_test', 'gauge')

      metricsCollector.recordMetric('timeseries_test', 50)
      metricsCollector.recordMetric('timeseries_test', 75)

      expect(metricsCollector.timeSeries.has('timeseries_test')).toBe(true)
      const timeSeries = metricsCollector.timeSeries.get('timeseries_test')
      expect(timeSeries.length).toBe(2)
      expect(timeSeries[0].value).toBe(50)
      expect(timeSeries[1].value).toBe(75)
    })

    test('履歴サイズが制限される', () => {
      // 小さな履歴サイズで設定
      metricsCollector.config.maxHistory = 3
      metricsCollector.registerMetric('limited_metric', 'gauge')

      // 制限を超える数の記録
      for (let i = 1; i <= 5; i++) {
        metricsCollector.recordMetric('limited_metric', i)
      }

      const metric = metricsCollector.customMetrics.get('limited_metric')
      expect(metric.history.length).toBe(3)
      expect(metric.history[0].value).toBe(3) // 最初の2つは削除されている
      expect(metric.history[2].value).toBe(5)

      const timeSeries = metricsCollector.timeSeries.get('limited_metric')
      expect(timeSeries.length).toBe(3)
    })
  })

  describe('便利メソッド', () => {
    test('incrementCounterメソッドが動作する', () => {
      metricsCollector.registerMetric('counter_test', 'counter')

      metricsCollector.incrementCounter('counter_test')
      metricsCollector.incrementCounter('counter_test', 5)

      const metric = metricsCollector.customMetrics.get('counter_test')
      expect(metric.value).toBe(6) // 1 + 5
    })

    test('setGaugeメソッドが動作する', () => {
      metricsCollector.registerMetric('gauge_test', 'gauge')

      metricsCollector.setGauge('gauge_test', 250)

      const metric = metricsCollector.customMetrics.get('gauge_test')
      expect(metric.value).toBe(250)
    })

    test('measureExecutionTimeメソッドが成功時の実行時間を測定する', async () => {
      const testFunction = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'success'
      })

      const result = await metricsCollector.measureExecutionTime('test_operation', testFunction)

      expect(result).toBe('success')
      expect(testFunction).toHaveBeenCalled()

      // 実行時間メトリクスが記録されているかチェック
      expect(metricsCollector.customMetrics.has('test_operation_duration_ms')).toBe(true)
      const durationMetric = metricsCollector.customMetrics.get('test_operation_duration_ms')
      expect(durationMetric.value).toBeGreaterThanOrEqual(10)
      expect(durationMetric.history[0].tags.status).toBe('success')
    })

    test('measureExecutionTimeメソッドがエラー時の実行時間を測定する', async () => {
      const testFunction = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5))
        throw new Error('Test error')
      })

      await expect(
        metricsCollector.measureExecutionTime('error_operation', testFunction)
      ).rejects.toThrow('Test error')

      // 実行時間とエラーカウントが記録されているかチェック
      expect(metricsCollector.customMetrics.has('error_operation_duration_ms')).toBe(true)
      expect(metricsCollector.customMetrics.has('error_operation_errors')).toBe(true)

      const durationMetric = metricsCollector.customMetrics.get('error_operation_duration_ms')
      expect(durationMetric.history[0].tags.status).toBe('error')

      const errorMetric = metricsCollector.customMetrics.get('error_operation_errors')
      expect(errorMetric.value).toBe(1)
    })
  })

  describe('システムメトリクス収集', () => {
    test('システムメトリクスを収集できる', () => {
      // まず基本的なsetGaugeテスト
      metricsCollector.setGauge('test_gauge', 42)
      const testGauge = metricsCollector.customMetrics.get('test_gauge')
      expect(testGauge.value).toBe(42)

      metricsCollector.collectSystemMetrics()

      // メモリメトリクス
      expect(metricsCollector.customMetrics.has('system_memory_used_bytes')).toBe(true)
      expect(metricsCollector.customMetrics.has('system_memory_heap_used_bytes')).toBe(true)
      expect(metricsCollector.customMetrics.has('system_memory_heap_total_bytes')).toBe(true)
      expect(metricsCollector.customMetrics.has('system_memory_external_bytes')).toBe(true)

      // CPUメトリクス
      expect(metricsCollector.customMetrics.has('system_cpu_user_microseconds')).toBe(true)
      expect(metricsCollector.customMetrics.has('system_cpu_system_microseconds')).toBe(true)

      // プロセスメトリクス
      expect(metricsCollector.customMetrics.has('system_process_uptime_seconds')).toBe(true)

      // 値が数値であることを確認
      const memUsed = metricsCollector.customMetrics.get('system_memory_used_bytes')
      expect(memUsed).toBeDefined()

      // メトリクスの値が正しく設定されているかチェック（null でなければOK）
      expect(memUsed.value).not.toBe(null)
      expect(memUsed.value).toBeDefined()
      expect(typeof memUsed.value).toBe('number')
      expect(memUsed.value).toBeGreaterThan(0)
    })
  })

  describe('アプリケーションメトリクス収集', () => {
    test('ボットオブジェクトからアプリケーションメトリクスを収集できる', () => {
      metricsCollector.collectApplicationMetrics(mockBot)

      // Twitterメトリクス
      expect(metricsCollector.customMetrics.get('twitter_total_posts').value).toBe(100)
      expect(metricsCollector.customMetrics.get('twitter_successful_posts').value).toBe(95)
      expect(metricsCollector.customMetrics.get('twitter_failed_posts').value).toBe(5)
      expect(metricsCollector.customMetrics.get('twitter_success_rate_percentage').value).toBe(95)

      // フィード処理メトリクス
      expect(metricsCollector.customMetrics.get('rss_items_processed').value).toBe(50)
      expect(metricsCollector.customMetrics.get('rss_items_filtered').value).toBe(30)
      expect(metricsCollector.customMetrics.get('rss_items_unique').value).toBe(25)
      expect(metricsCollector.customMetrics.get('tweets_generated').value).toBe(20)
      expect(metricsCollector.customMetrics.get('tweets_optimal').value).toBe(15)

      // コンポーネントメトリクス
      expect(metricsCollector.customMetrics.get('components_total').value).toBe(5)
    })

    test('ボットオブジェクトがない場合は何もしない', () => {
      const initialSize = metricsCollector.customMetrics.size

      metricsCollector.collectApplicationMetrics(null)

      expect(metricsCollector.customMetrics.size).toBe(initialSize)
    })

    test('不完全なボットオブジェクトでもエラーなく動作する', () => {
      const incompleteBot = {
        twitterClient: null,
        lastFeedResults: null
      }

      expect(() => {
        metricsCollector.collectApplicationMetrics(incompleteBot)
      }).not.toThrow()
    })
  })

  describe('全メトリクス収集', () => {
    test('全メトリクスを収集できる', async () => {
      await metricsCollector.collectAllMetrics(mockBot)

      // システムメトリクスとアプリケーションメトリクスの両方が収集されている
      expect(metricsCollector.customMetrics.has('system_memory_used_bytes')).toBe(true)
      expect(metricsCollector.customMetrics.has('twitter_total_posts')).toBe(true)
    })
  })

  describe('メトリクス統計', () => {
    beforeEach(() => {
      metricsCollector.registerMetric('stats_test', 'gauge')

      // テストデータを作成
      const values = [10, 20, 30, 40, 50]
      values.forEach(value => {
        metricsCollector.recordMetric('stats_test', value)
      })
    })

    test('メトリクス統計を取得できる', () => {
      const stats = metricsCollector.getMetricStats('stats_test')

      expect(stats).toBeDefined()
      expect(stats.count).toBe(5)
      expect(stats.sum).toBe(150)
      expect(stats.avg).toBe(30)
      expect(stats.min).toBe(10)
      expect(stats.max).toBe(50)
      expect(stats.p50).toBe(30)
      expect(stats.p95).toBe(50)
      expect(stats.p99).toBe(50)
      expect(stats.latest).toBe(50)
    })

    test('存在しないメトリクスの統計はnullを返す', () => {
      const stats = metricsCollector.getMetricStats('nonexistent')
      expect(stats).toBe(null)
    })

    test('データがない場合はnullを返す', () => {
      metricsCollector.registerMetric('empty_metric', 'gauge')
      const stats = metricsCollector.getMetricStats('empty_metric')
      expect(stats).toBe(null)
    })

    test('時間範囲を指定してメトリクス統計を取得できる', async () => {
      // 少し待ってから新しいデータを追加
      await new Promise(resolve => setTimeout(resolve, 10))
      metricsCollector.recordMetric('stats_test', 60)

      // 極端に短い時間範囲で統計取得（最新の値のみ取得されることを確認）
      const stats = metricsCollector.getMetricStats('stats_test', 1)
      expect(stats).toBeDefined()
      expect(stats.count).toBe(1)
      expect(stats.latest).toBe(60)
    })
  })

  describe('全メトリクス要約', () => {
    test('全メトリクスの要約を取得できる', () => {
      metricsCollector.registerMetric('summary_counter', 'counter', 'Test counter')
      metricsCollector.registerMetric('summary_gauge', 'gauge', 'Test gauge')

      metricsCollector.recordMetric('summary_counter', 5)
      metricsCollector.recordMetric('summary_gauge', 25)

      const summary = metricsCollector.getAllMetricsSummary()

      expect(summary.timestamp).toBeDefined()
      expect(summary.timeRange).toBe(3600) // デフォルト1時間
      expect(summary.metrics).toHaveProperty('summary_counter')
      expect(summary.metrics).toHaveProperty('summary_gauge')

      expect(summary.metrics.summary_counter.type).toBe('counter')
      expect(summary.metrics.summary_counter.currentValue).toBe(5)
      expect(summary.metrics.summary_gauge.type).toBe('gauge')
      expect(summary.metrics.summary_gauge.currentValue).toBe(25)
    })
  })

  describe('定期収集', () => {
    test('定期メトリクス収集を開始できる', () => {
      expect(metricsCollector.isCollecting).toBe(false)

      metricsCollector.startPeriodicCollection(mockBot)

      expect(metricsCollector.isCollecting).toBe(true)
      expect(metricsCollector.intervalId).toBeDefined()
    })

    test('すでに実行中の場合は重複開始しない', () => {
      metricsCollector.startPeriodicCollection(mockBot)
      const firstIntervalId = metricsCollector.intervalId

      metricsCollector.startPeriodicCollection(mockBot)

      expect(metricsCollector.intervalId).toBe(firstIntervalId)
    })

    test('収集が無効化されている場合は開始しない', () => {
      metricsCollector.config.enableCollection = false

      metricsCollector.startPeriodicCollection(mockBot)

      expect(metricsCollector.isCollecting).toBe(false)
      expect(metricsCollector.intervalId).toBe(null)
    })

    test('定期メトリクス収集を停止できる', () => {
      metricsCollector.startPeriodicCollection(mockBot)
      expect(metricsCollector.isCollecting).toBe(true)

      metricsCollector.stopPeriodicCollection()

      expect(metricsCollector.isCollecting).toBe(false)
      expect(metricsCollector.intervalId).toBe(null)
    })

    test('停止されていない場合の停止処理はエラーなく実行される', () => {
      expect(() => {
        metricsCollector.stopPeriodicCollection()
      }).not.toThrow()
    })
  })

  describe('ファイル操作', () => {
    const testFilePath = '/tmp/metrics-test.json'

    afterEach(async () => {
      // テストファイルをクリーンアップ
      try {
        await fs.unlink(testFilePath)
      } catch (error) {
        // ファイルが存在しない場合は無視
      }
    })

    test('メトリクスをファイルに保存できる', async () => {
      metricsCollector.registerMetric('save_test', 'counter', 'Save test metric')
      metricsCollector.recordMetric('save_test', 42)

      await metricsCollector.saveMetricsToFile(testFilePath)

      const fileContent = await fs.readFile(testFilePath, 'utf8')
      const data = JSON.parse(fileContent)

      expect(data.exported).toBeDefined()
      expect(data.config).toBeDefined()
      expect(data.metrics).toHaveProperty('save_test')
      expect(data.timeSeries).toHaveProperty('save_test')
    })

    test('メトリクスをファイルから読み込める', async () => {
      // まずメトリクスを保存
      metricsCollector.registerMetric('load_test', 'gauge', 'Load test metric')
      metricsCollector.recordMetric('load_test', 75)
      await metricsCollector.saveMetricsToFile(testFilePath)

      // 新しいCollectorインスタンスを作成
      const newCollector = new MetricsCollector({ enableCollection: false })
      expect(newCollector.customMetrics.size).toBe(0)

      // メトリクスを読み込み
      await newCollector.loadMetricsFromFile(testFilePath)

      expect(newCollector.customMetrics.size).toBe(1)
      expect(newCollector.customMetrics.has('load_test')).toBe(true)
      expect(newCollector.timeSeries.has('load_test')).toBe(true)

      newCollector.stopPeriodicCollection()
    })

    test('存在しないファイルの読み込みはエラーをスローする', async () => {
      await expect(
        metricsCollector.loadMetricsFromFile('/nonexistent/path/file.json')
      ).rejects.toThrow()
    })
  })

  describe('クリーンアップ', () => {
    test('クリーンアップ処理が正常に実行される', async () => {
      metricsCollector.startPeriodicCollection(mockBot)
      metricsCollector.registerMetric('cleanup_test', 'counter')
      metricsCollector.recordMetric('cleanup_test', 10)

      expect(metricsCollector.isCollecting).toBe(true)
      expect(metricsCollector.customMetrics.size).toBeGreaterThan(0)

      await metricsCollector.cleanup()

      expect(metricsCollector.isCollecting).toBe(false)
      expect(metricsCollector.customMetrics.size).toBe(0)
      expect(metricsCollector.timeSeries.size).toBe(0)
    })

    test('収集が無効化されている場合はファイル保存をスキップする', async () => {
      metricsCollector.config.enableCollection = false
      metricsCollector.registerMetric('no_save_test', 'counter')

      // ファイル保存をスパイ
      const saveSpy = jest.spyOn(metricsCollector, 'saveMetricsToFile')

      await metricsCollector.cleanup()

      expect(saveSpy).not.toHaveBeenCalled()
    })
  })
})
