# GitHub Issues for n8n-tweet Project

## Epic Issues (優先度順)

### Epic 1: Project Infrastructure Setup 🏗️
**優先度**: P0 (最高)  
**説明**: Docker Compose、依存関係、基本設定の構築

---

#### Issue 1.1: Docker Compose環境構築
**見積もり**: 4時間  
**ラベル**: `epic:infrastructure` `priority:P0` `effort:4h`

**Description**:
n8n、PostgreSQL、Redis サービスを含むDocker Compose環境を構築し、開発環境の基盤を整備する。

**Acceptance Criteria**:
- [ ] `docker-compose.yml`でn8n、PostgreSQL、Redisサービスが定義されている
- [ ] 環境変数設定ファイル（`.env.example`）が作成されている
- [ ] サービス間のネットワーク通信が正常に動作する
- [ ] `docker-compose up`でワンクリック起動が可能

**対象ファイル**:
- `docker-compose.yml` (新規作成)
- `.env.example` (新規作成)
- `README.md` (更新)

**Definition of Done**:
- Docker Composeで全サービスが起動すること
- n8nダッシュボードにアクセス可能なこと
- PostgreSQLとRedisの接続確認ができること

---

#### Issue 1.2: プロジェクト基本構造作成
**見積もり**: 3時間  
**ラベル**: `epic:infrastructure` `priority:P0` `effort:3h`

**Description**:
モジュラー設計に基づくプロジェクトディレクトリ構造を作成し、基本的なNode.js設定を行う。

**Acceptance Criteria**:
- [ ] `src/`配下のディレクトリ構造が`.kiro/steering/structure.md`に従って作成されている
- [ ] `package.json`が適切な依存関係で初期化されている
- [ ] ESLintとPrettierの設定が完了している
- [ ] Jestのテスト環境が設定されている

**対象ファイル**:
- `package.json` (新規作成)
- `src/` ディレクトリ構造 (新規作成)
- `.eslintrc.js` (新規作成)
- `jest.config.js` (新規作成)

**Definition of Done**:
- `npm install`が正常に完了すること
- `npm run lint`が実行できること
- `npm test`が実行できること

---

### Epic 2: RSS Feed Processing Pipeline 📡
**優先度**: P0 (最高)  
**説明**: RSS フィード収集・解析システムの構築

---

#### Issue 2.1: RSS Feed Parser Service実装
**見積もり**: 4時間  
**ラベル**: `epic:rss-processing` `priority:P0` `effort:4h`

**Description**:
RSS フィードを収集・解析するサービスを実装し、AI関連コンテンツの自動収集基盤を構築する。

**Acceptance Criteria**:
- [ ] `FeedParser`クラスが`rss-parser`を使用して実装されている
- [ ] 複数のRSSフィードを並列処理できる
- [ ] ネットワークエラーと無効フィードのエラーハンドリングが実装されている
- [ ] 85%以上のテストカバレッジを達成している

**対象ファイル**:
- `src/utils/feed-parser.js` (新規作成)
- `tests/unit/utils/feed-parser.test.js` (新規作成)
- `config/rss-feeds.json` (新規作成)

**Definition of Done**:
- RSS フィードから記事データを正常に取得できること
- エラー発生時も他のフィードの処理が継続されること
- 単体テストが全て合格すること

---

#### Issue 2.2: Cache Service実装
**見積もり**: 3時間  
**ラベル**: `epic:rss-processing` `priority:P1` `effort:3h`

**Description**:
Redis を使用したキャッシュサービスを実装し、RSS処理のパフォーマンスを向上させる。

**Acceptance Criteria**:
- [ ] `CacheService`クラスがRedis操作をラップしている
- [ ] TTL設定による自動期限切れが実装されている
- [ ] Redis接続エラーのハンドリングが実装されている
- [ ] キャッシュ操作の単体テストが完備されている

**対象ファイル**:
- `src/services/cache-service.js` (新規作成)
- `tests/unit/services/cache-service.test.js` (新規作成)

**Definition of Done**:
- Redis への接続・操作が正常に動作すること
- TTL による自動削除が機能すること
- Redis 接続失敗時もアプリケーションが継続動作すること

---

### Epic 3: Content Filtering and Quality Assessment 🎯
**優先度**: P0 (最高)  
**説明**: AI関連度スコアリングとコンテンツ品質評価システム

---

#### Issue 3.1: Content Filter Service実装
**見積もり**: 4時間  
**ラベル**: `epic:content-filtering` `priority:P0` `effort:4h`

**Description**:
AI関連キーワードマッチングによるコンテンツフィルタリングと品質評価システムを実装する。

**Acceptance Criteria**:
- [ ] `ContentFilter`クラスがキーワードベースのAI関連度スコアリングを実装
- [ ] 品質評価ロジックが実装されている
- [ ] 設定可能な閾値による自動フィルタリングが機能する
- [ ] 85%以上のテストカバレッジを達成している

**対象ファイル**:
- `src/filters/content-filter.js` (新規作成)
- `tests/unit/filters/content-filter.test.js` (新規作成)
- `config/keywords.json` (新規作成)

**Definition of Done**:
- AI関連記事が適切にスコアリングされること
- 低品質コンテンツが除外されること
- スコア閾値が設定可能なこと

---

#### Issue 3.2: Duplicate Detection Service実装
**見積もり**: 3時間  
**ラベル**: `epic:content-filtering` `priority:P1` `effort:3h`

**Description**:
コンテンツハッシュ化と比較アルゴリズムによる重複検出システムを実装する。

**Acceptance Criteria**:
- [ ] `DuplicateChecker`クラスがRedisベースの重複追跡を実装
- [ ] コンテンツハッシュ化アルゴリズムが実装されている
- [ ] 重複検出の精度が95%以上である
- [ ] 重複検出の単体テストが完備されている

**対象ファイル**:
- `src/filters/duplicate-checker.js` (新規作成)
- `tests/unit/filters/duplicate-checker.test.js` (新規作成)

**Definition of Done**:
- 重複コンテンツが正確に検出されること
- 類似度判定が適切に機能すること
- Redis を使用した履歴管理が動作すること

---

### Epic 4: Tweet Generation and Optimization ✍️
**優先度**: P0 (最高)  
**説明**: 280文字最適化とハッシュタグ付きツイート生成

---

#### Issue 4.1: Tweet Generator Service実装
**見積もり**: 4時間  
**ラベル**: `epic:tweet-generation` `priority:P0` `effort:4h`

**Description**:
280文字制限に対応したツイート生成とハッシュタグ・URL最適化システムを実装する。

**Acceptance Criteria**:
- [ ] `TweetGenerator`クラスが280文字最適化を実装
- [ ] ハッシュタグとURL自動付与機能が実装されている
- [ ] テンプレートベースのツイート生成が可能
- [ ] 文字数超過時の自動切り詰め機能が実装されている

**対象ファイル**:
- `src/generators/tweet-generator.js` (新規作成)
- `tests/unit/generators/tweet-generator.test.js` (新規作成)
- `config/tweet-templates.json` (新規作成)

**Definition of Done**:
- 280文字以内でツイートが生成されること
- 適切なハッシュタグが付与されること
- URL短縮が機能すること

---

### Epic 5: Twitter API Integration 🐦
**優先度**: P0 (最高)  
**説明**: Twitter API v2統合とレート制限対応

---

#### Issue 5.1: Twitter API Client実装
**見積もり**: 4時間  
**ラベル**: `epic:twitter-integration` `priority:P0` `effort:4h`

**Description**:
Twitter API v2を使用したクライアントライブラリとレート制限管理システムを実装する。

**Acceptance Criteria**:
- [ ] `TwitterClient`クラスが`twitter-api-v2`ライブラリを使用して実装
- [ ] レート制限の自動検出と待機機能が実装されている
- [ ] 認証エラーのハンドリングが実装されている
- [ ] API呼び出しの単体テストが完備されている

**対象ファイル**:
- `src/integrations/twitter-client.js` (新規作成)
- `tests/unit/integrations/twitter-client.test.js` (新規作成)

**Definition of Done**:
- Twitter API v2 への認証が正常に動作すること
- レート制限エラーが適切に処理されること
- API呼び出しが成功すること

---

#### Issue 5.2: Tweet Posting with Error Handling実装
**見積もり**: 3時間  
**ラベル**: `epic:twitter-integration` `priority:P0` `effort:3h`

**Description**:
指数バックオフによるリトライロジックと重複ツイート防止機能を実装する。

**Acceptance Criteria**:
- [ ] 指数バックオフによるリトライロジックが実装されている
- [ ] 重複ツイート防止機能が実装されている
- [ ] ツイート投稿の統合テストが完備されている
- [ ] エラー時の適切なログ出力が実装されている

**対象ファイル**:
- `src/integrations/twitter-posting.js` (新規作成)
- `tests/integration/twitter-posting.test.js` (新規作成)

**Definition of Done**:
- 一時的なAPI エラー時にリトライが実行されること
- 重複ツイートが投稿されないこと
- エラー状況が適切にログ記録されること

---

### Epic 6: Monitoring and Analytics System 📊
**優先度**: P1 (高)  
**説明**: ヘルスチェック、メトリクス収集、アラートシステム

---

#### Issue 6.1: Health Check Service実装
**見積もり**: 3時間  
**ラベル**: `epic:monitoring` `priority:P1` `effort:3h`

**Description**:
全システムコンポーネントのヘルスチェック機能とサービス可用性監視を実装する。

**Acceptance Criteria**:
- [ ] 各サービス（Redis、PostgreSQL、Twitter API）のヘルスチェックが実装
- [ ] ヘルスチェックエンドポイントが提供されている
- [ ] サービス障害の自動検出機能が実装されている
- [ ] ヘルスチェックの単体テストが完備されている

**対象ファイル**:
- `src/monitoring/health-check.js` (新規作成)
- `tests/unit/monitoring/health-check.test.js` (新規作成)

**Definition of Done**:
- 全サービスのヘルス状態が確認できること
- 障害発生時にアラートが出力されること
- `/health` エンドポイントが応答すること

---

#### Issue 6.2: Metrics Collection Service実装
**見積もり**: 4時間  
**ラベル**: `epic:monitoring` `priority:P1` `effort:4h`

**Description**:
ツイートパフォーマンス、システム統計の収集とWinston構造化ログシステムを実装する。

**Acceptance Criteria**:
- [ ] ツイートパフォーマンス指標の収集が実装されている
- [ ] システム統計（処理時間、エラー率等）の収集が実装されている
- [ ] Winston による構造化JSON ログが実装されている
- [ ] メトリクス出力の単体テストが完備されている

**対象ファイル**:
- `src/monitoring/metrics-collector.js` (新規作成)
- `src/utils/logger.js` (新規作成)
- `tests/unit/monitoring/metrics-collector.test.js` (新規作成)

**Definition of Done**:
- メトリクスが正しく収集・出力されること
- 構造化ログが出力されること
- ログローテーションが機能すること

---

### Epic 7: n8n Workflow Integration 🔄
**優先度**: P1 (高)  
**説明**: n8nワークフロー定義とWebhook統合

---

#### Issue 7.1: n8n Workflow Definitions作成
**見積もり**: 4時間  
**ラベル**: `epic:n8n-integration` `priority:P1` `effort:4h`

**Description**:
完全自動化パイプライン用のn8nワークフロー定義とスケジューリングを実装する。

**Acceptance Criteria**:
- [ ] RSS収集からツイート投稿までの完全ワークフローが定義されている
- [ ] スケジューリング設定（cron）が実装されている
- [ ] エラーハンドリングとリトライ機能が組み込まれている
- [ ] ワークフロー実行テストが完備されている

**対象ファイル**:
- `workflows/rss-to-tweet-pipeline.json` (新規作成)
- `workflows/setup-workflows.js` (新規作成)

**Definition of Done**:
- n8n でワークフローがインポート・実行可能なこと
- スケジュール実行が正常に動作すること
- エラー時の処理が適切に機能すること

---

#### Issue 7.2: Webhook Server for n8n Integration実装
**見積もり**: 3時間  
**ラベル**: `epic:n8n-integration` `priority:P1` `effort:3h`

**Description**:
n8nワークフローとの通信用Express.js Webhookサーバーを実装する。

**Acceptance Criteria**:
- [ ] Express.js ベースのWebhook サーバーが実装されている
- [ ] リクエスト検証とレスポンスハンドリングが実装されている
- [ ] n8n ワークフローとの双方向通信が可能
- [ ] Webhook の統合テストが完備されている

**対象ファイル**:
- `src/webhook/server.js` (新規作成)
- `tests/integration/webhook-server.test.js` (新規作成)

**Definition of Done**:
- Webhook エンドポイントが正常に応答すること
- n8n からの呼び出しが処理されること
- 認証とリクエスト検証が機能すること

---

### Epic 8: Deployment and Operations 🚀
**優先度**: P1 (高)  
**説明**: デプロイメント自動化とバックアップシステム

---

#### Issue 8.1: Deployment Automation Scripts実装
**見積もり**: 4時間  
**ラベル**: `epic:deployment` `priority:P1` `effort:4h`

**Description**:
quick.shスクリプトによる自動デプロイメントとサービス管理システムを実装する。

**Acceptance Criteria**:
- [ ] `quick.sh`スクリプトがstart、stop、status、resetコマンドを提供
- [ ] 自動サービスヘルスチェックが実装されている
- [ ] リアルタイムログ表示機能が実装されている
- [ ] デプロイメントスクリプトのテストが完備されている

**対象ファイル**:
- `quick.sh` (新規作成)
- `scripts/health-check.sh` (新規作成)
- `tests/deployment/quick-script.test.js` (新規作成)

**Definition of Done**:
- ワンコマンドでサービスの起動・停止ができること
- サービス状態が正確に表示されること
- ログ表示が正常に機能すること

---

#### Issue 8.2: Backup and Restore System実装
**見積もり**: 3時間  
**ラベル**: `epic:deployment` `priority:P2` `effort:3h`

**Description**:
自動ワークフローバックアップ・復元とスケジューリングシステムを実装する。

**Acceptance Criteria**:
- [ ] ワークフローの自動バックアップが実装されている
- [ ] バックアップスケジューリング（日次、週次）が設定可能
- [ ] バックアップファイルの自動ローテーションが実装されている
- [ ] バックアップ・復元の単体テストが完備されている

**対象ファイル**:
- `src/services/backup-service.js` (新規作成)
- `scripts/backup.sh` (新規作成)
- `tests/unit/services/backup-service.test.js` (新規作成)

**Definition of Done**:
- 自動バックアップが正常に実行されること
- 復元処理が正常に完了すること
- ローテーション機能が動作すること

---

## 高優先度個別Issues

### Issue 9.1: RSS Feed Configuration Management
**見積もり**: 2時間  
**ラベル**: `priority:P0` `config` `effort:2h`

**Description**:
AI関連RSS フィードの設定管理システムを実装する。

**Acceptance Criteria**:
- [ ] `config/rss-feeds.json` でフィード設定が管理されている
- [ ] フィード追加・削除の動的設定変更が可能
- [ ] 無効フィードの自動無効化機能が実装されている

**対象ファイル**:
- `config/rss-feeds.json` (新規作成)
- `src/config/feed-manager.js` (新規作成)

---

### Issue 9.2: AI Keyword Configuration
**見積もり**: 2時間  
**ラベル**: `priority:P0` `config` `effort:2h`

**Description**:
AI関連キーワード定義とスコアリングルールの設定管理を実装する。

**Acceptance Criteria**:
- [ ] `config/keywords.json` でキーワードとスコアが管理されている
- [ ] カテゴリ別キーワード分類が実装されている
- [ ] 動的スコア閾値調整が可能

**対象ファイル**:
- `config/keywords.json` (新規作成)
- `src/config/keyword-manager.js` (新規作成)

---

### Issue 9.3: Security Hardening
**見積もり**: 4時間  
**ラベル**: `priority:P1` `security` `effort:4h`

**Description**:
API キー管理、入力サニタイゼーション、セキュリティテストを実装する。

**Acceptance Criteria**:
- [ ] 環境変数による安全なAPI キー管理が実装されている
- [ ] 入力データのサニタイゼーションが実装されている
- [ ] セキュリティテストスイートが完備されている

**対象ファイル**:
- `src/security/input-sanitizer.js` (新規作成)
- `tests/security/api-security.test.js` (新規作成)

---

### Issue 9.4: Error Recovery and Resilience
**見積もり**: 4時間  
**ラベル**: `priority:P1` `resilience` `effort:4h`

**Description**:
サーキットブレーカー、自動復旧、エラー通知システムを実装する。

**Acceptance Criteria**:
- [ ] サーキットブレーカーパターンが実装されている
- [ ] 自動復旧機能（ヘルスチェック + 再起動）が実装されている
- [ ] エラー通知とアラートシステムが実装されている

**対象ファイル**:
- `src/resilience/circuit-breaker.js` (新規作成)
- `src/resilience/auto-recovery.js` (新規作成)

---

## 作業順序推奨

### Phase 1: 基盤構築 (1-2週目)
1. Issue 1.1: Docker Compose環境構築
2. Issue 1.2: プロジェクト基本構造作成
3. Issue 9.1: RSS Feed Configuration Management
4. Issue 9.2: AI Keyword Configuration

### Phase 2: コア機能実装 (3-4週目)
1. Issue 2.1: RSS Feed Parser Service実装
2. Issue 2.2: Cache Service実装
3. Issue 3.1: Content Filter Service実装
4. Issue 3.2: Duplicate Detection Service実装

### Phase 3: Twitter統合 (5週目)
1. Issue 4.1: Tweet Generator Service実装
2. Issue 5.1: Twitter API Client実装
3. Issue 5.2: Tweet Posting with Error Handling実装

### Phase 4: 監視・統合 (6週目)
1. Issue 6.1: Health Check Service実装
2. Issue 6.2: Metrics Collection Service実装
3. Issue 7.1: n8n Workflow Definitions作成
4. Issue 7.2: Webhook Server for n8n Integration実装

### Phase 5: 運用・セキュリティ (7週目)
1. Issue 8.1: Deployment Automation Scripts実装
2. Issue 8.2: Backup and Restore System実装
3. Issue 9.3: Security Hardening
4. Issue 9.4: Error Recovery and Resilience

**推定総作業時間**: 約140時間 (7週間 × 20時間/週)