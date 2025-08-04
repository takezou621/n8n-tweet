# セキュリティセットアップガイド

## 🔐 重要なセキュリティ設定

### 1. 環境変数の設定

セキュリティ上の理由により、認証情報は**環境変数**で管理します。

#### 初期設定
```bash
# テンプレートファイルをコピー
cp config/template.env .env

# 環境変数を設定
export N8N_ADMIN_PASSWORD="your-very-secure-password-123!"
export TWITTER_API_KEY="your-twitter-api-key"
export TWITTER_API_SECRET="your-twitter-api-secret"
export ENCRYPTION_KEY="your-32-character-encryption-key"
```

#### 必須環境変数
| 変数名 | 説明 | 例 |
|-------|------|---|
| `N8N_ADMIN_PASSWORD` | n8n管理者パスワード | `SecurePass123!` |
| `TWITTER_API_KEY` | Twitter APIキー | `your-api-key` |
| `TWITTER_API_SECRET` | Twitter APIシークレット | `your-api-secret` |
| `ENCRYPTION_KEY` | データ暗号化キー | `your-32char-encryption-key-here` |

### 2. パスワード要件

#### n8n管理者パスワード
- ✅ 最低12文字以上
- ✅ 大文字・小文字・数字・記号を含む
- ✅ 辞書にない単語
- ❌ ハードコード禁止

#### 例（強力なパスワード）
```bash
# 良い例
export N8N_ADMIN_PASSWORD="MySecure#N8nPass2024!"

# 悪い例（使用禁止）
export N8N_ADMIN_PASSWORD="admin123"  # 弱すぎる
export N8N_ADMIN_PASSWORD="password"  # 辞書語
```

### 3. セキュリティチェックリスト

#### ✅ 実装済み
- [x] ハードコードされたパスワードの削除
- [x] 環境変数による認証情報管理
- [x] 暗号化ユーティリティの実装
- [x] 入力値検証の強化
- [x] セキュリティミドルウェアの実装
- [x] API制限機能

#### 🔄 推奨対応
- [ ] HTTPS通信の強制（本番環境）
- [ ] ログ監視・アラート設定
- [ ] 定期的なパスワード変更
- [ ] セキュリティスキャンの実行

### 4. 本番環境での追加設定

#### HTTPS設定
```bash
# 本番環境用の設定
export N8N_PROTOCOL=https
export N8N_BASE_URL=https://your-domain.com
```

#### ファイアウォール設定
```bash
# 必要なポートのみ開放
ufw allow 443  # HTTPS
ufw allow 22   # SSH
ufw deny 5678  # n8n管理画面は内部のみ
```

### 5. セキュリティ監視

#### ログの監視項目
- 認証失敗の試行
- 異常なAPIアクセス
- 権限エスカレーションの試み
- データ暗号化/復号化エラー

#### アラート設定
```bash
# Slackアラート設定例
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/your/webhook/url"
export WEBHOOK_ALERTS_URL="https://your-monitoring.com/webhook"
```

## 🚨 緊急時の対応

### パスワード漏洩時
1. 即座にパスワードを変更
2. セッションを全て無効化
3. ログを確認して不審なアクセスをチェック
4. 必要に応じてAPIキーを再生成

### システム侵害時
1. サービスを一時停止
2. セキュリティチームに連絡
3. ログの保全
4. インシデント対応プロセスを開始

## 📋 定期メンテナンス

### 月次タスク
- [ ] パスワードの強度確認
- [ ] 不要なアクセストークンの削除
- [ ] セキュリティログの確認
- [ ] 脆弱性スキャンの実行

### 年次タスク
- [ ] 全認証情報の更新
- [ ] セキュリティポリシーの見直し
- [ ] ペネトレーションテストの実施
- [ ] セキュリティ教育の実施

---

**重要**: このドキュメントで設定したセキュリティ対策を必ず実装してから本番環境で使用してください。