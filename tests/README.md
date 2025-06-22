# Test Infrastructure Documentation

This document provides comprehensive guidance for the contribux test suite, covering architecture, best practices, and implementation details.

## 📋 Table of Contents

- [Overview](#overview)
- [Test Architecture](#test-architecture)
- [Test Categories](#test-categories)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Utilities](#test-utilities)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The contribux test suite uses **Vitest 3.2+** as the primary testing framework, providing:
- Fast execution with native ESM support
- Built-in TypeScript support
- Advanced mocking capabilities
- Comprehensive coverage reporting
- Parallel test execution

### Key Statistics
- **Total Tests**: 711 tests across 45 test files
- **Coverage Target**: 80% (currently achieving 87.31%)
- **Execution Time**: ~90s standard, ~34s in fast mode
- **Test Categories**: Unit, Integration, E2E, Performance

## Test Architecture

### Directory Structure
```
tests/
├── auth/                 # Authentication & authorization tests
├── database/            # Database and schema tests
├── github/              # GitHub API client tests
├── integration/         # Integration test suites
│   └── github/         # GitHub-specific integration tests
├── validation/          # Input validation tests
├── performance/         # Performance optimization utilities
├── test-utils/          # Shared test utilities
├── setup.ts            # Global test setup
└── vitest.performance.config.ts  # Fast mode configuration
```

### Test Isolation

All tests are designed with complete isolation to prevent cross-test interference:

```typescript
// Example from tests/github/test-helpers.ts
export function setupGitHubTestIsolation() {
  beforeEach(() => {
    // Complete nock reset
    nock.cleanAll()
    nock.abortPendingRequests()
    nock.disableNetConnect()
    
    // Clear all mocks
    vi.clearAllMocks()
    
    // Clear global state
    if (global.__githubClientCache) {
      delete global.__githubClientCache
    }
    
    // Reset nock completely
    nock.restore()
    nock.activate()
  })

  afterEach(() => {
    // Cleanup
    nock.cleanAll()
    nock.enableNetConnect()
    vi.clearAllMocks()
    nock.restore()
  })
}
```

## Test Categories

### 1. Unit Tests
- **Location**: Throughout the codebase, typically alongside source files
- **Purpose**: Test individual functions and components in isolation
- **Tools**: Vitest, vi.mock(), vi.fn()

### 2. Integration Tests
- **Location**: `tests/integration/`
- **Purpose**: Test component interactions and API integrations
- **Key Features**:
  - Docker-based test database
  - Mock external APIs with nock
  - Real database operations

### 3. GitHub API Tests
- **Location**: `tests/github/`
- **Purpose**: Comprehensive testing of GitHub API client
- **Coverage**: 274 tests covering:
  - Authentication methods
  - Rate limiting
  - Caching strategies
  - GraphQL operations
  - Webhook handling

### 4. Authentication Tests
- **Location**: `tests/auth/`
- **Purpose**: Test auth flows and security features
- **Coverage**: 228 tests including:
  - WebAuthn/Passkeys
  - OAuth flows
  - JWT management
  - GDPR compliance

## Running Tests

### Standard Test Commands

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test:watch

# Coverage report
pnpm test:coverage

# CI mode with verbose output
pnpm test:ci

# Database-specific tests
pnpm test:db

# UI test interface
pnpm test:ui
```

### Performance-Optimized Testing

For faster feedback during development:

```bash
# Fast mode (60-80% faster)
pnpm test:fast

# Fast watch mode
pnpm test:fast:watch
```

Fast mode reduces:
- Iteration counts for expensive tests
- Timeouts for quicker feedback
- Memory leak detection cycles

### Integration Testing

```bash
# Run integration tests
pnpm test:integration

# Watch integration tests
pnpm test:integration:watch

# CI-optimized integration tests
pnpm test:integration:ci

# Check integration test status
pnpm test:integration:status
```

## Writing Tests

### Test Structure

Follow the Arrange-Act-Assert pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup test environment
  })

  it('should perform expected behavior', async () => {
    // Arrange
    const input = createTestInput()
    
    // Act
    const result = await performAction(input)
    
    // Assert
    expect(result).toMatchObject({
      success: true,
      data: expect.any(Object)
    })
  })
})
```

### Mocking Best Practices

#### HTTP Requests with Nock
```typescript
import nock from 'nock'

const scope = nock('https://api.github.com', {
  reqheaders: {
    'authorization': 'token test-token'
  }
})
.get('/user')
.reply(200, { login: 'testuser' })

// Always verify scope completion
expect(scope.isDone()).toBe(true)
```

#### Module Mocks with Vitest
```typescript
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn().mockResolvedValue([]),
  getDatabaseUrl: vi.fn()
}))
```

### Async Testing

Always use async/await for asynchronous operations:

```typescript
it('should handle async operations', async () => {
  const result = await asyncOperation()
  expect(result).toBeDefined()
})
```

### Test Timeouts

Configure appropriate timeouts for different test types:

```typescript
// Quick unit test (default 5s)
it('should complete quickly', async () => {
  // test code
})

// Longer integration test
it('should handle complex operations', async () => {
  // test code
}, 30000) // 30 second timeout
```

## Test Utilities

### Global Test Helpers

Located in `tests/test-utils/`:

```typescript
// cleanup.ts - Global test state reset
export function resetTestState() {
  // Clear all test state
}

// mock-data.ts - Consistent test data
export const mockGitHubUser = {
  id: 1,
  login: 'testuser',
  // ...
}
```

### Environment Configuration

Test environment variables are loaded from `.env.test`. Copy `.env.test.example` to `.env.test` and update as needed:

```bash
# Database
DATABASE_URL_TEST=postgresql://...

# GitHub API
GITHUB_APP_ID=12345
GITHUB_APP_PRIVATE_KEY=test-key

# Auth
NEXTAUTH_SECRET=test-secret
```

## Best Practices

### 1. Test Isolation
- Always clean up after tests
- Don't rely on test execution order
- Reset global state in beforeEach/afterEach

### 2. Descriptive Test Names
```typescript
// ❌ Bad
it('should work', () => {})

// ✅ Good
it('should authenticate user with valid GitHub token', () => {})
```

### 3. Focused Tests
- One assertion per test when possible
- Test one behavior at a time
- Use describe blocks for logical grouping

### 4. Mock External Dependencies
```typescript
// Always mock external services
nock('https://api.external.com')
  .get('/data')
  .reply(200, mockResponse)
```

### 5. Use Test Data Builders
```typescript
function createTestUser(overrides = {}) {
  return {
    id: 'test-id',
    email: 'test@example.com',
    ...overrides
  }
}
```

### 6. Avoid Test Interdependencies
Each test should be able to run independently:
```typescript
// ❌ Bad - depends on previous test
it('should update user', () => {
  updateUser(globalUser) // Uses state from another test
})

// ✅ Good - self-contained
it('should update user', () => {
  const user = createTestUser()
  updateUser(user)
})
```

## Troubleshooting

### Common Issues

#### 1. Test Isolation Failures
**Symptom**: Tests pass individually but fail when run together

**Solution**: Implement proper cleanup
```typescript
beforeEach(() => {
  nock.cleanAll()
  vi.clearAllMocks()
})
```

#### 2. Timeout Errors
**Symptom**: Tests timeout before completion

**Solutions**:
- Increase timeout for specific tests
- Use fake timers for time-dependent tests
- Check for hanging promises

#### 3. Mock Not Working
**Symptom**: Real implementation called instead of mock

**Solutions**:
- Ensure mock is defined before import
- Check mock path matches exactly
- Use `vi.mock()` hoisting

#### 4. Database Connection Issues
**Symptom**: Cannot connect to test database

**Solutions**:
- Ensure Docker is running
- Check DATABASE_URL_TEST is set
- Run `docker-compose -f docker-compose.test.yml up -d`

### Debugging Tests

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/vitest run

# Enable test output
DEBUG_TESTS=true pnpm test

# Run single test file
pnpm test tests/github/client.test.ts

# Run tests matching pattern
pnpm test -t "should authenticate"
```

### Performance Debugging

For slow tests:
1. Use `pnpm test:fast` for quick feedback
2. Profile with `node --inspect`
3. Check for unnecessary async operations
4. Reduce test data size

## CI/CD Integration

Tests are automatically run in CI with:
- Parallel execution across test categories
- Coverage reporting with 80% threshold
- Automatic failure notifications
- Performance benchmarking

### GitHub Actions Configuration
```yaml
- name: Run Tests
  run: |
    pnpm test:ci
    pnpm test:coverage
```

## Contributing

When adding new tests:
1. Follow existing patterns in the codebase
2. Ensure tests are isolated and deterministic
3. Add appropriate test categories
4. Update this documentation if needed
5. Maintain or improve coverage percentages

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Nock HTTP Mocking](https://github.com/nock/nock)
- Project-specific: `/tests/performance/README.md` for performance optimization