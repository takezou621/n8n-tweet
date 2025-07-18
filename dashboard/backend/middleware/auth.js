/**
 * JWT Authentication Middleware
 * Provides JWT token validation and user authentication
 */

const jwt = require('jsonwebtoken');
const { createAuthenticationError, createAuthorizationError } = require('./error-handler');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Middleware to verify JWT token
function authMiddleware(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw createAuthenticationError('Authorization header missing');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw createAuthenticationError('Invalid authorization header format');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw createAuthenticationError('Token missing');
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Add user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(createAuthenticationError('Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(createAuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
}

// Middleware to check user permissions
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(createAuthenticationError('Authentication required'));
    }

    if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
      return next(createAuthorizationError(`Permission required: ${permission}`));
    }

    next();
  };
}

// Middleware to check user role
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return next(createAuthenticationError('Authentication required'));
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return next(createAuthorizationError(`Role required: ${role}`));
    }

    next();
  };
}

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(createAuthenticationError('Authentication required'));
  }

  if (req.user.role !== 'admin') {
    return next(createAuthorizationError('Admin access required'));
  }

  next();
}

// Optional authentication (doesn't fail if no token)
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role || 'user',
          permissions: decoded.permissions || []
        };
      }
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }
  
  next();
}

// Generate JWT token
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    permissions: user.permissions || []
  };

  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'n8n-tweet-dashboard',
    audience: 'dashboard-users'
  });
}

// Verify JWT token (utility function)
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw error;
  }
}

// Decode JWT token without verification (utility function)
function decodeToken(token) {
  return jwt.decode(token);
}

// Refresh token middleware
function refreshToken(req, res, next) {
  try {
    if (!req.user) {
      throw createAuthenticationError('Authentication required');
    }

    // Generate new token with updated info
    const newToken = generateToken(req.user);
    
    // Add new token to response headers
    res.setHeader('X-New-Token', newToken);
    
    next();
  } catch (error) {
    next(error);
  }
}

// Check if token is close to expiry
function checkTokenExpiry(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = decodeToken(token);
      
      if (decoded && decoded.exp) {
        const now = Math.floor(Date.now() / 1000);
        const timeToExpiry = decoded.exp - now;
        
        // If token expires in less than 1 hour, add warning header
        if (timeToExpiry < 3600) {
          res.setHeader('X-Token-Warning', 'Token expires soon');
        }
      }
    }
  } catch (error) {
    // Ignore errors in token expiry check
  }
  
  next();
}

module.exports = {
  authMiddleware,
  requirePermission,
  requireRole,
  requireAdmin,
  optionalAuth,
  generateToken,
  verifyToken,
  decodeToken,
  refreshToken,
  checkTokenExpiry,
  JWT_SECRET,
  JWT_EXPIRES_IN
};