// RSS収集テスト
const FeedParser = require('./src/utils/feed-parser');
const ContentFilter = require('./src/filters/content-filter');

async function testRSSCollection() {
  console.log('🔍 RSS収集テストを開始...');
  
  const feedParser = new FeedParser();
  const contentFilter = new ContentFilter();
  
  try {
    // 設定ファイルを読み込み
    const config = await feedParser.loadFeedConfig('./config/rss-feeds.json');
    
    // OpenAI Blogの設定を取得
    const openAIFeed = config.feeds.find(feed => feed.name === 'OpenAI Blog');
    
    if (openAIFeed) {
      console.log(`📡 ${openAIFeed.name} から記事を収集中...`);
      
      // フィードを解析
      const feed = await feedParser.parseFeed(openAIFeed);
      console.log(`✅ ${feed.title} から ${feed.items.length} 件の記事を取得`);
      
      // 最新記事を3件表示
      const latestItems = feed.items.slice(0, 3);
      latestItems.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.title}`);
        console.log(`   📅 ${item.pubDate}`);
        console.log(`   🔗 ${item.link}`);
        
        // コンテンツフィルタリングテスト
        const score = contentFilter.calculateScore(item);
        console.log(`   ⭐ 品質スコア: ${score.toFixed(2)}`);
      });
    } else {
      console.log('❌ OpenAI Blogの設定が見つかりません');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
}

testRSSCollection();