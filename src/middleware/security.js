/**
 * セキュリティミドルウェア
 * アプリケーション全体のセキュリティ機能を提供
 */

const crypto = require('crypto')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const { getCryptoUtils, sanitizeForLogging } = require('../utils/crypto')
const { validateInput } = require('../utils/input-validator')

/**
 * セキュリティヘッダーミドルウェア
 */
function securityHeaders () {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // n8n requires inline scripts
          "'unsafe-eval'", // n8n requires eval
          'https://cdn.jsdelivr.net',
          'https://unpkg.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'data:'
        ],
        imgSrc: [
          "'self'",
          'data:',
          'https:',
          'http:'
        ],
        connectSrc: [
          "'self'",
          'https://api.twitter.com',
          'https://upload.twitter.com',
          'wss:',
          'ws:'
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        workerSrc: ["'self'"],
        childSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },

    // HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },

    // X-Frame-Options
    frameguard: {
      action: 'deny'
    },

    // X-Content-Type-Options
    noSniff: true,

    // X-XSS-Protection
    xssFilter: true,

    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    // Permissions Policy
    permissionsPolicy: {
      features: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
        magnetometer: [],
        gyroscope: [],
        accelerometer: []
      }
    },

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // DNS Prefetch Control
    dnsPrefetchControl: {
      allow: false
    },

    // Download Options
    ieNoOpen: true,

    // MIME Sniffing Prevention
    noSniff: true,

    // Origin Agent Cluster
    originAgentCluster: true
  })
}

/**
 * CORS設定ミドルウェア
 */
function corsMiddleware (allowedOrigins = []) {
  return (req, res, next) => {
    const origin = req.headers.origin

    // 許可されたオリジンをチェック
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      res.header('Access-Control-Allow-Origin', origin || '*')
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key')
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Max-Age', '86400') // 24 hours

    // Preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    next()
  }
}

/**
 * レート制限ミドルウェア
 */
function createRateLimiter (options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // requests per window
    message = 'Too many requests, please try again later',
    standardHeaders = true,
    legacyHeaders = false,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip,
    onLimitReached = null,
    store = null
  } = options

  return rateLimit({
    windowMs,
    max,
    message: { error: message, retryAfter: Math.ceil(windowMs / 1000) },
    standardHeaders,
    legacyHeaders,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator,
    handler: (req, res, next, options) => {
      if (onLimitReached) {
        onLimitReached(req, res, options)
      }
      res.status(429).json(options.message)
    },
    store
  })
}

/**
 * 入力検証ミドルウェア
 */
function inputValidation (schema) {
  return async (req, res, next) => {
    try {
      // リクエストボディの検証
      if (req.body && Object.keys(req.body).length > 0) {
        const validationResult = await validateInput(req.body, schema.body)
        if (!validationResult.isValid) {
          return res.status(400).json({
            error: 'Invalid input',
            details: validationResult.errors
          })
        }
        req.body = validationResult.sanitized
      }

      // クエリパラメータの検証
      if (req.query && Object.keys(req.query).length > 0) {
        const validationResult = await validateInput(req.query, schema.query)
        if (!validationResult.isValid) {
          return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
          })
        }
        req.query = validationResult.sanitized
      }

      // URLパラメータの検証
      if (req.params && Object.keys(req.params).length > 0) {
        const validationResult = await validateInput(req.params, schema.params)
        if (!validationResult.isValid) {
          return res.status(400).json({
            error: 'Invalid URL parameters',
            details: validationResult.errors
          })
        }
        req.params = validationResult.sanitized
      }

      next()
    } catch (error) {
      res.status(500).json({
        error: 'Input validation failed',
        message: error.message
      })
    }
  }
}

/**
 * 認証ミドルウェア
 */
function authentication (options = {}) {
  const {
    type = 'bearer', // 'bearer', 'basic', 'api-key'
    secret = process.env.AUTH_SECRET,
    headerName = 'authorization',
    tokenPrefix = 'Bearer ',
    validateToken = null,
    logger = console
  } = options

  return async (req, res, next) => {
    try {
      const authHeader = req.headers[headerName.toLowerCase()]

      if (!authHeader) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Missing authentication header'
        })
      }

      let token = null

      if (type === 'bearer') {
        if (!authHeader.startsWith(tokenPrefix)) {
          return res.status(401).json({
            error: 'Invalid authentication format',
            message: `Expected ${tokenPrefix} token`
          })
        }
        token = authHeader.slice(tokenPrefix.length)
      } else if (type === 'basic') {
        if (!authHeader.startsWith('Basic ')) {
          return res.status(401).json({
            error: 'Invalid authentication format',
            message: 'Expected Basic authentication'
          })
        }
        const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8')
        const [username, password] = credentials.split(':')
        token = { username, password }
      } else if (type === 'api-key') {
        token = authHeader
      }

      // カスタム検証関数
      if (validateToken) {
        const validationResult = await validateToken(token, req)
        if (!validationResult.valid) {
          return res.status(401).json({
            error: 'Authentication failed',
            message: validationResult.message || 'Invalid token'
          })
        }
        req.user = validationResult.user
      } else {
        // デフォルト検証（環境変数のシークレットと比較）
        if (type === 'bearer' || type === 'api-key') {
          const crypto = getCryptoUtils()
          if (!secret || !crypto.verify(token, secret)) {
            return res.status(401).json({
              error: 'Authentication failed',
              message: 'Invalid token'
            })
          }
        }
      }

      // 認証成功ログ（機密情報をサニタイズ）
      logger.info('Authentication successful', sanitizeForLogging({
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        endpoint: req.originalUrl,
        method: req.method
      }))

      next()
    } catch (error) {
      logger.error('Authentication error:', error.message)
      res.status(500).json({
        error: 'Authentication system error',
        message: 'Please try again later'
      })
    }
  }
}

/**
 * 認可ミドルウェア
 */
function authorization (requiredPermissions = []) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        })
      }

      const userPermissions = req.user.permissions || []
      const hasPermission = requiredPermissions.every(permission =>
        userPermissions.includes(permission) || userPermissions.includes('*')
      )

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: 'Access denied',
          required: requiredPermissions
        })
      }

      next()
    } catch (error) {
      res.status(500).json({
        error: 'Authorization system error',
        message: 'Please try again later'
      })
    }
  }
}

/**
 * セキュリティログミドルウェア
 */
function securityLogging (logger = console) {
  return (req, res, next) => {
    const startTime = Date.now()

    // セキュリティ関連ヘッダーをログ
    const securityHeaders = {
      userAgent: req.headers['user-agent'],
      xForwardedFor: req.headers['x-forwarded-for'],
      xRealIp: req.headers['x-real-ip'],
      xForwardedProto: req.headers['x-forwarded-proto']
    }

    // 疑わしいリクエストの検出
    const suspiciousPatterns = [
      /\.\./, // Path traversal
      /<script/i, // XSS attempts
      /union.*select/i, // SQL injection
      /javascript:/i, // JavaScript URLs
      /vbscript:/i, // VBScript URLs
      /onload=/i, // Event handlers
      /onerror=/i // Event handlers
    ]

    const isSuspicious = suspiciousPatterns.some(pattern =>
      pattern.test(req.url) ||
      pattern.test(JSON.stringify(req.query)) ||
      pattern.test(JSON.stringify(req.body))
    )

    if (isSuspicious) {
      logger.warn('Suspicious request detected', sanitizeForLogging({
        ip: req.ip,
        method: req.method,
        url: req.url,
        headers: securityHeaders,
        query: req.query,
        body: req.body
      }))
    }

    // レスポンス完了時のログ
    res.on('finish', () => {
      const duration = Date.now() - startTime
      const logLevel = res.statusCode >= 400 ? 'warn' : 'info'

      logger[logLevel]('Request completed', sanitizeForLogging({
        ip: req.ip,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers['user-agent']
      }))
    })

    next()
  }
}

/**
 * Content-Length制限ミドルウェア
 */
function contentLengthLimit (maxSize = 1024 * 1024) { // 1MB default
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'], 10)

    if (contentLength && contentLength > maxSize) {
      return res.status(413).json({
        error: 'Request entity too large',
        message: `Maximum allowed size is ${maxSize} bytes`,
        received: contentLength
      })
    }

    next()
  }
}

/**
 * JSONペイロードサニタイザー
 */
function jsonSanitizer () {
  return (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeJsonObject(req.body)
    }
    next()
  }
}

/**
 * JSONオブジェクトの再帰的サニタイズ
 */
function sanitizeJsonObject (obj, depth = 0) {
  if (depth > 10) return '[MAX_DEPTH_REACHED]' // 無限再帰防止

  if (obj === null || typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeJsonObject(item, depth + 1))
  }

  const sanitized = {}
  for (const [key, value] of Object.entries(obj)) {
    // キー名のサニタイズ
    const cleanKey = key.replace(/[<>'"&]/g, '')

    if (typeof value === 'string') {
      // 基本的なXSS防止
      sanitized[cleanKey] = value
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/on\w+=/gi, 'on_sanitized=')
    } else if (typeof value === 'object') {
      sanitized[cleanKey] = sanitizeJsonObject(value, depth + 1)
    } else {
      sanitized[cleanKey] = value
    }
  }

  return sanitized
}

/**
 * セキュリティミドルウェアファクトリー
 */
function createSecurityMiddleware (options = {}) {
  const {
    enableHeaders = true,
    enableCors = true,
    enableRateLimit = true,
    enableAuth = false,
    enableLogging = true,
    enableContentLimit = true,
    enableJsonSanitizer = true,
    logger = console,
    ...middlewareOptions
  } = options

  const middlewares = []

  if (enableHeaders) {
    middlewares.push(securityHeaders())
  }

  if (enableCors) {
    middlewares.push(corsMiddleware(middlewareOptions.corsOrigins))
  }

  if (enableRateLimit) {
    middlewares.push(createRateLimiter(middlewareOptions.rateLimit))
  }

  if (enableContentLimit) {
    middlewares.push(contentLengthLimit(middlewareOptions.maxContentLength))
  }

  if (enableJsonSanitizer) {
    middlewares.push(jsonSanitizer())
  }

  if (enableLogging) {
    middlewares.push(securityLogging(logger))
  }

  if (enableAuth) {
    middlewares.push(authentication(middlewareOptions.auth))
  }

  return middlewares
}

module.exports = {
  securityHeaders,
  corsMiddleware,
  createRateLimiter,
  inputValidation,
  authentication,
  authorization,
  securityLogging,
  contentLengthLimit,
  jsonSanitizer,
  createSecurityMiddleware,
  sanitizeJsonObject
}
