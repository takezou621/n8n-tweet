// ツイート生成テスト（モックデータ使用）
const TweetGenerator = require('./src/generators/tweet-generator');
const ContentFilter = require('./src/filters/content-filter');

async function testTweetGeneration() {
  console.log('🐦 ツイート生成テストを開始...');
  
  const tweetGenerator = new TweetGenerator();
  const contentFilter = new ContentFilter();
  
  // モックデータ - 実際のRSSフィードから取得される想定のデータ
  const mockArticles = [
    {
      title: "Introducing GPT-4o: OpenAI's new flagship model",
      content: "We're announcing GPT-4o, our new flagship model that can reason across audio, vision, and text in real time.",
      link: "https://blog.openai.com/gpt-4o",
      pubDate: new Date().toISOString(),
      category: "industry",
      source: "OpenAI Blog"
    },
    {
      title: "Attention Is All You Need: Transformer Architecture Explained",
      content: "The Transformer architecture has revolutionized deep learning and natural language processing.",
      link: "https://arxiv.org/abs/1706.03762",
      pubDate: new Date().toISOString(),
      category: "research", 
      source: "ArXiv AI"
    },
    {
      title: "AlphaFold 3 predicts the structure and interactions of all of life's molecules",
      content: "AlphaFold 3 is a new AI model developed by Google DeepMind that can predict the structure of proteins.",
      link: "https://deepmind.com/research/alphafold",
      pubDate: new Date().toISOString(),
      category: "research",
      source: "DeepMind Blog"
    }
  ];
  
  console.log(`\n📊 ${mockArticles.length} 件のモック記事でテスト中...\n`);
  
  for (const [index, article] of mockArticles.entries()) {
    console.log(`${index + 1}. 記事: ${article.title}`);
    console.log(`   📂 カテゴリ: ${article.category}`);
    console.log(`   📰 ソース: ${article.source}`);
    
    // コンテンツフィルタリング
    const relevanceScore = contentFilter.calculateRelevanceScore(article);
    const qualityScore = contentFilter.calculateQualityScore(article);
    console.log(`   ⭐ 関連性スコア: ${relevanceScore.toFixed(2)}`);
    console.log(`   🎯 品質スコア: ${qualityScore.toFixed(2)}`);
    
    // ツイート生成
    try {
      const tweet = await tweetGenerator.generateSingleTweet(article);
      if (tweet && tweet.content) {
        console.log(`   🐦 生成ツイート: "${tweet.content}"`);
        console.log(`   📏 文字数: ${tweet.content.length}/280`);
      } else {
        console.log(`   ⚠️ ツイート生成結果なし`);
      }
    } catch (error) {
      console.log(`   ❌ ツイート生成エラー: ${error.message}`);
    }
    
    console.log(''); // 空行
  }
}

testTweetGeneration();