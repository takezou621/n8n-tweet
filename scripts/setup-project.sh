#!/bin/bash

# n8n-tweet Project Setup Script
# Run this script after cloning the repository

set -e

echo "🚀 Starting n8n-tweet project setup..."

# Check Node.js version
echo "📋 Checking Node.js version..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Check npm version
echo "📋 Checking npm version..."
npm_version=$(npm -v | cut -d'.' -f1)
if [ "$npm_version" -lt 8 ]; then
    echo "❌ npm 8+ is required. Current version: $(npm -v)"
    exit 1
fi
echo "✅ npm version: $(npm -v)"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Setup environment file
echo "🔧 Setting up environment configuration..."
if [ ! -f .env ]; then
    cp config/template.env .env
    echo "✅ Created .env file from template"
    echo "⚠️  Please edit .env file and add your API credentials"
else
    echo "⚠️  .env file already exists, skipping..."
fi

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs
touch logs/.gitkeep

# Create cache directory
echo "📁 Creating cache directory..."
mkdir -p cache
touch cache/.gitkeep

# Create backups directory
echo "📁 Creating backups directory..."
mkdir -p backups
touch backups/.gitkeep

# Run initial tests
echo "🧪 Running initial tests..."
npm test 2>/dev/null || echo "⚠️  Some tests may fail until implementation is complete"

# Check linting
echo "🔍 Running code quality check..."
npm run lint 2>/dev/null || echo "⚠️  Linting may fail until implementation is complete"

# Setup git hooks (if husky is installed)
echo "🔧 Setting up git hooks..."
if command -v husky >/dev/null 2>&1; then
    npx husky install
    echo "✅ Git hooks configured"
else
    echo "⚠️  Husky not found, skipping git hooks setup"
fi

# Create initial workflow template
echo "📝 Creating initial n8n workflow template..."
cat > workflows/rss-feed-reader-template.json << 'EOF'
{
  "name": "RSS Feed Reader",
  "nodes": [
    {
      "parameters": {
        "feedUrl": "=https://arxiv.org/rss/cs.AI",
        "options": {
          "timeout": 60000
        }
      },
      "name": "RSS Feed Reader",
      "type": "n8n-nodes-base.rssFeedRead",
      "typeVersion": 1,
      "position": [250, 300]
    }
  ],
  "connections": {},
  "active": false,
  "settings": {
    "saveManualExecutions": true
  },
  "versionId": "1"
}
EOF
echo "✅ Created initial n8n workflow template"

# Generate basic documentation
echo "📚 Generating project documentation..."
cat > docs/getting-started.md << 'EOF'
# Getting Started

## Prerequisites

- Node.js 18+
- npm 8+
- n8n (self-hosted or cloud)
- Twitter API credentials

## Quick Start

1. Clone the repository
2. Run `npm run setup` (this script)
3. Edit `.env` file with your API credentials
4. Run `npm start` to start the application

## Development Workflow

1. Follow TDD approach (Red-Green-Refactor)
2. Write tests first, then implement
3. Ensure 85%+ test coverage
4. Run `npm run lint` before committing

## Issues and Implementation

Start with Issue #3 and follow the implementation order:

1. #3 - Project Setup (current)
2. #4 - RSS Feed Reader
3. #5 - Content Filtering
4. #6 - Tweet Generation
5. #7 - Twitter Integration
6. #8 - Monitoring & Logging
7. #9 - Testing & QA
8. #10 - Deployment

## Support

See the main README.md for detailed documentation.
EOF

echo "📊 Project setup summary:"
echo "  ✅ Dependencies installed"
echo "  ✅ Directory structure created"
echo "  ✅ Configuration files setup"
echo "  ✅ Environment template created"
echo "  ✅ Initial tests configured"
echo "  ✅ Documentation generated"

echo ""
echo "🎉 Setup complete! Next steps:"
echo "  1. Edit .env file with your Twitter API credentials"
echo "  2. Start implementing Issue #4 (RSS Feed Reader)"
echo "  3. Follow TDD approach: write tests first!"
echo ""
echo "📖 Documentation: docs/getting-started.md"
echo "🐛 Issues: https://github.com/takezou621/n8n-tweet/issues"
echo ""
echo "Happy coding! 🚀"
