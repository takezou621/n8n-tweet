/**
 * Jest setup file
 * グローバルテスト設定とモックの初期化
 */

// Console methods should not be used in production code
// すべてのconsole呼び出しをモック化
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}

// Environment variables for testing
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'error'

// Global test timeout
jest.setTimeout(30000)

// Mock external APIs by default
jest.mock('axios')
jest.mock('twitter-api-v2')
jest.mock('rss-parser')

// Setup test data directory
const path = require('path')
const fs = require('fs')

const testDataDir = path.join(__dirname, 'data')
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true })
}

// Global test utilities
global.testUtils = {
  mockConfig: {
    logging: {
      level: 'error',
      format: 'json'
    },
    apis: {
      twitter: {
        rateLimit: {
          requests: 100,
          windowMs: 900000 // 15 minutes
        }
      }
    }
  },

  mockRssItem: {
    title: 'Test AI Article',
    description: 'This is a test article about artificial intelligence',
    link: 'https://example.com/test-article',
    pubDate: new Date('2025-07-06T00:00:00Z'),
    guid: 'test-guid-123'
  },

  mockTweetData: {
    text: 'Test tweet content #AI #MachineLearning',
    created_at: '2025-07-06T00:00:00.000Z',
    id: '1234567890123456789'
  },

  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
})

// Clean up after all tests
afterAll(async () => {
  // Close any open connections, clean up resources
  await new Promise(resolve => setTimeout(resolve, 100))
})
