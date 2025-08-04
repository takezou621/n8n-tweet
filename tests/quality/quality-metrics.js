/**
 * 品質メトリクス収集テスト
 * コードカバレッジ、複雑度、保守性などの品質指標を測定
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const path = require('path')
const fs = require('fs')

// テスト対象モジュール
const FeedParser = require('../../src/utils/feed-parser')
const ContentFilter = require('../../src/filters/content-filter')
const TweetGenerator = require('../../src/generators/tweet-generator')
// Core modules for quality analysis
// const TwitterClient = require('../../src/integrations/twitter-client')
// const RateLimiter = require('../../src/utils/rate-limiter')
// const TweetHistory = require('../../src/storage/tweet-history')
// const HealthChecker = require('../../src/monitoring/health-checker')
// const MetricsCollector = require('../../src/monitoring/metrics-collector')
const { createLogger } = require('../../src/utils/logger')
// const { createErrorHandler } = require('../../src/utils/error-handler')

describe('Quality Metrics Tests', () => {
  // let metricsCollector
  let logger
  let qualityReport

  beforeAll(async () => {
    logger = createLogger('quality-test', {
      logDir: path.join(__dirname, '../data/quality-logs'),
      enableConsole: false
    })

    // metricsCollector = new MetricsCollector({
    //   logger,
    //   enablePerformanceMonitoring: true,
    //   enableBusinessMetrics: true
    // })

    qualityReport = {
      codeQuality: {},
      testCoverage: {},
      performance: {},
      maintainability: {},
      reliability: {},
      security: {},
      timestamp: new Date().toISOString()
    }
  })

  afterAll(() => {
    // 品質レポートを保存
    const reportPath = path.join(__dirname, '../data/quality-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(qualityReport, null, 2))

    // Quality metrics summary logging
    logger.info('Quality Metrics Summary:', {
      codeQualityScore: qualityReport.codeQuality.overallScore || 'N/A',
      testCoverage: qualityReport.testCoverage.overall || 'N/A',
      performanceScore: qualityReport.performance.overallScore || 'N/A',
      maintainability: qualityReport.maintainability.score || 'N/A'
    })
  })

  describe('Code Quality Metrics', () => {
    test('循環的複雑度測定', () => {
      const sourceFiles = [
        '../../src/utils/feed-parser.js',
        '../../src/filters/content-filter.js',
        '../../src/generators/tweet-generator.js',
        '../../src/integrations/twitter-client.js',
        '../../src/storage/tweet-history.js'
      ]

      const complexityResults = sourceFiles.map(file => {
        const filePath = path.join(__dirname, file)
        if (!fs.existsSync(filePath)) {
          return { file, complexity: 0, exists: false }
        }

        const content = fs.readFileSync(filePath, 'utf8')
        const complexity = calculateCyclomaticComplexity(content)

        return {
          file: path.basename(file),
          complexity,
          exists: true,
          acceptable: complexity <= 10 // 一般的に10以下が推奨
        }
      })

      const avgComplexity = complexityResults
        .filter(r => r.exists)
        .reduce((sum, r) => sum + r.complexity, 0) /
        complexityResults.filter(r => r.exists).length

      qualityReport.codeQuality.cyclomaticComplexity = {
        results: complexityResults,
        average: avgComplexity,
        threshold: 10,
        acceptable: avgComplexity <= 10
      }

      expect(avgComplexity).toBeLessThanOrEqual(15) // 許容範囲
      const existingResults = complexityResults.filter(result => result.exists)
      existingResults.forEach(result => {
        expect(result.complexity).toBeLessThanOrEqual(20) // 最大限界
      })
      expect(existingResults.length).toBeGreaterThan(0) // At least one file should exist
    })

    test('コード行数とファイル構造分析', () => {
      const srcDir = path.join(__dirname, '../../src')
      const analysis = analyzeCodeStructure(srcDir)

      qualityReport.codeQuality.codeStructure = {
        totalFiles: analysis.totalFiles,
        totalLines: analysis.totalLines,
        averageLinesPerFile: analysis.averageLinesPerFile,
        largestFile: analysis.largestFile,
        fileDistribution: analysis.fileDistribution
      }

      // ファイルサイズの妥当性チェック
      expect(analysis.averageLinesPerFile).toBeLessThanOrEqual(500) // 平均500行以下
      expect(analysis.largestFile.lines).toBeLessThanOrEqual(1000) // 最大1000行以下
    })

    test('関数・クラス複雑度分析', () => {
      const targetFiles = [
        path.join(__dirname, '../../src/utils/feed-parser.js'),
        path.join(__dirname, '../../src/integrations/twitter-client.js'),
        path.join(__dirname, '../../src/storage/tweet-history.js')
      ]

      const functionAnalysis = targetFiles.map(file => {
        if (!fs.existsSync(file)) {
          return { file: path.basename(file), functions: [], exists: false }
        }

        const content = fs.readFileSync(file, 'utf8')
        const functions = analyzeFunctions(content)

        return {
          file: path.basename(file),
          functions,
          exists: true,
          avgFunctionLength: functions.length > 0
            ? functions.reduce((sum, f) => sum + f.lines, 0) / functions.length
            : 0
        }
      })

      qualityReport.codeQuality.functionAnalysis = functionAnalysis

      const existingAnalysis = functionAnalysis.filter(analysis => analysis.exists)
      existingAnalysis.forEach(fileAnalysis => {
        expect(fileAnalysis.avgFunctionLength).toBeLessThanOrEqual(50) // 平均50行以下

        fileAnalysis.functions.forEach(func => {
          expect(func.lines).toBeLessThanOrEqual(100) // 各関数100行以下
        })
      })
      expect(existingAnalysis.length).toBeGreaterThan(0) // At least one file should exist
    })
  })

  describe('Test Coverage Metrics', () => {
    test('テストカバレッジ分析', () => {
      // Jest カバレッジレポートを読み取り（存在する場合）
      const coveragePath = path.join(__dirname, '../../coverage/coverage-summary.json')

      let coverageData = {
        lines: { pct: 0 },
        functions: { pct: 0 },
        branches: { pct: 0 },
        statements: { pct: 0 }
      }

      if (fs.existsSync(coveragePath)) {
        try {
          const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
          coverageData = coverage.total || coverageData
        } catch (error) {
          logger.warn('Could not read coverage data:', error.message)
        }
      }

      qualityReport.testCoverage = {
        lines: coverageData.lines.pct,
        functions: coverageData.functions.pct,
        branches: coverageData.branches.pct,
        statements: coverageData.statements.pct,
        overall: (coverageData.lines.pct + coverageData.functions.pct +
                 coverageData.branches.pct + coverageData.statements.pct) / 4,
        targetThreshold: 85
      }

      // カバレッジ目標は85%以上
      expect(qualityReport.testCoverage.overall).toBeGreaterThanOrEqual(70) // 最低限の妥当性
    })

    test('テストファイル存在確認', () => {
      const expectedTestFiles = [
        'tests/unit/feed-parser.test.js',
        'tests/unit/content-filter.test.js',
        'tests/unit/tweet-generator.test.js',
        'tests/unit/twitter-client.test.js',
        'tests/unit/rate-limiter.test.js',
        'tests/unit/tweet-history.test.js',
        'tests/integration/end-to-end.test.js',
        'tests/performance/load-test.js',
        'tests/security/security-test.js'
      ]

      const testFileStatus = expectedTestFiles.map(testFile => {
        const filePath = path.join(__dirname, '../..', testFile)
        const exists = fs.existsSync(filePath)

        return {
          file: testFile,
          exists,
          size: exists ? fs.statSync(filePath).size : 0
        }
      })

      const testCoverage = testFileStatus.filter(t => t.exists).length /
        expectedTestFiles.length * 100

      qualityReport.testCoverage.testFiles = {
        expected: expectedTestFiles.length,
        present: testFileStatus.filter(t => t.exists).length,
        coverage: testCoverage,
        files: testFileStatus
      }

      expect(testCoverage).toBeGreaterThanOrEqual(70) // 70%以上のテストファイルが存在
    })
  })

  describe('Performance Metrics', () => {
    test('アプリケーション起動時間', async () => {
      const startTime = Date.now()

      // 主要コンポーネントの初期化時間を測定
      // eslint-disable-next-line no-unused-vars
      const feedParser = new FeedParser({ enableCache: false })
      // eslint-disable-next-line no-unused-vars
      const contentFilter = new ContentFilter({
        keywordsFile: path.join(__dirname, '../../config/keywords.json')
      })
      // eslint-disable-next-line no-unused-vars
      const tweetGenerator = new TweetGenerator({
        templatesFile: path.join(__dirname, '../../config/tweet-templates.json')
      })

      const initTime = Date.now() - startTime

      qualityReport.performance.initializationTime = {
        duration: initTime,
        threshold: 5000, // 5秒以内
        acceptable: initTime <= 5000
      }

      expect(initTime).toBeLessThanOrEqual(10000) // 最大10秒
    })

    test('メモリ使用効率', async () => {
      const initialMemory = process.memoryUsage()

      // 通常の処理を実行
      // eslint-disable-next-line no-unused-vars
      const feedParser = new FeedParser({ enableCache: false })
      const mockArticles = Array.from({ length: 100 }, (_, i) => ({
        title: `Test Article ${i}`,
        content: 'Test content '.repeat(100),
        url: `https://example.com/article-${i}`,
        publishedAt: new Date()
      }))

      const contentFilter = new ContentFilter({
        keywordsFile: path.join(__dirname, '../../config/keywords.json')
      })
      await contentFilter.filterArticles(mockArticles)

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      qualityReport.performance.memoryUsage = {
        initial: Math.round(initialMemory.heapUsed / 1024 / 1024),
        final: Math.round(finalMemory.heapUsed / 1024 / 1024),
        increase: Math.round(memoryIncrease / 1024 / 1024),
        threshold: 200, // 200MB以下の増加
        acceptable: memoryIncrease <= 200 * 1024 * 1024
      }

      expect(memoryIncrease).toBeLessThanOrEqual(500 * 1024 * 1024) // 最大500MB増加
    })
  })

  describe('Maintainability Metrics', () => {
    test('コメント率分析', () => {
      const sourceFiles = getSourceFiles(path.join(__dirname, '../../src'))

      const commentAnalysis = sourceFiles.map(file => {
        const content = fs.readFileSync(file, 'utf8')
        const stats = analyzeComments(content)

        return {
          file: path.relative(path.join(__dirname, '../../src'), file),
          totalLines: stats.totalLines,
          commentLines: stats.commentLines,
          commentRatio: stats.commentRatio,
          hasDocumentation: stats.hasDocumentation
        }
      })

      const avgCommentRatio = commentAnalysis.reduce((sum, f) => sum + f.commentRatio, 0) /
        commentAnalysis.length

      qualityReport.maintainability = {
        commentAnalysis,
        averageCommentRatio: avgCommentRatio,
        targetRatio: 20, // 20%以上のコメント率
        acceptable: avgCommentRatio >= 15
      }

      expect(avgCommentRatio).toBeGreaterThanOrEqual(10) // 最低10%
    })

    test('設定ファイル妥当性', () => {
      const configFiles = [
        '../../config/rss-feeds.json',
        '../../config/keywords.json',
        '../../config/tweet-templates.json',
        '../../config/twitter-config.json',
        '../../config/logging-config.json'
      ]

      const configValidation = configFiles.map(configFile => {
        const filePath = path.join(__dirname, configFile)

        if (!fs.existsSync(filePath)) {
          return { file: configFile, valid: false, exists: false }
        }

        try {
          const content = fs.readFileSync(filePath, 'utf8')
          JSON.parse(content) // JSON妥当性チェック

          return {
            file: configFile,
            valid: true,
            exists: true,
            size: fs.statSync(filePath).size
          }
        } catch (error) {
          return {
            file: configFile,
            valid: false,
            exists: true,
            error: error.message
          }
        }
      })

      const validConfigs = configValidation.filter(c => c.valid).length
      const totalConfigs = configValidation.length

      qualityReport.maintainability.configurationQuality = {
        validConfigs,
        totalConfigs,
        validationRate: (validConfigs / totalConfigs) * 100,
        details: configValidation
      }

      expect(validConfigs).toBe(totalConfigs) // 全ての設定ファイルが有効
    })
  })

  describe('Reliability Metrics', () => {
    test('エラーハンドリング網羅性', async () => {
      const errorScenarios = [
        {
          name: 'Network timeout',
          test: async () => {
            const feedParser = new FeedParser({ timeout: 1 })
            return feedParser.parseFeeds([{
              url: 'https://httpbin.org/delay/5',
              category: 'test',
              enabled: true
            }])
          }
        },
        {
          name: 'Invalid JSON response',
          test: async () => {
            const feedParser = new FeedParser()
            return feedParser.parseFeeds([{
              url: 'https://httpbin.org/html',
              category: 'test',
              enabled: true
            }])
          }
        },
        {
          name: 'Non-existent domain',
          test: async () => {
            const feedParser = new FeedParser()
            return feedParser.parseFeeds([{
              url: 'https://non-existent-domain-12345.com/feed.xml',
              category: 'test',
              enabled: true
            }])
          }
        }
      ]

      let handledErrors = 0
      const errorResults = []

      for (const scenario of errorScenarios) {
        try {
          await scenario.test()
          errorResults.push({ scenario: scenario.name, handled: false })
        } catch (error) {
          handledErrors++
          errorResults.push({
            scenario: scenario.name,
            handled: true,
            errorType: error.constructor.name
          })
        }
      }

      qualityReport.reliability = {
        errorHandling: {
          totalScenarios: errorScenarios.length,
          handledErrors,
          handlingRate: (handledErrors / errorScenarios.length) * 100,
          results: errorResults
        }
      }

      expect(handledErrors).toBeGreaterThanOrEqual(errorScenarios.length * 0.8) // 80%以上処理
    }, 30000)
  })
})

// ユーティリティ関数

function calculateCyclomaticComplexity (code) {
  const complexityKeywords = [
    /\bif\b/g, /\belse\b/g, /\bwhile\b/g, /\bfor\b/g,
    /\bdo\b/g, /\bswitch\b/g, /\bcase\b/g, /\bcatch\b/g,
    /\b\?\b/g, /\b&&\b/g, /\b\|\|\b/g
  ]

  let complexity = 1 // 基本複雑度

  complexityKeywords.forEach(pattern => {
    const matches = code.match(pattern)
    if (matches) {
      complexity += matches.length
    }
  })

  return complexity
}

function analyzeCodeStructure (directory) {
  const files = getSourceFiles(directory)

  let totalLines = 0
  let largestFile = { path: '', lines: 0 }
  const fileSizes = []

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n').length

    totalLines += lines
    fileSizes.push(lines)

    if (lines > largestFile.lines) {
      largestFile = { path: file, lines }
    }
  })

  return {
    totalFiles: files.length,
    totalLines,
    averageLinesPerFile: Math.round(totalLines / files.length),
    largestFile: {
      path: path.relative(directory, largestFile.path),
      lines: largestFile.lines
    },
    fileDistribution: {
      small: fileSizes.filter(s => s <= 100).length,
      medium: fileSizes.filter(s => s > 100 && s <= 300).length,
      large: fileSizes.filter(s => s > 300 && s <= 500).length,
      veryLarge: fileSizes.filter(s => s > 500).length
    }
  }
}

function analyzeFunctions (code) {
  const functionRegex = /(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?function|\bclass\s+(\w+))/g
  const functions = []
  let match

  while ((match = functionRegex.exec(code)) !== null) {
    const name = match[1] || match[2] || match[3]
    const startIndex = match.index

    // 関数の終了を見つける（簡易実装）
    let braceCount = 0
    let endIndex = startIndex
    let started = false

    for (let i = startIndex; i < code.length; i++) {
      if (code[i] === '{') {
        braceCount++
        started = true
      } else if (code[i] === '}') {
        braceCount--
        if (started && braceCount === 0) {
          endIndex = i
          break
        }
      }
    }

    const functionCode = code.substring(startIndex, endIndex + 1)
    const lines = functionCode.split('\n').length

    functions.push({
      name,
      lines,
      complexity: calculateCyclomaticComplexity(functionCode)
    })
  }

  return functions
}

function analyzeComments (code) {
  const lines = code.split('\n')
  let commentLines = 0
  let hasDocumentation = false

  lines.forEach(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('*/')) {
      commentLines++

      if (trimmed.includes('/**') || trimmed.includes('@param') || trimmed.includes('@returns')) {
        hasDocumentation = true
      }
    }
  })

  return {
    totalLines: lines.length,
    commentLines,
    commentRatio: (commentLines / lines.length) * 100,
    hasDocumentation
  }
}

function getSourceFiles (directory) {
  const files = []

  function scanDirectory (dir) {
    const entries = fs.readdirSync(dir)

    entries.forEach(entry => {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        scanDirectory(fullPath)
      } else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) {
        files.push(fullPath)
      }
    })
  }

  scanDirectory(directory)
  return files
}
