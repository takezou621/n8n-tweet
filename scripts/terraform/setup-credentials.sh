#!/bin/bash

# Terraform Credentials Setup Script
# Securely configure environment variables for Terraform authentication

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

# 設定ファイルパス
ENV_FILE=".env.terraform"
BACKUP_FILE=".env.terraform.backup"

# 関数: 既存ファイルのバックアップ
backup_existing_file() {
    if [ -f "$ENV_FILE" ]; then
        log_info "既存の設定ファイルをバックアップ中..."
        cp "$ENV_FILE" "$BACKUP_FILE"
        log_success "バックアップ完了: $BACKUP_FILE"
    fi
}

# 関数: セキュアな入力取得
secure_read() {
    local prompt="$1"
    local var_name="$2"
    local is_secret="${3:-false}"
    
    echo -n "$prompt: "
    
    if [ "$is_secret" = "true" ]; then
        read -s value
        echo ""  # 改行を追加
    else
        read value
    fi
    
    # 入力値の検証
    if [ -z "$value" ]; then
        log_error "値が入力されていません"
        return 1
    fi
    
    # グローバル変数に設定
    eval "$var_name='$value'"
    return 0
}

# 関数: Proxmox認証情報設定
setup_proxmox_credentials() {
    log_info "Proxmox認証情報を設定中..."
    
    echo "Proxmox API設定:"
    secure_read "Proxmox API URL (例: https://proxmox.example.com:8006/api2/json)" PROXMOX_API_URL
    secure_read "Proxmox API Token ID (例: username@pam!token-id)" PROXMOX_API_TOKEN_ID
    secure_read "Proxmox API Token Secret" PROXMOX_API_TOKEN_SECRET true
    
    log_success "Proxmox認証情報設定完了"
}

# 関数: AWS認証情報設定
setup_aws_credentials() {
    log_info "AWS認証情報を設定中..."
    
    echo "AWS Backend設定:"
    secure_read "S3バケット名" STATE_BUCKET_NAME
    secure_read "AWS Region (デフォルト: us-east-1)" STATE_BUCKET_REGION
    STATE_BUCKET_REGION=${STATE_BUCKET_REGION:-us-east-1}
    
    secure_read "DynamoDB テーブル名 (デフォルト: terraform-state-lock)" STATE_LOCK_TABLE_NAME
    STATE_LOCK_TABLE_NAME=${STATE_LOCK_TABLE_NAME:-terraform-state-lock}
    
    secure_read "KMS Key ID/Alias (デフォルト: alias/terraform-state-key)" STATE_KMS_KEY_ID
    STATE_KMS_KEY_ID=${STATE_KMS_KEY_ID:-alias/terraform-state-key}
    
    secure_read "AWS Profile (デフォルト: default)" AWS_PROFILE
    AWS_PROFILE=${AWS_PROFILE:-default}
    
    log_success "AWS認証情報設定完了"
}

# 関数: SSH鍵パス設定
setup_ssh_keys() {
    log_info "SSH鍵パスを設定中..."
    
    echo "SSH鍵設定:"
    secure_read "SSH公開鍵パス (デフォルト: ~/.ssh/id_rsa.pub)" SSH_PUBLIC_KEY_PATH
    SSH_PUBLIC_KEY_PATH=${SSH_PUBLIC_KEY_PATH:-~/.ssh/id_rsa.pub}
    
    secure_read "SSH秘密鍵パス (デフォルト: ~/.ssh/id_rsa)" SSH_PRIVATE_KEY_PATH
    SSH_PRIVATE_KEY_PATH=${SSH_PRIVATE_KEY_PATH:-~/.ssh/id_rsa}
    
    # SSH鍵の存在確認
    if [ ! -f "${SSH_PUBLIC_KEY_PATH/#\~/$HOME}" ]; then
        log_warning "SSH公開鍵が見つかりません: $SSH_PUBLIC_KEY_PATH"
        read -p "続行しますか？ (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "SSH鍵の設定をやり直してください"
            return 1
        fi
    fi
    
    if [ ! -f "${SSH_PRIVATE_KEY_PATH/#\~/$HOME}" ]; then
        log_warning "SSH秘密鍵が見つかりません: $SSH_PRIVATE_KEY_PATH"
        read -p "続行しますか？ (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "SSH鍵の設定をやり直してください"
            return 1
        fi
    fi
    
    log_success "SSH鍵パス設定完了"
}

# 関数: 環境変数ファイル作成
create_env_file() {
    log_info "環境変数ファイルを作成中..."
    
    cat > "$ENV_FILE" << EOF
# Terraform Environment Variables
# Generated on $(date)
# WARNING: This file contains sensitive information. Do not commit to version control.

# Proxmox Provider Configuration
export TF_VAR_proxmox_api_url="$PROXMOX_API_URL"
export TF_VAR_proxmox_api_token_id="$PROXMOX_API_TOKEN_ID"
export TF_VAR_proxmox_api_token_secret="$PROXMOX_API_TOKEN_SECRET"

# AWS Backend Configuration
export TF_VAR_state_bucket_name="$STATE_BUCKET_NAME"
export TF_VAR_state_bucket_region="$STATE_BUCKET_REGION"
export TF_VAR_state_lock_table_name="$STATE_LOCK_TABLE_NAME"
export TF_VAR_state_kms_key_id="$STATE_KMS_KEY_ID"
export TF_VAR_aws_profile="$AWS_PROFILE"

# SSH Configuration
export TF_VAR_ssh_public_key_path="$SSH_PUBLIC_KEY_PATH"
export TF_VAR_ssh_private_key_path="$SSH_PRIVATE_KEY_PATH"

# Usage Instructions:
# Source this file before running Terraform commands:
# source .env.terraform
# terraform plan
# terraform apply
EOF
    
    # ファイル権限を制限
    chmod 600 "$ENV_FILE"
    
    log_success "環境変数ファイル作成完了: $ENV_FILE"
}

# 関数: .gitignore更新
update_gitignore() {
    log_info ".gitignoreを更新中..."
    
    # .gitignoreファイルの場所を確認
    local gitignore_file=""
    if [ -f "../../.gitignore" ]; then
        gitignore_file="../../.gitignore"
    elif [ -f ".gitignore" ]; then
        gitignore_file=".gitignore"
    else
        log_warning ".gitignoreファイルが見つかりません"
        return 0
    fi
    
    # 既に存在するかチェック
    if ! grep -q ".env.terraform" "$gitignore_file"; then
        cat >> "$gitignore_file" << EOF

# Terraform credentials and sensitive files
.env.terraform
.env.terraform.backup
terraform.tfvars
*.tfstate
*.tfstate.backup
.terraform/
.terraform.lock.hcl
connection-details.txt
EOF
        log_success ".gitignore更新完了"
    else
        log_info ".gitignoreは既に更新済みです"
    fi
}

# 関数: 設定検証
validate_configuration() {
    log_info "設定を検証中..."
    
    # AWS認証情報確認
    if command -v aws &> /dev/null; then
        if aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
            log_success "AWS認証確認完了"
        else
            log_warning "AWS認証に問題があります。AWSプロファイル '$AWS_PROFILE' を確認してください"
        fi
    else
        log_warning "AWS CLIがインストールされていません"
    fi
    
    # SSH鍵検証スクリプトの実行
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local validation_script="$script_dir/validate-ssh-keys.sh"
    
    if [ -f "$validation_script" ]; then
        log_info "SSH鍵の詳細検証を実行中..."
        export TF_VAR_ssh_public_key_path="$SSH_PUBLIC_KEY_PATH"
        export TF_VAR_ssh_private_key_path="$SSH_PRIVATE_KEY_PATH"
        
        if "$validation_script"; then
            log_success "SSH鍵検証完了"
        else
            log_error "SSH鍵検証に失敗しました。問題を修正してください"
            return 1
        fi
    else
        log_warning "SSH鍵検証スクリプトが見つかりません: $validation_script"
        
        # 基本的な権限確認のみ実行
        local private_key_path=${SSH_PRIVATE_KEY_PATH/#\~/$HOME}
        if [ -f "$private_key_path" ]; then
            local perms=$(stat -f "%A" "$private_key_path" 2>/dev/null || stat -c "%a" "$private_key_path" 2>/dev/null)
            if [ "$perms" != "600" ] && [ "$perms" != "0600" ]; then
                log_warning "SSH秘密鍵の権限が安全でありません。chmod 600 '$private_key_path' を実行してください"
            fi
        fi
    fi
    
    log_success "設定検証完了"
}

# 関数: 使用方法表示
show_usage_instructions() {
    log_success "=== Terraform認証情報設定完了 ==="
    echo ""
    echo "次の手順:"
    echo "  1. 環境変数を読み込み:"
    echo "     source $ENV_FILE"
    echo ""
    echo "  2. Terraformを初期化:"
    echo "     terraform init"
    echo ""
    echo "  3. プランニング実行:"
    echo "     terraform plan"
    echo ""
    echo "  4. インフラ構築:"
    echo "     terraform apply"
    echo ""
    echo "セキュリティ注意事項:"
    echo "  - $ENV_FILE ファイルは機密情報を含みます"
    echo "  - このファイルをversion controlにコミットしないでください"
    echo "  - 定期的にアクセスキーをローテーションしてください"
    echo "  - MFAを有効化することを強く推奨します"
    echo ""
    log_warning "重要: 環境変数ファイルを安全に管理してください！"
}

# メイン実行関数
main() {
    echo "=== Terraform Credentials Setup ==="
    echo "このスクリプトはTerraformで使用する認証情報を安全に設定します。"
    echo ""
    
    read -p "続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "セットアップをキャンセルしました"
        exit 0
    fi
    
    backup_existing_file
    setup_proxmox_credentials
    setup_aws_credentials
    setup_ssh_keys
    create_env_file
    update_gitignore
    validate_configuration
    show_usage_instructions
}

# スクリプト実行
main "$@"