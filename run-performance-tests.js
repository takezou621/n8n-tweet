/**
 * Performance Tests Runner
 * n8n-tweet システムのパフォーマンステストを直接実行
 */

const { performance } = require('perf_hooks');

console.log('🚀 Starting n8n-tweet Performance Tests...\n');

async function runRSSFeedPerformanceTest() {
  console.log('=== RSS フィード処理のパフォーマンステスト ===');
  
  const FeedParser = require('./src/utils/feed-parser.js');
  const feedConfig = require('./config/rss-feeds.json');
  
  const parser = new FeedParser({ timeout: 15000, retries: 1 });
  
  const performanceMetrics = {
    feedProcessingTimes: [],
    totalArticles: 0,
    averageResponseTime: 0,
    throughput: 0
  };
  
  try {
    console.log('Testing concurrent feed processing...');
    const startTime = performance.now();
    
    const testFeeds = feedConfig.feeds.slice(0, 3); // 最初の3つのフィードをテスト
    const feedPromises = testFeeds.map(async (feed, index) => {
      const feedStartTime = performance.now();
      
      try {
        const result = await parser.parseFeed(feed);
        const feedProcessingTime = performance.now() - feedStartTime;
        
        performanceMetrics.feedProcessingTimes.push({
          feedName: feed.name,
          processingTime: feedProcessingTime,
          articles: result.items?.length || 0,
          success: result.success
        });
        
        return result;
      } catch (error) {
        performanceMetrics.feedProcessingTimes.push({
          feedName: feed.name,
          processingTime: performance.now() - feedStartTime,
          articles: 0,
          success: false,
          error: error.message
        });
        return null;
      }
    });
    
    const results = await Promise.all(feedPromises);
    const totalProcessingTime = performance.now() - startTime;
    
    // パフォーマンスメトリクスの計算
    const successfulFeeds = performanceMetrics.feedProcessingTimes.filter(f => f.success);
    performanceMetrics.totalArticles = successfulFeeds.reduce((sum, f) => sum + f.articles, 0);
    performanceMetrics.averageResponseTime = successfulFeeds.length > 0 
      ? successfulFeeds.reduce((sum, f) => sum + f.processingTime, 0) / successfulFeeds.length 
      : 0;
    performanceMetrics.throughput = performanceMetrics.totalArticles / (totalProcessingTime / 1000); // articles per second
    
    console.log('\n📊 RSS Feed Processing Performance Results:');
    console.log('===========================================');
    console.log(`Total processing time: ${totalProcessingTime.toFixed(2)}ms`);
    console.log(`Successful feeds: ${successfulFeeds.length}/${testFeeds.length}`);
    console.log(`Total articles processed: ${performanceMetrics.totalArticles}`);
    console.log(`Average feed response time: ${performanceMetrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`Throughput: ${performanceMetrics.throughput.toFixed(2)} articles/second`);
    
    // 詳細な結果表示
    performanceMetrics.feedProcessingTimes.forEach((feed, index) => {
      const status = feed.success ? '✅' : '❌';
      console.log(`${status} ${feed.feedName}: ${feed.processingTime.toFixed(2)}ms (${feed.articles} articles)`);
      if (feed.error) {
        console.log(`    Error: ${feed.error}`);
      }
    });
    
    console.log('\n✅ RSS feed processing performance test: COMPLETED\n');
    return performanceMetrics;
    
  } catch (error) {
    console.error('❌ RSS performance test failed:', error.message);
    return null;
  }
}

async function runContentFilteringPerformanceTest() {
  console.log('=== コンテンツフィルタリングのパフォーマンステスト ===');
  
  const ContentFilter = require('./src/filters/content-filter.js');
  const config = require('./config/default.json');
  
  // 大量のテストデータを生成
  const generateTestArticles = (count) => {
    const articles = [];
    const titles = [
      'Machine Learning Breakthrough in Neural Networks',
      'Artificial Intelligence Ethics Guidelines',
      'Deep Learning Applications in Healthcare',
      'Natural Language Processing Advances',
      'Computer Vision Research Update',
      'Weather Forecast for Tomorrow',
      'Local Restaurant News',
      'Sports Game Results',
      'Celebrity Entertainment News',
      'Stock Market Update'
    ];
    
    const descriptions = [
      'Advanced research in artificial intelligence and machine learning.',
      'New developments in neural network architectures.',
      'Applications of AI in medical diagnosis and treatment.',
      'Breakthrough in natural language understanding.',
      'Computer vision improvements for autonomous systems.',
      'Sunny weather expected with mild temperatures.',
      'New restaurant opens with traditional cuisine.',
      'Local team wins championship game.',
      'Celebrity spotted at movie premiere.',
      'Market shows positive trends this quarter.'
    ];
    
    for (let i = 0; i < count; i++) {
      articles.push({
        title: titles[i % titles.length] + ` - Article ${i + 1}`,
        description: descriptions[i % descriptions.length],
        category: ['research', 'industry', 'technology', 'local', 'entertainment'][i % 5],
        link: `https://example.com/article-${i + 1}`
      });
    }
    
    return articles;
  };
  
  try {
    const testSizes = [10, 50, 100]; // Different batch sizes to test
    const filteringResults = [];
    
    const filter = new ContentFilter({
      ...config.content.filtering,
      scoreThreshold: 0.3
    });
    
    for (const size of testSizes) {
      console.log(`\nTesting filtering performance with ${size} articles...`);
      
      const testArticles = generateTestArticles(size);
      const startTime = performance.now();
      
      const filteredArticles = await filter.filterRelevantContent(
        testArticles,
        ['ai', 'research', 'technology', 'machine learning']
      );
      
      const processingTime = performance.now() - startTime;
      const throughput = size / (processingTime / 1000); // articles per second
      
      const result = {
        inputSize: size,
        outputSize: filteredArticles.length,
        processingTime,
        throughput,
        filteringRatio: filteredArticles.length / size
      };
      
      filteringResults.push(result);
      
      console.log(`✅ ${size} articles → ${filteredArticles.length} filtered in ${processingTime.toFixed(2)}ms`);
      console.log(`   Throughput: ${throughput.toFixed(2)} articles/second`);
      console.log(`   Filtering ratio: ${(result.filteringRatio * 100).toFixed(1)}%`);
    }
    
    console.log('\n📊 Content Filtering Performance Summary:');
    console.log('==========================================');
    
    const avgThroughput = filteringResults.reduce((sum, r) => sum + r.throughput, 0) / filteringResults.length;
    const avgFilteringRatio = filteringResults.reduce((sum, r) => sum + r.filteringRatio, 0) / filteringResults.length;
    
    console.log(`Average throughput: ${avgThroughput.toFixed(2)} articles/second`);
    console.log(`Average filtering ratio: ${(avgFilteringRatio * 100).toFixed(1)}%`);
    
    console.log('\n✅ Content filtering performance test: COMPLETED\n');
    return filteringResults;
    
  } catch (error) {
    console.error('❌ Content filtering performance test failed:', error.message);
    return null;
  }
}

async function runTweetGenerationPerformanceTest() {
  console.log('=== ツイート生成のパフォーマンステスト ===');
  
  const TweetGenerator = require('./src/generators/tweet-generator.js');
  const config = require('./config/default.json');
  
  try {
    const generator = new TweetGenerator(config.content.generation);
    
    // テスト用記事データを生成
    const generateTestArticles = (count) => {
      const articles = [];
      for (let i = 0; i < count; i++) {
        articles.push({
          title: `AI Research Article ${i + 1}: Advanced Machine Learning Techniques`,
          description: `This article discusses cutting-edge developments in artificial intelligence and machine learning, focusing on neural network architectures and their applications in real-world scenarios.`,
          category: 'research',
          link: `https://example.com/ai-research-${i + 1}`,
          scores: { relevance: 0.8, quality: 0.9, combined: 0.85 }
        });
      }
      return articles;
    };
    
    const testSizes = [5, 10, 20]; // Different batch sizes
    const generationResults = [];
    
    for (const size of testSizes) {
      console.log(`\nTesting tweet generation with ${size} articles...`);
      
      const testArticles = generateTestArticles(size);
      const startTime = performance.now();
      
      const tweets = [];
      for (const article of testArticles) {
        const tweet = await generator.generateSingleTweet(article, { ai: 'ai', research: 'research' });
        tweets.push(tweet);
      }
      
      const processingTime = performance.now() - startTime;
      const throughput = size / (processingTime / 1000); // tweets per second
      
      // 生成されたツイートの品質チェック
      const qualityMetrics = {
        averageLength: tweets.reduce((sum, t) => sum + t.metadata.length, 0) / tweets.length,
        validTweets: tweets.filter(t => t.metadata.length <= 280).length,
        tweetsWithHashtags: tweets.filter(t => t.metadata.hashtags.length > 0).length,
        tweetsWithUrls: tweets.filter(t => t.content.includes('http')).length
      };
      
      const result = {
        inputSize: size,
        processingTime,
        throughput,
        qualityMetrics
      };
      
      generationResults.push(result);
      
      console.log(`✅ Generated ${tweets.length} tweets in ${processingTime.toFixed(2)}ms`);
      console.log(`   Throughput: ${throughput.toFixed(2)} tweets/second`);
      console.log(`   Average length: ${qualityMetrics.averageLength.toFixed(0)}/280 chars`);
      console.log(`   Valid tweets: ${qualityMetrics.validTweets}/${tweets.length}`);
      console.log(`   With hashtags: ${qualityMetrics.tweetsWithHashtags}/${tweets.length}`);
      console.log(`   With URLs: ${qualityMetrics.tweetsWithUrls}/${tweets.length}`);
    }
    
    console.log('\n📊 Tweet Generation Performance Summary:');
    console.log('=========================================');
    
    const avgThroughput = generationResults.reduce((sum, r) => sum + r.throughput, 0) / generationResults.length;
    const avgLength = generationResults.reduce((sum, r) => sum + r.qualityMetrics.averageLength, 0) / generationResults.length;
    
    console.log(`Average throughput: ${avgThroughput.toFixed(2)} tweets/second`);
    console.log(`Average tweet length: ${avgLength.toFixed(0)}/280 characters`);
    
    console.log('\n✅ Tweet generation performance test: COMPLETED\n');
    return generationResults;
    
  } catch (error) {
    console.error('❌ Tweet generation performance test failed:', error.message);
    return null;
  }
}

async function runIntegratedWorkflowPerformanceTest() {
  console.log('=== 統合ワークフローのパフォーマンステスト ===');
  
  const AITweetBot = require('./src/index.js');
  
  try {
    console.log('Running end-to-end workflow performance test...');
    
    const bot = new AITweetBot();
    const startTime = performance.now();
    
    // 完全なワークフローを実行
    const result = await bot.processFeeds();
    
    const totalProcessingTime = performance.now() - startTime;
    
    // パフォーマンスメトリクスの計算
    const metrics = {
      totalProcessingTime,
      articlesProcessed: result.allItems.length,
      articlesFiltered: result.filteredItems.length,
      tweetsGenerated: result.tweets.length,
      optimalTweets: result.optimalTweets.length,
      processingSpeed: result.allItems.length / (totalProcessingTime / 1000), // articles per second
      filteringEfficiency: result.allItems.length > 0 ? result.filteredItems.length / result.allItems.length : 0,
      generationSuccess: result.filteredItems.length > 0 ? result.tweets.length / result.filteredItems.length : 0
    };
    
    console.log('\n📊 Integrated Workflow Performance Results:');
    console.log('===========================================');
    console.log(`Total processing time: ${totalProcessingTime.toFixed(2)}ms`);
    console.log(`Articles processed: ${metrics.articlesProcessed}`);
    console.log(`Articles after filtering: ${metrics.articlesFiltered}`);
    console.log(`Tweets generated: ${metrics.tweetsGenerated}`);
    console.log(`Optimal tweets selected: ${metrics.optimalTweets}`);
    console.log(`Processing speed: ${metrics.processingSpeed.toFixed(2)} articles/second`);
    console.log(`Filtering efficiency: ${(metrics.filteringEfficiency * 100).toFixed(1)}%`);
    console.log(`Generation success rate: ${(metrics.generationSuccess * 100).toFixed(1)}%`);
    
    // ワークフローの各段階での処理時間推定
    const estimatedBreakdown = {
      rssProcessing: totalProcessingTime * 0.7, // RSS処理が全体の約70%
      filtering: totalProcessingTime * 0.2,     // フィルタリングが約20%
      tweetGeneration: totalProcessingTime * 0.1 // ツイート生成が約10%
    };
    
    console.log('\n⏱️ Estimated Processing Time Breakdown:');
    console.log(`RSS Processing: ~${estimatedBreakdown.rssProcessing.toFixed(0)}ms`);
    console.log(`Content Filtering: ~${estimatedBreakdown.filtering.toFixed(0)}ms`);
    console.log(`Tweet Generation: ~${estimatedBreakdown.tweetGeneration.toFixed(0)}ms`);
    
    console.log('\n✅ Integrated workflow performance test: COMPLETED\n');
    return metrics;
    
  } catch (error) {
    console.error('❌ Integrated workflow performance test failed:', error.message);
    return null;
  }
}

async function main() {
  console.log('🎯 n8n-tweet Performance Test Suite\n');
  
  const results = {
    rssPerformance: null,
    filteringPerformance: null,
    tweetGenerationPerformance: null,
    workflowPerformance: null
  };
  
  // Run all performance tests
  results.rssPerformance = await runRSSFeedPerformanceTest();
  results.filteringPerformance = await runContentFilteringPerformanceTest();
  results.tweetGenerationPerformance = await runTweetGenerationPerformanceTest();
  results.workflowPerformance = await runIntegratedWorkflowPerformanceTest();
  
  // Final summary
  console.log('🏁 PERFORMANCE TEST SUITE SUMMARY');
  console.log('=================================');
  
  const testResults = [
    { name: 'RSS Feed Processing', result: results.rssPerformance },
    { name: 'Content Filtering', result: results.filteringPerformance },
    { name: 'Tweet Generation', result: results.tweetGenerationPerformance },
    { name: 'Integrated Workflow', result: results.workflowPerformance }
  ];
  
  testResults.forEach(test => {
    const status = test.result ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} ${test.name}`);
  });
  
  const passedTests = testResults.filter(t => t.result).length;
  const totalTests = testResults.length;
  
  console.log(`\n📊 Overall Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All performance tests completed successfully!');
  } else {
    console.log('⚠️  Some performance tests failed. Check the logs above for details.');
  }
}

// Run the performance tests
main().catch(error => {
  console.error('❌ Performance test suite failed:', error.message);
  process.exit(1);
});