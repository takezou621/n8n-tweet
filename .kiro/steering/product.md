# Product Overview

## n8n-tweet: AI Information Collection & Distribution System

This is a fully automated AI information collection and distribution system that monitors RSS feeds for AI-related content and automatically posts curated tweets to Twitter/X.

### Core Functionality
- **RSS Feed Monitoring**: Automatically collects content from multiple AI-related RSS feeds (ArXiv AI, OpenAI Blog, Google AI Blog, etc.)
- **Content Filtering**: Uses AI-related keywords to filter and score content relevance
- **Tweet Generation**: Automatically generates optimized 280-character tweets with hashtags
- **Twitter Integration**: Posts tweets via Twitter API v2 with rate limiting and duplicate detection
- **Workflow Automation**: Runs on n8n platform with scheduled execution (6 AM, 12 PM, 6 PM daily)

### Key Features
- One-click setup and deployment via `./quick.sh test`
- Complete workflow automation with n8n v1.100.1+
- Docker-based infrastructure (PostgreSQL + Redis + n8n)
- Comprehensive monitoring and health checking
- Tweet history management with duplicate prevention
- TDD development approach with 90%+ test coverage

### Target Users
- AI researchers and enthusiasts who want automated content curation
- Social media managers focusing on AI content
- Developers interested in RSS-to-social-media automation
- Organizations wanting to maintain an active AI-focused Twitter presence

### Business Value
- Saves hours of manual content curation daily
- Maintains consistent social media presence
- Provides high-quality, relevant AI content automatically
- Scales to handle multiple RSS sources and social platforms