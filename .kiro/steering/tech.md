# Technology Stack & Build System

## Core Technologies
- **Runtime**: Node.js 18+ with npm 8+
- **Language**: JavaScript ES2022 (modern async/await, modules)
- **Workflow Engine**: n8n v1.100.1+ (automation platform)
- **Database**: PostgreSQL 15 (primary data storage)
- **Cache**: Redis 7 (session management, caching)
- **Container**: Docker & Docker Compose

## Key Libraries & Frameworks
- **RSS Processing**: `rss-parser` for feed parsing, `fast-xml-parser` for XML handling
- **Twitter Integration**: `twitter-api-v2` for Twitter API v2 client
- **HTTP Client**: `axios` for API requests
- **Content Processing**: `cheerio` for HTML parsing, `lodash` for utilities
- **Logging**: `winston` for structured logging
- **Validation**: `joi` for data validation
- **Scheduling**: `node-cron` for task scheduling
- **Testing**: Jest with TDD approach, 90%+ coverage requirement

## Development Tools
- **Linting**: ESLint with Standard config, strict rules (max-len: 100, no-console: error)
- **Testing**: Jest with comprehensive unit/integration/performance/security tests
- **Git Hooks**: Husky with lint-staged for pre-commit quality checks
- **Environment**: dotenv for configuration management

## Common Commands

### Setup & Deployment
```bash
# One-click complete setup (recommended)
./quick.sh test

# Manual setup
npm run setup:initial
./setup-initial.sh

# Docker deployment
docker-compose up -d
```

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
npm run dev:legacy  # for legacy entry point

# Run tests
npm test
npm run test:watch
npm run test:coverage
npm run test:unit
npm run test:integration
```

### Code Quality
```bash
# Linting
npm run lint
npm run lint:fix

# Full test suite
npm run test:unit
npm run test:integration
npm run test:performance
npm run test:security
```

### Operations
```bash
# Service management
./quick.sh start    # Start services
./quick.sh stop     # Stop services
./quick.sh restart  # Restart services
./quick.sh status   # Check status

# Monitoring
./quick.sh logs     # View logs
npm run health-check

# Data management
./quick.sh backup   # Backup workflows
./quick.sh reset    # Complete reset
./quick.sh clean    # Clean temp files
```

### n8n Specific
```bash
# n8n operations
npm run n8n         # Start n8n with auth
npm run start:n8n   # Start n8n service
npm run open-n8n    # Open n8n dashboard
./quick.sh open     # Open in browser
```

## Build & Deployment
- **No build step required** - Pure Node.js runtime
- **Docker-first deployment** with multi-service orchestration
- **Environment-based configuration** via .env files
- **Automated workflow import** and activation via n8n API
- **Health checks** and monitoring built-in

## Architecture Patterns
- **Modular design** with clear separation of concerns
- **Event-driven architecture** with n8n workflow orchestration
- **Microservices approach** with Docker containers
- **Configuration-driven** behavior via JSON config files
- **Error-first callbacks** and comprehensive error handling
- **Async/await** patterns throughout codebase