# Project Structure & Organization

## Root Level Organization
```
n8n-tweet/
├── quick.sh                    # Main CLI toolkit (12 commands)
├── setup-initial.sh           # Initial setup script
├── package.json               # Dependencies & scripts
├── docker-compose.yml         # Production Docker setup
├── .env / .env.production     # Environment configuration
└── README.md                  # Comprehensive documentation
```

## Source Code Structure (`src/`)
```
src/
├── index.js                   # Main application entry point
├── utils/
│   └── feed-parser.js        # RSS feed parsing utilities
├── filters/
│   ├── content-filter.js     # AI content relevance filtering
│   └── duplicate-checker.js  # Duplicate detection logic
├── generators/
│   └── tweet-generator.js    # Tweet content generation
├── integrations/
│   └── twitter-client.js     # Twitter API v2 client
├── storage/
│   └── tweet-history.js      # Tweet history management
└── monitoring/
    ├── health-checker.js     # System health monitoring
    └── metrics-collector.js  # Performance metrics
```

## Configuration Management (`config/`)
```
config/
├── default.json              # Base configuration
├── production.json           # Production overrides
├── rss-feeds.json           # RSS feed definitions
├── keywords.json            # AI filtering keywords
├── tweet-templates.json     # Tweet generation templates
├── twitter-config.json      # Twitter API settings
└── logging-config.json      # Winston logging setup
```

## Testing Structure (`tests/`)
```
tests/
├── setup.js                 # Jest global configuration
├── unit/                    # Unit tests (isolated components)
├── integration/             # Integration tests (component interaction)
├── performance/             # Performance benchmarks
├── security/                # Security validation tests
└── data/                    # Test fixtures and mock data
```

## Automation & Scripts (`scripts/`)
```
scripts/
├── auto-setup-n8n.js       # Complete n8n automation
├── deploy-n8n.sh           # Deployment automation
├── backup-workflows.sh     # Workflow backup
├── restore-workflows.sh    # Workflow restoration
├── health-check.sh         # System health validation
└── run-tests.sh            # Test execution wrapper
```

## n8n Workflows (`workflows/`)
```
workflows/
├── ai-tweet-rss-workflow.json      # Main production workflow
├── simple-ai-tweet-workflow.json   # Simplified version
└── rss-feed-reader-template.json   # Template for customization
```

## Documentation (`docs/`)
```
docs/
├── beginner-setup-guide.md    # Step-by-step setup for beginners
├── environment-setup.md       # Environment preparation
├── twitter-api-setup.md       # Twitter API configuration
├── deployment-guide.md        # Production deployment
└── api-documentation.md       # API reference
```

## Architecture Principles

### Modular Design
- **Single Responsibility**: Each module handles one specific concern
- **Dependency Injection**: Configuration passed to constructors
- **Interface Consistency**: All modules follow similar patterns (constructor, methods, error handling)

### File Naming Conventions
- **kebab-case** for filenames (`content-filter.js`, `tweet-generator.js`)
- **PascalCase** for class names (`ContentFilter`, `TweetGenerator`)
- **camelCase** for variables and functions
- **UPPER_CASE** for constants and environment variables

### Directory Organization
- **Functional grouping**: Related functionality grouped together (`filters/`, `integrations/`)
- **Layer separation**: Clear separation between data, business logic, and presentation
- **Configuration centralization**: All config files in dedicated `config/` directory
- **Test mirroring**: Test structure mirrors source structure

### Import/Export Patterns
- **CommonJS modules**: Using `require()` and `module.exports`
- **Relative imports**: Use relative paths for local modules
- **Absolute imports**: Use package names for external dependencies
- **Default exports**: Each module exports a single main class/function

### Error Handling Strategy
- **Error-first callbacks**: Follow Node.js conventions
- **Structured logging**: Use Winston with JSON format
- **Graceful degradation**: System continues operating with reduced functionality
- **Comprehensive monitoring**: Health checks and metrics for all components

### Configuration Management
- **Environment-based**: Different configs for dev/test/production
- **JSON-based**: Human-readable configuration files
- **Environment variable substitution**: `${VAR_NAME}` pattern in config files
- **Validation**: Joi schemas for configuration validation

### Testing Organization
- **Test types separation**: Unit, integration, performance, security in separate directories
- **Test data isolation**: Mock data and fixtures in dedicated `data/` directory
- **Setup centralization**: Common test setup in `tests/setup.js`
- **Coverage requirements**: 90%+ coverage maintained across all test types