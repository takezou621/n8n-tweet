/**
 * テスト環境の基本動作確認
 */

const {
  createMockCredentials,
  setupTestEnvironment,
  createTestDataDirectory,
  cleanupTestDataDirectory
} = require('./helpers/test-helpers')

describe('Test Environment Setup', () => {
  test('環境変数設定が正常に動作する', () => {
    const envCleanup = setupTestEnvironment()

    expect(process.env.NODE_ENV).toBe('test')
    expect(process.env.TWITTER_BEARER_TOKEN).toBeDefined()
    expect(process.env.TWITTER_API_KEY).toBeDefined()

    envCleanup()
  })

  test('モック認証情報が生成される', () => {
    const credentials = createMockCredentials()

    expect(credentials).toHaveProperty('bearerToken')
    expect(credentials).toHaveProperty('apiKey')
    expect(credentials).toHaveProperty('apiSecret')
    expect(credentials).toHaveProperty('accessToken')
    expect(credentials).toHaveProperty('accessTokenSecret')
  })

  test('テストデータディレクトリの作成とクリーンアップ', async () => {
    const testDir = await createTestDataDirectory(__dirname)
    expect(testDir).toBeDefined()

    await cleanupTestDataDirectory(testDir)
  })
})
