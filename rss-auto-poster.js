#!/usr/bin/env node

/**
 * RSS自動投稿システム
 * RSSフィードからAI関連情報を収集し、Twitterに自動投稿
 */

const RSSCollector = require('./src/rss-collector')

class RSSAutoPoster {
  constructor(config = {}) {
    this.config = {
      interval: config.interval || 3600000, // 1時間
      ...config
    }

    this.collector = new RSSCollector({
      rssFeeds: [
        'https://arxiv.org/rss/cs.AI',
        'https://blog.openai.com/rss/',
        'https://ai.googleblog.com/feeds/posts/default'
      ],
      keywords: [
        'AI', 'artificial intelligence', 'machine learning', 'deep learning',
        'neural network', 'GPT', 'transformer', 'LLM', 'computer vision'
      ],
      maxItemsPerFeed: 3,
      updateInterval: this.config.interval
    })

    this.isRunning = false
    this.intervalId = null

    console.log('🚀 RSS Auto Poster initialized')
    console.log(`📡 Monitoring ${this.collector.config.rssFeeds.length} RSS feeds`)
    console.log(`⏰ Collection interval: ${this.config.interval / 1000 / 60} minutes`)
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  RSS Auto Poster is already running')
      return
    }

    try {
      console.log('🚀 Starting RSS Auto Poster...')
      await this.collector.initialize()
      this.isRunning = true

      // 初回実行
      console.log('📡 Running initial collection...')
      await this.runCollection()

      // 定期実行開始
      this.intervalId = setInterval(async () => {
        try {
          await this.runCollection()
        } catch (error) {
          console.error('❌ Auto collection error:', error.message)
        }
      }, this.config.interval)

      console.log('✅ RSS Auto Poster started successfully')
      console.log(`🔄 Next collection in ${this.config.interval / 1000 / 60} minutes`)

    } catch (error) {
      console.error('❌ Failed to start RSS Auto Poster:', error.message)
      throw error
    }
  }

  async stop() {
    if (!this.isRunning) {
      console.log('⚠️  RSS Auto Poster is not running')
      return
    }

    console.log('🛑 Stopping RSS Auto Poster...')
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    console.log('✅ RSS Auto Poster stopped')
  }

  async runCollection() {
    try {
      console.log('\n' + '='.repeat(50))
      console.log('📰 Starting RSS Collection Cycle...')
      console.log('⏰', new Date().toLocaleString())

      const result = await this.collector.runCollectionCycle()

      console.log('📊 Collection Results:')
      console.log(`   📡 Feeds processed: ${result.stats.feedsProcessed}`)
      console.log(`   📄 Items collected: ${result.collected}`)
      console.log(`   🤖 AI items filtered: ${result.filtered}`)
      console.log(`   🐦 Tweets posted: ${result.posted}`)
      console.log(`   ⚠️  Errors: ${result.stats.errors}`)

      if (result.posted > 0) {
        console.log('✅ Successfully posted new tweets!')
      } else {
        console.log('📭 No new tweets to post')
      }

      console.log('='.repeat(50) + '\n')

    } catch (error) {
      console.error('❌ Collection cycle failed:', error.message)
      throw error
    }
  }

  async runOnce() {
    try {
      console.log('🔄 Running one-time RSS collection...')
      await this.collector.initialize()
      await this.runCollection()
      console.log('✅ One-time collection completed')
    } catch (error) {
      console.error('❌ One-time collection failed:', error.message)
      throw error
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      collectorStats: this.collector.stats
    }
  }
}

// CLIインターフェース
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  const poster = new RSSAutoPoster()

  try {
    switch (command) {
      case 'start':
        await poster.start()
        // プロセスを維持
        process.on('SIGINT', async () => {
          console.log('\n🛑 Received SIGINT, stopping...')
          await poster.stop()
          process.exit(0)
        })
        break

      case 'stop':
        await poster.stop()
        break

      case 'once':
        await poster.runOnce()
        break

      case 'status':
        const stats = poster.getStats()
        console.log('📊 RSS Auto Poster Status:')
        console.log(`   Running: ${stats.isRunning}`)
        console.log(`   Interval: ${stats.config.interval / 1000 / 60} minutes`)
        console.log(`   Feeds: ${stats.collectorStats.feedsProcessed}`)
        console.log(`   Items collected: ${stats.collectorStats.itemsCollected}`)
        console.log(`   Tweets posted: ${stats.collectorStats.tweetsPosted}`)
        console.log(`   Errors: ${stats.collectorStats.errors}`)
        break

      default:
        console.log('📖 RSS Auto Poster Usage:')
        console.log('   npm run rss:start    - Start automatic collection')
        console.log('   npm run rss:once     - Run one-time collection')
        console.log('   npm run rss:status   - Show current status')
        console.log('   npm run rss:stop     - Stop automatic collection')
        break
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// 直接実行された場合
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message)
    process.exit(1)
  })
}

module.exports = RSSAutoPoster
