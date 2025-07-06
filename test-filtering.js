/**
 * Quick test for content filtering functionality
 */

const FeedParser = require('./src/utils/feed-parser')
const ContentFilter = require('./src/filters/content-filter')
const DuplicateChecker = require('./src/filters/duplicate-checker')

async function testContentFiltering() {
  console.log('🧪 Testing Content Filtering Functionality...\n')
  
  try {
    // Test data
    const testItems = [
      {
        title: 'Breakthrough in Deep Learning for Natural Language Processing',
        description: 'Researchers at MIT have developed a new neural network architecture that significantly improves performance on language understanding tasks.',
        link: 'https://arxiv.org/abs/2024/12345',
        pubDate: new Date(),
        category: 'research',
        feedName: 'ArXiv AI'
      },
      {
        title: 'OpenAI Announces GPT-5 with Enhanced Capabilities',
        description: 'The latest iteration of OpenAI\'s language model features improved reasoning and multimodal understanding.',
        link: 'https://blog.openai.com/gpt-5-announcement',
        pubDate: new Date(),
        category: 'industry',
        feedName: 'OpenAI Blog'
      },
      {
        title: 'Best Pizza Places in Tokyo - Food Review',
        description: 'A comprehensive guide to finding the most delicious pizza in Tokyo, with recommendations from local food critics.',
        link: 'https://foodblog.example.com/tokyo-pizza',
        pubDate: new Date(),
        category: 'food',
        feedName: 'Food Blog'
      },
      {
        title: 'Breakthrough in Deep Learning for Natural Language Processing', // Duplicate title
        description: 'Researchers at MIT have developed a new neural network architecture...',
        link: 'https://arxiv.org/abs/2024/12345', // Duplicate URL
        pubDate: new Date(),
        category: 'research',
        feedName: 'ArXiv AI Copy'
      }
    ]
    
    const categories = {
      research: {
        weight: 1.0,
        keywords: ['arxiv', 'paper', 'research', 'study', 'algorithm', 'neural', 'deep learning'],
        hashtagPrefix: '#AIResearch'
      },
      industry: {
        weight: 0.9,
        keywords: ['product', 'announcement', 'release', 'update', 'company'],
        hashtagPrefix: '#AIIndustry'
      }
    }
    
    // Initialize components
    console.log('📝 Initializing components...')
    const contentFilter = new ContentFilter({
      scoreThreshold: 0.7,
      minQualityScore: 0.5
    })
    
    const duplicateChecker = new DuplicateChecker({
      maxEntries: 1000,
      retentionHours: 24,
      similarityThreshold: 0.8
    })
    
    // Test content filtering
    console.log('🔍 Testing content filtering...')
    const filteredItems = await contentFilter.filterRelevantContent(testItems, categories)
    
    console.log(`Original items: ${testItems.length}`)
    console.log(`Filtered items: ${filteredItems.length}`)
    
    // Display filtering results
    filteredItems.forEach((item, index) => {
      console.log(`\n--- Filtered Item ${index + 1} ---`)
      console.log(`Title: ${item.title.substring(0, 60)}...`)
      console.log(`Relevance Score: ${item.scores.relevance.toFixed(3)}`)
      console.log(`Quality Score: ${item.scores.quality.toFixed(3)}`)
      console.log(`Combined Score: ${item.scores.combined.toFixed(3)}`)
      console.log(`Category: ${item.category}`)
    })
    
    // Test duplicate checking
    console.log('\n🔍 Testing duplicate checking...')
    const uniqueItems = await duplicateChecker.removeDuplicates(filteredItems)
    
    console.log(`After filtering: ${filteredItems.length}`)
    console.log(`After deduplication: ${uniqueItems.length}`)
    
    // Display cache stats
    const cacheStats = duplicateChecker.getCacheStats()
    console.log('\n📊 Cache Statistics:')
    console.log(`Seen items: ${cacheStats.seenItems}`)
    console.log(`URL cache: ${cacheStats.urlCache}`)
    console.log(`Content hashes: ${cacheStats.contentHashes}`)
    
    console.log('\n✅ Content filtering test completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error(error.stack)
  }
}

// Run test
if (require.main === module) {
  testContentFiltering()
}

module.exports = testContentFiltering
