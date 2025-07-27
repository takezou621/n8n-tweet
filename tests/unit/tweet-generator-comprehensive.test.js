/**
 * Tweet Generator Comprehensive Test
 * ツイート生成機能の包括的なテスト（280文字制限対応確認）
 */

const TweetGenerator = require('../../src/generators/tweet-generator')

describe('TweetGenerator - 280文字制限対応テスト', () => {
  let generator

  beforeEach(() => {
    generator = new TweetGenerator({
      maxLength: 280,
      includeUrl: true,
      hashtagLimit: 3,
      reserveUrlLength: 23
    })
  })

  describe('1. 280文字制限の遵守確認', () => {
    test('長いタイトル・説明文を持つ記事での文字数チェック', async () => {
      const longArticle = {
        title: 'Revolutionary Machine Learning Algorithm Achieves Breakthrough Performance ' +
          'in Natural Language Processing Tasks with State-of-the-Art Results ' +
          'Across Multiple Benchmarks and Datasets',
        description: 'This groundbreaking research presents a novel deep learning architecture ' +
          'that combines transformer networks with advanced attention mechanisms to achieve ' +
          'unprecedented performance in natural language understanding tasks. The proposed ' +
          'model demonstrates significant improvements over existing approaches across multiple ' +
          'benchmarks including GLUE, SuperGLUE, and custom evaluation datasets. Our ' +
          'experiments show that this new architecture can handle complex linguistic ' +
          'phenomena with remarkable accuracy while maintaining computational efficiency. ' +
          'The implications for real-world applications are substantial, ranging from ' +
          'improved chatbots and virtual assistants to enhanced document analysis and ' +
          'automated content generation systems.',
        link: 'https://arxiv.org/abs/2024.01234.very-long-url-with-many-parameters' +
          '?param1=value1&param2=value2&param3=value3',
        feedName: 'ArXiv AI Papers',
        category: 'research',
        pubDate: new Date().toISOString(),
        scores: {
          relevance: 0.95,
          quality: 0.88,
          combined: 0.91
        }
      }

      const tweet = await generator.generateTweet(longArticle)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)
      expect(tweet.metadata.length).toBe(tweet.content.length)

      console.log('長い記事のツイート:', {
        content: tweet.content,
        length: tweet.content.length,
        originalTitleLength: longArticle.title.length,
        originalDescriptionLength: longArticle.description.length
      })
    })

    test('URL込みでの文字数計算の正確性', async () => {
      const articleWithUrl = {
        title: 'Medium Length Title About AI Research Findings',
        description: 'This article discusses important findings in artificial intelligence ' +
          'research with practical implications.',
        link: 'https://example.com/very-long-url-path/with-multiple-segments/' +
          'and-query-parameters?test=true&source=ai',
        feedName: 'AI Research News',
        category: 'news',
        pubDate: new Date().toISOString()
      }

      const tweet = await generator.generateTweet(articleWithUrl)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)

      // URLが含まれているかチェック
      expect(tweet.content).toContain('http')

      console.log('URL込みツイート:', {
        content: tweet.content,
        length: tweet.content.length,
        containsUrl: tweet.content.includes('http')
      })
    })

    test('ハッシュタグ込みでの総文字数確認', async () => {
      const hashtagTestArticle = {
        title: 'Deep Learning Neural Network Architecture Optimization',
        description: 'Advanced techniques for optimizing neural network architectures using machine learning and artificial intelligence methodologies.',
        link: 'https://research.example.com/papers/2024/neural-networks',
        feedName: 'Deep Learning Research',
        category: 'research',
        pubDate: new Date().toISOString()
      }

      const categories = {
        research: {
          hashtagPrefix: '#DeepLearning'
        }
      }

      const tweet = await generator.generateTweet(hashtagTestArticle, categories)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)

      // ハッシュタグが含まれているかチェック
      const hashtagCount = (tweet.content.match(/#\w+/g) || []).length
      expect(hashtagCount).toBeGreaterThan(0)
      expect(hashtagCount).toBeLessThanOrEqual(3)

      console.log('ハッシュタグ込みツイート:', {
        content: tweet.content,
        length: tweet.content.length,
        hashtagCount,
        hashtags: tweet.metadata.hashtags
      })
    })
  })

  describe('2. 実際のRSSフィードデータでのテスト', () => {
    test('ArXiv AI の実際の記事データを使用', async () => {
      const arxivSamples = [
        {
          title: 'Attention Is All You Need: Transformer Networks for Neural Machine Translation',
          description: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.',
          link: 'https://arxiv.org/abs/1706.03762',
          feedName: 'ArXiv Computer Science - Artificial Intelligence',
          category: 'research',
          pubDate: new Date().toISOString(),
          scores: { relevance: 0.99, quality: 0.95, combined: 0.97 }
        },
        {
          title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
          description: 'We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models, BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.',
          link: 'https://arxiv.org/abs/1810.04805',
          feedName: 'ArXiv Computer Science - Computation and Language',
          category: 'research',
          pubDate: new Date().toISOString(),
          scores: { relevance: 0.98, quality: 0.93, combined: 0.96 }
        }
      ]

      for (const article of arxivSamples) {
        const tweet = await generator.generateTweet(article)

        expect(tweet).toBeTruthy()
        expect(tweet.content.length).toBeLessThanOrEqual(280)
        expect(tweet.content).toMatch(/[🔬📊🧪]/) // Research emojis
        expect(tweet.metadata.engagementScore).toBeGreaterThan(0.5)

        console.log('ArXiv記事ツイート:', {
          title: article.title.substring(0, 50) + '...',
          content: tweet.content,
          length: tweet.content.length,
          engagement: tweet.metadata.engagementScore
        })
      }
    })

    test('MIT Technology Review の実際の記事データを使用', async () => {
      const mitSamples = [
        {
          title: 'How AI is revolutionizing drug discovery and development',
          description: 'Artificial intelligence is transforming pharmaceutical research by accelerating the identification of promising drug compounds and predicting their effectiveness before costly clinical trials begin.',
          link: 'https://www.technologyreview.com/2024/01/15/ai-drug-discovery/',
          feedName: 'MIT Technology Review',
          category: 'industry',
          pubDate: new Date().toISOString(),
          scores: { relevance: 0.87, quality: 0.91, combined: 0.89 }
        },
        {
          title: 'The latest breakthroughs in quantum machine learning',
          description: 'Researchers are exploring how quantum computing could exponentially speed up machine learning algorithms, potentially solving problems that are impossible for classical computers.',
          link: 'https://www.technologyreview.com/2024/01/20/quantum-ml-breakthrough/',
          feedName: 'MIT Technology Review',
          category: 'research',
          pubDate: new Date().toISOString(),
          scores: { relevance: 0.92, quality: 0.88, combined: 0.90 }
        }
      ]

      for (const article of mitSamples) {
        const tweet = await generator.generateTweet(article)

        expect(tweet).toBeTruthy()
        expect(tweet.content.length).toBeLessThanOrEqual(280)
        expect(tweet.metadata.engagementScore).toBeGreaterThan(0.6) // MIT articles should have high engagement

        console.log('MIT記事ツイート:', {
          title: article.title.substring(0, 50) + '...',
          content: tweet.content,
          length: tweet.content.length,
          engagement: tweet.metadata.engagementScore
        })
      }
    })

    test('日本語・英語両言語での動作確認', async () => {
      const multilingualSamples = [
        {
          title: 'AIによる自然言語処理の最新研究動向',
          description: '人工知能技術を活用した自然言語処理分野では、大規模言語モデルの性能向上と実用化が急速に進んでいます。最新の研究では、より効率的な学習手法と推論アルゴリズムが提案されています。',
          link: 'https://ai.jp/research/nlp-trends-2024',
          feedName: 'AI Research Japan',
          category: 'research',
          pubDate: new Date().toISOString(),
          scores: { relevance: 0.94, quality: 0.87, combined: 0.91 }
        },
        {
          title: 'Advanced Neural Architecture Search for Computer Vision',
          description: 'This paper presents novel approaches to automated neural architecture design for computer vision tasks, achieving state-of-the-art results on ImageNet and COCO datasets.',
          link: 'https://example.com/neural-architecture-search',
          feedName: 'Computer Vision Research',
          category: 'research',
          pubDate: new Date().toISOString(),
          scores: { relevance: 0.89, quality: 0.92, combined: 0.91 }
        }
      ]

      for (const article of multilingualSamples) {
        const tweet = await generator.generateTweet(article)

        expect(tweet).toBeTruthy()
        expect(tweet.content.length).toBeLessThanOrEqual(280)

        // 日本語の場合、文字数計算が正確かチェック
        const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(tweet.content)

        console.log('多言語記事ツイート:', {
          title: article.title.substring(0, 50) + '...',
          content: tweet.content,
          length: tweet.content.length,
          hasJapanese,
          language: hasJapanese ? 'Japanese' : 'English'
        })
      }
    })
  })

  describe('3. エッジケースのテスト', () => {
    test('非常に長いタイトルの記事', async () => {
      const extremelyLongTitle = {
        title: 'Revolutionary Breakthrough in Artificial Intelligence Research: ' +
          'Novel Deep Learning Architecture Combining Transformer Networks, ' +
          'Attention Mechanisms, Convolutional Neural Networks, and Reinforcement ' +
          'Learning Techniques Achieves Unprecedented Performance Across Multiple ' +
          'Natural Language Processing, Computer Vision, and Speech Recognition ' +
          'Benchmarks While Maintaining Computational Efficiency and Scalability ' +
          'for Real-World Applications in Healthcare, Finance, Education, and ' +
          'Autonomous Systems',
        description: 'Brief description of the research.',
        link: 'https://example.com/research',
        feedName: 'Research Journal',
        category: 'research',
        pubDate: new Date().toISOString()
      }

      const tweet = await generator.generateTweet(extremelyLongTitle)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)
      expect(tweet.content).toContain('...')

      console.log('超長タイトル記事ツイート:', {
        originalTitleLength: extremelyLongTitle.title.length,
        content: tweet.content,
        length: tweet.content.length
      })
    })

    test('説明文が短い記事', async () => {
      const shortDescription = {
        title: 'AI News Update',
        description: 'Brief update.',
        link: 'https://example.com/news',
        feedName: 'AI News',
        category: 'news',
        pubDate: new Date().toISOString()
      }

      const tweet = await generator.generateTweet(shortDescription)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)
      expect(tweet.content.length).toBeGreaterThan(20) // Should have minimum content

      console.log('短い説明文記事ツイート:', {
        content: tweet.content,
        length: tweet.content.length
      })
    })

    test('URLが含まれていない記事', async () => {
      const noUrlArticle = {
        title: 'Machine Learning Best Practices',
        description: 'Essential guidelines for implementing machine learning solutions in production environments.',
        feedName: 'ML Practices',
        category: 'industry',
        pubDate: new Date().toISOString()
      }

      const tweet = await generator.generateTweet(noUrlArticle)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)
      expect(tweet.content).not.toContain('http')

      console.log('URL無し記事ツイート:', {
        content: tweet.content,
        length: tweet.content.length,
        hasUrl: tweet.content.includes('http')
      })
    })

    test('特殊文字を含む記事', async () => {
      const specialCharacters = {
        title: 'AI & ML: The Future of Computing (2024) - $1B Industry Analysis',
        description: 'Comprehensive analysis of AI/ML market trends, including ROI calculations & performance metrics (95% accuracy achieved).',
        link: 'https://example.com/analysis?section=ai&year=2024&type=market',
        feedName: 'Market Analysis',
        category: 'industry',
        pubDate: new Date().toISOString()
      }

      const tweet = await generator.generateTweet(specialCharacters)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)

      console.log('特殊文字記事ツイート:', {
        content: tweet.content,
        length: tweet.content.length,
        hasSpecialChars: /[&$%()]/.test(tweet.content)
      })
    })
  })

  describe('4. 品質チェック', () => {
    test('生成されたツイートの可読性', async () => {
      const testArticle = {
        title: 'Explainable AI Techniques for Healthcare Applications',
        description: 'New methods for making AI decisions transparent and interpretable in medical diagnosis systems.',
        link: 'https://healthcare-ai.org/explainable-ai',
        feedName: 'Healthcare AI Journal',
        category: 'research',
        pubDate: new Date().toISOString(),
        scores: { relevance: 0.91, quality: 0.88, combined: 0.90 }
      }

      const tweet = await generator.generateTweet(testArticle)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)

      // 可読性チェック
      expect(tweet.content).not.toMatch(/\s{2,}/) // 連続空白なし
      expect(tweet.content).not.toMatch(/\n{2,}/) // 連続改行なし
      expect(tweet.content.trim()).toBe(tweet.content) // 前後空白なし

      console.log('可読性チェック:', {
        content: tweet.content,
        length: tweet.content.length,
        readable: true
      })
    })

    test('ハッシュタグの適切性', async () => {
      const hashtagTestCases = [
        {
          title: 'PyTorch Deep Learning Tutorial',
          description: 'Learn PyTorch for machine learning applications.',
          expectedHashtags: ['pytorch', 'machine learning', 'deep learning']
        },
        {
          title: 'OpenAI GPT-4 Release Notes',
          description: 'Latest updates from OpenAI about GPT-4 capabilities.',
          expectedHashtags: ['openai', 'gpt']
        }
      ]

      for (const testCase of hashtagTestCases) {
        const article = {
          ...testCase,
          link: 'https://example.com',
          feedName: 'Tech News',
          category: 'news',
          pubDate: new Date().toISOString()
        }

        const tweet = await generator.generateTweet(article)

        expect(tweet).toBeTruthy()
        expect(tweet.metadata.hashtags).toBeDefined()
        expect(tweet.metadata.hashtags.length).toBeGreaterThan(0)
        expect(tweet.metadata.hashtags.length).toBeLessThanOrEqual(3)

        console.log('ハッシュタグ適切性:', {
          title: testCase.title,
          hashtags: tweet.metadata.hashtags,
          content: tweet.content
        })
      }
    })

    test('エンゲージメントスコアの適切性', async () => {
      const engagementTestCases = [
        {
          title: 'ArXiv: Breakthrough in Neural Networks',
          feedName: 'ArXiv AI',
          pubDate: new Date().toISOString(),
          expectedScore: 0.7 // High score due to credible source and recent date
        },
        {
          title: 'Random Blog Post',
          feedName: 'Unknown Blog',
          pubDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week old
          expectedScore: 0.4 // Lower score
        }
      ]

      for (const testCase of engagementTestCases) {
        const article = {
          ...testCase,
          description: 'Test description for engagement scoring.',
          link: 'https://example.com',
          category: 'research'
        }

        const tweet = await generator.generateTweet(article)

        expect(tweet).toBeTruthy()
        expect(tweet.metadata.engagementScore).toBeGreaterThan(0)
        expect(tweet.metadata.engagementScore).toBeLessThanOrEqual(1)

        if (testCase.expectedScore) {
          expect(tweet.metadata.engagementScore).toBeGreaterThanOrEqual(testCase.expectedScore - 0.2)
        }

        console.log('エンゲージメントスコア:', {
          title: testCase.title,
          score: tweet.metadata.engagementScore,
          feedName: testCase.feedName
        })
      }
    })
  })

  describe('5. 修正前後の比較テスト', () => {
    test('280文字制限問題の解決確認', async () => {
      // 280文字を超える可能性が高い記事でテスト
      const problematicArticle = {
        title: 'Comprehensive Survey of Large Language Models: Architecture, Training Methodologies, Fine-tuning Techniques, and Applications in Natural Language Processing, Computer Vision, and Multimodal AI Systems',
        description: 'This comprehensive survey examines the current state of large language models, including detailed analysis of transformer architectures, training methodologies, fine-tuning approaches, and real-world applications across multiple domains. We provide insights into performance benchmarks, computational requirements, and future research directions.',
        link: 'https://very-long-domain-name.example.com/research/papers/comprehensive-llm-survey-2024-detailed-analysis-with-benchmarks',
        feedName: 'Comprehensive AI Research Journal',
        category: 'research',
        pubDate: new Date().toISOString(),
        scores: { relevance: 0.98, quality: 0.95, combined: 0.97 }
      }

      const tweet = await generator.generateTweet(problematicArticle)

      expect(tweet).toBeTruthy()
      expect(tweet.content.length).toBeLessThanOrEqual(280)

      // 内容が適切に含まれているかチェック
      expect(tweet.content).toMatch(/[🔬📊🧪]/) // Research emojis
      expect(tweet.content).toMatch(/#\w+/) // Has hashtags
      expect(tweet.content).toContain('http') // Has URL

      console.log('280文字制限解決確認:', {
        originalTitleLength: problematicArticle.title.length,
        originalDescLength: problematicArticle.description.length,
        finalTweetLength: tweet.content.length,
        content: tweet.content,
        withinLimit: tweet.content.length <= 280
      })

      // 文字数制限を満たしていることを明確に検証
      expect(tweet.content.length).toBeLessThanOrEqual(280)
    })
  })

  describe('6. optimizeTweetLength関数の詳細テスト', () => {
    test('URL長予約計算の正確性', () => {
      const longContent = 'This is a very long tweet content that definitely exceeds the 280 character limit and needs to be optimized by the optimizeTweetLength function. It contains detailed information about AI research and development. https://example.com/very-long-url'

      const optimized = generator.optimizeTweetLength(longContent)

      expect(optimized.length).toBeLessThanOrEqual(280)
      expect(optimized).toContain('http')

      console.log('URL長予約計算:', {
        original: longContent.length,
        optimized: optimized.length,
        containsUrl: optimized.includes('http')
      })
    })

    test('文章の自然な切断処理', () => {
      const contentWithSentences = '🔬 New research: Revolutionary AI breakthrough in natural language processing. This groundbreaking study presents novel transformer architectures. The implications are significant for future AI development. #AI #Research #Technology https://example.com/research'

      const optimized = generator.optimizeTweetLength(contentWithSentences)

      expect(optimized.length).toBeLessThanOrEqual(280)
      expect(optimized).toContain('🔬')
      expect(optimized).toContain('#')
      expect(optimized).toContain('http')

      console.log('自然な切断処理:', {
        optimized,
        length: optimized.length,
        endsWithEllipsis: optimized.includes('...')
      })
    })
  })
})
