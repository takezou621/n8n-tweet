# 🛠️ 環境構築ガイド

このガイドでは、n8n-tweetシステムを動作させるために必要な開発環境の構築方法を詳しく説明します。

## 📋 目次

1. [システム要件](#システム要件)
2. [Node.js環境構築](#nodejs環境構築)
3. [Git環境構築](#git環境構築)
4. [Docker環境構築（オプション）](#docker環境構築オプション)
5. [開発ツール](#開発ツール)
6. [環境確認](#環境確認)

---

## 1. システム要件

### 最小システム要件

| 項目 | Windows | macOS | Linux |
|------|---------|-------|-------|
| OS | Windows 10 1909以降 | macOS 10.15以降 | Ubuntu 18.04以降 |
| CPU | Intel/AMD 64-bit | Intel/Apple Silicon | x86_64 |
| RAM | 4GB以上 | 4GB以上 | 4GB以上 |
| ストレージ | 10GB以上の空き容量 | 10GB以上の空き容量 | 10GB以上の空き容量 |
| ネットワーク | インターネット接続 | インターネット接続 | インターネット接続 |

### 推奨システム要件

| 項目 | 推奨スペック |
|------|-------------|
| RAM | 8GB以上 |
| ストレージ | SSD 20GB以上 |
| ネットワーク | 安定したブロードバンド接続 |

---

## 2. Node.js環境構築

### 2.1 Windows環境

#### 方法1: 公式インストーラー（推奨）

1. **公式サイトアクセス**
   - https://nodejs.org/
   - 「LTS」版（Long Term Support）をクリック

2. **インストーラーダウンロード**
   - `node-v18.x.x-x64.msi` をダウンロード

3. **インストール実行**
   ```
   1. ダウンロードした.msiファイルをダブルクリック
   2. インストールウィザードに従って進行
   3. 「Add to PATH」のチェックボックスを確認（チェック済み）
   4. 「Install」をクリック
   5. 完了まで5-10分程度待機
   ```

4. **インストール確認**
   ```cmd
   # コマンドプロンプトを開いて実行
   node --version
   # v18.15.0 のように表示されることを確認
   
   npm --version
   # 9.5.0 のように表示されることを確認
   ```

#### 方法2: Chocolatey（上級者向け）

```powershell
# PowerShellを管理者権限で開いて実行
choco install nodejs
```

#### 方法3: Scoop（上級者向け）

```powershell
# PowerShellで実行
scoop install nodejs
```

### 2.2 macOS環境

#### 方法1: 公式インストーラー（推奨）

1. **公式サイトアクセス**
   - https://nodejs.org/
   - 「LTS」版をクリック

2. **インストーラーダウンロード**
   - `node-v18.x.x.pkg` をダウンロード

3. **インストール実行**
   ```
   1. ダウンロードした.pkgファイルをダブルクリック
   2. インストーラーの指示に従って進行
   3. 管理者パスワードを入力
   4. インストール完了
   ```

4. **インストール確認**
   ```bash
   # ターミナルを開いて実行
   node --version
   npm --version
   ```

#### 方法2: Homebrew（推奨）

```bash
# Homebrewがインストールされていない場合
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.jsインストール
brew install node
```

#### 方法3: nodenv（バージョン管理）

```bash
# nodenvインストール
brew install nodenv

# 最新のLTSバージョン確認
nodenv install --list | grep "18\."

# Node.js 18.x.x インストール
nodenv install 18.15.0
nodenv global 18.15.0

# Shell設定
echo 'export PATH="$HOME/.nodenv/bin:$PATH"' >> ~/.zshrc
echo 'eval "$(nodenv init -)"' >> ~/.zshrc
source ~/.zshrc
```

### 2.3 Linux環境（Ubuntu/Debian）

#### 方法1: NodeSource リポジトリ（推奨）

```bash
# システム更新
sudo apt update && sudo apt upgrade -y

# curl インストール
sudo apt install -y curl

# NodeSource リポジトリ追加
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Node.js インストール
sudo apt install -y nodejs

# インストール確認
node --version
npm --version
```

#### 方法2: Snap

```bash
# Node.js インストール
sudo snap install node --classic

# インストール確認
node --version
npm --version
```

#### 方法3: 公式バイナリ

```bash
# 作業ディレクトリ作成
mkdir -p ~/downloads
cd ~/downloads

# Node.js バイナリダウンロード
wget https://nodejs.org/dist/v18.15.0/node-v18.15.0-linux-x64.tar.xz

# 展開
tar -xJf node-v18.15.0-linux-x64.tar.xz

# インストール
sudo cp -r node-v18.15.0-linux-x64/* /usr/local/

# パス設定
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 2.4 npm設定最適化

```bash
# npm キャッシュクリア
npm cache clean --force

# npm グローバルパッケージディレクトリ確認
npm config get prefix

# npmレジストリ設定確認（オプション）
npm config get registry

# 高速化設定
npm config set registry https://registry.npmjs.org/
npm config set engine-strict true
```

---

## 3. Git環境構築

### 3.1 Windows環境

#### Git for Windows インストール

1. **公式サイトアクセス**
   - https://git-scm.com/download/win

2. **インストーラーダウンロード**
   - 最新版をダウンロード

3. **インストール設定**
   ```
   インストール時の推奨設定:
   ✅ Git Bash Here
   ✅ Git GUI Here
   ✅ Git LFS (Large File Support)
   ✅ Associate .git* configuration files with default text editor
   ✅ Associate .sh files to be run with Bash
   ✅ Use Git from Git Bash only（初心者）
      または Use Git from the Windows Command Prompt（上級者）
   ✅ Use the OpenSSL library
   ✅ Checkout Windows-style, commit Unix-style line endings
   ✅ Use MinTTY (the default terminal of MSYS2)
   ✅ Enable file system caching
   ✅ Enable Git Credential Manager
   ```

### 3.2 macOS環境

#### 方法1: Xcode Command Line Tools

```bash
# Xcode Command Line Tools インストール
xcode-select --install

# インストール確認
git --version
```

#### 方法2: Homebrew

```bash
# Git インストール
brew install git

# インストール確認
git --version
```

### 3.3 Linux環境

#### Ubuntu/Debian

```bash
# システム更新
sudo apt update

# Git インストール
sudo apt install -y git

# インストール確認
git --version
```

#### CentOS/RHEL/Fedora

```bash
# Git インストール（CentOS/RHEL）
sudo yum install -y git

# Git インストール（Fedora）
sudo dnf install -y git

# インストール確認
git --version
```

### 3.4 Git初期設定

```bash
# ユーザー名設定
git config --global user.name "あなたの名前"

# メールアドレス設定
git config --global user.email "your-email@example.com"

# デフォルトエディタ設定（Visual Studio Code推奨）
git config --global core.editor "code --wait"

# 改行コード設定
# Windows
git config --global core.autocrlf true

# macOS/Linux
git config --global core.autocrlf input

# 設定確認
git config --list
```

---

## 4. Docker環境構築（オプション）

Dockerは本システムの動作には必須ではありませんが、本番環境でのデプロイや開発環境の統一に便利です。

### 4.1 Windows環境

#### Docker Desktop for Windows

1. **システム要件確認**
   - Windows 10 Pro/Enterprise/Education（Hyper-V対応）
   - または Windows 10 Home（WSL2対応）

2. **Docker Desktop ダウンロード**
   - https://www.docker.com/products/docker-desktop
   - 「Docker Desktop for Windows」をダウンロード

3. **インストール実行**
   ```
   1. インストーラーを実行
   2. 「Use WSL 2 instead of Hyper-V」を選択（推奨）
   3. インストール完了後、再起動
   ```

### 4.2 macOS環境

#### Docker Desktop for Mac

```bash
# Homebrew でインストール（推奨）
brew install --cask docker

# または公式サイトから直接ダウンロード
# https://www.docker.com/products/docker-desktop
```

### 4.3 Linux環境

#### Ubuntu/Debian

```bash
# 古いDockerを削除
sudo apt remove docker docker-engine docker.io containerd runc

# 依存関係インストール
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Docker公式GPGキー追加
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Dockerリポジトリ追加
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker Engine インストール
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# ユーザーをdockerグループに追加
sudo usermod -aG docker $USER

# システム再起動またはログアウト/ログイン
```

#### Docker Compose インストール

```bash
# Docker Compose インストール
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 実行権限付与
sudo chmod +x /usr/local/bin/docker-compose

# インストール確認
docker-compose --version
```

---

## 5. 開発ツール

### 5.1 Visual Studio Code（推奨）

#### インストール

1. **公式サイトアクセス**
   - https://code.visualstudio.com/

2. **OS別インストール**
   ```
   Windows: .exe ファイルをダウンロード・実行
   macOS: .dmg ファイルをダウンロード・実行
   Linux: .deb または .rpm ファイルをダウンロード・実行
   ```

#### 推奨拡張機能

```
必須拡張機能:
✅ JavaScript (ES6) code snippets
✅ Node.js Extension Pack
✅ npm Intellisense
✅ Path Intellisense
✅ Auto Rename Tag
✅ Bracket Pair Colorizer
✅ GitLens
✅ Prettier - Code formatter
✅ ESLint

オプション拡張機能:
✅ Docker
✅ YAML
✅ JSON Tools
✅ Thunder Client（API テスト用）
```

### 5.2 ターミナル設定

#### Windows

**推奨**: Windows Terminal + PowerShell Core

```powershell
# Windows Terminal インストール（Microsoft Storeから）
# または Chocolatey
choco install microsoft-windows-terminal

# PowerShell Core インストール
choco install powershell-core
```

#### macOS

**推奨**: iTerm2 + Oh My Zsh

```bash
# iTerm2 インストール
brew install --cask iterm2

# Oh My Zsh インストール
sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

#### Linux

**推奨**: Zsh + Oh My Zsh

```bash
# Zsh インストール
sudo apt install -y zsh

# デフォルトシェル変更
chsh -s $(which zsh)

# Oh My Zsh インストール
sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

---

## 6. 環境確認

### 6.1 基本環境チェック

```bash
# Node.js バージョン確認
node --version
# Expected: v18.15.0 or higher

# npm バージョン確認
npm --version
# Expected: 9.5.0 or higher

# Git バージョン確認
git --version
# Expected: 2.30.0 or higher

# Docker バージョン確認（オプション）
docker --version
# Expected: 20.10.0 or higher

# Docker Compose バージョン確認（オプション）
docker-compose --version
# Expected: 1.29.0 or higher
```

### 6.2 権限・パス確認

```bash
# npm グローバルパッケージ確認
npm list -g --depth=0

# 実行可能ファイルパス確認
which node
which npm
which git

# 環境変数確認
echo $PATH
```

### 6.3 ネットワーク確認

```bash
# npm レジストリ接続確認
npm ping

# GitHub 接続確認
git ls-remote https://github.com/takezou621/n8n-tweet.git

# DNS確認
nslookup registry.npmjs.org
```

### 6.4 自動環境チェックスクリプト

**environment-check.js** を作成して実行:

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');

function checkCommand(command, expectedVersion) {
  try {
    const version = execSync(command, { encoding: 'utf8' }).trim();
    console.log(`✅ ${command}: ${version}`);
    return true;
  } catch (error) {
    console.log(`❌ ${command}: Not found or error`);
    return false;
  }
}

console.log('🔍 Environment Check\n');

const checks = [
  ['node --version', 'v18.0.0+'],
  ['npm --version', '8.0.0+'],
  ['git --version', '2.30.0+'],
  ['docker --version', '20.10.0+ (optional)'],
  ['docker-compose --version', '1.29.0+ (optional)']
];

let passedChecks = 0;
checks.forEach(([command, expected]) => {
  if (checkCommand(command, expected)) {
    passedChecks++;
  }
});

console.log(`\n📊 Results: ${passedChecks}/${checks.length} checks passed`);

if (passedChecks >= 3) {
  console.log('🎉 Environment setup is ready!');
} else {
  console.log('⚠️  Please install missing requirements');
}
```

実行:
```bash
node environment-check.js
```

---

## 🚀 次のステップ

環境構築が完了したら、次のガイドに進んでください：

1. **[Twitter API設定ガイド](twitter-api-setup.md)** - Twitter Developer Accountの取得
2. **[初心者向け完全セットアップガイド](beginner-setup-guide.md)** - システム全体のセットアップ
3. **[n8n設定ガイド](n8n-configuration.md)** - ワークフロー設定

## 💡 トラブルシューティング

問題が発生した場合は、[トラブルシューティングガイド](troubleshooting.md)を参照してください。

## 📞 サポート

- [FAQ](faq.md)
- [GitHub Issues](https://github.com/takezou621/n8n-tweet/issues)
- [GitHub Discussions](https://github.com/takezou621/n8n-tweet/discussions)
