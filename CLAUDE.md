# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

contribux is an AI-powered GitHub contribution discovery platform built with Next.js 15, TypeScript, and Neon PostgreSQL. The platform intelligently surfaces high-impact open source opportunities for senior developers transitioning to AI Engineering roles. This is a serverless-first, AI-native architecture designed for zero maintenance and ultra-low costs.

## Essential Commands

**CRITICAL: Always use `pnpm` instead of `npm` for all package management and script execution.**

### Development Commands
```bash
# Development server with Turbo
pnpm dev

# Production build and start
pnpm build
pnpm start

# Code quality (always run before commits)
pnpm lint          # Biome linting
pnpm lint:fix      # Auto-fix linting issues
pnpm format        # Format code with Biome
pnpm type-check    # TypeScript validation

# Clean build artifacts
pnpm clean
```

### Testing Commands (Vitest Framework)
```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test:watch

# Coverage reporting
pnpm test:coverage

# Database-specific tests
pnpm test:db

# Test UI interface
pnpm test:ui

# CI mode with verbose output
pnpm test:ci
```

### Database Commands (Neon PostgreSQL)
```bash
# Connection testing
pnpm db:test-connection
pnpm db:test-dev
pnpm db:test-prod

# Database health and monitoring
pnpm db:health
pnpm db:performance-report
pnpm db:slow-queries
pnpm db:vector-metrics
pnpm db:indexes
pnpm db:analyze
```

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15 with App Router, React 19, TypeScript 5.8+
- **Styling**: Tailwind CSS 4.0+, Biome for formatting/linting
- **Database**: Neon PostgreSQL 16 with pgvector extension for vector search
- **AI/ML**: OpenAI Agents SDK, halfvec embeddings (1536 dimensions)
- **Testing**: Vitest 3.2+ with V8 coverage provider
- **Package Manager**: pnpm 10.11.1 (strictly enforced)

### Key Directories
```
src/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── features/          # Feature-specific components
│   └── ui/                # Reusable UI components
├── lib/                   # Utilities and configurations
│   ├── db/                # Database configuration and client
│   └── monitoring/        # Database monitoring utilities
├── context/               # React context providers
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions

tests/
├── database/              # Database-related tests
└── setup.ts              # Vitest test configuration
```

## Database Architecture

### Core Schema
The database uses a sophisticated schema with vector embeddings for AI-powered search:

- **users**: User profiles with GitHub integration
- **repositories**: Repository metadata with health scoring
- **opportunities**: Contribution opportunities with AI analysis
- **user_preferences**: Personalized filtering and notification settings
- **notifications**: Multi-channel notification system
- **contribution_outcomes**: Success tracking and analytics
- **user_repository_interactions**: User engagement tracking

### Vector Search Features
- **halfvec(1536) embeddings** for semantic similarity
- **HNSW indexes** for efficient vector search
- **Hybrid search functions** combining text and vector search
- **Performance monitoring** with comprehensive metrics

### Environment Configuration
Database connections use branch-specific URLs:
- `DATABASE_URL` - Production/main branch
- `DATABASE_URL_DEV` - Development branch
- `DATABASE_URL_TEST` - Testing branch

## Code Standards

### TypeScript Configuration
- **Strict mode enabled** with comprehensive type checking
- **Path mapping**: Use `@/*` for src/ imports
- **Target**: ES2017 for broad compatibility
- **Additional strictness**: noUncheckedIndexedAccess, exactOptionalPropertyTypes

### Biome Configuration
- **Line width**: 100 characters
- **Indentation**: 2 spaces
- **Quote style**: Single quotes for JS, double for JSX
- **Import organization**: Automatic with type imports

### Testing Strategy
- **Framework**: Vitest with V8 coverage provider
- **Coverage targets**: 90% across all metrics through meaningful tests
- **Test organization**: Feature-based in tests/ directory, logically grouped by functionality
- **Global APIs**: Enabled for Jest-like syntax without imports

### Test Quality Standards (MANDATORY)
- **Functional Organization**: Group tests by business functionality, never by coverage metrics
- **Realistic Scenarios**: Test real-world usage patterns that mirror production behavior
- **Modern Patterns**: Use MSW 2.x for HTTP mocking, property-based testing for edge cases
- **Proper Isolation**: Comprehensive setup/teardown with proper async/await patterns
- **Meaningful Coverage**: Achieve coverage through valuable tests, not artificial line-targeting

## Development Workflow

### Task Management Integration
This project uses Task Master AI for enhanced development workflow:
- **MCP Integration**: Full integration with Cursor IDE
- **Tagged task lists**: Support for feature-branch isolation
- **AI-powered expansion**: Research-backed task breakdown
- **Complex project support**: PRD parsing and analysis

### Git Workflow
- **Main branch**: `main` (for production releases)
- **Feature branches**: Follow `feat/description` pattern
- **Current branch**: `feat/task-2-config-postgresql-db-schema`
- **Testing**: Database schema with comprehensive test coverage

### Performance Considerations
- **Serverless architecture**: Optimized for Vercel Edge Functions
- **Vector operations**: Efficient HNSW indexing for fast similarity search
- **Connection pooling**: Built-in Neon serverless pooling
- **Monitoring**: Comprehensive database performance tracking

## Important Notes

### Package Management
- **ALWAYS use pnpm**: Never use npm or yarn
- **Version**: pnpm@10.11.1 as specified in package.json
- **Installation**: `pnpm install` for dependencies
- **Scripts**: `pnpm <script-name>` for all package.json scripts

### Database Considerations
- **Branch strategy**: Use appropriate DATABASE_URL for environment
- **Vector operations**: Work with halfvec(1536) embeddings
- **Monitoring**: Regular performance reports and health checks
- **Testing**: Requires test database configuration for full test suite

### AI/ML Integration
- **Embeddings**: 1536-dimensional halfvec for compatibility
- **Search**: Hybrid approach combining text and vector similarity
- **Analysis**: AI-powered opportunity complexity assessment
- **Agents**: OpenAI Agents SDK for intelligent task orchestration

### Code Quality
- **Linting**: Biome with strict rules for TypeScript
- **Testing**: Comprehensive coverage with Vitest
- **Type safety**: Strict TypeScript configuration
- **Monitoring**: Database performance and vector index metrics

## Development Best Practices

### Test-Driven Development (TDD)
- **Always develop using a TDD test first development approach**
- **Write tests using Vitest for the new features or functionality we want**
- **Implement code to make those tests pass until all tests pass**
- **Ensure the entire feature is implemented successfully and matches our requirements defined in the current task and subtasks**

### Testing Anti-Patterns to AVOID (Learned from GitHub Client Consolidation)
❌ **Coverage-Driven Testing**: Never create tests solely to hit coverage metrics or line numbers
❌ **Artificial Error Scenarios**: Avoid fabricated edge cases that wouldn't occur in real usage  
❌ **Internal Implementation Testing**: Don't test private methods or implementation details
❌ **Line-Number Targeting**: Never write tests with comments like "covers lines X-Y"
❌ **Metric-Named Tests**: Avoid test names like "coverage-boost" or "final-coverage-push"
❌ **Timing-Dependent Tests**: Don't rely on real timers or timing for cache/async tests

### Testing Best Practices to FOLLOW
✅ **Functional Organization**: Structure tests by business functionality (Core, Edge Cases, Integration)
✅ **User-Centric Scenarios**: Test from the perspective of actual API consumers and end users
✅ **Realistic Edge Cases**: Test boundary conditions and error scenarios that mirror production
✅ **Public API Focus**: Test through public interfaces, not internal implementation details
✅ **Modern Test Patterns**: Use MSW for HTTP mocking, Vitest async utilities, property-based testing
✅ **Proper Test Isolation**: Comprehensive beforeEach/afterEach with enhanced test isolation helpers
✅ **Meaningful Test Names**: Descriptive names that explain business value, not technical coverage

### Test File Organization Standards
```
Feature Tests Structure:
├── feature-core.test.ts        # Basic initialization, configuration, defaults
├── feature-edge-cases.test.ts  # Error handling, boundary conditions, realistic failures  
├── feature-integration.test.ts # End-to-end flows, multi-service integration
├── feature-comprehensive.test.ts # Full API testing, happy path scenarios
└── specialized files as needed (errors, utilities, etc.)
```

### Test Quality Checklist (Use for ALL tests)
- [ ] Tests organized by functionality, not coverage metrics
- [ ] All test scenarios represent realistic usage patterns
- [ ] MSW used for HTTP mocking with proper setup/teardown
- [ ] Proper async/await patterns throughout
- [ ] No artificial timing dependencies or internal method testing
- [ ] Test names describe business value and expected behavior
- [ ] 90%+ coverage achieved through meaningful scenarios, not line-targeting
- [ ] Each test file has clear, logical sections with descriptive describe blocks

## Project Management Best Practices

- **Always be sure to keep both your todo list as well as the task-master-ai task and subtasks statuses updated throughout your work.**

## Confidentiality Guidelines

- **NEVER MENTION CLAUDE CODE IN COMMIT OR PULL REQUEST MESSAGES OR DESCRIPTIONS**

## TypeScript Validation

- **Always use Zod for all TypeScript Schema validation and typing throughout the app.**