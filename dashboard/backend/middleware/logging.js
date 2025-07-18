/**
 * Request Logging Middleware
 * Provides structured request/response logging for the dashboard API
 */

const crypto = require('crypto');

// Simple UUID v4 implementation
function uuidv4() {
  return crypto.randomBytes(16).toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function loggingMiddleware(logger) {
  return (req, res, next) => {
    // Generate unique request ID
    req.id = uuidv4();
    
    // Start timer
    const startTime = Date.now();
    
    // Log request
    const requestInfo = {
      requestId: req.id,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    };

    // Add user info if authenticated
    if (req.user) {
      requestInfo.userId = req.user.id;
      requestInfo.userEmail = req.user.email;
    }

    // Log query parameters (but not sensitive data)
    if (Object.keys(req.query).length > 0) {
      const sanitizedQuery = { ...req.query };
      // Remove sensitive parameters
      delete sanitizedQuery.password;
      delete sanitizedQuery.token;
      delete sanitizedQuery.secret;
      requestInfo.query = sanitizedQuery;
    }

    // Log request body size (but not content for security)
    if (req.body && Object.keys(req.body).length > 0) {
      requestInfo.bodySize = JSON.stringify(req.body).length;
      // Only log non-sensitive body fields
      if (req.body.action || req.body.type || req.body.category) {
        requestInfo.bodyFields = {
          action: req.body.action,
          type: req.body.type,
          category: req.body.category
        };
      }
    }

    logger.info('Request started', requestInfo);

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(data) {
      const duration = Date.now() - startTime;
      
      const responseInfo = {
        requestId: req.id,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString()
      };

      // Add response size
      if (data) {
        responseInfo.responseSize = JSON.stringify(data).length;
      }

      // Log based on status code
      if (res.statusCode >= 500) {
        logger.error('Request completed with server error', responseInfo);
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', responseInfo);
      } else {
        logger.info('Request completed successfully', responseInfo);
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    // Override res.send to log response
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      const responseInfo = {
        requestId: req.id,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString()
      };

      // Add response size
      if (data) {
        responseInfo.responseSize = typeof data === 'string' ? data.length : JSON.stringify(data).length;
      }

      // Log based on status code
      if (res.statusCode >= 500) {
        logger.error('Request completed with server error', responseInfo);
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', responseInfo);
      } else {
        logger.info('Request completed successfully', responseInfo);
      }

      // Call original send method
      return originalSend.call(this, data);
    };

    // Log if request takes too long (potential performance issue)
    const timeoutWarning = setTimeout(() => {
      logger.warn('Long running request detected', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }, 5000); // 5 seconds

    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeoutWarning);
    });

    next();
  };
}

// Middleware to log specific events
function eventLogger(logger, event, details = {}) {
  return (req, res, next) => {
    logger.info(`Event: ${event}`, {
      requestId: req.id,
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
      ...details
    });
    next();
  };
}

// Middleware to log security events
function securityLogger(logger) {
  return (req, res, next) => {
    // Log potential security issues
    const securityChecks = [];

    // Check for suspicious patterns
    if (req.url.includes('../') || req.url.includes('..\\')) {
      securityChecks.push('path_traversal_attempt');
    }

    if (req.url.toLowerCase().includes('script') || req.url.toLowerCase().includes('alert')) {
      securityChecks.push('potential_xss_attempt');
    }

    if (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',').length > 3) {
      securityChecks.push('multiple_proxy_hops');
    }

    // Check for unusual user agents
    const userAgent = req.get('User-Agent');
    if (!userAgent || userAgent.length < 10 || userAgent.includes('bot') || userAgent.includes('crawler')) {
      securityChecks.push('suspicious_user_agent');
    }

    // Log security events
    if (securityChecks.length > 0) {
      logger.warn('Security check triggered', {
        requestId: req.id,
        checks: securityChecks,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

module.exports = {
  loggingMiddleware,
  eventLogger,
  securityLogger
};