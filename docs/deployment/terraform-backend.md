# Terraform Remote State Backend Configuration

このドキュメントでは、n8n-tweetプロジェクトのTerraform状態管理を安全に設定する方法を説明します。

## 概要

Terraformの状態ファイルには機密情報が含まれるため、セキュアなリモートバックエンドの設定が重要です。このプロジェクトではAWS S3とDynamoDBを使用した設定を推奨します。

## セキュリティ要件

### 必須要件
- **暗号化**: すべての状態データはKMSキーで暗号化
- **アクセス制御**: IAMポリシーによる最小権限アクセス
- **状態ロック**: DynamoDBによる同時実行制御
- **バージョニング**: S3バージョニングによる状態履歴保持
- **監査ログ**: CloudTrailによるアクセス記録

### 推奨事項
- MFA（多要素認証）の有効化
- 定期的なアクセスキーローテーション
- 環境ごとの分離された状態管理
- バックアップとリカバリ戦略

## 自動セットアップ

### 1. 自動セットアップスクリプトの実行

```bash
# スクリプトの実行権限設定
chmod +x scripts/terraform/setup-backend.sh

# 環境変数設定（オプション）
export BUCKET_NAME="your-terraform-state-bucket"
export REGION="us-east-1"
export TABLE_NAME="terraform-state-lock"
export KMS_ALIAS="alias/terraform-state-key"
export PROFILE="default"

# セットアップ実行
./scripts/terraform/setup-backend.sh
```

### 2. 作成されるリソース

- **S3バケット**: Terraform状態ファイル保存
- **DynamoDBテーブル**: 状態ロック管理
- **KMSキー**: 暗号化キー
- **IAMポリシー**: アクセス制御ポリシー

## 手動セットアップ

### 1. S3バケット作成

```bash
# バケット作成
aws s3 mb s3://your-terraform-state-bucket --region us-east-1

# バージョニング有効化
aws s3api put-bucket-versioning \
  --bucket your-terraform-state-bucket \
  --versioning-configuration Status=Enabled

# パブリックアクセスブロック
aws s3api put-public-access-block \
  --bucket your-terraform-state-bucket \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 2. KMSキー作成

```bash
# KMSキー作成
aws kms create-key \
  --description "Terraform State Encryption Key" \
  --usage ENCRYPT_DECRYPT

# エイリアス作成
aws kms create-alias \
  --alias-name alias/terraform-state-key \
  --target-key-id <key-id-from-previous-command>
```

### 3. S3暗号化設定

```bash
aws s3api put-bucket-encryption \
  --bucket your-terraform-state-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "alias/terraform-state-key"
      },
      "BucketKeyEnabled": true
    }]
  }'
```

### 4. DynamoDBテーブル作成

```bash
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## 設定ファイル

### terraform.tfvars

```hcl
# Backend Configuration
state_bucket_name      = "your-terraform-state-bucket"
state_bucket_region    = "us-east-1"
state_lock_table_name  = "terraform-state-lock"
state_kms_key_id       = "alias/terraform-state-key"
aws_profile           = "default"

# その他のProxmox設定...
```

## Terraform初期化

```bash
cd terraform/proxmox

# 1. SSH鍵検証（推奨）
../../scripts/terraform/validate-ssh-keys.sh

# 2. 認証情報設定
source .env.terraform

# 3. バックエンド初期化（backend.hclファイルを使用）
terraform init -backend-config=backend.hcl

# 4. 設定確認
terraform plan

# 5. リソース作成
terraform apply
```

### バックエンド初期化の注意点

- **初回実行時**: `backend.hcl`ファイルを編集して正しい値を設定
- **既存環境**: `-reconfigure`オプションでバックエンド再設定可能
- **ローカル開発**: `-backend=false`オプションでローカル状態管理も可能

## IAMポリシー例

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketVersioning"
      ],
      "Resource": "arn:aws:s3:::your-terraform-state-bucket"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-terraform-state-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/terraform-state-lock"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:via": [
            "s3.us-east-1.amazonaws.com"
          ]
        }
      }
    }
  ]
}
```

## トラブルシューティング

### よくある問題

1. **権限エラー**
   - IAMポリシーの確認
   - AWS認証情報の確認

2. **バケットアクセスエラー**
   - バケット名の重複確認
   - リージョン設定の確認

3. **状態ロックエラー**
   - DynamoDBテーブルの存在確認
   - ネットワーク接続の確認

### ログ確認

```bash
# Terraformデバッグログ
export TF_LOG=DEBUG
terraform plan

# AWS CLIデバッグ
aws s3 ls s3://your-terraform-state-bucket --debug
```

## セキュリティベストプラクティス

1. **アクセス制御**
   - 最小権限の原則を適用
   - MFAを必須化
   - 定期的な権限見直し

2. **暗号化**
   - 転送時暗号化（HTTPS）
   - 保存時暗号化（KMS）
   - キーローテーション

3. **監査**
   - CloudTrail有効化
   - アクセスログ監視
   - 定期的なセキュリティ監査

4. **バックアップ**
   - 状態ファイルバックアップ
   - クロスリージョンレプリケーション
   - 災害復旧計画

## 参考資料

- [Terraform S3 Backend](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [AWS S3 Security Best Practices](https://docs.aws.amazon.com/s3/latest/userguide/security-best-practices.html)
- [Terraform State Security](https://www.terraform.io/docs/language/state/sensitive-data.html)