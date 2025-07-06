/**
 * Complete workflow test
 */

const AITweetBot = require('./src/index')

async function testCompleteWorkflow() {
  console.log('🤖 Testing Complete AI Tweet Bot Workflow...\n')
  
  try {
    // Initialize the bot
    console.log('🔄 Initializing AI Tweet Bot...')
    const bot = new AITweetBot()
    
    // Start the bot
    console.log('🚀 Starting AI Tweet Bot...')
    await bot.start()
    
    // Run health check
    console.log('🏥 Running health check...')
    const health = await bot.healthCheck()
    console.log(`Health status: ${health.status}`)
    console.log('Components status:')
    Object.entries(health.components).forEach(([component, status]) => {
      console.log(`  ${component}: ${status.status}`)
    })
    
    // Process feeds (this would normally get data from actual RSS feeds)
    console.log('\n📡 Processing RSS feeds...')
    // Note: This will try to fetch real RSS feeds, so it might take some time
    
    try {
      const results = await bot.processFeeds()
      
      console.log('\n📊 Workflow Results:')
      console.log(`Original items from RSS: ${results.allItems.length}`)
      console.log(`After filtering: ${results.filteredItems.length}`)
      console.log(`After deduplication: ${results.uniqueItems.length}`)
      console.log(`Tweets generated: ${results.tweets.length}`)
      console.log(`Optimal tweets selected: ${results.optimalTweets.length}`)
      
      // Display sample optimal tweets
      if (results.optimalTweets.length > 0) {
        console.log('\n🐦 Sample Generated Tweets:')
        results.optimalTweets.slice(0, 3).forEach((tweet, index) => {
          console.log(`\n--- Tweet ${index + 1} ---`)
          console.log(`"${tweet.content}"\n`)
          console.log(`Length: ${tweet.metadata.length} chars`)
          console.log(`Engagement Score: ${tweet.metadata.engagementScore.toFixed(3)}`)
          console.log(`Source: ${tweet.originalItem.source}`)
        })
      }
      
      // Get tweet statistics
      const tweetStats = bot.tweetGenerator.getTweetStats(results.tweets)
      console.log('\n📈 Tweet Statistics:')
      console.log(`Average length: ${tweetStats.averageLength} characters`)
      console.log(`Average engagement score: ${tweetStats.averageEngagement}`)
      
    } catch (feedError) {
      console.log('⚠️  RSS feed processing failed (this might be expected in testing environment)')
      console.log('Error:', feedError.message)
      console.log('\nTesting with mock data instead...')
      
      // Test with mock data when real feeds are not available
      await testWithMockData(bot)
    }
    
    // Stop the bot
    console.log('\n🛑 Stopping AI Tweet Bot...')
    await bot.stop()
    
    console.log('\n✅ Complete workflow test finished!')
    
  } catch (error) {
    console.error('❌ Workflow test failed:', error.message)
    console.error(error.stack)
  }
}

async function testWithMockData(bot) {
  console.log('🧪 Testing with mock data...')
  
  // Mock filtered items (simulating what would come from real RSS processing)
  const mockItems = [
    {
      title: 'New Transformer Architecture Achieves State-of-the-Art Results',
      description: 'Researchers have developed a novel transformer variant that improves efficiency by 40% while maintaining accuracy across language tasks.',
      link: 'https://arxiv.org/abs/example',
      pubDate: new Date(),
      category: 'research',
      feedName: 'ArXiv AI',
      scores: { relevance: 0.92, quality: 0.88, combined: 0.90 }
    },
    {
      title: 'Meta Releases Llama 3.5 with Advanced Reasoning Capabilities',
      description: 'The latest version of Meta\'s open-source language model shows significant improvements in mathematical and logical reasoning tasks.',
      link: 'https://ai.meta.com/llama-3-5',
      pubDate: new Date(),
      category: 'industry',
      feedName: 'Meta AI',
      scores: { relevance: 0.95, quality: 0.85, combined: 0.90 }
    }
  ]
  
  // Generate tweets from mock data
  const tweets = await bot.tweetGenerator.generateTweets(mockItems, bot.config.feeds.categories)
  const optimal = bot.tweetGenerator.selectOptimalTweets(tweets, 2)
  
  console.log(`\n📱 Generated ${tweets.length} tweets from mock data:`)
  optimal.forEach((tweet, index) => {
    console.log(`\n--- Mock Tweet ${index + 1} ---`)
    console.log(`"${tweet.content}"`)
    console.log(`Engagement Score: ${tweet.metadata.engagementScore.toFixed(3)}`)
  })
}

// Run test
if (require.main === module) {
  testCompleteWorkflow()
}

module.exports = testCompleteWorkflow
