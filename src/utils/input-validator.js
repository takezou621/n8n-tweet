/**
 * 入力値検証ユーティリティ
 * セキュアな入力値検証、サニタイズ、型変換機能を提供
 */

const crypto = require('crypto')
const url = require('url')
const validator = require('validator')

/**
 * 検証ルールの定義
 */
const VALIDATION_RULES = {
  // 基本型
  string: {
    type: 'string',
    minLength: 0,
    maxLength: 1000,
    allowEmpty: true,
    trim: true,
    sanitize: true
  },

  number: {
    type: 'number',
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
    integer: false
  },

  boolean: {
    type: 'boolean'
  },

  email: {
    type: 'email',
    normalize: true
  },

  url: {
    type: 'url',
    protocols: ['http', 'https'],
    requireProtocol: true
  },

  // RSS関連
  rssUrl: {
    type: 'url',
    protocols: ['http', 'https'],
    requireProtocol: true,
    allowLocalhost: false,
    allowPrivateIP: false
  },

  // Twitter関連
  tweetText: {
    type: 'string',
    minLength: 1,
    maxLength: 280,
    allowEmpty: false,
    sanitize: true,
    stripHtml: true
  },

  hashtag: {
    type: 'string',
    pattern: /^#[a-zA-Z0-9_]+$/,
    maxLength: 100
  },

  // ファイルパス
  filepath: {
    type: 'string',
    maxLength: 500,
    sanitize: true,
    allowTraversal: false
  },

  // APIキー
  apiKey: {
    type: 'string',
    minLength: 20,
    maxLength: 200,
    pattern: /^[a-zA-Z0-9_-]+$/,
    sanitize: false
  },

  // JSON
  json: {
    type: 'json',
    maxDepth: 10,
    maxKeys: 100
  }
}

/**
 * 危険なパターンの定義
 */
const DANGEROUS_PATTERNS = {
  xss: [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload=/gi,
    /onerror=/gi,
    /onclick=/gi,
    /onmouseover=/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>.*?<\/embed>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi
  ],

  pathTraversal: [
    /\.\./g,
    /\.\/\./g,
    /\\\.\./g,
    /\.\.\\\\/g,
    /%2e%2e/gi,
    /%2f/gi,
    /%5c/gi
  ],

  sqlInjection: [
    /union.*select/gi,
    /insert.*into/gi,
    /delete.*from/gi,
    /update.*set/gi,
    /drop.*table/gi,
    /create.*table/gi,
    /alter.*table/gi,
    /exec.*sp_/gi,
    /execute.*sp_/gi
  ],

  commandInjection: [
    /;\s*(rm|del|format)/gi,
    /\|\s*(rm|del|format)/gi,
    /&&\s*(rm|del|format)/gi,
    /`[^`]*`/g,
    /\$\([^)]*\)/g
  ],

  ldapInjection: [
    /\*\)/g,
    /\(\*/g,
    /\|\(/g,
    /&\(/g
  ]
}

/**
 * プライベートIPアドレスの範囲
 */
const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/
]

/**
 * 入力値検証クラス
 */
class InputValidator {
  constructor (options = {}) {
    this.customRules = options.customRules || {}
    this.enableSanitization = options.enableSanitization !== false
    this.enableXSSProtection = options.enableXSSProtection !== false
    this.enableSQLInjectionProtection = options.enableSQLInjectionProtection !== false
    this.logger = options.logger || console
  }

  /**
   * 入力値を検証
   */
  async validate (input, schema) {
    try {
      const result = {
        isValid: true,
        errors: [],
        sanitized: {},
        warnings: []
      }

      if (typeof schema !== 'object' || schema === null) {
        throw new Error('Schema must be an object')
      }

      for (const [key, rule] of Object.entries(schema)) {
        const value = input[key]
        const validationResult = await this.validateField(key, value, rule)

        if (!validationResult.isValid) {
          result.isValid = false
          result.errors.push(...validationResult.errors)
        }

        if (validationResult.warnings.length > 0) {
          result.warnings.push(...validationResult.warnings)
        }

        if (validationResult.hasOwnProperty('sanitized')) {
          result.sanitized[key] = validationResult.sanitized
        }
      }

      return result
    } catch (error) {
      this.logger.error('Validation error:', error.message)
      return {
        isValid: false,
        errors: [`Validation system error: ${error.message}`],
        sanitized: {},
        warnings: []
      }
    }
  }

  /**
   * 単一フィールドの検証
   */
  async validateField (fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: value
    }

    // ルールの正規化
    const normalizedRule = this.normalizeRule(rule)

    // 必須チェック
    if (normalizedRule.required && (value === undefined || value === null)) {
      result.isValid = false
      result.errors.push(`${fieldName} is required`)
      return result
    }

    // 値が存在しない場合のデフォルト値
    if (value === undefined || value === null) {
      if (normalizedRule.default !== undefined) {
        result.sanitized = normalizedRule.default
      }
      return result
    }

    // 型別検証
    switch (normalizedRule.type) {
      case 'string':
        return await this.validateString(fieldName, value, normalizedRule)
      case 'number':
        return await this.validateNumber(fieldName, value, normalizedRule)
      case 'boolean':
        return await this.validateBoolean(fieldName, value, normalizedRule)
      case 'email':
        return await this.validateEmail(fieldName, value, normalizedRule)
      case 'url':
        return await this.validateUrl(fieldName, value, normalizedRule)
      case 'json':
        return await this.validateJson(fieldName, value, normalizedRule)
      case 'array':
        return await this.validateArray(fieldName, value, normalizedRule)
      case 'object':
        return await this.validateObject(fieldName, value, normalizedRule)
      default:
        result.isValid = false
        result.errors.push(`Unknown validation type: ${normalizedRule.type}`)
        return result
    }
  }

  /**
   * ルールの正規化
   */
  normalizeRule (rule) {
    if (typeof rule === 'string') {
      return VALIDATION_RULES[rule] || { type: rule }
    }

    if (typeof rule === 'object') {
      const baseRule = rule.extends ? VALIDATION_RULES[rule.extends] : {}
      return { ...baseRule, ...rule }
    }

    return { type: 'string' }
  }

  /**
   * 文字列検証
   */
  async validateString (fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: value
    }

    // 型変換
    if (typeof value !== 'string') {
      if (value === null || value === undefined) {
        result.sanitized = ''
      } else {
        result.sanitized = String(value)
      }
    }

    let sanitizedValue = result.sanitized

    // トリム
    if (rule.trim) {
      sanitizedValue = sanitizedValue.trim()
    }

    // 長さチェック
    if (rule.minLength !== undefined && sanitizedValue.length < rule.minLength) {
      result.isValid = false
      result.errors.push(`${fieldName} must be at least ${rule.minLength} characters`)
    }

    if (rule.maxLength !== undefined && sanitizedValue.length > rule.maxLength) {
      result.isValid = false
      result.errors.push(`${fieldName} must be at most ${rule.maxLength} characters`)
    }

    // 空文字チェック
    if (!rule.allowEmpty && sanitizedValue === '') {
      result.isValid = false
      result.errors.push(`${fieldName} cannot be empty`)
    }

    // パターンマッチング
    if (rule.pattern && !rule.pattern.test(sanitizedValue)) {
      result.isValid = false
      result.errors.push(`${fieldName} format is invalid`)
    }

    // サニタイゼーション
    if (rule.sanitize && this.enableSanitization) {
      sanitizedValue = this.sanitizeString(sanitizedValue, rule)
    }

    // XSS防止
    if (this.enableXSSProtection) {
      const xssResult = this.detectXSS(sanitizedValue)
      if (xssResult.detected) {
        if (rule.strictXSS) {
          result.isValid = false
          result.errors.push(`${fieldName} contains potentially malicious content`)
        } else {
          sanitizedValue = xssResult.sanitized
          result.warnings.push(`${fieldName} contained potentially unsafe content that was sanitized`)
        }
      }
    }

    // SQLインジェクション防止
    if (this.enableSQLInjectionProtection) {
      const sqlResult = this.detectSQLInjection(sanitizedValue)
      if (sqlResult.detected) {
        result.isValid = false
        result.errors.push(`${fieldName} contains potentially malicious SQL patterns`)
      }
    }

    // パストラバーサル防止
    if (rule.type === 'filepath' && !rule.allowTraversal) {
      const pathResult = this.detectPathTraversal(sanitizedValue)
      if (pathResult.detected) {
        result.isValid = false
        result.errors.push(`${fieldName} contains path traversal attempts`)
      }
    }

    result.sanitized = sanitizedValue
    return result
  }

  /**
   * 数値検証
   */
  async validateNumber (fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: value
    }

    // 型変換
    if (typeof value === 'string') {
      const parsed = rule.integer ? parseInt(value, 10) : parseFloat(value)
      if (isNaN(parsed)) {
        result.isValid = false
        result.errors.push(`${fieldName} must be a valid number`)
        return result
      }
      result.sanitized = parsed
    } else if (typeof value !== 'number') {
      result.isValid = false
      result.errors.push(`${fieldName} must be a number`)
      return result
    }

    const numValue = result.sanitized

    // 範囲チェック
    if (rule.min !== undefined && numValue < rule.min) {
      result.isValid = false
      result.errors.push(`${fieldName} must be at least ${rule.min}`)
    }

    if (rule.max !== undefined && numValue > rule.max) {
      result.isValid = false
      result.errors.push(`${fieldName} must be at most ${rule.max}`)
    }

    // 整数チェック
    if (rule.integer && !Number.isInteger(numValue)) {
      result.isValid = false
      result.errors.push(`${fieldName} must be an integer`)
    }

    return result
  }

  /**
   * ブール値検証
   */
  async validateBoolean (fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: value
    }

    if (typeof value === 'boolean') {
      return result
    }

    // 文字列からブール値への変換
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim()
      if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
        result.sanitized = true
      } else if (['false', '0', 'no', 'off'].includes(lowerValue)) {
        result.sanitized = false
      } else {
        result.isValid = false
        result.errors.push(`${fieldName} must be a valid boolean value`)
      }
      return result
    }

    // 数値からブール値への変換
    if (typeof value === 'number') {
      result.sanitized = Boolean(value)
      return result
    }

    result.isValid = false
    result.errors.push(`${fieldName} must be a boolean`)
    return result
  }

  /**
   * メールアドレス検証
   */
  async validateEmail (fieldName, value, rule) {
    const stringResult = await this.validateString(fieldName, value, { ...rule, type: 'string' })

    if (!stringResult.isValid) {
      return stringResult
    }

    const email = stringResult.sanitized

    if (!validator.isEmail(email)) {
      stringResult.isValid = false
      stringResult.errors.push(`${fieldName} must be a valid email address`)
    } else if (rule.normalize) {
      stringResult.sanitized = validator.normalizeEmail(email)
    }

    return stringResult
  }

  /**
   * URL検証
   */
  async validateUrl (fieldName, value, rule) {
    const stringResult = await this.validateString(fieldName, value, { ...rule, type: 'string' })

    if (!stringResult.isValid) {
      return stringResult
    }

    const urlString = stringResult.sanitized

    try {
      const parsedUrl = new URL(urlString)

      // プロトコルチェック
      if (rule.protocols && !rule.protocols.includes(parsedUrl.protocol.slice(0, -1))) {
        stringResult.isValid = false
        stringResult.errors.push(`${fieldName} must use one of these protocols: ${rule.protocols.join(', ')}`)
        return stringResult
      }

      // ローカルホストチェック
      if (!rule.allowLocalhost && (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1')) {
        stringResult.isValid = false
        stringResult.errors.push(`${fieldName} cannot reference localhost`)
        return stringResult
      }

      // プライベートIPチェック
      if (!rule.allowPrivateIP && this.isPrivateIP(parsedUrl.hostname)) {
        stringResult.isValid = false
        stringResult.errors.push(`${fieldName} cannot reference private IP addresses`)
        return stringResult
      }

      // ポートチェック
      if (rule.allowedPorts && parsedUrl.port && !rule.allowedPorts.includes(parseInt(parsedUrl.port))) {
        stringResult.isValid = false
        stringResult.errors.push(`${fieldName} uses an unauthorized port`)
        return stringResult
      }
    } catch (error) {
      stringResult.isValid = false
      stringResult.errors.push(`${fieldName} must be a valid URL`)
    }

    return stringResult
  }

  /**
   * JSON検証
   */
  async validateJson (fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: value
    }

    let jsonData = value

    // 文字列からJSONへの変換
    if (typeof value === 'string') {
      try {
        jsonData = JSON.parse(value)
      } catch (error) {
        result.isValid = false
        result.errors.push(`${fieldName} must be valid JSON`)
        return result
      }
    }

    // 深度チェック
    if (rule.maxDepth && this.getObjectDepth(jsonData) > rule.maxDepth) {
      result.isValid = false
      result.errors.push(`${fieldName} JSON structure too deep (max: ${rule.maxDepth})`)
    }

    // キー数チェック
    if (rule.maxKeys && this.countObjectKeys(jsonData) > rule.maxKeys) {
      result.isValid = false
      result.errors.push(`${fieldName} has too many keys (max: ${rule.maxKeys})`)
    }

    result.sanitized = jsonData
    return result
  }

  /**
   * 配列検証
   */
  async validateArray (fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: value
    }

    if (!Array.isArray(value)) {
      result.isValid = false
      result.errors.push(`${fieldName} must be an array`)
      return result
    }

    // 長さチェック
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      result.isValid = false
      result.errors.push(`${fieldName} must have at least ${rule.minLength} items`)
    }

    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      result.isValid = false
      result.errors.push(`${fieldName} must have at most ${rule.maxLength} items`)
    }

    // 要素の検証
    if (rule.items) {
      const sanitizedItems = []
      for (let i = 0; i < value.length; i++) {
        const itemResult = await this.validateField(`${fieldName}[${i}]`, value[i], rule.items)
        if (!itemResult.isValid) {
          result.isValid = false
          result.errors.push(...itemResult.errors)
        }
        sanitizedItems.push(itemResult.sanitized)
        result.warnings.push(...itemResult.warnings)
      }
      result.sanitized = sanitizedItems
    }

    return result
  }

  /**
   * オブジェクト検証
   */
  async validateObject (fieldName, value, rule) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitized: {}
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      result.isValid = false
      result.errors.push(`${fieldName} must be an object`)
      return result
    }

    // プロパティの検証
    if (rule.properties) {
      for (const [propName, propRule] of Object.entries(rule.properties)) {
        const propResult = await this.validateField(`${fieldName}.${propName}`, value[propName], propRule)
        if (!propResult.isValid) {
          result.isValid = false
          result.errors.push(...propResult.errors)
        }
        result.sanitized[propName] = propResult.sanitized
        result.warnings.push(...propResult.warnings)
      }
    }

    return result
  }

  /**
   * 文字列サニタイゼーション
   */
  sanitizeString (value, rule) {
    let sanitized = value

    // HTMLタグの除去
    if (rule.stripHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '')
    }

    // HTMLエンティティのエスケープ
    if (rule.escapeHtml) {
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    // 制御文字の除去
    if (rule.removeControlChars) {
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '')
    }

    return sanitized
  }

  /**
   * XSS検出とサニタイゼーション
   */
  detectXSS (value) {
    const detected = DANGEROUS_PATTERNS.xss.some(pattern => pattern.test(value))

    let sanitized = value
    if (detected) {
      DANGEROUS_PATTERNS.xss.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '')
      })
    }

    return { detected, sanitized }
  }

  /**
   * SQLインジェクション検出
   */
  detectSQLInjection (value) {
    const detected = DANGEROUS_PATTERNS.sqlInjection.some(pattern => pattern.test(value))
    return { detected }
  }

  /**
   * パストラバーサル検出
   */
  detectPathTraversal (value) {
    const detected = DANGEROUS_PATTERNS.pathTraversal.some(pattern => pattern.test(value))
    return { detected }
  }

  /**
   * プライベートIPアドレスチェック
   */
  isPrivateIP (hostname) {
    return PRIVATE_IP_RANGES.some(range => range.test(hostname))
  }

  /**
   * オブジェクトの深度計算
   */
  getObjectDepth (obj, depth = 0) {
    if (depth > 50) return depth // 無限再帰防止

    if (typeof obj !== 'object' || obj === null) return depth

    if (Array.isArray(obj)) {
      return Math.max(depth, ...obj.map(item => this.getObjectDepth(item, depth + 1)))
    }

    const depths = Object.values(obj).map(value => this.getObjectDepth(value, depth + 1))
    return depths.length > 0 ? Math.max(...depths) : depth
  }

  /**
   * オブジェクトのキー数計算
   */
  countObjectKeys (obj, count = 0) {
    if (count > 10000) return count // 過度に大きなオブジェクト防止

    if (typeof obj !== 'object' || obj === null) return count

    let totalKeys = count + Object.keys(obj).length

    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        totalKeys += this.countObjectKeys(value, 0)
      }
    }

    return totalKeys
  }
}

// シングルトンインスタンス
let instance = null

/**
 * InputValidatorのシングルトンインスタンスを取得
 */
function getInputValidator (options = {}) {
  if (!instance) {
    instance = new InputValidator(options)
  }
  return instance
}

/**
 * 便利な検証関数
 */
async function validateInput (input, schema, options = {}) {
  const validator = getInputValidator(options)
  return await validator.validate(input, schema)
}

/**
 * 単一フィールド検証
 */
async function validateField (fieldName, value, rule, options = {}) {
  const validator = getInputValidator(options)
  return await validator.validateField(fieldName, value, rule)
}

/**
 * XSS検出
 */
function detectXSS (value) {
  const validator = getInputValidator()
  return validator.detectXSS(value)
}

/**
 * SQLインジェクション検出
 */
function detectSQLInjection (value) {
  const validator = getInputValidator()
  return validator.detectSQLInjection(value)
}

module.exports = {
  InputValidator,
  getInputValidator,
  validateInput,
  validateField,
  detectXSS,
  detectSQLInjection,
  VALIDATION_RULES,
  DANGEROUS_PATTERNS
}
