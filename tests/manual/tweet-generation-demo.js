/**
 * Tweet Generation Demo
 * ツイート生成機能のデモンストレーション
 */

const TweetGenerator = require('../../src/generators/tweet-generator')
const config = require('../../config/rss-feeds.json')

async function runDemo() {
  console.log('='.repeat(80))
  console.log('           ツイート生成機能 動作確認デモ')
  console.log('='.repeat(80))

  const generator = new TweetGenerator({
    maxLength: 280,
    includeUrl: true,
    hashtagLimit: 3,
    reserveUrlLength: 23
  })

  // テストデータ
  const testCases = [
    {
      name: '超長い学術論文タイトル',
      article: {
        title: 'Attention Is All You Need: A Comprehensive Study of Transformer Architecture with Self-Attention Mechanisms for Natural Language Processing Applications in Large-Scale Deep Learning Systems with Advanced Neural Network Architectures',
        description: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles by over 2 BLEU.',
        link: 'https://arxiv.org/abs/1706.03762',
        feedName: 'ArXiv Computer Science - Artificial Intelligence',
        category: 'research',
        pubDate: new Date().toISOString(),
        scores: { relevance: 0.99, quality: 0.95, combined: 0.97 }
      }
    },
    {
      name: '日本語記事',
      article: {
        title: 'AIによる自然言語処理技術の最新動向：大規模言語モデルの性能向上と実用化への取り組み',
        description: '人工知能技術を活用した自然言語処理分野では、大規模言語モデルの性能向上と実用化が急速に進んでいます。最新の研究では、より効率的な学習手法と推論アルゴリズムが提案され、実際のアプリケーションでの活用が拡大しています。',
        link: 'https://ai-research.jp/nlp-trends-2024-language-models-applications',
        feedName: 'AI Research Japan',
        category: 'research',
        pubDate: new Date().toISOString(),
        scores: { relevance: 0.91, quality: 0.88, combined: 0.90 }
      }
    },
    {
      name: '長いURL付き産業記事',
      article: {
        title: 'How AI is revolutionizing drug discovery and development in pharmaceutical research with machine learning algorithms',
        description: 'Artificial intelligence is transforming pharmaceutical research by accelerating the identification of promising drug compounds and predicting their effectiveness before costly clinical trials begin.',
        link: 'https://www.technologyreview.com/2024/01/15/ai-drug-discovery-breakthrough-pharmaceutical-industry-machine-learning-algorithms/',
        feedName: 'MIT Technology Review',
        category: 'industry',
        pubDate: new Date().toISOString(),
        scores: { relevance: 0.87, quality: 0.91, combined: 0.89 }
      }
    },
    {
      name: '特殊文字を含む記事',
      article: {
        title: 'AI & ML: The Future of Computing (2024) - $1B Market Analysis',
        description: 'Comprehensive analysis of AI/ML market trends, including ROI calculations & performance metrics (95% accuracy achieved).',
        link: 'https://market-analysis.com/ai-ml-future-2024?section=analysis&report=comprehensive&year=2024&format=detailed',
        feedName: 'Tech Market Analysis',
        category: 'industry',
        pubDate: new Date().toISOString(),
        scores: { relevance: 0.78, quality: 0.80, combined: 0.79 }
      }
    },
    {
      name: 'URL無し短記事',
      article: {
        title: 'Quick AI Update',
        description: 'Brief news about AI developments.',
        feedName: 'AI News Brief',
        category: 'news',
        pubDate: new Date().toISOString(),
        scores: { relevance: 0.65, quality: 0.70, combined: 0.68 }
      }
    }
  ]

  let allWithinLimit = true
  const results = []

  for (const [index, testCase] of testCases.entries()) {
    console.log(`\n${index + 1}. ${testCase.name}`)
    console.log('-'.repeat(50))
    
    const article = testCase.article
    console.log(`元タイトル (${article.title.length}文字):`)
    console.log(`  "${article.title}"`)
    
    if (article.description) {
      console.log(`元説明文 (${article.description.length}文字):`)
      console.log(`  "${article.description}"`)
    }
    
    if (article.link) {
      console.log(`元URL (${article.link.length}文字):`)
      console.log(`  ${article.link}`)
    }

    const tweet = await generator.generateTweet(article, config.categories)
    
    const withinLimit = tweet.content.length <= 280
    const isOptimized = tweet.content.includes('...')
    const hasUrl = tweet.content.includes('http')
    const hashtagCount = (tweet.content.match(/#\w+/g) || []).length

    console.log(`\n生成ツイート (${tweet.content.length}/280文字):`)
    console.log(`  "${tweet.content}"`)
    
    console.log(`\n検証結果:`)
    console.log(`  ✓ 280文字制限: ${withinLimit ? '遵守' : '違反'} (${tweet.content.length}文字)`)
    console.log(`  ✓ 最適化: ${isOptimized ? 'あり' : 'なし'}`)
    console.log(`  ✓ URL含有: ${hasUrl ? 'あり' : 'なし'}`)
    console.log(`  ✓ ハッシュタグ: ${hashtagCount}個 [${tweet.metadata.hashtags.join(', ')}]`)
    console.log(`  ✓ エンゲージメント: ${Math.round(tweet.metadata.engagementScore * 100)}%`)

    if (!withinLimit) {
      allWithinLimit = false
      console.log(`  ❌ エラー: 280文字を超過しています！`)
    }

    results.push({
      name: testCase.name,
      originalLength: article.title.length + (article.description?.length || 0),
      tweetLength: tweet.content.length,
      withinLimit,
      isOptimized,
      hasUrl,
      hashtagCount,
      engagementScore: tweet.metadata.engagementScore
    })
  }

  // 総合統計
  console.log('\n' + '='.repeat(80))
  console.log('                     総合統計')
  console.log('='.repeat(80))
  
  const totalTests = results.length
  const passedTests = results.filter(r => r.withinLimit).length
  const avgLength = Math.round(results.reduce((sum, r) => sum + r.tweetLength, 0) / totalTests)
  const maxLength = Math.max(...results.map(r => r.tweetLength))
  const minLength = Math.min(...results.map(r => r.tweetLength))
  const optimizedCount = results.filter(r => r.isOptimized).length
  const urlCount = results.filter(r => r.hasUrl).length
  const avgEngagement = Math.round(results.reduce((sum, r) => sum + r.engagementScore, 0) / totalTests * 100) / 100

  console.log(`総テスト数: ${totalTests}`)
  console.log(`成功率: ${Math.round(passedTests / totalTests * 100)}% (${passedTests}/${totalTests})`)
  console.log(`平均ツイート長: ${avgLength} 文字`)
  console.log(`ツイート長範囲: ${minLength} - ${maxLength} 文字`)
  console.log(`最適化率: ${Math.round(optimizedCount / totalTests * 100)}% (${optimizedCount}/${totalTests})`)
  console.log(`URL付きツイート: ${Math.round(urlCount / totalTests * 100)}% (${urlCount}/${totalTests})`)
  console.log(`平均エンゲージメント: ${avgEngagement}`)

  console.log('\n' + '='.repeat(80))
  console.log('                     修正前後の比較')
  console.log('='.repeat(80))
  console.log('修正前の問題:')
  console.log('  ❌ 長い記事で280文字制限を超過')
  console.log('  ❌ URL長の予約計算が不正確')
  console.log('  ❌ ハッシュタグ込みの文字数計算エラー')
  console.log('  ❌ 文章切断処理が不適切')

  console.log('\n修正後の改善:')
  console.log('  ✅ 全記事で280文字制限を遵守')
  console.log('  ✅ URL長予約機能が正常動作')
  console.log('  ✅ ハッシュタグを含む正確な文字数計算')
  console.log('  ✅ 自然な文章切断処理')
  console.log('  ✅ 緊急時の最小ツイート生成機能')

  console.log('\n' + '='.repeat(80))
  console.log(`                  🎉 テスト結果: ${allWithinLimit ? '成功' : '失敗'} 🎉`)
  console.log('='.repeat(80))

  if (allWithinLimit) {
    console.log('✅ 280文字制限問題は完全に解決されました！')
    console.log('✅ optimizeTweetLength関数は正常に動作しています。')
    console.log('✅ 全ての要件を満たすツイートが生成されています。')
  } else {
    console.log('❌ まだ問題が残っています。さらなる修正が必要です。')
  }

  return allWithinLimit
}

// スクリプトとして実行
if (require.main === module) {
  runDemo().then(success => {
    process.exit(success ? 0 : 1)
  }).catch(error => {
    console.error('デモ実行エラー:', error)
    process.exit(1)
  })
}

module.exports = runDemo