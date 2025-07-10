# Enhanced Test Environment Setup

This document describes the enhanced test environment configuration that provides complete isolation between test runs and production/development environments.

## Overview

The enhanced test environment provides:

- **Complete Environment Isolation**: Tests run in isolated environments with their own databases, configuration, and mocks
- **Type-Specific Configuration**: Different test types (unit, integration, database, e2e, performance) have optimized configurations
- **Automatic Service Mocking**: GitHub API, authentication, and external services are automatically mocked based on test type
- **Database Isolation**: Each test run gets its own isolated database instance
- **Memory Monitoring**: Built-in memory leak detection and resource monitoring
- **Enhanced Cleanup**: Comprehensive cleanup ensures no test pollution

## Test Environment Types

### Unit Tests (`unit`)
- **Purpose**: Fast, isolated component and function testing
- **Features**: Minimal setup, no database, basic mocking
- **Database**: Disabled
- **Services**: All external services mocked
- **Isolation**: Basic (mock clearing between tests)
- **Performance**: Optimized for speed (4 concurrent workers)

### Integration Tests (`integration`)
- **Purpose**: Testing component interactions with external services
- **Features**: Full service mocking, isolated database, authentication flows
- **Database**: Temporary isolated database per test run
- **Services**: GitHub API, authentication, Redis mocked
- **Isolation**: Full (complete reset between tests)
- **Performance**: Sequential execution to prevent conflicts

### Database Tests (`database`)
- **Purpose**: Testing database operations, migrations, and queries
- **Features**: Isolated test database, connection pooling, migration testing
- **Database**: Dedicated test database with migrations
- **Services**: Minimal external service mocking
- **Isolation**: Full database isolation
- **Performance**: Limited concurrency (3 workers max)

### E2E Tests (`e2e`)
- **Purpose**: End-to-end user journey testing
- **Features**: Full application stack, browser automation, real-like environment
- **Database**: Complete isolated database
- **Services**: All services mocked with realistic behavior
- **Isolation**: Complete isolation with fresh state
- **Performance**: Sequential execution, extended timeouts

### Performance Tests (`performance`)
- **Purpose**: Load testing, stress testing, performance benchmarking
- **Features**: High-capacity database, realistic service mocking, memory monitoring
- **Database**: Optimized for high throughput
- **Services**: GitHub API with rate limiting simulation
- **Isolation**: Full isolation with performance monitoring
- **Performance**: Optimized for load (higher resource limits)

## Configuration Files

### Core Configuration
- `tests/config/test-environment.config.ts` - Main environment configuration
- `tests/config/test-database-manager.ts` - Database isolation management
- `tests/config/test-service-mocks.ts` - Service mocking configuration
- `tests/config/enhanced-test-setup.ts` - Unified setup orchestration

### Setup Files
- `tests/setup-enhanced.ts` - Enhanced setup with backward compatibility
- `tests/setup-database-enhanced.ts` - Database-specific enhanced setup
- `tests/setup-integration-enhanced.ts` - Integration-specific enhanced setup

## Usage

### Basic Usage

```typescript
// tests/my-component.test.tsx
import { setupUnitTests } from '@/tests/config/enhanced-test-setup'

// Automatically sets up unit test environment
setupUnitTests()

describe('MyComponent', () => {
  it('should render correctly', () => {
    // Test implementation
  })
})
```

### Advanced Usage

```typescript
// tests/integration/auth-flow.test.ts
import { setupIntegrationTests } from '@/tests/config/enhanced-test-setup'
import { integrationTestUtils } from '@/tests/setup-integration-enhanced'

const { config, addCleanupTask } = setupIntegrationTests()

describe('Authentication Flow', () => {
  beforeEach(async () => {
    // Wait for services to be ready
    await integrationTestUtils.waitForServices()
  })

  it('should authenticate user', async () => {
    const testUser = integrationTestUtils.getTestUser()
    const session = integrationTestUtils.getTestSession()
    
    // Test authentication flow with mocked services
    // ...
  })
})
```

### Database Testing

```typescript
// tests/database/migrations.test.ts
import { setupDatabaseTests } from '@/tests/config/enhanced-test-setup'
import { dbTestUtils } from '@/tests/setup-database-enhanced'

setupDatabaseTests()

describe('Database Migrations', () => {
  beforeEach(async () => {
    await dbTestUtils.waitForReady()
  })

  it('should run migrations successfully', async () => {
    const connection = dbTestUtils.getConnection()
    const health = await dbTestUtils.checkHealth()
    
    expect(health.healthy).toBe(true)
    expect(connection).toBeDefined()
  })
})
```

## NPM Scripts

### Enhanced Test Scripts

```bash
# Run unit tests with enhanced environment
pnpm test:unit:enhanced

# Run database tests with enhanced isolation
pnpm test:db:enhanced

# Run integration tests with full mocking
pnpm test:integration:enhanced

# Run all enhanced tests
pnpm test:all:enhanced
```

### Legacy Compatibility

```bash
# Existing scripts continue to work
pnpm test              # Standard unit tests
pnpm test:db          # Standard database tests
pnpm test:integration # Standard integration tests
```

## Environment Variables

### Test Environment Isolation

The enhanced setup automatically configures environment variables for each test type:

```bash
# Automatically set for all test types
NODE_ENV=test
VITEST=true
SKIP_ENV_VALIDATION=true

# Security configuration (isolated test keys)
NEXTAUTH_SECRET=<test-specific-secret>
ENCRYPTION_KEY=<test-specific-key>

# Database configuration (test-specific)
DATABASE_URL_TEST=<isolated-test-database>

# Service configuration (test-specific)
LOG_LEVEL=warn|error
ENABLE_OAUTH=true|false
ENABLE_WEBAUTHN=true|false
```

### Environment File Loading

Environment files are loaded in this order of precedence:
1. `.env.test.local` (git-ignored, for local test overrides)
2. `.env.test` (committed test defaults)
3. `.env.local` (git-ignored, general local overrides)
4. `.env` (committed defaults)

## Database Isolation

### Automatic Database Management

Each test environment gets its own isolated database:

```typescript
// Automatic database naming with isolation
contribux_test_unit_<timestamp>_<process_id>_<random>
contribux_test_integration_<timestamp>_<process_id>_<random>
contribux_test_database_<timestamp>_<process_id>_<random>
```

### Migration Strategies

- **Fresh**: Drop all tables and run all migrations (integration, e2e)
- **Incremental**: Run only pending migrations (database tests)
- **None**: No migration management (unit tests)

### Connection Pooling

Test environments use optimized connection pooling:

```typescript
// Unit tests: No database connections
// Integration tests: 1-3 connections
// Database tests: 1-5 connections
// E2E tests: 2-10 connections
// Performance tests: 5-20 connections
```

## Service Mocking

### GitHub API Mocking

```typescript
// Automatic GitHub API mocking based on test type
const client = new GitHubClient() // Automatically mocked in tests

// Mock responses include:
// - Repository search results
// - Issue search results
// - Rate limit information
// - User information
// - Error simulation (when enabled)
```

### Authentication Mocking

```typescript
// Automatic authentication mocking
const session = await auth() // Returns test user session

// Mock includes:
// - Test user with realistic data
// - Valid session tokens
// - Provider information
// - Configurable session timeout
```

### MSW Integration

The enhanced setup automatically configures MSW (Mock Service Worker) for HTTP request mocking:

```typescript
// Automatic HTTP request mocking
// - Health checks
// - API endpoints
// - External service calls
// - Error simulation
```

## Memory Monitoring

### Automatic Memory Leak Detection

```typescript
// Memory monitoring is enabled for integration, e2e, and performance tests
// Warnings are logged when memory usage exceeds configured thresholds:

// Unit tests: 128MB threshold
// Integration tests: 512MB threshold
// Database tests: 256MB threshold
// E2E tests: 1024MB threshold
// Performance tests: 2048MB threshold
```

### Memory Utilities

```typescript
import { testUtils } from '@/tests/config/enhanced-test-setup'

// Check current memory usage
const memory = testUtils.getMemoryUsage()
console.log(`Memory: ${memory.current}MB (baseline: ${memory.baseline}MB)`)

// Force garbage collection
testUtils.triggerGC()

// Wait for async operations
await testUtils.waitFor(1000)
```

## Migration Guide

### From Standard to Enhanced Tests

1. **Update imports**:
   ```typescript
   // Before
   import { setupTestEnvironment } from '@/tests/utils/test-environment-manager'
   
   // After
   import { setupIntegrationTests } from '@/tests/config/enhanced-test-setup'
   ```

2. **Update setup calls**:
   ```typescript
   // Before
   const env = setupTestEnvironment({ useDatabase: true, useAuth: true })
   
   // After
   const { config, addCleanupTask } = setupIntegrationTests()
   ```

3. **Use enhanced utilities**:
   ```typescript
   // Before
   // Manual service mocking and database setup
   
   // After
   import { integrationTestUtils } from '@/tests/setup-integration-enhanced'
   await integrationTestUtils.waitForServices()
   ```

4. **Update package.json scripts**:
   ```json
   {
     "scripts": {
       "test:integration": "pnpm test:integration:enhanced"
     }
   }
   ```

### Backward Compatibility

The enhanced setup maintains backward compatibility:

- Existing test files continue to work without changes
- Legacy setup files are still supported
- Environment variable loading remains the same
- All existing utilities are re-exported

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Ensure PostgreSQL is running locally
   brew services start postgresql
   
   # Check database permissions
   createuser -s test
   createdb -O test contribux_test
   ```

2. **Memory Warnings**
   ```typescript
   // Add manual cleanup in tests with high memory usage
   afterEach(() => {
     testUtils.triggerGC()
   })
   ```

3. **Service Mock Issues**
   ```typescript
   // Reset mocks if tests interfere with each other
   beforeEach(async () => {
     await integrationTestUtils.resetMocks()
   })
   ```

4. **Environment Variable Conflicts**
   ```bash
   # Use .env.test.local for local overrides
   echo "DATABASE_URL_TEST=postgresql://localhost:5432/my_test_db" > .env.test.local
   ```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm test:integration:enhanced

# Enable memory profiling
NODE_OPTIONS="--expose-gc" pnpm test:integration:enhanced
```

## Performance Considerations

### Test Execution Speed

- **Unit tests**: ~50ms per test (no I/O)
- **Integration tests**: ~500ms per test (with mocks)
- **Database tests**: ~1s per test (with database)
- **E2E tests**: ~5-30s per test (with browser)

### Resource Usage

- **Memory**: Each test environment uses 50-200MB baseline
- **Database**: Each isolated database uses ~10-50MB
- **CPU**: Concurrency is optimized per test type

### Optimization Tips

1. **Use appropriate test types**
   - Prefer unit tests for business logic
   - Use integration tests for API endpoints
   - Use database tests for complex queries
   - Use E2E tests for critical user flows

2. **Minimize test database usage**
   - Use mocks instead of real database when possible
   - Clean up test data efficiently
   - Use transactions for rollback when appropriate

3. **Optimize service mocks**
   - Mock only necessary services
   - Use static responses when possible
   - Avoid complex mock logic

## Security Considerations

### Test Data Isolation

- All test databases are isolated and cleaned up automatically
- Test environment variables use secure but non-production values
- Service mocks prevent real external API calls

### Secret Management

- Test secrets are hardcoded and safe for testing
- Production secrets are never used in tests
- Environment variable validation is skipped for tests

### Network Isolation

- All external requests are mocked by default
- Real network calls require explicit configuration
- MSW prevents accidental external requests

## Future Enhancements

### Planned Features

1. **Visual Test Environment Dashboard**
   - Real-time monitoring of test environments
   - Resource usage visualization
   - Test execution metrics

2. **Advanced Database Seeding**
   - Configurable test data sets
   - Realistic data generation
   - Performance test data scaling

3. **Enhanced Mock Management**
   - Dynamic mock configuration
   - Scenario-based mock responses
   - Mock interaction recording

4. **CI/CD Integration**
   - Parallel test environment provisioning
   - Resource usage reporting
   - Performance regression detection

### Contributing

To contribute to the enhanced test environment:

1. Follow the existing patterns in `tests/config/`
2. Ensure backward compatibility
3. Add comprehensive documentation
4. Include performance considerations
5. Test with all environment types

For questions or suggestions, please refer to the project's contribution guidelines.