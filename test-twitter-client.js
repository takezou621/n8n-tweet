// Twitter Client統合テスト
const TwitterClient = require('./src/integrations/twitter-client')

async function testTwitterClient() {
  console.log('🐦 TwitterClient統合テストを開始...')
  
  try {
    // テスト用設定
    const config = {
      credentials: {
        apiKey: 'test_api_key',
        apiSecret: 'test_api_secret', 
        accessToken: 'test_access_token',
        accessTokenSecret: 'test_access_token_secret'
      },
      enableDryRun: true, // ドライランモード
      rateLimitDelay: 1000
    }
    
    // TwitterClientを初期化
    const twitterClient = new TwitterClient(config)
    console.log('✅ TwitterClient initialized successfully')
    
    // ヘルスチェック
    console.log('🔍 Performing health check...')
    const health = await twitterClient.healthCheck()
    console.log('Health status:', health.status)
    console.log('Authenticated:', health.authenticated)
    
    // 単一ツイートテスト
    console.log('📝 Testing single tweet posting...')
    const singleTweet = { text: 'This is a test tweet from AI Tweet Bot! 🤖 #AI #Testing' }
    const singleResult = await twitterClient.postTweet(singleTweet)
    console.log('Single tweet result:', singleResult.success ? '✅ Success' : '❌ Failed')
    if (singleResult.dryRun) {
      console.log('  📝 DRY RUN - Tweet ID:', singleResult.data.id)
    }
    
    // 複数ツイートテスト
    console.log('📝 Testing multiple tweet posting...')
    const multipleTweets = [
      { text: 'First AI research update 🧠 #AI #Research' },
      { text: 'Latest in machine learning developments 🤖 #ML #Tech' },
      { text: 'Breaking: New neural network architecture announced! 🚀 #NeuralNetworks' }
    ]
    
    const multipleResult = await twitterClient.postMultipleTweets(multipleTweets)
    console.log(`Multiple tweets result: ${multipleResult.successful}/${multipleResult.total} successful`)
    
    // 統計情報表示
    console.log('📊 Statistics:')
    const stats = twitterClient.getStats()
    console.log(`  Total posts: ${stats.total}`)
    console.log(`  Successful: ${stats.successful}`)
    console.log(`  Failed: ${stats.failed}`)
    console.log(`  Success rate: ${stats.successRate}`)
    
    // 投稿履歴表示
    console.log('📚 Post History:')
    const history = twitterClient.getPostHistory(5)
    history.forEach((post, index) => {
      const status = post.success ? '✅' : '❌'
      console.log(`  ${index + 1}. ${status} ${post.text.substring(0, 50)}...`)
    })
    
    console.log('🎉 TwitterClient integration test completed successfully!')
    
  } catch (error) {
    console.error('❌ TwitterClient test failed:', error.message)
  }
}

// テスト実行
testTwitterClient()
