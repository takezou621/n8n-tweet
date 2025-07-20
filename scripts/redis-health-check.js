#!/usr/bin/env node

/**
 * Redis Health Check - Node.js版
 * redis-cliに依存しないRedis接続確認スクリプト
 */

const redis = require('redis')

async function checkRedisHealth () {
  const redisHost = process.env.REDIS_HOST || 'localhost'
  const redisPort = process.env.REDIS_PORT || 6379

  let client
  try {
    // Redis接続設定（短いタイムアウト）
    client = redis.createClient({
      socket: {
        host: redisHost,
        port: redisPort,
        connectTimeout: 2000
      }
    })

    // エラーハンドリング（簡潔に）
    client.on('error', () => {
      // Suppress error output in CI
    })

    // 接続試行（タイムアウト付き）
    const connectPromise = client.connect()
    const timeoutPromise = new Promise((resolve, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), 3000)
    )

    await Promise.race([connectPromise, timeoutPromise])

    // Ping テスト
    const pong = await client.ping()

    if (pong === 'PONG') {
      process.exit(0)
    } else {
      process.exit(1)
    }
  } catch (error) {
    // Redis not available - fail silently for CI
    process.exit(1)
  } finally {
    if (client && client.isOpen) {
      try {
        await client.disconnect()
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}

// メイン実行
if (require.main === module) {
  checkRedisHealth().catch(() => {
    process.exit(1)
  })
}

module.exports = { checkRedisHealth }
