# Pull Request Workflow & Strategy

Comprehensive guide for managing pull requests in the Contribux project, including splitting strategies, templates, and best practices.

## Table of Contents

- [Overview](#overview)
- [PR Split Strategy](#pr-split-strategy)
- [PR Templates](#pr-templates)
- [Git Workflow](#git-workflow)
- [Review Guidelines](#review-guidelines)
- [Best Practices](#best-practices)

## Overview

This document outlines the strategy for managing large pull requests by splitting them into focused, reviewable chunks. The approach prioritizes reviewer efficiency while maintaining logical dependency chains.

## PR Split Strategy

### The Challenge: Large PRs

- **Original PR**: 224 files, 70,767 line additions
- **Review Complexity**: Difficult to review comprehensively
- **Merge Risk**: Higher chance of conflicts and errors

### Solution: Strategic Splitting

Break large changes into 3 focused PRs that build on each other:

#### PR 1: Core GitHub Client (25 files, ~3,500 lines)

**Purpose**: Minimal, working GitHub API client

- ✅ Self-contained and immediately usable
- ✅ No external dependencies on other PRs
- ✅ Complete test coverage
- ✅ Follows KISS principle

#### PR 2: Authentication (20 files, ~2,000 lines)

**Purpose**: Simplified GitHub OAuth only

- ✅ Removes WebAuthn complexity
- ✅ Depends only on PR 1 (uses GitHub client)
- ✅ Clean, focused changes
- ✅ Security best practices

#### PR 3: Test Infrastructure (75 files, ~15,000 lines)

**Purpose**: Complete test setup and CI/CD

- ✅ Mostly test code (reviewable with less scrutiny)
- ✅ Depends on PR 1 & 2 for complete testing
- ✅ Establishes quality standards
- ✅ Enables future development

### Benefits of This Split

1. **Logical Separation**: Each PR has a single, clear purpose
2. **Dependency Order**: Natural build progression (client → auth → tests)
3. **Review Efficiency**:
   - PR 1: Focus on API design (3.5K lines)
   - PR 2: Focus on security (2K lines)
   - PR 3: Mostly test code (15K lines)
4. **Risk Mitigation**: Each PR is independently functional

## PR Templates

### Template 1: Core GitHub Client Implementation

#### Title

`feat: implement core GitHub API client with Octokit v5`

#### Description Template

```markdown
## Summary

This PR implements a lightweight, type-safe GitHub API client using Octokit v5.0.3 with essential features for repository and issue management. This is the foundation for the contribux platform's GitHub integration.

## What's Included

### Core Implementation (src/lib/github/)

- ✨ **Unified Client**: Single class supporting both REST and GraphQL APIs
- 🔐 **Authentication**: GitHub App auth with automatic token rotation
- ⚡ **Performance**: Built-in rate limiting and retry logic via Octokit plugins
- 🛡️ **Error Handling**: Custom error classes with detailed context
- 📝 **Type Safety**: Full TypeScript types + Zod validation for all API responses
- 💾 **Caching**: Lightweight caching strategy for common requests

### Test Coverage

- ✅ Comprehensive unit tests achieving 95%+ coverage
- 🧪 Modern testing patterns with proper isolation
- 🔄 Both success and error scenario coverage
- 📊 Performance benchmarks included

## Technical Approach

Following KISS principles:

- Minimal abstractions over Octokit
- Direct mapping to GitHub API concepts
- Clear, predictable error handling
- Ready for immediate use in API routes

## Usage Example

```typescript
import { createGitHubClient } from "@/lib/github";

const client = createGitHubClient({
  auth: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
  },
});

// REST API
const repo = await client.getRepository({ owner: "vercel", repo: "next.js" });

// GraphQL API
const data = await client.graphql(query, variables);
```
````

## Testing

```bash
# Run GitHub client tests
pnpm test tests/github/github-client-*.test.ts

# Run with coverage
pnpm test:coverage tests/github/
```

## Checklist

- [x] Code follows project standards (TypeScript strict mode, Zod validation)
- [x] Tests pass with >90% coverage
- [x] No console.logs or debug code
- [x] Error handling is comprehensive
- [x] Documentation via code comments
- [x] Follows KISS/YAGNI principles

## Files Changed

- 19 new files in `src/lib/github/`
- 6 test files with comprehensive coverage
- 1 modification to `tests/setup.ts`

Total: ~3,500 lines of production-ready code
```

### Template 2: Authentication Simplification

#### Title
`feat: simplify authentication to GitHub OAuth only`

#### Description Template
```markdown
## Summary

This PR streamlines authentication by implementing GitHub OAuth as the sole authentication method, removing WebAuthn complexity to follow KISS principles for the MVP.

## What Changed

### Simplified Auth Stack
- 🔐 **GitHub OAuth**: Clean implementation with secure token handling
- 🛡️ **Auth Middleware**: Streamlined for API route protection
- 📊 **Database Schema**: Minimal schema for GitHub user sessions
- ❌ **Removed**: WebAuthn configuration and dependencies

### Implementation Details
- **OAuth Flow**: Standard GitHub OAuth 2.0 implementation
- **Session Management**: Secure, httpOnly cookies
- **Token Storage**: Encrypted in database
- **Middleware**: Simple session validation

## Breaking Changes

- Removes WebAuthn support entirely
- Simplifies auth middleware interface
- Changes auth configuration structure

## Database Changes

```sql
-- New simplified auth schema
CREATE TABLE github_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  github_token TEXT NOT NULL, -- encrypted
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Testing

```bash
# Run auth tests
pnpm test tests/auth/*.test.ts

# Integration tests
pnpm test tests/integration/github/auth-flows.test.ts
```

## Security Considerations

- ✅ Tokens encrypted at rest
- ✅ Secure httpOnly cookies for sessions
- ✅ CSRF protection implemented
- ✅ Rate limiting on auth endpoints

## Migration Guide

For new installations: No action needed
For existing users: Would need to re-authenticate

## Files Changed

- 4 core auth files (simplified)
- 5 test files
- 3 documentation files
- Database schema addition

Total: ~2,000 lines focusing on essential auth
```

### Template 3: Test Infrastructure & CI

#### Title
`test: comprehensive test infrastructure with MSW 2.x`

#### Description Template
```markdown
## Summary

This PR establishes a robust test infrastructure using MSW 2.x for HTTP mocking, specialized Vitest configurations, and comprehensive CI/CD pipelines.

## What's Included

### Test Infrastructure
- 🧪 **MSW 2.x**: Modern HTTP mocking with type-safe handlers
- 🔧 **Vitest Configs**: Specialized configs for different test types
- 🏃 **Test Runners**: Optimized for parallel execution
- 🧹 **Test Utilities**: Database helpers, factories, assertions
- 📊 **Coverage**: Achieving 90%+ across all modules

### CI/CD Pipeline
- ✅ **GitHub Actions**: Comprehensive test workflows
- 🔒 **Security Scanning**: GitGuardian integration
- 🐳 **Docker Compose**: Integration test environment
- 📈 **Performance Tests**: Benchmark tracking

## Running Tests

```bash
# All tests
pnpm test

# Specific suites
pnpm test:unit
pnpm test:integration
pnpm test:db
pnpm test:performance

# With UI
pnpm test:ui
```

## Key Improvements

1. **MSW 2.x Migration**: From v1 to v2 with proper TypeScript support
2. **Test Isolation**: Each test runs in complete isolation
3. **Resource Cleanup**: Automatic cleanup of test resources
4. **Parallel Execution**: Tests run in parallel where safe
5. **Performance Tracking**: Built-in performance assertions

## Files Changed

- 25 test infrastructure files
- 15 integration test files
- 10 CI/CD and config files
- 10 database test files
- 15 documentation files

Total: ~15,000 lines (mostly test code and documentation)

## Note

This PR is large but consists primarily of:

- Test code (can be reviewed less strictly)
- Test utilities and helpers
- Documentation
- Configuration files

The actual production code changes are minimal.
```

## Git Workflow

### Commands for PR Creation

#### Step 1: Create PR 1 Branch (Core GitHub Client)
```bash
# From main branch
git checkout main
git pull origin main
git checkout -b feat/github-client-core

# Cherry-pick specific files
git checkout feat/task-3-github-api-client -- src/lib/github/
git checkout feat/task-3-github-api-client -- tests/github/github-client-*.test.ts
git checkout feat/task-3-github-api-client -- tests/github/github-errors.test.ts
git checkout feat/task-3-github-api-client -- tests/github/test-helpers.ts
git checkout feat/task-3-github-api-client -- tests/helpers/github-mocks.ts

# Commit
git add .
git commit -m "feat: implement core GitHub API client with Octokit v5

- Core GitHub client with REST and GraphQL support
- GitHub App authentication with automatic token rotation
- Built-in rate limiting and retry logic
- Comprehensive error handling
- Full TypeScript types and Zod validation
- Unit tests with 95%+ coverage"

# Push and create PR
git push origin feat/github-client-core
```

#### Step 2: Create PR 2 Branch (Authentication)

```bash
# After PR 1 is merged, from updated main
git checkout main
git pull origin main
git checkout -b feat/simplified-auth

# Apply auth changes
git checkout feat/task-3-github-api-client -- src/lib/auth/oauth.ts
git checkout feat/task-3-github-api-client -- src/lib/auth/middleware.ts
git checkout feat/task-3-github-api-client -- database/auth-schema.sql
git checkout feat/task-3-github-api-client -- tests/auth/
git checkout feat/task-3-github-api-client -- tests/integration/github/auth-flows.test.ts

# Remove WebAuthn references
git rm src/lib/auth/webauthn-config.ts

git add .
git commit -m "feat: simplify authentication to GitHub OAuth only

- Remove WebAuthn complexity for MVP
- Streamline auth middleware
- Add GitHub OAuth database schema
- Comprehensive auth testing"

git push origin feat/simplified-auth
```

#### Step 3: Create PR 3 Branch (Test Infrastructure)

```bash
# After PR 2 is merged, from updated main
git checkout main
git pull origin main
git checkout -b feat/test-infrastructure

# Apply all test infrastructure
git checkout feat/task-3-github-api-client -- tests/
git checkout feat/task-3-github-api-client -- vitest*.config.ts
git checkout feat/task-3-github-api-client -- .github/workflows/
git checkout feat/task-3-github-api-client -- .gitguardian.yml
git checkout feat/task-3-github-api-client -- docker-compose.test.yml

# Remove files already in PR 1 and 2
git rm tests/github/github-client-*.test.ts
git rm tests/github/github-errors.test.ts
git rm tests/auth/

git add .
git commit -m "test: comprehensive test infrastructure with MSW 2.x

- MSW 2.x setup with type-safe mocking
- Specialized Vitest configurations
- GitHub Actions CI/CD pipelines
- Docker Compose for integration testing
- Test utilities and helpers
- GitGuardian security scanning
- 90%+ test coverage"

git push origin feat/test-infrastructure
```

## Review Guidelines

### Dependencies & Review Order

1. **PR 1** - No dependencies, can be reviewed immediately
2. **PR 2** - Depends on PR 1 being merged (uses GitHub client)
3. **PR 3** - Depends on PR 1 & 2 (tests both features)

### For Reviewers

#### Review Focus Areas

**PR 1 (Core GitHub Client)**:

- API design and architecture
- Error handling patterns
- Type safety implementation
- Test coverage and quality

**PR 2 (Authentication)**:

- Security implementation
- OAuth flow correctness
- Database schema design
- Authentication logic

**PR 3 (Test Infrastructure)**:

- Test organization and patterns
- CI/CD pipeline configuration
- MSW setup and mocking
- Documentation quality

#### Review Tips

Include this in PR description:

```markdown
## Review Guide

This PR is part of a 3-PR split from a larger feature branch. See [pull-request-workflow.md](./docs/processes/pull-request-workflow.md) for full context.

### What to Focus On:

- [Specific areas based on PR]

### What to Skim:

- [Less critical files that can be reviewed quickly]

### Dependencies:

- [Which PRs this depends on]
```

## Best Practices

### PR Size Guidelines

- **Maximum 5,000 lines** for non-test code
- **Test PRs can be larger** (review less strictly)
- **Single responsibility** per PR
- **Clear dependency chain**

### Review Efficiency

- **Focus review time** on production code
- **Test code** can be reviewed less strictly
- **Documentation** should be skimmed unless critical
- **Configuration files** need careful review for security

### Risk Mitigation

1. **Each PR includes its own tests**
2. **No breaking changes** to existing code
3. **Incremental integration** - each PR is functional standalone
4. **CI validation** - each PR passes all checks independently

### Success Metrics

- [ ] Each PR passes all CI checks independently
- [ ] Each PR has focused scope and clear purpose
- [ ] Review time per PR < 2 hours
- [ ] No merge conflicts between PRs
- [ ] Total review cycle < 1 week

### Timeline Estimate

- **PR 1**: 1-2 days review cycle (core functionality)
- **PR 2**: 1 day review cycle (straightforward auth)
- **PR 3**: 2-3 days review cycle (large but mostly tests)

**Total**: 4-6 days vs 2+ weeks for monolithic PR

This structured approach ensures efficient review cycles while maintaining code quality and minimizing integration risks.
