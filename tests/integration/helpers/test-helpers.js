/**
 * 統合テスト用ヘルパー関数
 */

const path = require('path')
const fs = require('fs').promises
const TwitterClientMock = require('../mocks/twitter-client-mock')

/**
 * 統合テスト用の認証情報を生成
 */
function createMockCredentials () {
  return {
    bearerToken: 'test_bearer_token_integration',
    apiKey: 'test_api_key_integration',
    apiSecret: 'test_api_secret_integration',
    accessToken: 'test_access_token_integration',
    accessTokenSecret: 'test_access_token_secret_integration'
  }
}

/**
 * テスト用環境変数の設定
 */
function setupTestEnvironment () {
  const originalEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'

  // テスト用Twitter認証情報を環境変数に設定
  const mockCredentials = createMockCredentials()
  process.env.TWITTER_BEARER_TOKEN = mockCredentials.bearerToken
  process.env.TWITTER_API_KEY = mockCredentials.apiKey
  process.env.TWITTER_API_SECRET = mockCredentials.apiSecret
  process.env.TWITTER_ACCESS_TOKEN = mockCredentials.accessToken
  process.env.TWITTER_ACCESS_TOKEN_SECRET = mockCredentials.accessTokenSecret

  return () => {
    process.env.NODE_ENV = originalEnv
    delete process.env.TWITTER_BEARER_TOKEN
    delete process.env.TWITTER_API_KEY
    delete process.env.TWITTER_API_SECRET
    delete process.env.TWITTER_ACCESS_TOKEN
    delete process.env.TWITTER_ACCESS_TOKEN_SECRET
  }
}

/**
 * TwitterClientのテスト用インスタンスを作成
 */
function createTestTwitterClient (customConfig = {}) {
  const credentials = createMockCredentials()
  const config = {
    rateLimit: {
      tweetsPerHour: 5,
      tweetsPerDay: 50,
      requestsPerMinute: 10
    },
    ...customConfig
  }

  return new TwitterClientMock(credentials, config)
}

/**
 * テストデータディレクトリの作成
 */
async function createTestDataDirectory (basePath) {
  const testDataDir = path.join(basePath, 'temp-test-data')

  try {
    await fs.mkdir(testDataDir, { recursive: true })
    return testDataDir
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error
    }
    return testDataDir
  }
}

/**
 * テストデータディレクトリのクリーンアップ
 */
async function cleanupTestDataDirectory (testDataDir) {
  try {
    // Node.js 14.14.0以降でrm()を使用
    await fs.rm(testDataDir, { recursive: true, force: true })
  } catch (error) {
    // ディレクトリが存在しない場合は無視
    if (error.code !== 'ENOENT') {
      // Failed to cleanup test directory - log to test logger if available
      if (global.testLogger) {
        global.testLogger.warn(`Failed to cleanup test directory: ${error.message}`)
      }
    }
  }
}

/**
 * fetchのモック設定
 */
function setupFetchMock () {
  const originalFetch = global.fetch

  global.fetch = jest.fn()

  return {
    mockSuccess: (responseData) => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(responseData)
      })
    },
    mockError: (status, errorData) => {
      global.fetch.mockResolvedValue({
        ok: false,
        status,
        json: () => Promise.resolve(errorData)
      })
    },
    mockNetworkError: (errorMessage) => {
      global.fetch.mockRejectedValue(new Error(errorMessage))
    },
    cleanup: () => {
      global.fetch = originalFetch
      jest.clearAllMocks()
    }
  }
}

/**
 * テスト用の記事データを生成
 */
function createMockArticle (overrides = {}) {
  return {
    title: 'AI Breakthrough in Machine Learning',
    description: 'Researchers develop new neural network architecture',
    link: 'https://example.com/ai-breakthrough',
    pubDate: new Date().toISOString(),
    category: 'ai',
    content: 'Detailed content about the AI breakthrough...',
    ...overrides
  }
}

/**
 * テスト用のツイートデータを生成
 */
function createMockTweet (overrides = {}) {
  return {
    text: 'AI breakthrough in machine learning! New neural network architecture ' +
      'shows promising results. #AI #MachineLearning https://example.com/ai-breakthrough',
    hashtags: ['#AI', '#MachineLearning'],
    url: 'https://example.com/ai-breakthrough',
    ...overrides
  }
}

/**
 * 統合テスト用のアサーション
 */
function assertIntegrationTestResult (result, expectedType = 'success') {
  expect(result).toBeDefined()
  expect(result).toHaveProperty('success')

  if (expectedType === 'success') {
    expect(result.success).toBe(true)
    expect(result).toHaveProperty('data')
  } else {
    expect(result.success).toBe(false)
    expect(result).toHaveProperty('error')
    expect(result.error).toHaveProperty('type')
    expect(result.error).toHaveProperty('message')
  }
}

/**
 * 統計情報の検証
 */
function assertStatsIncrement (statsBefore, statsAfter, type = 'success') {
  expect(statsAfter.totalTweets).toBe(statsBefore.totalTweets + 1)

  if (type === 'success') {
    expect(statsAfter.successfulTweets).toBe(statsBefore.successfulTweets + 1)
    expect(statsAfter.failedTweets).toBe(statsBefore.failedTweets)
  } else {
    expect(statsAfter.successfulTweets).toBe(statsBefore.successfulTweets)
    expect(statsAfter.failedTweets).toBe(statsBefore.failedTweets + 1)
  }
}

module.exports = {
  createMockCredentials,
  setupTestEnvironment,
  createTestTwitterClient,
  createTestDataDirectory,
  cleanupTestDataDirectory,
  setupFetchMock,
  createMockArticle,
  createMockTweet,
  assertIntegrationTestResult,
  assertStatsIncrement
}
