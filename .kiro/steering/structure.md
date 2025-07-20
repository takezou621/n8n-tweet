# Project Structure & Organization

## Directory Layout

```
n8n-tweet/
├── src/                          # Main application source code
│   ├── utils/                    # Utility modules (logger, feed-parser, etc.)
│   ├── filters/                  # Content filtering logic
│   ├── generators/               # Tweet generation logic
│   ├── integrations/             # External API integrations (Twitter, etc.)
│   ├── services/                 # Business services (cache, backup, etc.)
│   ├── storage/                  # Data persistence layer
│   ├── monitoring/               # Health checks and metrics
│   ├── main.js                   # Main application entry point
│   └── index.js                  # Legacy/core bot implementation
├── config/                       # Configuration files
│   ├── default.json              # Default configuration
│   ├── production.json           # Production overrides
│   ├── rss-feeds.json           # RSS feed definitions
│   ├── keywords.json            # AI keyword definitions
│   └── tweet-templates.json     # Tweet generation templates
├── tests/                        # Test suites
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── performance/              # Performance tests
│   ├── security/                 # Security tests
│   └── setup.js                  # Jest global setup
├── workflows/                    # n8n workflow definitions
├── scripts/                      # Automation and deployment scripts
├── docs/                         # Documentation
├── logs/                         # Application logs
├── cache/                        # Runtime cache files
└── backups/                      # Workflow backups
```

## Architecture Patterns

### Modular Design
- **Single Responsibility**: Each module handles one specific concern
- **Dependency Injection**: Configuration passed to constructors
- **Interface Consistency**: All modules follow similar patterns (constructor, methods, error handling)

### Error Handling Strategy
- **Graceful Degradation**: System continues operating when non-critical components fail
- **Structured Logging**: All errors logged with context and metadata
- **Retry Logic**: Automatic retry for transient failures with exponential backoff
- **Health Checks**: Regular monitoring of all system components

### Configuration Management
- **Environment Variables**: All secrets and environment-specific values
- **JSON Configuration**: Static configuration in versioned files
- **Hierarchical Config**: Default → environment-specific → runtime overrides
- **Validation**: All configuration validated at startup

## Code Organization Conventions

### File Naming
- **kebab-case**: For file and directory names (`content-filter.js`)
- **PascalCase**: For class names (`ContentFilter`)
- **camelCase**: For variables and functions (`generateTweet`)
- **UPPER_CASE**: For constants and environment variables

### Module Structure
```javascript
// Standard module pattern
class ModuleName {
  constructor(config = {}) {
    this.config = { ...defaults, ...config }
    this.logger = createLogger('module-name')
  }

  async mainMethod() {
    try {
      // Implementation
    } catch (error) {
      this.logger.error('Operation failed', { error: error.message })
      throw error
    }
  }
}

module.exports = ModuleName
```

### Test Organization
- **Mirror Source Structure**: Test files mirror `src/` directory structure
- **Descriptive Names**: Test files end with `.test.js`
- **Setup/Teardown**: Use `beforeEach`/`afterEach` for test isolation
- **Mock Strategy**: Mock external dependencies, test business logic

## Data Flow Architecture

### RSS Processing Pipeline
1. **Feed Parser** (`src/utils/feed-parser.js`) - RSS collection
2. **Content Filter** (`src/filters/content-filter.js`) - AI relevance scoring
3. **Duplicate Checker** (`src/filters/duplicate-checker.js`) - Deduplication
4. **Tweet Generator** (`src/generators/tweet-generator.js`) - Content creation
5. **Twitter Client** (`src/integrations/twitter-client.js`) - Publishing

### Service Layer
- **Cache Service** - Redis-based caching for performance
- **Backup Service** - Automated workflow backup/restore
- **Alerting Service** - Error notifications and monitoring alerts
- **Webhook Server** - External integration endpoints
- **Scheduler** - Cron-based task scheduling

### Storage Strategy
- **Tweet History** - JSON-based local storage with rotation
- **RSS Cache** - In-memory caching with TTL
- **Configuration** - File-based with environment variable injection
- **Logs** - Structured logging with rotation and retention