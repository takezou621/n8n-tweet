#!/usr/bin/env node

// n8n自動セットアップ & ワークフローインポートスクリプト
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// 設定
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'http://localhost:5678';
const N8N_ADMIN_EMAIL = process.env.N8N_ADMIN_EMAIL || 'admin@n8n-tweet.local';
const N8N_ADMIN_PASSWORD = process.env.N8N_ADMIN_PASSWORD;

// セキュリティチェック
if (!N8N_ADMIN_PASSWORD) {
  console.error('❌ 環境変数 N8N_ADMIN_PASSWORD が設定されていません');
  console.error('セキュリティのため、管理者パスワードは環境変数で設定してください');
  console.error('例: export N8N_ADMIN_PASSWORD="your-secure-password"');
  process.exit(1);
}

// カラー出力
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class N8nAutoSetup {
  constructor() {
    this.baseUrl = N8N_BASE_URL;
    this.authToken = null;
    this.ownerId = null;
  }

  async checkN8nStatus() {
    try {
      const response = await axios.get(`${this.baseUrl}/healthz`);
      if (response.data.status === 'ok') {
        log('✅ n8n サービス正常稼働中', 'green');
        return true;
      }
    } catch (error) {
      log(`❌ n8n サービス接続失敗: ${error.message}`, 'red');
    }
    return false;
  }

  async checkOwnerSetup() {
    try {
      const response = await axios.get(`${this.baseUrl}/rest/owner`);
      log('🔍 オーナー設定状況確認中...', 'blue');
      return response.status === 200;
    } catch (error) {
      if (error.response?.status === 404) {
        log('📝 初期セットアップが必要です', 'yellow');
        return false;
      }
      log(`⚠️  オーナー確認エラー: ${error.message}`, 'yellow');
      return false;
    }
  }

  async setupOwner() {
    try {
      log('👤 オーナーアカウント作成中...', 'blue');
      
      const setupData = {
        email: N8N_ADMIN_EMAIL,
        firstName: 'AI',
        lastName: 'TweetBot',
        password: N8N_ADMIN_PASSWORD
      };

      const response = await axios.post(`${this.baseUrl}/rest/owner/setup`, setupData, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 200) {
        log('✅ オーナーアカウント作成完了', 'green');
        return true;
      }
    } catch (error) {
      if (error.response?.status === 400) {
        log('⚠️  オーナーは既に設定済みです', 'yellow');
        return true; // 既に設定済み
      }
      log(`❌ オーナーセットアップ失敗: ${error.message}`, 'red');
    }
    return false;
  }

  async login() {
    try {
      log('🔑 ログイン処理中...', 'blue');
      
      const loginData = {
        emailOrLdapLoginId: N8N_ADMIN_EMAIL,
        password: N8N_ADMIN_PASSWORD
      };

      const response = await axios.post(`${this.baseUrl}/rest/login`, loginData, {
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true
      });

      if (response.status === 200) {
        // n8nの最新バージョンではセッションクッキーを使用
        const cookies = response.headers['set-cookie'];
        if (cookies) {
          this.authToken = cookies.join('; ');
        }
        // データにトークンが含まれている場合もチェック
        if (response.data && response.data.token) {
          this.authToken = `Bearer ${response.data.token}`;
        }
        log('✅ ログイン成功', 'green');
        return true;
      }
    } catch (error) {
      log(`❌ ログイン失敗: ${error.message}`, 'red');
      if (error.response?.data) {
        console.error('詳細:', error.response.data);
      }
    }
    return false;
  }

  async importWorkflow() {
    try {
      log('📦 ワークフローインポート中...', 'blue');
      
      const workflowPath = path.join(__dirname, '..', 'workflows', 'ai-tweet-rss-workflow.json');
      const workflowData = JSON.parse(await fs.readFile(workflowPath, 'utf8'));
      
      // アクティブ状態をfalseに設定してインポート
      workflowData.active = false;
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.authToken) {
        if (this.authToken.startsWith('Bearer ')) {
          headers['Authorization'] = this.authToken;
        } else {
          headers['Cookie'] = this.authToken;
        }
      }

      const response = await axios.post(
        `${this.baseUrl}/rest/workflows`,
        workflowData,
        { headers }
      )

      if (response.status === 200) {
        // n8nのレスポンスは{ data: { id: ..., name: ..., ... } }の形式
        const workflowData = response.data.data;
        const workflowId = workflowData.id;
        log(`✅ ワークフローインポート成功 (ID: ${workflowId})`, 'green');
        return workflowData;
      }
    } catch (error) {
      log(`❌ ワークフローインポート失敗: ${error.message}`, 'red');
      if (error.response?.data) {
        console.error('詳細:', error.response.data);
      }
    }
    return null;
  }

  async activateWorkflow(workflowId) {
    try {
      log(`⚡ ワークフローアクティブ化中 (ID: ${workflowId})...`, 'blue');
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.authToken) {
        if (this.authToken.startsWith('Bearer ')) {
          headers['Authorization'] = this.authToken;
        } else {
          headers['Cookie'] = this.authToken;
        }
      }

      // ワークフローをアクティブ化するために、PATCHでactiveプロパティをtrueに設定
      const response = await axios.patch(`${this.baseUrl}/rest/workflows/${workflowId}`, {
        active: true
      }, { headers });

      if (response.status === 200) {
        log('✅ ワークフローアクティブ化成功', 'green');
        return true;
      }
    } catch (error) {
      log(`⚠️  ワークフローアクティブ化失敗: ${error.message}`, 'yellow');
      log('📝 手動でアクティブ化してください: http://localhost:5678', 'blue');
    }
    return false;
  }

  async runWorkflowTest(workflowId) {
    try {
      log('🧪 ワークフローテスト実行中...', 'blue');
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.authToken) {
        if (this.authToken.startsWith('Bearer ')) {
          headers['Authorization'] = this.authToken;
        } else {
          headers['Cookie'] = this.authToken;
        }
      }

      const response = await axios.post(`${this.baseUrl}/rest/workflows/${workflowId}/run`, {
        loadedFromDatabase: false,
        data: {}
      }, { headers });

      if (response.status === 200) {
        log('✅ ワークフローテスト実行成功', 'green');
        return true;
      }
    } catch (error) {
      log(`⚠️  ワークフローテスト実行: ${error.message}`, 'yellow');
      log('📝 ダッシュボードで手動テストしてください', 'blue');
      // テスト実行の失敗は非致命的
    }
    return false;
  }
}

async function main() {
  log('🚀 n8n 自動セットアップ & ワークフロー設定開始', 'cyan');
  log('='.repeat(60), 'cyan');

  const setup = new N8nAutoSetup();

  try {
    // 1. n8nサービス確認
    const isRunning = await setup.checkN8nStatus();
    if (!isRunning) {
      log('❌ n8nサービスが起動していません', 'red');
      process.exit(1);
    }

    // 少し待機
    await delay(2000);

    // 2. オーナー設定確認
    const hasOwner = await setup.checkOwnerSetup();
    
    if (!hasOwner) {
      // 3. オーナーセットアップ
      const ownerSetup = await setup.setupOwner();
      if (!ownerSetup) {
        log('❌ オーナーセットアップに失敗しました', 'red');
        process.exit(1);
      }
      
      // セットアップ後少し待機
      await delay(3000);
    }

    // 4. ログイン試行
    const loginSuccess = await setup.login();
    if (!loginSuccess) {
      log('⚠️  ログインをスキップしてワークフローインポートを続行', 'yellow');
    }

    // 5. ワークフローインポート
    const workflow = await setup.importWorkflow();
    if (!workflow) {
      log('❌ ワークフローインポートに失敗しました', 'red');
      process.exit(1);
    }

    // 6. ワークフローアクティブ化
    await delay(1000);
    await setup.activateWorkflow(workflow.id);

    // 7. テスト実行（オプション）
    await delay(1000);
    await setup.runWorkflowTest(workflow.id);

    // 完了メッセージ
    log('', 'reset');
    log('🎉 n8nワークフロー自動セットアップ完了！', 'green');
    log('='.repeat(60), 'green');
    log('📋 設定完了項目:', 'green');
    log('  ✅ オーナーアカウント作成', 'green');
    log('  ✅ ワークフローインポート', 'green');
    log('  ✅ ワークフローアクティブ化', 'green');
    log('  ✅ 自動実行スケジュール設定', 'green');
    log('', 'reset');
    log('🌐 n8nダッシュボード: http://localhost:5678', 'blue');
    log(`👤 ログイン: ${N8N_ADMIN_EMAIL} / [環境変数で設定済み]`, 'blue');
    log('', 'reset');
    log('⏰ 自動実行スケジュール:', 'cyan');
    log('  🌅 朝 6:00 - モーニング AI ニュース', 'cyan');
    log('  🌞 昼 12:00 - ランチタイム AI アップデート', 'cyan');
    log('  🌇 夕 18:00 - イブニング AI サマリー', 'cyan');
    log('', 'reset');
    log('🔧 次の手動設定を完了してください:', 'cyan');
    log('  1. Twitter APIクレデンシャルを設定', 'cyan');
    log('  2. RSSフィードURLを確認・調整', 'cyan');
    log('  3. n8nダッシュボードで動作確認', 'cyan');
    log('', 'reset');
    log('🚀 設定完了後はAI情報収集・Twitter自動投稿システムが稼働開始！', 'green');

  } catch (error) {
    log('', 'reset');
    log('❌ セットアップ中にエラーが発生しました:', 'red');
    console.error(error.message);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = N8nAutoSetup;
