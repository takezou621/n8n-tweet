// 重複チェック機能テスト
const DuplicateChecker = require('./src/filters/duplicate-checker');

async function testDuplicateCheck() {
  console.log('🔍 重複チェック機能テストを開始...');
  
  const duplicateChecker = new DuplicateChecker();
  
  const testArticles = [
    {
      title: "GPT-4o: OpenAI's new flagship model",
      content: "Introducing our new model...",
      link: "https://blog.openai.com/gpt-4o"
    },
    {
      title: "GPT-4o: OpenAI's Latest Model", // 類似タイトル
      content: "OpenAI announces new model...",
      link: "https://techcrunch.com/openai-gpt4o"
    },
    {
      title: "Completely Different AI Research",
      content: "This is about something else...",
      link: "https://arxiv.org/different-research"
    }
  ];
  
  console.log(`\n📊 ${testArticles.length} 件の記事で重複チェック...\n`);
  
  const results = await duplicateChecker.removeDuplicates(testArticles);
  
  console.log(`✅ 重複除去結果: ${results.length}/${testArticles.length} 件がユニーク`);
  
  results.forEach((article, index) => {
    console.log(`${index + 1}. ${article.title}`);
    console.log(`   🔗 ${article.link}`);
  });
}

testDuplicateCheck();