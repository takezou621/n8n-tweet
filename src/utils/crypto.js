/**
 * 暗号化ユーティリティ
 * データの暗号化・復号化、ハッシュ化、署名検証などのセキュリティ機能を提供
 */

const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

/**
 * 暗号化設定のデフォルト値
 */
const DEFAULT_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32, // 256 bits
  ivLength: 16, // 128 bits for GCM
  tagLength: 16, // 128 bits authentication tag
  pbkdf2Iterations: 100000,
  pbkdf2Digest: 'sha512',
  hashAlgorithm: 'sha256',
  hmacAlgorithm: 'sha256'
}

/**
 * 暗号化クラス
 */
class CryptoUtils {
  constructor (options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options }
    this.masterKey = null
    this.logger = options.logger || console

    // 環境変数から暗号化キーを取得
    this.initializeMasterKey()
  }

  /**
   * マスターキーを初期化
   */
  initializeMasterKey () {
    try {
      const keySource = process.env.ENCRYPTION_KEY || process.env.MASTER_KEY
      if (keySource) {
        // 環境変数からキーを派生
        this.masterKey = this.deriveKey(keySource, 'master-key-salt')
      } else {
        // キーファイルから読み取り、なければ生成
        const keyFile = path.join(process.cwd(), '.encryption-key')
        if (fs.existsSync(keyFile)) {
          const keyData = fs.readFileSync(keyFile, 'utf8')
          this.masterKey = this.deriveKey(keyData, 'master-key-salt')
        } else {
          // 開発環境用のデフォルトキー（本番環境では使用禁止）
          if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
            this.masterKey = this.deriveKey('default-dev-key-do-not-use-in-production',
              'master-key-salt')
            this.logger.warn('Using default encryption key for development. ' +
              'Do not use in production!')
          } else {
            throw new Error('No encryption key found. Set ENCRYPTION_KEY environment variable.')
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize encryption key:', error.message)
      throw error
    }
  }

  /**
   * PBKDF2を使用してキーを派生
   */
  deriveKey (password, salt, keyLength = this.config.keyLength) {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.config.pbkdf2Iterations,
      keyLength,
      this.config.pbkdf2Digest
    )
  }

  /**
   * データを暗号化
   */
  encrypt (plaintext, key = null) {
    try {
      if (typeof plaintext !== 'string') {
        plaintext = JSON.stringify(plaintext)
      }

      const encryptionKey = key || this.masterKey
      if (!encryptionKey) {
        throw new Error('No encryption key available')
      }

      // ランダムなIVを生成
      const iv = crypto.randomBytes(this.config.ivLength)

      // 暗号化実行
      const cipher = crypto.createCipheriv(this.config.algorithm, encryptionKey, iv)
      cipher.setAAD(Buffer.from('n8n-tweet-encryption'))

      let encrypted = cipher.update(plaintext, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      // 認証タグを取得
      const tag = cipher.getAuthTag()

      // IV + Tag + 暗号化データを結合
      const result = {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted,
        algorithm: this.config.algorithm
      }

      return Buffer.from(JSON.stringify(result)).toString('base64')
    } catch (error) {
      this.logger.error('Encryption failed:', error.message)
      throw new Error('Encryption failed')
    }
  }

  /**
   * データを復号化
   */
  decrypt (encryptedData, key = null) {
    try {
      const encryptionKey = key || this.masterKey
      if (!encryptionKey) {
        throw new Error('No encryption key available')
      }

      // Base64デコード
      const jsonData = Buffer.from(encryptedData, 'base64').toString('utf8')
      const { iv, tag, data, algorithm } = JSON.parse(jsonData)

      // 復号化実行
      const decipher = crypto.createDecipheriv(
        algorithm || this.config.algorithm,
        encryptionKey,
        Buffer.from(iv, 'hex')
      )
      decipher.setAAD(Buffer.from('n8n-tweet-encryption'))
      decipher.setAuthTag(Buffer.from(tag, 'hex'))

      let decrypted = decipher.update(data, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      // JSONとして解析を試行
      try {
        return JSON.parse(decrypted)
      } catch {
        return decrypted
      }
    } catch (error) {
      this.logger.error('Decryption failed:', error.message)
      throw new Error('Decryption failed')
    }
  }

  /**
   * ファイルを暗号化して保存
   */
  encryptFile (filePath, data, key = null) {
    try {
      const encrypted = this.encrypt(data, key)
      fs.writeFileSync(filePath, encrypted, 'utf8')

      // ファイル権限を制限（600: 所有者のみ読み書き可能）
      fs.chmodSync(filePath, 0o600)

      this.logger.debug(`File encrypted and saved: ${filePath}`)
    } catch (error) {
      this.logger.error(`Failed to encrypt file ${filePath}:`, error.message)
      throw error
    }
  }

  /**
   * 暗号化ファイルを読み取り・復号化
   */
  decryptFile (filePath, key = null) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
      }

      const encryptedData = fs.readFileSync(filePath, 'utf8')
      return this.decrypt(encryptedData, key)
    } catch (error) {
      this.logger.error(`Failed to decrypt file ${filePath}:`, error.message)
      throw error
    }
  }

  /**
   * データのハッシュ値を計算
   */
  hash (data, algorithm = this.config.hashAlgorithm) {
    try {
      if (typeof data !== 'string') {
        data = JSON.stringify(data)
      }

      return crypto.createHash(algorithm).update(data, 'utf8').digest('hex')
    } catch (error) {
      this.logger.error('Hashing failed:', error.message)
      throw error
    }
  }

  /**
   * HMAC署名を生成
   */
  sign (data, secret = null, algorithm = this.config.hmacAlgorithm) {
    try {
      if (typeof data !== 'string') {
        data = JSON.stringify(data)
      }

      const signingKey = secret || this.masterKey
      if (!signingKey) {
        throw new Error('No signing key available')
      }

      return crypto.createHmac(algorithm, signingKey).update(data, 'utf8').digest('hex')
    } catch (error) {
      this.logger.error('Signing failed:', error.message)
      throw error
    }
  }

  /**
   * HMAC署名を検証
   */
  verify (data, signature, secret = null, algorithm = this.config.hmacAlgorithm) {
    try {
      const expectedSignature = this.sign(data, secret, algorithm)
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      )
    } catch (error) {
      this.logger.error('Signature verification failed:', error.message)
      return false
    }
  }

  /**
   * 安全なランダム文字列を生成
   */
  generateRandomString (length = 32, encoding = 'hex') {
    return crypto.randomBytes(Math.ceil(length / 2)).toString(encoding).slice(0, length)
  }

  /**
   * 安全なランダムトークンを生成
   */
  generateToken (length = 64) {
    return crypto.randomBytes(length).toString('base64url')
  }

  /**
   * パスワードをハッシュ化（bcryptスタイル）
   */
  hashPassword (password, saltRounds = 12) {
    try {
      const salt = crypto.randomBytes(16).toString('hex')
      const hash = crypto.pbkdf2Sync(password, salt, Math.pow(2, saltRounds), 64, 'sha512')
      return `$pbkdf2-sha512$${saltRounds}$${salt}$${hash.toString('hex')}`
    } catch (error) {
      this.logger.error('Password hashing failed:', error.message)
      throw error
    }
  }

  /**
   * パスワードを検証
   */
  verifyPassword (password, hashedPassword) {
    try {
      const parts = hashedPassword.split('$')
      if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha512') {
        return false
      }

      const saltRounds = parseInt(parts[2])
      const salt = parts[3]
      const hash = parts[4]

      const testHash = crypto.pbkdf2Sync(password, salt, Math.pow(2, saltRounds), 64, 'sha512')
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), testHash)
    } catch (error) {
      this.logger.error('Password verification failed:', error.message)
      return false
    }
  }

  /**
   * データの整合性チェックサムを計算
   */
  calculateChecksum (data, algorithm = 'sha256') {
    return this.hash(data, algorithm)
  }

  /**
   * 機密データをサニタイズ（ログ出力用）
   */
  sanitizeForLogging (data) {
    if (typeof data !== 'object' || data === null) {
      return data
    }

    const sanitized = {}
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'credential', 'auth',
      'apiKey', 'accessToken', 'refreshToken', 'privateKey',
      'authorization', 'bearer', 'signature'
    ]

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase()
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * セキュア消去（メモリ内容を上書き）
   */
  secureWipe (buffer) {
    if (Buffer.isBuffer(buffer)) {
      crypto.randomFillSync(buffer)
    }
  }

  /**
   * 暗号化設定情報を取得
   */
  getConfig () {
    return {
      algorithm: this.config.algorithm,
      keyLength: this.config.keyLength,
      ivLength: this.config.ivLength,
      tagLength: this.config.tagLength,
      pbkdf2Iterations: this.config.pbkdf2Iterations,
      hashAlgorithm: this.config.hashAlgorithm,
      hmacAlgorithm: this.config.hmacAlgorithm
    }
  }

  /**
   * セルフテスト実行
   */
  selfTest () {
    try {
      const testData = 'Hello, secure world!'
      const encrypted = this.encrypt(testData)
      const decrypted = this.decrypt(encrypted)

      if (decrypted !== testData) {
        throw new Error('Encryption/decryption test failed')
      }

      const hash1 = this.hash(testData)
      const hash2 = this.hash(testData)
      if (hash1 !== hash2) {
        throw new Error('Hash consistency test failed')
      }

      const signature = this.sign(testData)
      if (!this.verify(testData, signature)) {
        throw new Error('Signature verification test failed')
      }

      this.logger.info('Cryptographic self-test passed')
      return true
    } catch (error) {
      this.logger.error('Cryptographic self-test failed:', error.message)
      return false
    }
  }
}

// シングルトンインスタンス
let instance = null

/**
 * CryptoUtilsのシングルトンインスタンスを取得
 */
function getCryptoUtils (options = {}) {
  if (!instance) {
    instance = new CryptoUtils(options)
  }
  return instance
}

/**
 * 便利な関数エクスポート
 */
module.exports = {
  CryptoUtils,
  getCryptoUtils,

  // 便利な関数
  encrypt: (data, key) =>
    getCryptoUtils().encrypt(data, key),
  decrypt: (data, key) => getCryptoUtils().decrypt(data, key),
  hash: (data, algorithm) =>
    getCryptoUtils().hash(data, algorithm),
  sign: (data, secret, algorithm) => getCryptoUtils().sign(data, secret, algorithm),
  verify: (data, signature, secret, algorithm) =>
    getCryptoUtils().verify(data, signature, secret, algorithm),
  generateToken: (length) => getCryptoUtils().generateToken(length),
  generateRandomString: (length, encoding) =>
    getCryptoUtils().generateRandomString(length, encoding),
  hashPassword: (password, saltRounds) => getCryptoUtils().hashPassword(password, saltRounds),
  verifyPassword: (password, hash) => getCryptoUtils().verifyPassword(password, hash),
  sanitizeForLogging: (data) => getCryptoUtils().sanitizeForLogging(data)
}
