const puppeteer = require('puppeteer');

async function createN8nAccount() {
  console.log('🚀 n8n管理者アカウント自動作成開始...');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // n8nセットアップページにアクセス
    console.log('📱 セットアップページにアクセス中...');
    await page.goto('http://localhost:5678/setup', { waitUntil: 'networkidle2' });
    
    // ページの読み込み完了を待機
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // フォームフィールドを入力
    console.log('📝 アカウント情報を入力中...');
    
    // ページの内容をデバッグ
    const pageContent = await page.content();
    console.log('🔍 ページタイトル:', await page.title());
    console.log('🔍 現在のURL:', page.url());
    
    // メールアドレス
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', 'admin@n8n-tweet.local');
    
    // パスワード
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    await page.type('input[type="password"]', 'Admin123!');
    
    // 名前フィールド（First Name）
    const nameInputs = await page.$$('input[type="text"]');
    if (nameInputs.length >= 2) {
      await nameInputs[0].type('AI');
      await nameInputs[1].type('TweetBot');
    }
    
    // セットアップボタンをクリック
    console.log('🎯 アカウント作成実行中...');
    
    // 複数のボタンセレクターを試す
    const buttonSelectors = [
      'button[type="submit"]',
      'button:contains("Setup")',
      'button:contains("Create")',
      'button:contains("登録")',
      'button:contains("作成")',
      '.btn-primary',
      '.button-primary',
      'button'
    ];
    
    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        await page.click(selector);
        buttonClicked = true;
        console.log(`✅ ボタンをクリックしました: ${selector}`);
        break;
      } catch (error) {
        console.log(`❌ ボタンが見つかりません: ${selector}`);
        continue;
      }
    }
    
    if (!buttonClicked) {
      throw new Error('セットアップボタンが見つかりませんでした');
    }
    
    // 完了を待機
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 成功確認
    const currentUrl = page.url();
    if (currentUrl.includes('localhost:5678') && !currentUrl.includes('setup')) {
      console.log('✅ アカウント作成成功！');
      console.log('📱 n8nダッシュボードにアクセス可能です: http://localhost:5678');
      return true;
    } else {
      console.log('❌ アカウント作成に失敗しました');
      return false;
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

// スクリプト実行
createN8nAccount().then(success => {
  if (success) {
    console.log('🎉 n8n管理者アカウントの自動作成が完了しました！');
    process.exit(0);
  } else {
    console.log('❌ アカウント作成に失敗しました');
    process.exit(1);
  }
}).catch(error => {
  console.error('❌ 実行エラー:', error);
  process.exit(1);
});