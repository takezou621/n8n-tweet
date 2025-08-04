#!/bin/bash

# Terraform Backend Setup Script
# Creates necessary AWS resources for secure Terraform state management

set -e

# 色付きログ出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 設定変数
BUCKET_NAME=${BUCKET_NAME:-"n8n-tweet-terraform-state-$(date +%s)"}
REGION=${REGION:-"us-east-1"}
TABLE_NAME=${TABLE_NAME:-"terraform-state-lock"}
KMS_ALIAS=${KMS_ALIAS:-"alias/terraform-state-key"}
PROFILE=${PROFILE:-"default"}

# 関数: AWSクライアント確認
check_aws_cli() {
    log_info "AWS CLIの確認中..."
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLIがインストールされていません"
        exit 1
    fi
    
    # AWS認証情報確認
    if ! aws sts get-caller-identity --profile "$PROFILE" &> /dev/null; then
        log_error "AWS認証情報が設定されていません (プロファイル: $PROFILE)"
        exit 1
    fi
    
    log_success "AWS CLI確認完了"
}

# 関数: S3バケット作成
create_s3_bucket() {
    log_info "S3バケットを作成中: $BUCKET_NAME"
    
    # バケット存在確認
    if aws s3api head-bucket --bucket "$BUCKET_NAME" --profile "$PROFILE" 2>/dev/null; then
        log_warning "S3バケット '$BUCKET_NAME' は既に存在します"
        return 0
    fi
    
    # バケット作成
    if [ "$REGION" = "us-east-1" ]; then
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --profile "$PROFILE"
    else
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$REGION" \
            --create-bucket-configuration LocationConstraint="$REGION" \
            --profile "$PROFILE"
    fi
    
    # バージョニング有効化
    aws s3api put-bucket-versioning \
        --bucket "$BUCKET_NAME" \
        --versioning-configuration Status=Enabled \
        --profile "$PROFILE"
    
    # パブリックアクセスブロック
    aws s3api put-public-access-block \
        --bucket "$BUCKET_NAME" \
        --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
        --profile "$PROFILE"
    
    log_success "S3バケット作成完了: $BUCKET_NAME"
}

# 関数: KMSキー作成
create_kms_key() {
    log_info "KMSキーを作成中..."
    
    # エイリアス存在確認
    if aws kms describe-key --key-id "$KMS_ALIAS" --profile "$PROFILE" 2>/dev/null; then
        log_warning "KMSキー '$KMS_ALIAS' は既に存在します"
        return 0
    fi
    
    # KMSキー作成
    KEY_OUTPUT=$(aws kms create-key \
        --description "Terraform State Encryption Key for n8n-tweet" \
        --usage ENCRYPT_DECRYPT \
        --key-spec SYMMETRIC_DEFAULT \
        --profile "$PROFILE")
    
    KEY_ID=$(echo "$KEY_OUTPUT" | jq -r '.KeyMetadata.KeyId')
    
    # エイリアス作成
    aws kms create-alias \
        --alias-name "$KMS_ALIAS" \
        --target-key-id "$KEY_ID" \
        --profile "$PROFILE"
    
    log_success "KMSキー作成完了: $KMS_ALIAS (ID: $KEY_ID)"
    echo "$KEY_ID" > .kms-key-id
}

# 関数: S3暗号化設定
configure_s3_encryption() {
    log_info "S3バケット暗号化を設定中..."
    
    # 暗号化設定
    aws s3api put-bucket-encryption \
        --bucket "$BUCKET_NAME" \
        --server-side-encryption-configuration '{
            "Rules": [{
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "aws:kms",
                    "KMSMasterKeyID": "'"$KMS_ALIAS"'"
                },
                "BucketKeyEnabled": true
            }]
        }' \
        --profile "$PROFILE"
    
    log_success "S3暗号化設定完了"
}

# 関数: DynamoDBテーブル作成
create_dynamodb_table() {
    log_info "DynamoDBテーブルを作成中: $TABLE_NAME"
    
    # テーブル存在確認
    if aws dynamodb describe-table --table-name "$TABLE_NAME" --profile "$PROFILE" 2>/dev/null; then
        log_warning "DynamoDBテーブル '$TABLE_NAME' は既に存在します"
        return 0
    fi
    
    # テーブル作成
    aws dynamodb create-table \
        --table-name "$TABLE_NAME" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --profile "$PROFILE"
    
    # テーブル作成完了待機
    log_info "テーブル作成完了を待機中..."
    aws dynamodb wait table-exists \
        --table-name "$TABLE_NAME" \
        --profile "$PROFILE"
    
    log_success "DynamoDBテーブル作成完了: $TABLE_NAME"
}

# 関数: IAMポリシー作成
create_iam_policy() {
    log_info "IAMポリシーを作成中..."
    
    POLICY_NAME="TerraformStateAccess-$(date +%s)"
    
    # ポリシードキュメント作成
    cat > terraform-state-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "s3:GetBucketVersioning"
            ],
            "Resource": "arn:aws:s3:::$BUCKET_NAME"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:DeleteItem"
            ],
            "Resource": "arn:aws:dynamodb:$REGION:*:table/$TABLE_NAME"
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
                        "s3.${REGION}.amazonaws.com"
                    ]
                }
            }
        }
    ]
}
EOF
    
    # ポリシー作成
    aws iam create-policy \
        --policy-name "$POLICY_NAME" \
        --policy-document file://terraform-state-policy.json \
        --profile "$PROFILE" || true
    
    # 一時ファイル削除
    rm -f terraform-state-policy.json
    
    log_success "IAMポリシー作成完了: $POLICY_NAME"
}

# 関数: 設定ファイル更新
update_config_files() {
    log_info "設定ファイルを更新中..."
    
    # terraform.tfvars更新
    cat > terraform.tfvars << EOF
# Backend Configuration
state_bucket_name      = "$BUCKET_NAME"
state_bucket_region    = "$REGION"
state_lock_table_name  = "$TABLE_NAME"
state_kms_key_id       = "$KMS_ALIAS"
aws_profile           = "$PROFILE"

# Include other variables from terraform.tfvars.example
EOF
    
    # .env.terraform更新
    cat > .env.terraform << EOF
# Terraform Backend Environment Variables
TF_VAR_state_bucket_name="$BUCKET_NAME"
TF_VAR_state_bucket_region="$REGION"
TF_VAR_state_lock_table_name="$TABLE_NAME"
TF_VAR_state_kms_key_id="$KMS_ALIAS"
TF_VAR_aws_profile="$PROFILE"
EOF
    
    log_success "設定ファイル更新完了"
}

# 関数: 完了メッセージ
show_completion_message() {
    log_success "=== Terraformバックエンド設定完了 ==="
    echo ""
    echo "作成されたリソース:"
    echo "  S3バケット:     $BUCKET_NAME"
    echo "  DynamoDBテーブル: $TABLE_NAME"
    echo "  KMSキー:        $KMS_ALIAS"
    echo "  リージョン:     $REGION"
    echo ""
    echo "次の手順:"
    echo "  1. terraform.tfvarsに他の変数を追加"
    echo "  2. terraform init でバックエンド初期化"
    echo "  3. terraform plan でプランニング実行"
    echo ""
    echo "セキュリティ注意事項:"
    echo "  - AWS認証情報を安全に管理してください"
    echo "  - IAMポリシーで最小権限の原則を適用してください"
    echo "  - MFAを有効化することを推奨します"
    echo ""
    log_warning "terraform.tfvarsファイルは機密情報を含むため、gitリポジトリにコミットしないでください"
}

# メイン実行関数
main() {
    echo "=== Terraform Backend Setup ==="
    echo "S3バケット: $BUCKET_NAME"
    echo "リージョン: $REGION"
    echo "DynamoDBテーブル: $TABLE_NAME"
    echo "KMSエイリアス: $KMS_ALIAS"
    echo "AWSプロファイル: $PROFILE"
    echo ""
    
    read -p "続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "セットアップをキャンセルしました"
        exit 0
    fi
    
    check_aws_cli
    create_s3_bucket
    create_kms_key
    configure_s3_encryption
    create_dynamodb_table
    create_iam_policy
    update_config_files
    show_completion_message
}

# スクリプト実行
main "$@"