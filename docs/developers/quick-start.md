# Quick Start Guide

Get up and running with contribux development in under 10 minutes.

## Prerequisites

- Node.js 18+ and pnpm 10.11.1+
- Git configured with SSH keys
- Access to Neon PostgreSQL database

## Setup Process

### 1. Clone and Install

```bash
# Clone the repository
git clone git@github.com:your-org/contribux.git
cd contribux

# Install dependencies (CRITICAL: Use pnpm, not npm)
pnpm install
```

### 2. Environment Configuration

Create your environment file:

```bash
cp .env.example .env.local
```

Configure required environment variables:

```env
# Database URLs (branch-specific)
DATABASE_URL="your-production-db-url"
DATABASE_URL_DEV="your-development-db-url"
DATABASE_URL_TEST="your-testing-db-url"

# OpenAI API
OPENAI_API_KEY="your-openai-api-key"

# GitHub Integration
GITHUB_TOKEN="your-github-token"
```

### 3. Database Setup

Test your database connections:

```bash
# Test all database connections
pnpm db:test-connection
pnpm db:test-dev
pnpm db:test-prod

# Check database health
pnpm db:health
```

### 4. Development Server

Start the development server:

```bash
# Start with Turbo (recommended)
pnpm dev

# Alternative: Standard Next.js dev
pnpm dev:next
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### 5. Verify Setup

Run the test suite to ensure everything is working:

```bash
# Run all tests
pnpm test

# Run specific test categories
pnpm test:db        # Database tests
pnpm test:coverage  # Coverage report
```

## Development Workflow

### Daily Commands

```bash
# Code quality checks (run before commits)
pnpm lint           # Biome linting
pnpm lint:fix       # Auto-fix issues
pnpm format         # Format code
pnpm type-check     # TypeScript validation

# Testing during development
pnpm test:watch     # Watch mode
pnpm test:ui        # Test UI interface
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feat/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push -u origin feat/your-feature-name
```

### Task Management Integration

If using Task Master AI:

```bash
# Initialize task management
pnpm exec task-master init

# View next task
pnpm exec task-master next

# Update task status
pnpm exec task-master set-status --id=1.2 --status=in-progress
```

## Common Issues

### pnpm Not Found

```bash
npm install -g pnpm@10.11.1
```

### Database Connection Issues

```bash
# Verify environment variables
pnpm db:test-connection

# Check database health
pnpm db:health
```

### TypeScript Errors

```bash
# Clear cache and reinstall
pnpm clean
pnpm install
pnpm type-check
```

## Next Steps

1. Read the [Development Standards](./standards/code-quality.md)
2. Explore the [Testing Guide](./tutorials/testing-guide.md)
3. Review the [Architecture Reference](./reference/architecture.md)
4. Check out [Task Management](./reference/task-management.md) for AI-assisted development

## Key Technologies

- **Frontend**: Next.js 15, React 19, TypeScript 5.8+
- **Styling**: Tailwind CSS 4.0+, Biome formatting
- **Database**: Neon PostgreSQL 16 with pgvector
- **AI/ML**: OpenAI Agents SDK, halfvec embeddings
- **Testing**: Vitest 3.2+ with V8 coverage
- **Package Manager**: pnpm 10.11.1 (strictly enforced)

## Architecture Highlights

- **Serverless-first**: Optimized for Vercel Edge Functions
- **AI-native**: Vector embeddings for semantic search
- **Zero maintenance**: Neon serverless PostgreSQL
- **Ultra-low cost**: Efficient resource utilization
