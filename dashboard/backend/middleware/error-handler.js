/**
 * Global Error Handling Middleware
 * Provides comprehensive error handling for the dashboard API
 */

class APIError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends APIError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends APIError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends APIError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends APIError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends APIError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends APIError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

function errorHandler(logger) {
  return (error, req, res, next) => {
    // Log the error
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    };

    if (error.statusCode >= 500) {
      logger.error('Server Error:', errorInfo);
    } else {
      logger.warn('Client Error:', errorInfo);
    }

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

    // Handle different types of errors
    let statusCode = 500;
    let message = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';
    let details = null;

    if (error instanceof APIError) {
      statusCode = error.statusCode;
      message = error.message;
      code = error.code;
      if (error instanceof ValidationError) {
        details = error.details;
      }
    } else if (error.name === 'ValidationError') {
      // Joi validation error
      statusCode = 400;
      message = 'Validation Error';
      code = 'VALIDATION_ERROR';
      details = error.details?.map(detail => ({
        field: detail.path?.join('.'),
        message: detail.message
      }));
    } else if (error.name === 'JsonWebTokenError') {
      statusCode = 401;
      message = 'Invalid token';
      code = 'INVALID_TOKEN';
    } else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Token expired';
      code = 'TOKEN_EXPIRED';
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
      message = 'Service temporarily unavailable';
      code = 'SERVICE_UNAVAILABLE';
    } else if (error.code === '23505') {
      // PostgreSQL unique violation
      statusCode = 409;
      message = 'Resource already exists';
      code = 'DUPLICATE_RESOURCE';
    } else if (error.code === '23503') {
      // PostgreSQL foreign key violation
      statusCode = 400;
      message = 'Invalid reference';
      code = 'INVALID_REFERENCE';
    } else if (error.code === '23502') {
      // PostgreSQL not null violation
      statusCode = 400;
      message = 'Required field missing';
      code = 'MISSING_REQUIRED_FIELD';
    }

    // Prepare error response
    const errorResponse = {
      error: {
        message,
        code,
        timestamp: new Date().toISOString(),
        requestId: req.id || req.headers['x-request-id']
      }
    };

    // Add details for validation errors
    if (details) {
      errorResponse.error.details = details;
    }

    // Add stack trace in development
    if (isDevelopment && error.stack) {
      errorResponse.error.stack = error.stack;
    }

    // Add error context in development
    if (isDevelopment) {
      errorResponse.error.context = {
        url: req.url,
        method: req.method,
        params: req.params,
        query: req.query,
        body: req.body
      };
    }

    res.status(statusCode).json(errorResponse);
  };
}

// Async error wrapper for route handlers
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Create error instances
function createError(message, statusCode = 500, code = null) {
  return new APIError(message, statusCode, code);
}

function createValidationError(message, details = []) {
  return new ValidationError(message, details);
}

function createAuthenticationError(message) {
  return new AuthenticationError(message);
}

function createAuthorizationError(message) {
  return new AuthorizationError(message);
}

function createNotFoundError(message) {
  return new NotFoundError(message);
}

function createConflictError(message) {
  return new ConflictError(message);
}

function createRateLimitError(message) {
  return new RateLimitError(message);
}

module.exports = {
  errorHandler,
  asyncHandler,
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  createError,
  createValidationError,
  createAuthenticationError,
  createAuthorizationError,
  createNotFoundError,
  createConflictError,
  createRateLimitError
};