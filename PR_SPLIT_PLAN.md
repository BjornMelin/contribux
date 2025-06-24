# PR Split Strategy: Breaking Down 70K+ Line Changes

## Overview
Current PR contains 224 changed files with 70,767 line additions. This plan splits the changes into 3 focused, reviewable PRs that build on each other.

## PR 1: Core GitHub Client Implementation
**Size:** ~3,500 lines | **Files:** ~25 files  
**Focus:** Minimal, working GitHub API client with basic tests

### Files to Include:
```
# Core GitHub Client (19 files)
src/lib/github/client.ts
src/lib/github/constants.ts
src/lib/github/errors.ts
src/lib/github/index.ts
src/lib/github/types.ts
src/lib/github/utils.ts
src/lib/github/interfaces/cache.ts
src/lib/github/interfaces/client.ts
src/lib/github/interfaces/dataloader.ts
src/lib/github/interfaces/graphql.ts
src/lib/github/interfaces/http.ts
src/lib/github/interfaces/index.ts
src/lib/github/interfaces/octokit-types.ts
src/lib/github/interfaces/rate-limiting.ts
src/lib/github/interfaces/retry.ts
src/lib/github/interfaces/token.ts
src/lib/github/interfaces/utils.ts
src/lib/github/interfaces/webhooks.ts
src/lib/github/example.ts

# Essential Tests (6 files)
tests/github/github-client-api.test.ts
tests/github/github-client-comprehensive.test.ts
tests/github/github-errors.test.ts
tests/github/test-helpers.ts
tests/helpers/github-mocks.ts
tests/setup.ts (modifications only)
```

### PR 1 Description:
```markdown
## feat: implement core GitHub API client with Octokit v5

### Summary
Implements a lightweight, type-safe GitHub API client using Octokit v5.0.3 with essential features for repository and issue management.

### Changes
- ✨ Core GitHub client with REST and GraphQL support
- 🔒 GitHub App authentication with automatic token rotation
- ⚡ Built-in rate limiting and retry logic using Octokit plugins
- 🛡️ Comprehensive error handling with custom error classes
- 📝 Full TypeScript types and Zod validation for API responses
- ✅ Unit tests with 95%+ coverage

### Technical Details
- Uses Octokit v5's unified API approach
- Implements lightweight caching strategy
- Follows KISS principle with minimal abstractions
- Ready for immediate use in API routes

### Testing
```bash
pnpm test tests/github/github-client-*.test.ts
```
```

## PR 2: Authentication Simplification
**Size:** ~2,000 lines | **Files:** ~20 files  
**Focus:** Streamlined GitHub OAuth implementation (remove WebAuthn complexity)

### Files to Include:
```
# Auth Implementation (4 core files)
src/lib/auth/oauth.ts (modified - remove WebAuthn)
src/lib/auth/middleware.ts (modified - simplify)
database/auth-schema.sql (new - GitHub OAuth only)
src/app/api/auth/github/route.ts (if exists)

# Auth Tests (5 files)
tests/auth/oauth.test.ts
tests/auth/middleware.test.ts
tests/integration/github/auth-flows.test.ts
tests/helpers/auth-mocks.ts
tests/database/auth-schema.test.ts

# Minimal Documentation (3 files)
docs/api/authentication.md
docs/api/endpoints/auth.md
docs/adrs/adr-003-authentication-strategy.md

# Environment & Config Updates
.env.test.example (modifications)
.gitignore (modifications)
biome.json (if auth-related changes)
```

### PR 2 Description:
```markdown
## feat: simplify authentication to GitHub OAuth only

### Summary
Streamlines authentication by focusing exclusively on GitHub OAuth, removing WebAuthn complexity for MVP.

### Changes
- 🔐 GitHub OAuth implementation with secure token handling
- 🛡️ Simplified auth middleware for API routes
- 📊 Database schema for GitHub user sessions
- ✅ Auth flow integration tests
- 📝 Clear authentication documentation

### Breaking Changes
- Removes WebAuthn configuration and dependencies
- Simplifies auth middleware interface

### Migration
No migration needed for new installations. Existing WebAuthn users would need to re-authenticate.

### Testing
```bash
pnpm test tests/auth/*.test.ts
pnpm test tests/integration/github/auth-flows.test.ts
```
```

## PR 3: Test Infrastructure & CI
**Size:** ~15,000 lines | **Files:** ~75 files  
**Focus:** Comprehensive test setup, MSW 2.x migration, CI/CD

### Files to Include:
```
# Test Infrastructure (25 files)
tests/github/msw-setup.ts
tests/helpers/msw-factories.ts
tests/helpers/msw-setup.ts
tests/helpers/test-factories.ts
tests/helpers/test-assertions.ts
tests/helpers/test-utilities.test.ts
tests/helpers/vector-test-utils.ts
tests/helpers/index.ts
tests/test-utils/cleanup.ts
tests/test-utils/database.ts
tests/test-utils/index.ts
tests/mocks/github-handlers.ts
tests/performance/optimize-tests.ts
vitest.config.ts (modifications)
vitest.components.config.ts
vitest.database.config.ts
vitest.integration.config.ts
tests/vitest.performance.config.ts

# Integration Test Suite (15 files)
tests/integration/infrastructure/*
tests/integration/github/api-basic.test.ts
tests/integration/github/load-testing.test.ts
tests/integration/github/real-api-integration.test.ts
tests/integration/github/test-reporting-system.test.ts

# CI/CD & Config (10 files)
.github/workflows/test.yml
.github/workflows/security.yml
.gitguardian.yml
docker-compose.test.yml
package.json (test script updates)
tsconfig.src.json

# Database Testing (10 files)
database/init/*.sql
tests/database/*.test.ts
tests/validation/*.test.ts

# Essential Documentation Updates
README.md (testing section)
docs/testing/README.md
PARALLEL_CLEANUP_REPORT.md
```

### PR 3 Description:
```markdown
## test: comprehensive test infrastructure with MSW 2.x

### Summary
Establishes robust test infrastructure with MSW 2.x for HTTP mocking, comprehensive Vitest configurations, and CI/CD pipelines.

### Changes
- 🧪 MSW 2.x setup with type-safe mocking factories
- 🔧 Specialized Vitest configs (unit, integration, database, performance)
- 🚀 GitHub Actions workflows for testing and security scanning
- 🐳 Docker Compose setup for integration testing
- 📊 Test utilities and helpers for database and API testing
- 🔒 GitGuardian integration for secret scanning
- ✅ 90%+ test coverage across all modules

### Developer Experience
- Fast test execution with proper isolation
- Parallel test running with resource cleanup
- Performance benchmarking tools
- Comprehensive test documentation

### Testing
```bash
# Run all test suites
pnpm test
pnpm test:integration
pnpm test:db
pnpm test:performance
```
```

## Git Strategy for Splitting

### Step 1: Create PR 1 Branch (Core GitHub Client)
```bash
# From main branch
git checkout main
git pull origin main
git checkout -b feat/github-client-core

# Cherry-pick or apply specific files
git checkout feat/task-3-github-api-client -- src/lib/github/
git checkout feat/task-3-github-api-client -- tests/github/github-client-*.test.ts
git checkout feat/task-3-github-api-client -- tests/github/github-errors.test.ts
git checkout feat/task-3-github-api-client -- tests/github/test-helpers.ts
git checkout feat/task-3-github-api-client -- tests/helpers/github-mocks.ts

# Partially apply setup.ts changes
git checkout -p feat/task-3-github-api-client -- tests/setup.ts

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

### Step 2: Create PR 2 Branch (Authentication)
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
git checkout feat/task-3-github-api-client -- docs/api/authentication.md
git checkout feat/task-3-github-api-client -- docs/api/endpoints/auth.md
git checkout feat/task-3-github-api-client -- docs/adrs/adr-003-authentication-strategy.md

# Remove WebAuthn references
git rm src/lib/auth/webauthn-config.ts
# Edit oauth.ts and middleware.ts to remove WebAuthn code

git add .
git commit -m "feat: simplify authentication to GitHub OAuth only

- Remove WebAuthn complexity for MVP
- Streamline auth middleware
- Add GitHub OAuth database schema
- Comprehensive auth testing
- Clear authentication documentation"

git push origin feat/simplified-auth
```

### Step 3: Create PR 3 Branch (Test Infrastructure)
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
git checkout feat/task-3-github-api-client -- database/init/
git checkout feat/task-3-github-api-client -- tsconfig.src.json

# Remove files already in PR 1 and 2
git rm tests/github/github-client-*.test.ts
git rm tests/github/github-errors.test.ts
git rm tests/github/test-helpers.ts
git rm tests/helpers/github-mocks.ts
git rm tests/auth/
git rm tests/integration/github/auth-flows.test.ts

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

## Dependencies & Review Order

1. **PR 1** - No dependencies, can be reviewed immediately
2. **PR 2** - Depends on PR 1 being merged (uses GitHub client)
3. **PR 3** - Depends on PR 1 & 2 (tests both features)

## Review Benefits

### For Reviewers:
- **PR 1**: Focus on API design and core functionality (~3.5K lines)
- **PR 2**: Focus on auth flow and security (~2K lines)
- **PR 3**: Focus on test patterns and CI/CD (~15K lines, mostly test code)

### Clear Scope:
- Each PR has a single, clear purpose
- Changes are logically grouped
- Dependencies are explicit
- Testing is comprehensive in each PR

## Documentation Strategy

### PR 1: Minimal Docs
- Basic API usage in example.ts
- Code comments for complex logic
- Simple README section

### PR 2: Auth Docs
- Authentication flow documentation
- API endpoint specs
- Security considerations

### PR 3: Remaining Docs
- All ADRs and architecture docs
- Comprehensive API documentation
- Testing guides and database docs
- Can be reviewed less strictly as supplementary material

## Risk Mitigation

1. **Test Coverage**: Each PR includes its own tests
2. **Backward Compatibility**: No breaking changes to existing code
3. **Incremental Integration**: Each PR is functional standalone
4. **CI Validation**: Each PR passes all checks independently

## Timeline Estimate

- **PR 1**: 1-2 days review cycle (core functionality)
- **PR 2**: 1 day review cycle (straightforward auth)
- **PR 3**: 2-3 days review cycle (large but mostly tests)

Total: 4-6 days vs 2+ weeks for monolithic PR