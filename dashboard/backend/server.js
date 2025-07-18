#!/usr/bin/env node

/**
 * Intelligent Content Dashboard Backend Server
 * Express.js server with comprehensive middleware setup
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const winston = require('winston');
require('dotenv').config();

// Import middleware and routes
const { errorHandler } = require('./middleware/error-handler');
const { authMiddleware } = require('./middleware/auth');
const { loggingMiddleware } = require('./middleware/logging');

// Import route handlers
const authRoutes = require('./routes/auth');
const queueRoutes = require('./routes/queue');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const templatesRoutes = require('./routes/templates');
const systemRoutes = require('./routes/system');

class DashboardServer {
  constructor() {
    this.app = express();
    this.port = process.env.DASHBOARD_PORT || 3001;
    this.logger = this.setupLogger();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupLogger() {
    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'dashboard-backend' },
      transports: [
        new winston.transports.File({ 
          filename: path.join(__dirname, '../../logs/dashboard-error.log'), 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: path.join(__dirname, '../../logs/dashboard.log') 
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(loggingMiddleware(this.logger));

    // Health check endpoint (before auth middleware)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      });
    });

    // Static file serving for uploaded content
    this.app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  }

  setupRoutes() {
    // API routes with authentication
    this.app.use('/api/auth', authRoutes);
    
    // Protected routes (require authentication)
    this.app.use('/api/queue', authMiddleware, queueRoutes);
    this.app.use('/api/analytics', authMiddleware, analyticsRoutes);
    this.app.use('/api/settings', authMiddleware, settingsRoutes);
    this.app.use('/api/templates', authMiddleware, templatesRoutes);
    this.app.use('/api/system', authMiddleware, systemRoutes);

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Intelligent Content Dashboard API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Backend API for the n8n-tweet content dashboard',
        endpoints: {
          auth: '/api/auth',
          queue: '/api/queue',
          analytics: '/api/analytics',
          settings: '/api/settings',
          templates: '/api/templates',
          system: '/api/system'
        },
        documentation: 'See README.md for full API documentation'
      });
    });

    // Catch-all route for frontend (if serving React app)
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../frontend/build')));
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
      });
    }

    // 404 handler for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
      });
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use(errorHandler(this.logger));

    // Graceful shutdown handlers
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      this.gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  async gracefulShutdown(signal) {
    this.logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    if (this.server) {
      this.server.close(() => {
        this.logger.info('HTTP server closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }

  async start() {
    try {
      this.server = this.app.listen(this.port, () => {
        this.logger.info(`🚀 Dashboard server running on port ${this.port}`);
        this.logger.info(`📊 Dashboard API: http://localhost:${this.port}/api`);
        this.logger.info(`❤️  Health check: http://localhost:${this.port}/health`);
        
        if (process.env.NODE_ENV !== 'production') {
          this.logger.info(`🛠️  Environment: ${process.env.NODE_ENV || 'development'}`);
        }
      });

      // Handle server errors
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.error(`Port ${this.port} is already in use`);
          process.exit(1);
        } else {
          this.logger.error('Server error:', error);
        }
      });

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new DashboardServer();
  server.start();
}

module.exports = DashboardServer;