# MSW Handler Documentation

Comprehensive MSW (Mock Service Worker) handlers for complete API testing in the Contribux project.

## Overview

This directory contains comprehensive MSW handlers that mock all API endpoints in the Contribux application:

- **Security API** - Health checks, WebAuthn endpoints
- **Authentication API** - NextAuth.js flows, multi-provider OAuth, MFA
- **Search API** - Opportunities and repositories search with filtering
- **Health/Performance API** - Monitoring and performance metrics
- **GitHub API** - External GitHub integration endpoints

## Quick Start

### Basic Setup

```typescript
import { setupComprehensiveMSW } from '@/tests/mocks/unified-handlers'

// Setup all handlers for comprehensive testing
setupComprehensiveMSW()

// Your tests here...
```

### Scenario-Specific Setup

```typescript
import { 
  setupAuthMSW,
  setupSecurityMSW,
  setupSearchMSW 
} from '@/tests/mocks/unified-handlers'

// Setup only authentication handlers
setupAuthMSW()

// Setup only security handlers
setupSecurityMSW()

// Setup only search handlers
setupSearchMSW()
```

## Handler Groups

### 1. Security Handlers (`security-handlers.ts`)

Mock all security-related endpoints with multiple scenarios.

#### Endpoints Covered:
- `GET /api/security/health` - Security health check
- `POST /api/security/webauthn/register/options` - WebAuthn registration
- `POST /api/security/webauthn/register/verify` - WebAuthn verification
- `POST /api/security/webauthn/authenticate/options` - WebAuthn authentication
- `POST /api/security/webauthn/authenticate/verify` - WebAuthn auth verification

#### Test Scenarios:
```typescript
import { testScenarios } from '@/tests/mocks/unified-handlers'

// Security health scenarios
const url = `/api/security/health${testScenarios.security.healthy}`   // Healthy status
const url = `/api/security/health${testScenarios.security.warning}`   // Warning status
const url = `/api/security/health${testScenarios.security.critical}`  // Critical status
const url = `/api/security/health${testScenarios.security.error}`     // Error response
const url = `/api/security/health${testScenarios.security.slow}`      // Slow response

// WebAuthn scenarios
const url = `/api/security/webauthn/register/options${testScenarios.webauthn.disabled}`
const url = `/api/security/webauthn/register/verify${testScenarios.webauthn.failure}`
```

### 2. Authentication Handlers (`auth-handlers.ts`)

Mock NextAuth.js and authentication endpoints with comprehensive scenarios.

#### Endpoints Covered:
- `GET /api/auth/session` - Current session
- `GET /api/auth/csrf` - CSRF token
- `GET /api/auth/providers` - Available providers
- `POST /api/auth/signin/:provider` - Sign in
- `GET /api/auth/callback/:provider` - OAuth callback
- `POST /api/auth/signout` - Sign out
- `GET /api/auth/can-unlink` - Multi-provider management
- `POST /api/auth/unlink` - Unlink provider
- `POST /api/auth/mfa/enroll` - MFA enrollment
- `POST /api/auth/mfa/verify` - MFA verification

#### Usage Examples:
```typescript
import { HTTPBuilders } from '@/tests/mocks/unified-handlers'

// Authenticated request
const response = await fetch('/api/auth/session', HTTPBuilders.withSession())

// Custom session token
const response = await fetch('/api/auth/session', HTTPBuilders.withSession('custom-token'))

// With CSRF token
const response = await fetch('/api/auth/csrf', HTTPBuilders.withCsrf())
```

### 3. Search Handlers (`search-handlers.ts`)

Mock search API endpoints with realistic data and comprehensive filtering.

#### Endpoints Covered:
- `GET /api/search/opportunities` - Search contribution opportunities
- `GET /api/search/repositories` - Search repositories
- `GET /api/search/error` - Error simulation endpoint

#### Search Features:
- **Filtering**: difficulty, labels, skills, good first issue, mentorship
- **Pagination**: page, per_page parameters
- **Sorting**: by difficulty, impact, match score, creation date
- **Authentication**: requires valid session
- **Performance**: includes execution time metrics

#### Usage Examples:
```typescript
// Basic opportunity search
const response = await fetch(
  '/api/search/opportunities?q=typescript&difficulty=beginner',
  HTTPBuilders.withSession()
)

// Repository search with filters
const response = await fetch(
  '/api/search/repositories?language=javascript&first_time_contributor_friendly=true',
  HTTPBuilders.withSession()
)

// Error scenarios
const response = await fetch('/api/search/error?type=rate-limit')
```

### 4. Health Handlers (`health-handlers.ts`)

Mock health check and performance monitoring endpoints.

#### Endpoints Covered:
- `GET /api/health` - Comprehensive health check
- `GET /api/simple-health` - Simple health check
- `GET /api/performance` - Performance metrics
- `POST /api/performance/benchmark` - Benchmark testing
- `GET /api/health/database` - Database health
- `GET /api/health/application` - Application health

#### Health Scenarios:
```typescript
// Different health states
const healthy = await fetch(`/api/health${testScenarios.health.healthy}`)
const degraded = await fetch(`/api/health${testScenarios.health.degraded}`)
const unhealthy = await fetch(`/api/health${testScenarios.health.unhealthy}`)

// Performance testing
const response = await fetch('/api/performance?load=high&include-history=true')
```

### 5. GitHub Handlers (`github-handlers.ts`)

Mock GitHub API endpoints for external integration testing.

#### Endpoints Covered:
- `GET /user` - Authenticated user
- `GET /user/repos` - User repositories
- `GET /repos/:owner/:repo/issues` - Repository issues
- `POST /graphql` - GraphQL endpoint
- Rate limiting and error scenarios

## Test Utilities

### Mock Data Factories

Generate dynamic test data:

```typescript
import { TestDataBuilders } from '@/tests/mocks/unified-handlers'

// Create test data
const user = TestDataBuilders.createUser({ name: 'Custom User' })
const repo = TestDataBuilders.createRepository({ language: 'Python' })
const opportunity = TestDataBuilders.createOpportunity({ difficulty: 'advanced' })
const healthStatus = TestDataBuilders.createSecurityHealth('warning')
```

### Request Builders

Build common request patterns:

```typescript
import { HTTPBuilders } from '@/tests/mocks/unified-handlers'

// Authentication
const authRequest = HTTPBuilders.withSession()
const bearerRequest = HTTPBuilders.withAuth('token')

// Content types
const jsonRequest = HTTPBuilders.withJson({ data: 'test' })
const fullRequest = HTTPBuilders.authenticated()
```

### Response Validators

Validate response patterns:

```typescript
import { ResponseValidators } from '@/tests/mocks/unified-handlers'

// Status checks
expect(ResponseValidators.isSuccessful(response)).toBe(true)
expect(ResponseValidators.isUnauthorized(response)).toBe(false)
expect(ResponseValidators.isRateLimited(response)).toBe(false)

// Header checks
expect(ResponseValidators.hasSecurityHeaders(response)).toBe(true)
expect(ResponseValidators.hasRateLimitHeaders(response)).toBe(true)
```

## Advanced Usage

### Custom Handler Selection

```typescript
import { setupCustomMSW, authHandlers, searchHandlers } from '@/tests/mocks/unified-handlers'

// Setup only specific handler groups
const server = setupCustomMSW([...authHandlers, ...searchHandlers])
```

### Scenario Testing

```typescript
import { MSWScenarios } from '@/tests/utils/msw-setup'

describe('Authentication Tests', () => {
  // Use specialized setup
  MSWScenarios.auth()
  
  it('should handle authentication', () => {
    // Test auth functionality only
  })
})

describe('Security Tests', () => {
  // Use security-focused setup
  MSWScenarios.security()
  
  it('should handle security features', () => {
    // Test security functionality only
  })
})
```

### Performance Testing

```typescript
// Test slow responses
const response = await fetch(`/api/search/opportunities${testScenarios.search.slow}`)

// Test rate limiting
const response = await fetch('/api/search/error?type=rate-limit')
expect(ResponseValidators.isRateLimited(response)).toBe(true)

// Benchmark testing
const benchmarkResponse = await fetch('/api/performance/benchmark', {
  method: 'POST',
  body: JSON.stringify({
    test: 'load-test',
    duration: 5000,
    concurrency: 20
  })
})
```

### Error Handling

```typescript
// Simulate various error conditions
const timeoutResponse = await fetch(`/api/health${testScenarios.health.timeout}`)
const errorResponse = await fetch('/api/search/error?type=database')
const validationError = await fetch('/api/search/error?type=validation')

// Network errors
const networkError = await fetch('/api/security/test-error/network')
```

## Integration Examples

### Complete Authentication Flow

```typescript
it('should handle complete auth flow', async () => {
  // 1. Get providers
  const providers = await fetch('/api/auth/providers')
  
  // 2. Get CSRF token
  const csrf = await fetch('/api/auth/csrf')
  
  // 3. Sign in
  const signin = await fetch('/api/auth/signin/github', { method: 'POST' })
  
  // 4. Verify session
  const session = await fetch('/api/auth/session', HTTPBuilders.withSession())
  
  expect(session.ok).toBe(true)
})
```

### Search Workflow

```typescript
it('should handle search workflow', async () => {
  const sessionRequest = HTTPBuilders.withSession()
  
  // Search opportunities
  const opportunities = await fetch(
    '/api/search/opportunities?q=javascript&difficulty=beginner',
    sessionRequest
  )
  
  // Search repositories
  const repositories = await fetch(
    '/api/search/repositories?language=javascript',
    sessionRequest
  )
  
  expect(opportunities.ok).toBe(true)
  expect(repositories.ok).toBe(true)
})
```

### Security Monitoring

```typescript
it('should monitor security status', async () => {
  // Check overall security
  const security = await fetch('/api/security/health')
  
  // Test WebAuthn
  const webauthn = await fetch('/api/security/webauthn/register/options', {
    method: 'POST',
    ...HTTPBuilders.withSession()
  })
  
  // Check application health
  const health = await fetch('/api/health')
  
  expect(security.ok).toBe(true)
  expect(webauthn.ok).toBe(true)
  expect(health.ok).toBe(true)
})
```

## File Structure

```
tests/mocks/
├── README.md                    # This documentation
├── unified-handlers.ts          # Main export file
├── security-handlers.ts         # Security API handlers
├── auth-handlers.ts            # Authentication handlers
├── search-handlers.ts          # Search API handlers
├── health-handlers.ts          # Health check handlers
├── github-handlers.ts          # GitHub API handlers (existing)
└── handler-examples.test.ts    # Usage examples and tests
```

## Migration Guide

### From Existing MSW Setup

If you're migrating from the existing MSW setup:

```typescript
// Old way
import { setupMSW } from '@/tests/utils/msw-setup'
setupMSW()

// New way (comprehensive)
import { setupComprehensiveMSW } from '@/tests/mocks/unified-handlers'
setupComprehensiveMSW()

// Or use specific handlers
import { setupSearchMSW } from '@/tests/mocks/unified-handlers'
setupSearchMSW()
```

### Backward Compatibility

The existing MSW setup continues to work and now includes all new handlers by default. Legacy functions are still available:

```typescript
// These still work
import { server, setupMSW, mockGitHubAPI } from '@/tests/utils/msw-setup'
```

## Best Practices

1. **Use Scenario-Specific Setup**: Only include handlers you need for better test isolation
2. **Leverage Test Scenarios**: Use predefined scenarios for consistent testing
3. **Validate Responses**: Always use response validators to ensure correct behavior
4. **Mock Realistic Data**: Use factories to generate realistic test data
5. **Test Error Cases**: Include error scenarios in your test suites
6. **Performance Testing**: Test both normal and slow response scenarios

## Troubleshooting

### Common Issues

1. **Unhandled Requests**: Check that you're using the correct base URL and handler setup
2. **Authentication Errors**: Ensure you're using `HTTPBuilders.withSession()` for authenticated endpoints
3. **Scenario Not Working**: Verify you're using the correct query parameters from `testScenarios`
4. **Handler Conflicts**: Use scenario-specific setup to avoid handler conflicts

### Debug Mode

Enable MSW debugging to see request handling:

```typescript
// The handlers include debug logging for unmatched requests
// Check console output for MSW DEBUG messages
```

For more examples, see `handler-examples.test.ts` which demonstrates all functionality.