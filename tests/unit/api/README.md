# API Route Testing Infrastructure

This directory contains the comprehensive testing infrastructure for Next.js API routes in the Contribux application.

## Overview

We have implemented multiple approaches for testing API routes to ensure robust coverage and proper mocking:

### 1. MSW-Based HTTP Testing (`api-routes-core.test.ts`)
**✅ RECOMMENDED APPROACH**

This is the primary testing strategy that uses Mock Service Worker (MSW) 2.x to intercept HTTP requests and test API behavior end-to-end.

**Features:**
- Tests actual HTTP requests/responses
- Proper MSW 2.x integration with fetch mocking
- Comprehensive error handling testing
- Schema validation with Zod
- Realistic API behavior simulation

**Usage:**
```typescript
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'healthy' })
  })
)

// Tests use real fetch() calls
const response = await fetch('http://localhost:3000/api/health')
```

### 2. Direct Route Handler Testing (`nextjs-api-testing-utils.ts`)
**⚠️ EXPERIMENTAL**

Utilities for testing Next.js route handlers directly without HTTP calls.

**Features:**
- Direct function testing
- Faster test execution
- Mock NextRequest/NextResponse
- Requires careful mocking setup

**Usage:**
```typescript
import { GET } from '../../src/app/api/health/route'
import { createMockRequest, testApiRoute } from './nextjs-api-testing-utils'

const request = createMockRequest('/api/health')
const response = await testApiRoute(GET, request)
```

### 3. Legacy HTTP Testing (`search-routes.test.ts`)
**❌ DEPRECATED**

The original approach that has MSW setup issues. Kept for reference but should not be used for new tests.

## Architecture

### Fetch Mocking Strategy

The test infrastructure properly handles fetch mocking for different test scenarios:

1. **MSW Mode**: Uses real fetch with MSW interception
2. **Mock Mode**: Uses Vitest mocked fetch for unit tests
3. **Automatic Switching**: Tests can enable/disable MSW as needed

### Database Mocking

All tests mock the database layer to avoid real database calls:

```typescript
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn().mockImplementation(() => Promise.resolve(mockData))
}))
```

### Environment Setup

Tests include proper environment variable setup:

```typescript
process.env.NODE_ENV = 'test'
process.env.NEXTAUTH_SECRET = 'secure-test-token-32chars-minimum'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
```

## Test Coverage

### Health Check API (`/api/health`)
- ✅ Healthy status response
- ✅ Database error handling
- ✅ Memory status monitoring
- ✅ Proper HTTP status codes
- ✅ Response schema validation

### Search Opportunities API (`/api/search/opportunities`)
- ✅ Basic search functionality
- ✅ Pagination parameters
- ✅ Query filtering (difficulty, type, languages)
- ✅ Validation error handling
- ✅ Database error responses
- ✅ Schema compliance

### NextAuth API (`/api/auth/[...nextauth]`)
- ✅ Session management
- ✅ Provider configuration
- ✅ OAuth flow simulation
- ✅ Authentication headers
- ✅ Error responses

## Best Practices

### 1. Use MSW for HTTP Testing
```typescript
// ✅ Good: MSW-based testing
const server = setupServer(
  http.get('/api/health', () => HttpResponse.json({ status: 'healthy' }))
)
```

### 2. Validate Responses with Zod
```typescript
// ✅ Good: Schema validation
const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
})

const validated = HealthResponseSchema.parse(data)
```

### 3. Test Error Scenarios
```typescript
// ✅ Good: Test both success and error cases
it('should handle database errors', async () => {
  const response = await fetch('/api/health-error')
  expect(response.status).toBe(503)
})
```

### 4. Mock Database Calls
```typescript
// ✅ Good: Proper database mocking
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn().mockResolvedValue(mockData)
}))
```

### 5. Clean Test Environment
```typescript
// ✅ Good: Proper cleanup
afterEach(() => {
  server.resetHandlers()
  vi.clearAllMocks()
})
```

## Common Issues and Solutions

### Issue: MSW Not Intercepting Requests
**Solution:** Ensure proper fetch polyfill and MSW setup:
```typescript
// In setup.ts
if (typeof globalThis.fetch === 'undefined') {
  const { fetch: undiciFetch } = require('undici')
  globalThis.fetch = undiciFetch
}
```

### Issue: Path Resolution Errors
**Solution:** Use relative imports for API routes:
```typescript
// ✅ Good
import { GET } from '../../src/app/api/health/route'

// ❌ Bad (may fail in tests)
import { GET } from '@/app/api/health/route'
```

### Issue: NextAuth Route Testing
**Solution:** Mock the auth handlers directly:
```typescript
vi.mock('@/lib/auth', () => ({
  handlers: {
    GET: vi.fn().mockImplementation(async () => mockResponse),
    POST: vi.fn().mockImplementation(async () => mockResponse),
  }
}))
```

## Running Tests

```bash
# Run all API tests
pnpm test tests/api/

# Run specific test file
pnpm test tests/api/api-routes-core.test.ts

# Run with coverage
pnpm test:coverage tests/api/

# Watch mode
pnpm test:watch tests/api/
```

## File Structure

```
tests/api/
├── README.md                          # This documentation
├── api-routes-core.test.ts            # ✅ Main MSW-based tests
├── nextjs-api-testing-utils.ts        # Utility functions for direct testing
├── health-route.test.ts               # Direct handler testing (experimental)
├── search-opportunities-route.test.ts # Direct handler testing (experimental)
├── nextauth-route.test.ts             # Direct handler testing (experimental)
└── search-routes.test.ts              # ❌ Legacy test (deprecated)
```

## Future Improvements

1. **Extend MSW Coverage**: Add more API endpoints to the MSW test suite
2. **Performance Testing**: Add load testing for API routes
3. **Integration Testing**: Test API routes with real database in CI
4. **Error Monitoring**: Add comprehensive error scenario testing
5. **Security Testing**: Add authentication and authorization tests

---

For questions or improvements to the API testing infrastructure, please refer to the test files and this documentation.