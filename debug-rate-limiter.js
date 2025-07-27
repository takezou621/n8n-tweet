#!/usr/bin/env node

const RateLimiter = require('./src/utils/rate-limiter')

async function debugRateLimiter() {
  console.log('🔍 RateLimiter詳細デバッグ開始...\n')

  // テスト1: ヘルスチェックロジックの検証
  console.log('1. ヘルスチェックロジック検証')
  const limiter = new RateLimiter({
    tweetsPerHour: 10,
    tweetsPerDay: 100,
    requestsPerMinute: 30
  })

  // 80%使用状態をシミュレート
  console.log('   8件のツイート要求を記録（80%使用）...')
  for (let i = 0; i < 8; i++) {
    await limiter.recordRequest('tweets', true)
  }

  let stats = limiter.getStats()
  let health = limiter.getHealth()

  console.log('   統計情報:')
  console.log(`     tweets.total: ${stats.tweets.total}`)
  console.log(`     tweets.remaining.hour: ${stats.tweets.remaining.hour}`)
  console.log(`     使用率: ${10 - stats.tweets.remaining.hour}/10 = ${((10 - stats.tweets.remaining.hour) / 10) * 100}%`)
  
  console.log('   ヘルス情報:')
  console.log(`     平均使用率: ${health.usage.average}%`)
  console.log(`     ステータス: ${health.status}`)
  console.log(`     期待: warning (80%以上)`)

  // テスト2: 100%使用状態
  console.log('\n   さらに2件追加（100%使用）...')
  for (let i = 0; i < 2; i++) {
    await limiter.recordRequest('tweets', true)
  }

  stats = limiter.getStats()
  health = limiter.getHealth()

  console.log('   統計情報:')
  console.log(`     tweets.total: ${stats.tweets.total}`)
  console.log(`     tweets.remaining.hour: ${stats.tweets.remaining.hour}`)
  console.log(`     使用率: ${10 - stats.tweets.remaining.hour}/10 = ${((10 - stats.tweets.remaining.hour) / 10) * 100}%`)
  
  console.log('   ヘルス情報:')
  console.log(`     平均使用率: ${health.usage.average}%`)
  console.log(`     ステータス: ${health.status}`)
  console.log(`     期待: unhealthy (90%以上)`)

  // テスト3: 時間窓管理の検証
  console.log('\n2. 時間窓管理検証')
  const shortLimiter = new RateLimiter({
    tweetsPerHour: 5,
    timeWindowHour: 100 // 100ms
  })

  console.log('   初期要求を記録...')
  await shortLimiter.recordRequest('tweets')

  console.log('   150ms待機（時間窓外）...')
  await new Promise(resolve => setTimeout(resolve, 150))

  const finalStats = shortLimiter.getStats()
  console.log(`   最終remaining.hour: ${finalStats.tweets.remaining.hour}`)
  console.log(`   期待: 5 (古い記録除外)`)

  console.log('\n🔍 詳細計算確認:')
  
  // 内部状態確認
  console.log('内部requestHistory:')
  console.log(shortLimiter.requestHistory.tweets)
  
  // 時間フィルタリング確認
  const now = Date.now()
  const recentTweets = shortLimiter.requestHistory.tweets.filter(
    record => now - record.timestamp < 100 // 100ms窓
  )
  console.log(`フィルタ後の記録数: ${recentTweets.length}`)
  console.log(`残り: ${5 - recentTweets.length}`)

  limiter.cleanup()
  shortLimiter.cleanup()
}

if (require.main === module) {
  debugRateLimiter().catch(console.error)
}