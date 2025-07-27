#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// n8n設定
const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_USER = process.env.N8N_USER || 'admin';
const N8N_PASS = process.env.N8N_PASS || 'admin';

// 色付きコンソール出力
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`)
};

// axiosインスタンス作成
const api = axios.create({
  baseURL: N8N_URL,
  auth: {
    username: N8N_USER,
    password: N8N_PASS
  },
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// n8nの準備確認
async function waitForN8n() {
  log.info('n8nの起動を確認中...');
  
  for (let i = 0; i < 30; i++) {
    try {
      const response = await api.get('/api/v1/workflows');
      if (response.status === 200) {
        log.success('n8nが起動しています');
        return true;
      }
    } catch (error) {
      if (i < 29) {
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  log.error('n8nに接続できません。n8nが起動していることを確認してください。');
  return false;
}

// 既存ワークフローの確認
async function getExistingWorkflows() {
  try {
    const response = await api.get('/api/v1/workflows');
    return response.data.data || [];
  } catch (error) {
    log.error(`ワークフロー一覧の取得に失敗: ${error.message}`);
    return [];
  }
}

// ワークフローの削除
async function deleteWorkflow(id, name) {
  try {
    await api.delete(`/api/v1/workflows/${id}`);
    log.success(`既存ワークフロー削除: ${name}`);
  } catch (error) {
    log.warning(`ワークフロー削除失敗: ${name}`);
  }
}

// ワークフローファイルの読み込み
async function loadWorkflowFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log.error(`ファイル読み込みエラー: ${filePath}`);
    throw error;
  }
}

// ワークフローのインポート
async function importWorkflow(workflowData, fileName) {
  try {
    // n8nのAPIフォーマットに変換
    const importData = {
      name: workflowData.name || path.basename(fileName, '.json'),
      nodes: workflowData.nodes || [],
      connections: workflowData.connections || {},
      active: false,
      settings: workflowData.settings || { executionOrder: 'v1' },
      staticData: workflowData.staticData || null,
      tags: workflowData.tags || []
    };

    const response = await api.post('/api/v1/workflows', importData);
    
    if (response.data && response.data.id) {
      log.success(`ワークフローインポート成功: ${importData.name} (ID: ${response.data.id})`);
      return response.data;
    }
  } catch (error) {
    if (error.response) {
      log.error(`インポートエラー: ${error.response.data.message || error.message}`);
      if (error.response.data.message && error.response.data.message.includes('API Key')) {
        log.warning('APIキー認証が必要です。環境変数を設定してください。');
      }
    } else {
      log.error(`インポートエラー: ${error.message}`);
    }
    return null;
  }
}

// Twitter認証情報の作成
async function createTwitterCredentials() {
  log.info('Twitter認証情報の設定...');
  
  const twitterCreds = {
    name: 'Twitter API',
    type: 'twitterOAuth1Api',
    data: {
      consumerKey: process.env.TWITTER_API_KEY || '',
      consumerSecret: process.env.TWITTER_API_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
      // OAuth1.0a設定
      oauthTokenData: {
        oauth_token: process.env.TWITTER_ACCESS_TOKEN || '',
        oauth_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET || ''
      }
    }
  };

  if (!twitterCreds.data.consumerKey) {
    log.warning('Twitter認証情報が設定されていません。');
    log.info('以下の環境変数を設定してください:');
    console.log('  TWITTER_API_KEY=your_api_key');
    console.log('  TWITTER_API_SECRET=your_api_secret');
    console.log('  TWITTER_ACCESS_TOKEN=your_access_token');
    console.log('  TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret');
    return null;
  }

  try {
    const response = await api.post('/api/v1/credentials', twitterCreds);
    if (response.data && response.data.id) {
      log.success('Twitter認証情報を作成しました');
      return response.data.id;
    }
  } catch (error) {
    log.error(`認証情報作成エラー: ${error.message}`);
    return null;
  }
}

// メイン処理
async function main() {
  console.log('🤖 n8n-tweet 自動セットアップ開始\n');

  // n8nの起動確認
  const isReady = await waitForN8n();
  if (!isReady) {
    process.exit(1);
  }

  // 既存ワークフローの確認
  log.info('既存ワークフローを確認中...');
  const existingWorkflows = await getExistingWorkflows();
  
  // 同名のワークフローを削除（オプション）
  const workflowsToImport = [
    'ai-tweet-rss-workflow.json',
    'simple-ai-tweet-workflow.json'
  ];

  for (const existing of existingWorkflows) {
    if (existing.name && (
      existing.name.includes('AI Tweet Bot') ||
      existing.name.includes('RSS to Twitter')
    )) {
      await deleteWorkflow(existing.id, existing.name);
    }
  }

  // ワークフローのインポート
  log.info('\nワークフローをインポート中...');
  const workflowDir = path.join(__dirname, '..', 'workflows');
  const importedWorkflows = [];

  for (const fileName of workflowsToImport) {
    const filePath = path.join(workflowDir, fileName);
    try {
      const workflowData = await loadWorkflowFile(filePath);
      const imported = await importWorkflow(workflowData, fileName);
      if (imported) {
        importedWorkflows.push(imported);
      }
    } catch (error) {
      log.error(`${fileName} のインポートに失敗しました`);
    }
  }

  // Twitter認証情報の設定
  const credentialId = await createTwitterCredentials();

  // 完了メッセージ
  console.log('\n✨ セットアップ完了!\n');
  console.log('📋 インポートされたワークフロー:');
  importedWorkflows.forEach(wf => {
    console.log(`   - ${wf.name} (ID: ${wf.id})`);
  });

  console.log('\n🔧 次のステップ:');
  console.log(`1. n8nエディターにアクセス: ${N8N_URL}`);
  console.log('2. ワークフローを開いて設定を確認');
  
  if (!credentialId) {
    console.log('3. Twitter認証情報を手動で設定');
  } else {
    console.log('3. Twitter認証情報が自動設定されました');
  }
  
  console.log('4. "Execute Workflow"でテスト実行');
  console.log('5. 問題なければ"Active"をONに\n');
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  log.error(`予期しないエラー: ${error.message}`);
  process.exit(1);
});

// 実行
if (require.main === module) {
  main().catch(error => {
    log.error(`実行エラー: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { importWorkflow, createTwitterCredentials };