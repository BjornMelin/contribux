# PR Templates for Split PRs

## PR 1: Core GitHub Client Implementation

### Title
`feat: implement core GitHub API client with Octokit v5`

### Description
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
import { createGitHubClient } from '@/lib/github'

const client = createGitHubClient({
  auth: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID
  }
})

// REST API
const repo = await client.getRepository({ owner: 'vercel', repo: 'next.js' })

// GraphQL API
const data = await client.graphql(query, variables)
```

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

## Next Steps

After this PR:
1. PR 2 will add simplified GitHub OAuth authentication
2. PR 3 will add comprehensive test infrastructure

## Files Changed

- 19 new files in `src/lib/github/`
- 6 test files with comprehensive coverage
- 1 modification to `tests/setup.ts`

Total: ~3,500 lines of production-ready code
```

---

## PR 2: Authentication Simplification

### Title
`feat: simplify authentication to GitHub OAuth only`

### Description
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
For existing users: Would need to re-authenticate (no current users in production)

## Checklist

- [x] Simplified implementation following KISS
- [x] Removed unnecessary WebAuthn complexity
- [x] Security best practices maintained
- [x] Tests cover all auth flows
- [x] Documentation updated

## Files Changed

- 4 core auth files (simplified)
- 5 test files
- 3 documentation files
- Database schema addition

Total: ~2,000 lines focusing on essential auth
```

---

## PR 3: Test Infrastructure & CI

### Title
`test: comprehensive test infrastructure with MSW 2.x`

### Description
```markdown
## Summary

This PR establishes a robust test infrastructure using MSW 2.x for HTTP mocking, specialized Vitest configurations, and comprehensive CI/CD pipelines. This completes the testing foundation for the contribux platform.

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

### Developer Experience
- Fast test execution with proper isolation
- Clear test organization and naming
- Helpful error messages and debugging
- Performance monitoring built-in

## Test Organization

```
tests/
├── github/          # GitHub client tests (from PR 1)
├── auth/           # Auth tests (from PR 2)
├── integration/    # End-to-end tests
├── helpers/        # Shared test utilities
├── mocks/          # MSW handlers
├── performance/    # Performance benchmarks
└── database/       # Database-specific tests
```

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

# CI mode
pnpm test:ci
```

## Key Improvements

1. **MSW 2.x Migration**: From v1 to v2 with proper TypeScript support
2. **Test Isolation**: Each test runs in complete isolation
3. **Resource Cleanup**: Automatic cleanup of test resources
4. **Parallel Execution**: Tests run in parallel where safe
5. **Performance Tracking**: Built-in performance assertions

## CI/CD Workflows

### Test Workflow (.github/workflows/test.yml)
- Runs on all PRs and main branch
- Matrix testing across Node versions
- Database tests with real Neon instance
- Coverage reporting to Codecov

### Security Workflow (.github/workflows/security.yml)
- GitGuardian secret scanning
- Dependency vulnerability checks
- License compliance validation

## Documentation

Comprehensive test documentation includes:
- Testing best practices
- How to write new tests
- Debugging test failures
- Performance optimization tips

## Checklist

- [x] MSW 2.x properly configured
- [x] All test types have dedicated configs
- [x] CI/CD pipelines are comprehensive
- [x] Documentation is clear and helpful
- [x] No flaky tests
- [x] Performance benchmarks established

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

---

## Quick Reference for PR Creation

### After running split-pr.sh for each PR:

1. **Create PR on GitHub**
2. **Copy appropriate template from above**
3. **Add these labels**:
   - PR 1: `enhancement`, `github-integration`, `core`
   - PR 2: `enhancement`, `authentication`, `simplification`
   - PR 3: `testing`, `infrastructure`, `ci-cd`
4. **Request review from appropriate reviewers**
5. **Link to this split plan in PR description**

### Review Tips for Reviewers

Include this in PR description:

```markdown
## Review Guide

This PR is part of a 3-PR split from a larger feature branch. See [PR_SPLIT_PLAN.md](./PR_SPLIT_PLAN.md) for full context.

### What to Focus On:
- [Specific areas based on PR]

### What to Ignore:
- [Less critical files that can be skimmed]

### Dependencies:
- [Which PRs this depends on]
```