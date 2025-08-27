const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const fs = require('fs');

// .envファイルから環境変数を読み込む
require('dotenv').config({ path: 'config/template.env' });

console.log('Environment variables:');
console.log('API_KEY:', process.env.TWITTER_API_KEY ? '✓' : '✗');
console.log('API_SECRET:', process.env.TWITTER_API_SECRET ? '✓' : '✗');
console.log('ACCESS_TOKEN:', process.env.TWITTER_ACCESS_TOKEN ? '✓' : '✗');
console.log('ACCESS_TOKEN_SECRET:', process.env.TWITTER_ACCESS_TOKEN_SECRET ? '✓' : '✗');

// OAuth 1.0a設定
const oauth = OAuth({
  consumer: {
    key: process.env.TWITTER_API_KEY,
    secret: process.env.TWITTER_API_SECRET
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

const token = {
  key: process.env.TWITTER_ACCESS_TOKEN,
  secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
};

// テスト用リクエストデータ
const request_data = {
  url: 'https://api.twitter.com/2/tweets',
  method: 'POST',
  data: { text: 'Test tweet' }
};

// OAuthヘッダー生成
const authorization = oauth.authorize(request_data, token);
const authHeader = oauth.toHeader(authorization);

console.log('\nAuthorization Header:');
console.log(JSON.stringify(authHeader, null, 2));

// 実際のAPIリクエストテスト
async function testTwitterAPI() {
  try {
    const response = await fetch(request_data.url, {
      method: request_data.method,
      headers: {
        ...authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request_data.data)
    });

    console.log('\nResponse status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorData = await response.text();
      console.log('Error response:', errorData);
    } else {
      const result = await response.json();
      console.log('Success response:', result);
    }
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testTwitterAPI();
