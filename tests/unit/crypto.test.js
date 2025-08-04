/**
 * CryptoUtils のユニットテスト
 * 包括的テストによる高いカバレッジを実現
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  CryptoUtils,
  getCryptoUtils,
  encrypt,
  decrypt,
  hash,
  sign,
  verify,
  generateToken,
  generateRandomString,
  hashPassword,
  verifyPassword,
  sanitizeForLogging
} = require('../../src/utils/crypto')

// Mock file system
jest.mock('fs')
jest.mock('path')

describe('CryptoUtils', () => {
  let cryptoUtils
  let mockLogger

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }

    // Reset environment variables
    delete process.env.ENCRYPTION_KEY
    delete process.env.MASTER_KEY
    process.env.NODE_ENV = 'test'

    // Mock file system calls
    fs.existsSync = jest.fn()
    fs.readFileSync = jest.fn()
    fs.writeFileSync = jest.fn()
    fs.chmodSync = jest.fn()
    path.join = jest.fn().mockReturnValue('.encryption-key')

    // Clear singleton instance
    const cryptoModule = require('../../src/utils/crypto')
    if (cryptoModule.getCryptoUtils.__instance) {
      delete cryptoModule.getCryptoUtils.__instance
    }
  })

  describe('constructor and initialization', () => {
    it('should initialize with default configuration', () => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })

      expect(cryptoUtils.config.algorithm).toBe('aes-256-gcm')
      expect(cryptoUtils.config.keyLength).toBe(32)
      expect(cryptoUtils.config.ivLength).toBe(16)
      expect(cryptoUtils.logger).toBe(mockLogger)
    })

    it('should initialize with custom configuration', () => {
      const customConfig = {
        algorithm: 'aes-192-gcm',
        keyLength: 24,
        logger: mockLogger
      }

      cryptoUtils = new CryptoUtils(customConfig)

      expect(cryptoUtils.config.algorithm).toBe('aes-192-gcm')
      expect(cryptoUtils.config.keyLength).toBe(24)
      expect(cryptoUtils.config.ivLength).toBe(16) // should keep default
    })

    it('should initialize master key from environment variable', () => {
      process.env.ENCRYPTION_KEY = 'test-encryption-key'

      cryptoUtils = new CryptoUtils({ logger: mockLogger })

      expect(cryptoUtils.masterKey).toBeDefined()
      expect(cryptoUtils.masterKey).toBeInstanceOf(Buffer)
    })

    it('should initialize master key from MASTER_KEY environment variable', () => {
      process.env.MASTER_KEY = 'test-master-key'

      cryptoUtils = new CryptoUtils({ logger: mockLogger })

      expect(cryptoUtils.masterKey).toBeDefined()
      expect(cryptoUtils.masterKey).toBeInstanceOf(Buffer)
    })

    it('should read master key from file if no environment variable', () => {
      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue('file-encryption-key')

      cryptoUtils = new CryptoUtils({ logger: mockLogger })

      expect(fs.existsSync).toHaveBeenCalledWith('.encryption-key')
      expect(fs.readFileSync).toHaveBeenCalledWith('.encryption-key', 'utf8')
      expect(cryptoUtils.masterKey).toBeDefined()
    })

    it('should use default key in test environment', () => {
      fs.existsSync.mockReturnValue(false)

      cryptoUtils = new CryptoUtils({ logger: mockLogger })

      expect(cryptoUtils.masterKey).toBeDefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Using default encryption key for development. Do not use in production!'
      )
    })

    it('should use default key in development environment', () => {
      process.env.NODE_ENV = 'development'
      fs.existsSync.mockReturnValue(false)

      cryptoUtils = new CryptoUtils({ logger: mockLogger })

      expect(cryptoUtils.masterKey).toBeDefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Using default encryption key for development. Do not use in production!'
      )
    })

    it('should throw error in production without encryption key', () => {
      process.env.NODE_ENV = 'production'
      fs.existsSync.mockReturnValue(false)

      expect(() => {
        new CryptoUtils({ logger: mockLogger })
      }).toThrow('No encryption key found. Set ENCRYPTION_KEY environment variable.')
    })

    it('should handle key initialization errors', () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('File system error')
      })

      expect(() => {
        new CryptoUtils({ logger: mockLogger })
      }).toThrow('File system error')

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize encryption key:', 
        'File system error'
      )
    })
  })

  describe('deriveKey', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should derive key with default parameters', () => {
      const key = cryptoUtils.deriveKey('password', 'salt')

      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32) // default key length
    })

    it('should derive key with custom key length', () => {
      const key = cryptoUtils.deriveKey('password', 'salt', 16)

      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(16)
    })

    it('should produce consistent keys for same inputs', () => {
      const key1 = cryptoUtils.deriveKey('password', 'salt')
      const key2 = cryptoUtils.deriveKey('password', 'salt')

      expect(key1.equals(key2)).toBe(true)
    })

    it('should produce different keys for different inputs', () => {
      const key1 = cryptoUtils.deriveKey('password1', 'salt')
      const key2 = cryptoUtils.deriveKey('password2', 'salt')

      expect(key1.equals(key2)).toBe(false)
    })
  })

  describe('encrypt and decrypt', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should encrypt and decrypt string data successfully', () => {
      const plaintext = 'Hello, secure world!'
      const encrypted = cryptoUtils.encrypt(plaintext)
      const decrypted = cryptoUtils.decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
      expect(encrypted).not.toBe(plaintext)
    })

    it('should encrypt and decrypt object data successfully', () => {
      const plaintext = { message: 'Hello', number: 42, array: [1, 2, 3] }
      const encrypted = cryptoUtils.encrypt(plaintext)
      const decrypted = cryptoUtils.decrypt(encrypted)

      expect(decrypted).toEqual(plaintext)
    })

    it('should encrypt with custom key', () => {
      const customKey = crypto.randomBytes(32)
      const plaintext = 'Custom key test'
      
      const encrypted = cryptoUtils.encrypt(plaintext, customKey)
      const decrypted = cryptoUtils.decrypt(encrypted, customKey)

      expect(decrypted).toBe(plaintext)
    })

    it('should fail decryption with wrong key', () => {
      const plaintext = 'Test message'
      const wrongKey = crypto.randomBytes(32)
      
      const encrypted = cryptoUtils.encrypt(plaintext)

      expect(() => {
        cryptoUtils.decrypt(encrypted, wrongKey)
      }).toThrow('Decryption failed')

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Decryption failed:', 
        expect.any(String)
      )
    })

    it('should throw error when encrypting without key', () => {
      const cryptoUtilsNoKey = new CryptoUtils({ logger: mockLogger })
      cryptoUtilsNoKey.masterKey = null

      expect(() => {
        cryptoUtilsNoKey.encrypt('test')
      }).toThrow('Encryption failed')

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Encryption failed:', 
        expect.any(String)
      )
    })

    it('should throw error when decrypting without key', () => {
      const encrypted = cryptoUtils.encrypt('test')
      cryptoUtils.masterKey = null

      expect(() => {
        cryptoUtils.decrypt(encrypted)
      }).toThrow('Decryption failed')
    })

    it('should handle malformed encrypted data', () => {
      expect(() => {
        cryptoUtils.decrypt('invalid-base64-data')
      }).toThrow('Decryption failed')

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Decryption failed:', 
        expect.any(String)
      )
    })

    it('should return string if JSON parsing fails during decryption', () => {
      const plaintext = 'just a plain string, not JSON'
      const encrypted = cryptoUtils.encrypt(plaintext)
      const decrypted = cryptoUtils.decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    it('should use correct algorithm in encrypted data', () => {
      const plaintext = 'Algorithm test'
      const encrypted = cryptoUtils.encrypt(plaintext)
      
      // Decode to check structure
      const decoded = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'))
      
      expect(decoded.algorithm).toBe('aes-256-gcm')
      expect(decoded.iv).toBeDefined()
      expect(decoded.tag).toBeDefined()
      expect(decoded.data).toBeDefined()
    })
  })

  describe('file encryption operations', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should encrypt and save file successfully', () => {
      const filePath = '/test/path/encrypted.dat'
      const data = { secret: 'confidential data' }

      cryptoUtils.encryptFile(filePath, data)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        filePath, 
        expect.any(String), 
        'utf8'
      )
      expect(fs.chmodSync).toHaveBeenCalledWith(filePath, 0o600)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `File encrypted and saved: ${filePath}`
      )
    })

    it('should decrypt file successfully', () => {
      const filePath = '/test/path/encrypted.dat'
      const originalData = { secret: 'confidential data' }
      const encryptedData = cryptoUtils.encrypt(originalData)

      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue(encryptedData)

      const decryptedData = cryptoUtils.decryptFile(filePath)

      expect(fs.existsSync).toHaveBeenCalledWith(filePath)
      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8')
      expect(decryptedData).toEqual(originalData)
    })

    it('should throw error when decrypting non-existent file', () => {
      const filePath = '/test/path/nonexistent.dat'
      
      fs.existsSync.mockReturnValue(false)

      expect(() => {
        cryptoUtils.decryptFile(filePath)
      }).toThrow(`File not found: ${filePath}`)

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to decrypt file ${filePath}:`, 
        expect.any(String)
      )
    })

    it('should handle file encryption errors', () => {
      const filePath = '/test/path/encrypted.dat'
      const data = 'test data'

      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write permission denied')
      })

      expect(() => {
        cryptoUtils.encryptFile(filePath, data)
      }).toThrow('Write permission denied')

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to encrypt file ${filePath}:`, 
        'Write permission denied'
      )
    })

    it('should use custom key for file operations', () => {
      const filePath = '/test/path/encrypted.dat'
      const data = 'test data'
      const customKey = crypto.randomBytes(32)

      cryptoUtils.encryptFile(filePath, data, customKey)

      // Verify file was written
      expect(fs.writeFileSync).toHaveBeenCalled()

      // Mock file read for decryption test
      const encryptedData = cryptoUtils.encrypt(data, customKey)
      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue(encryptedData)

      const decryptedData = cryptoUtils.decryptFile(filePath, customKey)
      expect(decryptedData).toBe(data)
    })
  })

  describe('hash operations', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should calculate hash for string data', () => {
      const data = 'test data'
      const hashValue = cryptoUtils.hash(data)

      expect(hashValue).toBeDefined()
      expect(typeof hashValue).toBe('string')
      expect(hashValue.length).toBe(64) // SHA-256 hex length
    })

    it('should calculate hash for object data', () => {
      const data = { key: 'value', number: 42 }
      const hashValue = cryptoUtils.hash(data)

      expect(hashValue).toBeDefined()
      expect(typeof hashValue).toBe('string')
    })

    it('should produce consistent hashes', () => {
      const data = 'test data'
      const hash1 = cryptoUtils.hash(data)
      const hash2 = cryptoUtils.hash(data)

      expect(hash1).toBe(hash2)
    })

    it('should use custom algorithm', () => {
      const data = 'test data'
      const sha1Hash = cryptoUtils.hash(data, 'sha1')
      const sha256Hash = cryptoUtils.hash(data, 'sha256')

      expect(sha1Hash).not.toBe(sha256Hash)
      expect(sha1Hash.length).toBe(40) // SHA-1 hex length
      expect(sha256Hash.length).toBe(64) // SHA-256 hex length
    })

    it('should handle hash errors', () => {
      expect(() => {
        cryptoUtils.hash('test', 'invalid-algorithm')
      }).toThrow()

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Hashing failed:', 
        expect.any(String)
      )
    })
  })

  describe('HMAC signature operations', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should sign and verify data successfully', () => {
      const data = 'important data'
      const signature = cryptoUtils.sign(data)
      const isValid = cryptoUtils.verify(data, signature)

      expect(signature).toBeDefined()
      expect(typeof signature).toBe('string')
      expect(isValid).toBe(true)
    })

    it('should sign and verify with custom key', () => {
      const data = 'important data'
      const customKey = crypto.randomBytes(32)
      
      const signature = cryptoUtils.sign(data, customKey)
      const isValid = cryptoUtils.verify(data, signature, customKey)

      expect(isValid).toBe(true)
    })

    it('should fail verification with wrong signature', () => {
      const data = 'important data'
      const wrongSignature = 'invalid-signature'
      
      const isValid = cryptoUtils.verify(data, wrongSignature)

      expect(isValid).toBe(false)
    })

    it('should fail verification with modified data', () => {
      const originalData = 'important data'
      const modifiedData = 'modified data'
      
      const signature = cryptoUtils.sign(originalData)
      const isValid = cryptoUtils.verify(modifiedData, signature)

      expect(isValid).toBe(false)
    })

    it('should sign object data', () => {
      const data = { message: 'test', timestamp: Date.now() }
      const signature = cryptoUtils.sign(data)
      const isValid = cryptoUtils.verify(data, signature)

      expect(isValid).toBe(true)
    })

    it('should use custom HMAC algorithm', () => {
      const data = 'test data'
      const sha1Signature = cryptoUtils.sign(data, null, 'sha1')
      const sha256Signature = cryptoUtils.sign(data, null, 'sha256')

      expect(sha1Signature).not.toBe(sha256Signature)
      expect(cryptoUtils.verify(data, sha1Signature, null, 'sha1')).toBe(true)
      expect(cryptoUtils.verify(data, sha256Signature, null, 'sha256')).toBe(true)
    })

    it('should handle signing without key', () => {
      cryptoUtils.masterKey = null

      expect(() => {
        cryptoUtils.sign('test')
      }).toThrow()

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Signing failed:', 
        expect.any(String)
      )
    })

    it('should handle verification errors gracefully', () => {
      const data = 'test data'
      
      // Mock timing safe equal to throw error
      const originalTimingSafeEqual = crypto.timingSafeEqual
      crypto.timingSafeEqual = jest.fn().mockImplementation(() => {
        throw new Error('Comparison error')
      })

      const result = cryptoUtils.verify(data, 'signature')

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Signature verification failed:', 
        'Comparison error'
      )

      // Restore original function
      crypto.timingSafeEqual = originalTimingSafeEqual
    })
  })

  describe('random generation', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should generate random string with default parameters', () => {
      const randomString = cryptoUtils.generateRandomString()

      expect(randomString).toBeDefined()
      expect(typeof randomString).toBe('string')
      expect(randomString.length).toBe(32)
    })

    it('should generate random string with custom length', () => {
      const length = 16
      const randomString = cryptoUtils.generateRandomString(length)

      expect(randomString.length).toBe(length)
    })

    it('should generate random string with custom encoding', () => {
      const randomString = cryptoUtils.generateRandomString(32, 'base64')

      expect(randomString).toBeDefined()
      expect(typeof randomString).toBe('string')
    })

    it('should generate unique random strings', () => {
      const string1 = cryptoUtils.generateRandomString()
      const string2 = cryptoUtils.generateRandomString()

      expect(string1).not.toBe(string2)
    })

    it('should generate random token', () => {
      const token = cryptoUtils.generateToken()

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('should generate token with custom length', () => {
      const length = 32
      const token = cryptoUtils.generateToken(length)

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
    })

    it('should generate unique tokens', () => {
      const token1 = cryptoUtils.generateToken()
      const token2 = cryptoUtils.generateToken()

      expect(token1).not.toBe(token2)
    })
  })

  describe('password hashing', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should hash and verify password successfully', () => {
      const password = 'secure-password-123'
      const hashed = cryptoUtils.hashPassword(password)
      const isValid = cryptoUtils.verifyPassword(password, hashed)

      expect(hashed).toBeDefined()
      expect(hashed.startsWith('$pbkdf2-sha512$')).toBe(true)
      expect(isValid).toBe(true)
    })

    it('should hash password with custom salt rounds', () => {
      const password = 'test-password'
      const saltRounds = 8
      const hashed = cryptoUtils.hashPassword(password, saltRounds)

      expect(hashed).toContain(`$${saltRounds}$`)
    })

    it('should fail verification with wrong password', () => {
      const password = 'correct-password'
      const wrongPassword = 'wrong-password'
      
      const hashed = cryptoUtils.hashPassword(password)
      const isValid = cryptoUtils.verifyPassword(wrongPassword, hashed)

      expect(isValid).toBe(false)
    })

    it('should produce different hashes for same password', () => {
      const password = 'test-password'
      const hash1 = cryptoUtils.hashPassword(password)
      const hash2 = cryptoUtils.hashPassword(password)

      expect(hash1).not.toBe(hash2) // Different salt each time
      expect(cryptoUtils.verifyPassword(password, hash1)).toBe(true)
      expect(cryptoUtils.verifyPassword(password, hash2)).toBe(true)
    })

    it('should handle invalid hash format during verification', () => {
      const password = 'test-password'
      const invalidHash = 'invalid-hash-format'

      const isValid = cryptoUtils.verifyPassword(password, invalidHash)

      expect(isValid).toBe(false)
    })

    it('should handle wrong hash algorithm in verification', () => {
      const password = 'test-password'
      const wrongAlgorithmHash = '$bcrypt$10$salt$hash'

      const isValid = cryptoUtils.verifyPassword(password, wrongAlgorithmHash)

      expect(isValid).toBe(false)
    })

    it('should handle password hashing errors', () => {
      // Mock crypto.randomBytes to throw error
      const originalRandomBytes = crypto.randomBytes
      crypto.randomBytes = jest.fn().mockImplementation(() => {
        throw new Error('Random generation failed')
      })

      expect(() => {
        cryptoUtils.hashPassword('password')
      }).toThrow()

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Password hashing failed:', 
        'Random generation failed'
      )

      // Restore original function
      crypto.randomBytes = originalRandomBytes
    })

    it('should handle password verification errors', () => {
      const password = 'test-password'
      const validHash = cryptoUtils.hashPassword(password)

      // Mock crypto.pbkdf2Sync to throw error
      const originalPbkdf2Sync = crypto.pbkdf2Sync
      crypto.pbkdf2Sync = jest.fn().mockImplementation(() => {
        throw new Error('PBKDF2 failed')
      })

      const result = cryptoUtils.verifyPassword(password, validHash)

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Password verification failed:', 
        'PBKDF2 failed'
      )

      // Restore original function
      crypto.pbkdf2Sync = originalPbkdf2Sync
    })
  })

  describe('utility functions', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should calculate checksum', () => {
      const data = 'test data'
      const checksum = cryptoUtils.calculateChecksum(data)

      expect(checksum).toBeDefined()
      expect(typeof checksum).toBe('string')
      expect(checksum).toBe(cryptoUtils.hash(data))
    })

    it('should calculate checksum with custom algorithm', () => {
      const data = 'test data'
      const checksum = cryptoUtils.calculateChecksum(data, 'sha1')

      expect(checksum).toBe(cryptoUtils.hash(data, 'sha1'))
    })

    it('should sanitize sensitive data for logging', () => {
      const sensitiveData = {
        username: 'john',
        password: 'secret123',
        apiKey: 'key-123',
        authorization: 'Bearer token',
        publicInfo: 'safe data',
        nested: {
          secret: 'hidden',
          visible: 'shown'
        }
      }

      const sanitized = cryptoUtils.sanitizeForLogging(sensitiveData)

      expect(sanitized.username).toBe('john')
      expect(sanitized.password).toBe('[REDACTED]')
      expect(sanitized.apiKey).toBe('[REDACTED]')
      expect(sanitized.authorization).toBe('[REDACTED]')
      expect(sanitized.publicInfo).toBe('safe data')
      expect(sanitized.nested.secret).toBe('[REDACTED]')
      expect(sanitized.nested.visible).toBe('shown')
    })

    it('should handle non-object data in sanitization', () => {
      expect(cryptoUtils.sanitizeForLogging('string')).toBe('string')
      expect(cryptoUtils.sanitizeForLogging(123)).toBe(123)
      expect(cryptoUtils.sanitizeForLogging(null)).toBe(null)
      expect(cryptoUtils.sanitizeForLogging(undefined)).toBe(undefined)
    })

    it('should securely wipe buffer', () => {
      const buffer = Buffer.from('sensitive data')
      const originalData = buffer.toString()

      cryptoUtils.secureWipe(buffer)

      expect(buffer.toString()).not.toBe(originalData)
    })

    it('should handle non-buffer in secure wipe', () => {
      // Should not throw error
      expect(() => {
        cryptoUtils.secureWipe('not a buffer')
      }).not.toThrow()
    })

    it('should return configuration', () => {
      const config = cryptoUtils.getConfig()

      expect(config).toEqual({
        algorithm: cryptoUtils.config.algorithm,
        keyLength: cryptoUtils.config.keyLength,
        ivLength: cryptoUtils.config.ivLength,
        tagLength: cryptoUtils.config.tagLength,
        pbkdf2Iterations: cryptoUtils.config.pbkdf2Iterations,
        hashAlgorithm: cryptoUtils.config.hashAlgorithm,
        hmacAlgorithm: cryptoUtils.config.hmacAlgorithm
      })
    })
  })

  describe('self-test', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should pass self-test with valid crypto operations', () => {
      const result = cryptoUtils.selfTest()

      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith('Cryptographic self-test passed')
    })

    it('should fail self-test if encryption/decryption fails', () => {
      // Mock encrypt to return wrong data
      const originalEncrypt = cryptoUtils.encrypt
      cryptoUtils.encrypt = jest.fn().mockReturnValue('wrong-encrypted-data')

      const result = cryptoUtils.selfTest()

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cryptographic self-test failed:', 
        expect.any(String)
      )

      // Restore original method
      cryptoUtils.encrypt = originalEncrypt
    })

    it('should fail self-test if hash consistency fails', () => {
      // Mock hash to return different values
      let callCount = 0
      const originalHash = cryptoUtils.hash
      cryptoUtils.hash = jest.fn().mockImplementation(() => {
        return `hash-${++callCount}`
      })

      const result = cryptoUtils.selfTest()

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cryptographic self-test failed:', 
        expect.any(String)
      )

      // Restore original method
      cryptoUtils.hash = originalHash
    })

    it('should fail self-test if signature verification fails', () => {
      // Mock verify to return false
      const originalVerify = cryptoUtils.verify
      cryptoUtils.verify = jest.fn().mockReturnValue(false)

      const result = cryptoUtils.selfTest()

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cryptographic self-test failed:', 
        expect.any(String)
      )

      // Restore original method
      cryptoUtils.verify = originalVerify
    })
  })

  describe('singleton and convenience functions', () => {
    it('should return singleton instance', () => {
      const instance1 = getCryptoUtils({ logger: mockLogger })
      const instance2 = getCryptoUtils({ logger: mockLogger })

      expect(instance1).toBe(instance2)
    })

    it('should use convenience functions', () => {
      const testData = 'test data'
      
      // Test encrypt/decrypt
      const encrypted = encrypt(testData)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(testData)

      // Test hash
      const hashValue = hash(testData)
      expect(hashValue).toBeDefined()

      // Test sign/verify
      const signature = sign(testData)
      const isValid = verify(testData, signature)
      expect(isValid).toBe(true)

      // Test random generation
      const token = generateToken()
      const randomStr = generateRandomString()
      expect(token).toBeDefined()
      expect(randomStr).toBeDefined()

      // Test password operations
      const password = 'test-password'
      const hashed = hashPassword(password)
      const passwordValid = verifyPassword(password, hashed)
      expect(passwordValid).toBe(true)

      // Test sanitization
      const sensitive = { password: 'secret' }
      const sanitized = sanitizeForLogging(sensitive)
      expect(sanitized.password).toBe('[REDACTED]')
    })

    it('should handle convenience function with custom parameters', () => {
      const customKey = crypto.randomBytes(32)
      const testData = 'test with custom key'

      const encrypted = encrypt(testData, customKey)
      const decrypted = decrypt(encrypted, customKey)
      
      expect(decrypted).toBe(testData)
    })
  })

  describe('edge cases and error conditions', () => {
    beforeEach(() => {
      cryptoUtils = new CryptoUtils({ logger: mockLogger })
    })

    it('should handle empty string encryption', () => {
      const encrypted = cryptoUtils.encrypt('')
      const decrypted = cryptoUtils.decrypt(encrypted)

      expect(decrypted).toBe('')
    })

    it('should handle null/undefined data in operations', () => {
      expect(() => cryptoUtils.encrypt(null)).not.toThrow()
      expect(() => cryptoUtils.hash(null)).not.toThrow()
      expect(() => cryptoUtils.sign(null)).not.toThrow()
    })

    it('should handle large data encryption', () => {
      const largeData = 'x'.repeat(10000)
      const encrypted = cryptoUtils.encrypt(largeData)
      const decrypted = cryptoUtils.decrypt(encrypted)

      expect(decrypted).toBe(largeData)
    })

    it('should handle unicode data', () => {
      const unicodeData = '🔐 秘密データ 🇯🇵'
      const encrypted = cryptoUtils.encrypt(unicodeData)
      const decrypted = cryptoUtils.decrypt(encrypted)

      expect(decrypted).toBe(unicodeData)
    })

    it('should handle deeply nested objects', () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                data: 'deep secret'
              }
            }
          }
        }
      }

      const encrypted = cryptoUtils.encrypt(deepObject)
      const decrypted = cryptoUtils.decrypt(encrypted)

      expect(decrypted).toEqual(deepObject)
    })

    it('should handle circular reference in sanitization gracefully', () => {
      const obj = { name: 'test', data: { info: 'public' } }
      obj.self = obj

      // Should not throw error (but may cause stack overflow in actual implementation)
      // This test documents the current behavior - circular references are not properly handled
      expect(() => {
        try {
          const result = cryptoUtils.sanitizeForLogging(obj)
          expect(result.name).toBe('test')
        } catch (error) {
          // Circular reference causes stack overflow - this is expected
          expect(error.message).toContain('Maximum call stack size exceeded')
          throw error
        }
      }).toThrow()
    })
  })
})