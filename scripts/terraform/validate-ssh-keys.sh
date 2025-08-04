#!/bin/bash

# SSH Key Validation Script
# Validates SSH key files permissions and accessibility before Terraform operations

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

# 設定変数（環境変数から取得、デフォルト値を設定）
PUBLIC_KEY_PATH=${TF_VAR_ssh_public_key_path:-~/.ssh/id_rsa.pub}
PRIVATE_KEY_PATH=${TF_VAR_ssh_private_key_path:-~/.ssh/id_rsa}

# チルダ展開
PUBLIC_KEY_PATH=${PUBLIC_KEY_PATH/#\~/$HOME}
PRIVATE_KEY_PATH=${PRIVATE_KEY_PATH/#\~/$HOME}

# 関数: ファイル存在確認
check_file_exists() {
    local file_path="$1"
    local file_type="$2"
    
    if [ ! -f "$file_path" ]; then
        log_error "$file_type が見つかりません: $file_path"
        return 1
    fi
    
    log_success "$file_type が見つかりました: $file_path"
    return 0
}

# 関数: ファイル権限確認
check_file_permissions() {
    local file_path="$1"
    local expected_perms="$2"
    local file_type="$3"
    
    # macOSとLinuxの両方に対応
    local actual_perms
    if command -v stat >/dev/null 2>&1; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            actual_perms=$(stat -f "%A" "$file_path")
        else
            # Linux
            actual_perms=$(stat -c "%a" "$file_path")
        fi
    else
        log_error "statコマンドが利用できません"
        return 1
    fi
    
    # 権限を3桁形式に正規化
    actual_perms=$(printf "%03d" "$actual_perms")
    expected_perms=$(printf "%03d" "$expected_perms")
    
    if [ "$actual_perms" != "$expected_perms" ]; then
        log_error "$file_type の権限が不適切です"
        log_error "  現在の権限: $actual_perms"
        log_error "  期待する権限: $expected_perms"
        log_error "  修正コマンド: chmod $expected_perms $file_path"
        return 1
    fi
    
    log_success "$file_type の権限が適切です ($actual_perms)"
    return 0
}

# 関数: SSH鍵の内容確認
validate_ssh_key_content() {
    local key_path="$1"
    local key_type="$2"
    
    if [ "$key_type" = "public" ]; then
        # 公開鍵の形式確認
        if ! ssh-keygen -l -f "$key_path" >/dev/null 2>&1; then
            log_error "公開鍵の形式が無効です: $key_path"
            return 1
        fi
        
        # 鍵のタイプと長さを表示
        local key_info=$(ssh-keygen -l -f "$key_path")
        log_info "公開鍵情報: $key_info"
        
        # RSA鍵の場合、最小2048ビットを推奨
        if echo "$key_info" | grep -q "RSA" && echo "$key_info" | grep -q -E "(1024|512) "; then
            log_warning "RSA鍵のビット数が少なすぎます。2048ビット以上を推奨します"
        fi
        
    elif [ "$key_type" = "private" ]; then
        # 秘密鍵の形式確認（パスフレーズなしの場合のみ）
        if ! ssh-keygen -y -f "$key_path" >/dev/null 2>&1; then
            log_warning "秘密鍵の確認に失敗しました（パスフレーズが設定されている可能性があります）"
            log_info "パスフレーズ付きの鍵の場合は、ssh-agentの使用を検討してください"
        else
            log_success "秘密鍵の形式が有効です"
        fi
    fi
    
    return 0
}

# 関数: SSH鍵ペアの整合性確認
validate_key_pair_match() {
    local public_key_path="$1"
    local private_key_path="$2"
    
    log_info "SSH鍵ペアの整合性を確認中..."
    
    # 秘密鍵から公開鍵を生成
    local generated_public_key
    if generated_public_key=$(ssh-keygen -y -f "$private_key_path" 2>/dev/null); then
        # ファイルから公開鍵を読み取り
        local stored_public_key
        if stored_public_key=$(cat "$public_key_path" 2>/dev/null); then
            # 公開鍵の本体部分のみを比較（コメント部分を除く）
            local generated_key_part=$(echo "$generated_public_key" | awk '{print $1 " " $2}')
            local stored_key_part=$(echo "$stored_public_key" | awk '{print $1 " " $2}')
            
            if [ "$generated_key_part" = "$stored_key_part" ]; then
                log_success "SSH鍵ペアが一致しています"
                return 0
            else
                log_error "SSH鍵ペアが一致しません"
                log_error "  秘密鍵: $private_key_path"
                log_error "  公開鍵: $public_key_path"
                return 1
            fi
        else
            log_error "公開鍵ファイルの読み取りに失敗しました"
            return 1
        fi
    else
        log_warning "秘密鍵からの公開鍵生成に失敗しました（パスフレーズ付きの可能性）"
        return 0  # パスフレーズ付きの場合は警告のみ
    fi
}

# 関数: SSH Agentの確認
check_ssh_agent() {
    if [ -n "$SSH_AUTH_SOCK" ] && ssh-add -l >/dev/null 2>&1; then
        log_success "SSH Agentが実行中で、鍵が登録されています"
        ssh-add -l | while read -r line; do
            log_info "  登録済み鍵: $line"
        done
    else
        log_info "SSH Agentが実行されていないか、鍵が登録されていません"
        log_info "パスフレーズ付きSSH鍵の場合は、ssh-agentの使用を推奨します"
    fi
}

# 関数: セキュリティ推奨事項の表示
show_security_recommendations() {
    log_info "=== セキュリティ推奨事項 ==="
    echo ""
    echo "SSH鍵のセキュリティベストプラクティス:"
    echo "  1. RSA鍵の場合は2048ビット以上を使用"
    echo "  2. Ed25519鍵の使用を推奨（より安全）"
    echo "  3. 秘密鍵にはパスフレーズを設定"
    echo "  4. SSH鍵の定期的なローテーション"
    echo "  5. 使用していない鍵の削除"
    echo ""
    echo "推奨される鍵生成コマンド:"
    echo "  ssh-keygen -t ed25519 -C 'your-email@example.com'"
    echo "  ssh-keygen -t rsa -b 4096 -C 'your-email@example.com'"
    echo ""
}

# 関数: 自動修正提案
suggest_fixes() {
    local public_key_path="$1"
    local private_key_path="$2"
    
    log_info "=== 自動修正コマンド ==="
    echo ""
    echo "権限修正コマンド:"
    echo "  chmod 644 $public_key_path"
    echo "  chmod 600 $private_key_path"
    echo ""
    echo "親ディレクトリの権限確認:"
    echo "  chmod 700 $(dirname "$private_key_path")"
    echo ""
    
    read -p "権限を自動修正しますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "権限を修正中..."
        chmod 644 "$public_key_path" 2>/dev/null && log_success "公開鍵権限修正完了"
        chmod 600 "$private_key_path" 2>/dev/null && log_success "秘密鍵権限修正完了"
        chmod 700 "$(dirname "$private_key_path")" 2>/dev/null && log_success "ディレクトリ権限修正完了"
    fi
}

# メイン検証関数
main() {
    local exit_code=0
    
    echo "=== SSH Key Validation ==="
    echo "公開鍵: $PUBLIC_KEY_PATH"
    echo "秘密鍵: $PRIVATE_KEY_PATH"
    echo ""
    
    # 1. ファイル存在確認
    if ! check_file_exists "$PUBLIC_KEY_PATH" "SSH公開鍵"; then
        exit_code=1
    fi
    
    if ! check_file_exists "$PRIVATE_KEY_PATH" "SSH秘密鍵"; then
        exit_code=1
    fi
    
    # ファイルが存在しない場合は早期終了
    if [ $exit_code -ne 0 ]; then
        log_error "必要なSSH鍵ファイルが見つかりません"
        exit $exit_code
    fi
    
    # 2. 権限確認
    if ! check_file_permissions "$PUBLIC_KEY_PATH" 644 "SSH公開鍵"; then
        exit_code=1
    fi
    
    if ! check_file_permissions "$PRIVATE_KEY_PATH" 600 "SSH秘密鍵"; then
        exit_code=1
    fi
    
    # 3. SSH鍵内容の確認
    validate_ssh_key_content "$PUBLIC_KEY_PATH" "public"
    validate_ssh_key_content "$PRIVATE_KEY_PATH" "private"
    
    # 4. 鍵ペアの整合性確認
    validate_key_pair_match "$PUBLIC_KEY_PATH" "$PRIVATE_KEY_PATH"
    
    # 5. SSH Agent確認
    check_ssh_agent
    
    # 6. 結果の表示
    if [ $exit_code -eq 0 ]; then
        log_success "=== SSH鍵検証完了 - すべてのチェックが成功しました ==="
        show_security_recommendations
    else
        log_error "=== SSH鍵検証失敗 - 問題を修正してください ==="
        suggest_fixes "$PUBLIC_KEY_PATH" "$PRIVATE_KEY_PATH"
    fi
    
    exit $exit_code
}

# スクリプト実行
main "$@"