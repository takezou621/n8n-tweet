# Technology Stack & Build System

## Core Technologies
- **Runtime**: Node.js 18+ with ES2022 features
- **Workflow Engine**: n8n v1.100.1+ for automation workflows
- **Database**: PostgreSQL (via Docker) for n8n data persistence
- **Cache**: Redis for session management and caching
- **API Integration**: Twitter API v2, RSS/XML parsing
- **Testing**: Jest with TDD approach, 85%+ coverage requirement
- **Code Quality**: ESLint with Standard config, Prettier formatting

## Infrastructure & Deployment
- **Containerization**: Docker Compose with multi-service setup
- **Services**: n8n, PostgreSQL, Redis, optional Node.js app service
- **Environment**: Production-ready with environment variable configuration
- **Monitoring**: Winston logging, structured JSON logs, health checks
- **Backup**: Automated workflow backup/restore scripts

## Key Dependencies
```json
{
  "core": ["n8n", "express", "winston", "dotenv"],
  "apis": ["twitter-api-v2", "rss-parser", "axios", "cheerio"],
  "data": ["redis", "fast-xml-parser", "lodash", "moment"],
  "testing": ["jest", "@jest/globals", "supertest"],
  "quality": ["eslint", "eslint-config-standard", "husky", "lint-staged"]
}
```

## Common Commands

### Development
```bash
npm run dev          # Start with nodemon
npm run start        # Production start
npm test             # Run all tests
npm run test:watch   # Watch mode testing
npm run test:coverage # Coverage report
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix linting issues
```

### Deployment & Operations
```bash
./quick.sh test      # Complete automated setup
./quick.sh start     # Start all services
./quick.sh stop      # Stop all services
./quick.sh status    # Check service status
./quick.sh logs      # View real-time logs
./quick.sh backup    # Backup workflows
./quick.sh reset     # Complete environment reset
```

### n8n Specific
```bash
npm run n8n          # Start n8n with basic auth
npm run open-n8n     # Open n8n dashboard
npm run setup-n8n    # Auto-setup n8n workflows
```

## Build & Test Standards
- **TDD Approach**: Red → Green → Refactor cycle
- **Coverage**: Minimum 85% test coverage required
- **Code Style**: ESLint Standard config, max 100 chars per line
- **Error Handling**: All async operations must have proper error handling
- **Logging**: Use Winston logger, no console.log in production code
- **Environment**: All secrets via environment variables, never hardcoded