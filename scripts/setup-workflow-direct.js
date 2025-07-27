#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// n8nのデータディレクトリに直接ワークフローファイルを配置
async function setupWorkflowsDirect() {
  console.log('🔧 n8n ワークフロー直接設定開始\n');

  try {
    // n8nのデータディレクトリを探す
    const possibleDataDirs = [
      path.join(process.env.HOME, '.n8n'),
      path.join(process.cwd(), '.n8n'),
      '/tmp/n8n'
    ];

    let n8nDataDir = null;
    for (const dir of possibleDataDirs) {
      try {
        await fs.access(dir);
        n8nDataDir = dir;
        console.log(`✓ n8nデータディレクトリを発見: ${dir}`);
        break;
      } catch (error) {
        // ディレクトリが存在しない
      }
    }

    if (!n8nDataDir) {
      // デフォルトディレクトリを作成
      n8nDataDir = path.join(process.env.HOME, '.n8n');
      await fs.mkdir(n8nDataDir, { recursive: true });
      console.log(`✓ n8nデータディレクトリを作成: ${n8nDataDir}`);
    }

    // ワークフローディレクトリを作成
    const workflowsDir = path.join(n8nDataDir, 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    // ワークフローファイルをコピー
    const sourceDir = path.join(__dirname, '..', 'workflows');
    const workflowFiles = [
      'ai-tweet-rss-workflow.json',
      'simple-ai-tweet-workflow.json'
    ];

    console.log('\n📋 ワークフローファイルをコピー中...');
    
    for (const fileName of workflowFiles) {
      const sourcePath = path.join(sourceDir, fileName);
      const destPath = path.join(workflowsDir, fileName);
      
      try {
        await fs.copyFile(sourcePath, destPath);
        console.log(`✓ ${fileName} をコピーしました`);
      } catch (error) {
        console.log(`✗ ${fileName} のコピーに失敗: ${error.message}`);
      }
    }

    // n8n設定ファイルの生成
    const configPath = path.join(n8nDataDir, 'config');
    await fs.mkdir(configPath, { recursive: true });

    const configData = {
      version: 1,
      database: {
        type: 'sqlite',
        sqlite: {
          database: path.join(n8nDataDir, 'database.sqlite')
        }
      },
      workflows: {
        defaultName: 'My Workflow'
      }
    };

    await fs.writeFile(
      path.join(configPath, 'index.js'),
      `module.exports = ${JSON.stringify(configData, null, 2)};`
    );

    console.log('\n✨ 直接設定完了!');
    console.log('\n🔄 n8nを再起動してください:');
    console.log('1. 現在のn8nプロセスを停止 (Ctrl+C)');
    console.log('2. npm run n8n で再起動');
    console.log('3. http://localhost:5678 でワークフローを確認');

    return true;
  } catch (error) {
    console.error(`✗ 設定エラー: ${error.message}`);
    return false;
  }
}

// ワークフローテンプレートの生成
async function generateWorkflowTemplate() {
  console.log('\n📝 簡易ワークフローテンプレートを生成中...');

  const simpleWorkflow = {
    name: "AI RSS to Tweet - Simple",
    nodes: [
      {
        parameters: {
          rule: {
            interval: [{ field: "hours", triggerAtHour: 12 }]
          }
        },
        name: "Daily Trigger",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1,
        position: [240, 300]
      },
      {
        parameters: {
          url: "https://openai.com/news/rss.xml",
          options: { timeout: 30000 }
        },
        name: "Fetch RSS",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 3,
        position: [460, 300]
      },
      {
        parameters: {
          jsCode: `
// RSS to Tweet Processor
const items = $input.all();
const rssData = items[0]?.json?.data;

if (!rssData) {
  return [{ json: { error: 'No RSS data' } }];
}

// Simple RSS parsing
const titleMatch = rssData.match(/<title>([^<]*)<\\/title>/i);
const linkMatch = rssData.match(/<link>([^<]*)<\\/link>/i);

const title = titleMatch ? titleMatch[1] : 'AI News';
const link = linkMatch ? linkMatch[1] : '';

// Create tweet
let tweet = title;
if (tweet.length > 200) {
  tweet = tweet.substring(0, 197) + '...';
}

tweet += '\\n\\n#AI #OpenAI #TechNews';
if (link) {
  tweet += '\\n' + link;
}

return [{
  json: {
    title,
    link,
    tweet,
    tweetLength: tweet.length,
    timestamp: new Date().toISOString()
  }
}];
          `
        },
        name: "Process to Tweet",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [680, 300]
      }
    ],
    connections: {
      "Daily Trigger": {
        main: [
          [{ node: "Fetch RSS", type: "main", index: 0 }]
        ]
      },
      "Fetch RSS": {
        main: [
          [{ node: "Process to Tweet", type: "main", index: 0 }]
        ]
      }
    },
    active: false,
    settings: { executionOrder: "v1" }
  };

  const templatePath = path.join(__dirname, '..', 'simple-workflow-template.json');
  await fs.writeFile(templatePath, JSON.stringify(simpleWorkflow, null, 2));
  console.log(`✓ テンプレートを作成: ${templatePath}`);

  return simpleWorkflow;
}

// メイン実行
async function main() {
  const success = await setupWorkflowsDirect();
  
  if (!success) {
    console.log('\n📋 手動設定手順:');
    console.log('1. n8nエディター (http://localhost:5678) にアクセス');
    console.log('2. 左上の "Import workflow" をクリック');
    console.log('3. "From file" を選択');
    console.log('4. workflows/simple-ai-tweet-workflow.json を選択');
    console.log('5. ワークフローをインポート');
  }

  await generateWorkflowTemplate();
}

if (require.main === module) {
  main().catch(console.error);
}