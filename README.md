# n8n-tweet: AI情報収集・配信システム

RSSフィードからAI関連情報を自動収集し、Twitterに投稿するn8nワークフローシステム

## 🎯 プロジェクト概要

このプロジェクトは、AI関連の最新情報を自動的に収集・フィルタリング・生成・配信するシステムです。TDD（テスト駆動開発）方式で実装し、本番環境での安定運用を目指します。

### 主な機能
- 📡 RSS Feed自動収集（ArXiv AI、OpenAI Blog、Google AI Blogなど）
- 🔍 AI関連キーワードによる自動フィルタリング
- 📝 Twitter投稿用ツイート自動生成
- 🐦 X(Twitter) API v2での自動投稿
- 📊 包括的な監視・ログ・アラート機能
- 🚀 Docker & GitHub Actionsによる自動デプロイ

## 🛠️ 技術スタック

- **Workflow**: n8n automation platform
- **Language**: JavaScript ES6+
- **Testing**: Jest (TDD方式)
- **API**: X(Twitter) API v2, RSS/XML
- **Infrastructure**: Docker, GitHub Actions
- **Quality**: ESLint, テストカバレッジ85%以上

## 📋 実装計画

プロジェクトは8つのフェーズに分けて実装します：

| Phase | Issue | タスク | 所要時間 | 依存関係 |
|-------|-------|--------|----------|----------|
| 1 | [#3](../../issues/3) | プロジェクト初期設定 | 3時間 | なし |
| 2 | [#4](../../issues/4) | RSS Feed Reader実装 | 3時間 | #3完了後 |
| 3 | [#5](../../issues/5) | コンテンツフィルタリング実装 | 3時間 | #4完了後 |
| 4 | [#6](../../issues/6) | ツイート生成実装 | 3時間 | #5完了後 |
| 5 | [#7](../../issues/7) | Twitter投稿実装 | 3時間 | #6完了後 |
| 6 | [#8](../../issues/8) | 監視・ログ実装 | 3時間 | #7完了後 |
| 7 | [#9](../../issues/9) | 統合テスト実装 | 3時間 | #8完了後 |
| 8 | [#10](../../issues/10) | デプロイ自動化実装 | 3時間 | #9完了後 |

**総作業時間**: 24時間

## 🏗️ プロジェクト構造

```
n8n-tweet/
├── README.md
├── package.json
├── .gitignore
├── .cursorules
├── claude-desktop-config.json
├── docs/
│   ├── deployment-guide.md
│   └── api-documentation.md
├── workflows/
│   └── rss-feed-reader.json
├── src/
│   ├── utils/
│   │   ├── feed-parser.js
│   │   ├── text-optimizer.js
│   │   ├── logger.js
│   │   ├── error-handler.js
│   │   └── rate-limiter.js
│   ├── filters/
│   │   ├── content-filter.js
│   │   └── duplicate-checker.js
│   ├── generators/
│   │   └── tweet-generator.js
│   ├── integrations/
│   │   └── twitter-client.js
│   ├── storage/
│   │   └── tweet-history.js
│   └── monitoring/
│       ├── health-checker.js
│       └── metrics-collector.js
├── config/
│   ├── rss-feeds.json
│   ├── keywords.json
│   ├── tweet-templates.json
│   ├── twitter-config.json
│   ├── logging-config.json
│   └── production.json
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── performance/
│   └── security/
├── scripts/
│   ├── deploy-n8n.sh
│   ├── backup-workflows.sh
│   ├── restore-workflows.sh
│   └── run-tests.sh
├── infrastructure/
│   └── docker-compose.yml
└── .github/
    └── workflows/
        └── ci.yml
```

## 🚀 クイックスタート

### 前提条件
- Node.js 18+
- n8n (self-hosted or cloud)
- X(Twitter) API credentials
- Docker (本番環境用)

### セットアップ

1. **リポジトリクローン**
```bash
git clone https://github.com/takezou621/n8n-tweet.git
cd n8n-tweet
```

2. **依存関係インストール**
```bash
npm install
```

3. **環境設定**
```bash
cp config/template.env .env
# .envファイルを編集してAPI認証情報を設定
```

4. **テスト実行**
```bash
npm test
```

5. **n8nワークフロー起動**
```bash
npm run start
```

## 📊 開発ワークフロー

### TDD実装プロセス
1. **Red**: テストを書いて失敗を確認
2. **Green**: 最小限のコードでテストを通す
3. **Refactor**: コードを改善し、テストは維持

### 品質基準
- **テストカバレッジ**: 85%以上
- **パフォーマンス**: 1000件/10秒以内（フィルタリング）
- **エラーハンドリング**: 全APIコール・ファイル操作
- **セキュリティ**: API認証情報の適切な管理

### 開発環境
- **Cursor**: AI支援エディタ（`.cursorules`設定済み）
- **Claude Code**: CLI開発支援ツール
- **Jest**: テストフレームワーク
- **ESLint**: コード品質管理

## 🔧 主要機能詳細

### RSS Feed Reader
- 複数のAI関連RSSフィードを定期監視
- エラーハンドリングとリトライ機能
- パフォーマンス最適化

### コンテンツフィルタリング
- AI関連キーワードによる自動選別
- 重複記事の検出・除去
- 品質スコアリング

### ツイート生成
- 280文字制限対応
- カテゴリ別ハッシュタグ自動追加
- エンゲージメント最適化

### Twitter投稿
- レート制限管理
- 投稿履歴追跡
- 失敗時の自動リトライ

### 監視・ログ
- 構造化ログ出力
- リアルタイム監視
- アラート・通知機能

## 📈 運用・メンテナンス

### デプロイメント
```bash
./scripts/deploy-n8n.sh
```

### バックアップ
```bash
./scripts/backup-workflows.sh
```

### 復旧
```bash
./scripts/restore-workflows.sh
```

### ログ確認
```bash
tail -f logs/app.log
```

## 🤝 コントリビューション

1. Issues確認: [プロジェクトIssues](../../issues)
2. フォーク & ブランチ作成
3. TDD方式で実装
4. テスト確認（`npm test`）
5. プルリクエスト作成

## 📄 ライセンス

MIT License

## 🔗 関連リンク

- [n8n Documentation](https://docs.n8n.io/)
- [X(Twitter) API Documentation](https://developer.twitter.com/en/docs)
- [Jest Testing Framework](https://jestjs.io/)

---

**Note**: このプロジェクトはTDD方式で開発されており、各機能は対応するテストとともに実装されています。Issue #3から順番に実装を開始してください。
