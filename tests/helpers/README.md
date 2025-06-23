# Test Helpers Documentation

This directory contains comprehensive test utilities for the contribux project, providing type-safe, consistent testing tools across the entire test suite.

## Overview

The test helpers are organized into several key modules:

- **Database utilities** (`db-client.ts`) - Type-safe database connections and SQL execution
- **Vector utilities** (`vector-test-utils.ts`) - Vector similarity testing and HNSW index validation
- **Test factories** (`test-factories.ts`) - Zod-based test data generation with realistic values
- **MSW factories** (`msw-factories.ts`) - Type-safe API mocking for GitHub integration
- **Central exports** (`index.ts`) - Unified interface for all test utilities

## Key Features

### ✅ TypeScript Strict Mode Compliance
- All utilities support `strict: true`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
- Generic type support for database queries and API responses
- Comprehensive type guards and assertions

### ✅ Zod Schema Validation
- All test data factories use Zod for runtime validation
- Ensures test data consistency and catches schema issues early
- Type-safe factory inputs and outputs

### ✅ Vector Operations Support
- Proper halfvec(1536) handling for OpenAI embeddings
- Vector similarity testing with HNSW index validation
- Performance benchmarking for vector operations

### ✅ Database Compatibility
- Unified interface for PostgreSQL and Neon databases
- Transaction support for local PostgreSQL
- Proper parameter handling for both drivers

### ✅ MSW 2.x Integration
- Modern HTTP mocking with type-safe handlers
- Factory patterns for consistent API responses
- Error scenario testing support

## Quick Start

```typescript
import { 
  TestSetup, 
  TestCleanup,
  UserFactory, 
  RepositoryFactory,
  sql,
  VectorTestUtils 
} from '../helpers';

// Database tests
const { executeSql } = await TestSetup.database();
const users = await sql<UserRow>`SELECT * FROM users WHERE id = ${userId}`;

// API mocking tests
TestSetup.api();
const user = UserFactory.create({ github_username: 'testuser' });

// Vector tests
const vectorUtils = await TestSetup.vector();
const results = await vectorUtils.testVectorSimilaritySearch(
  'opportunities', 
  'title_embedding', 
  queryEmbedding
);

// Cleanup
await TestCleanup.all({ vectorUtils });
```

## Module Documentation

### Database Client (`db-client.ts`)

#### Type-Safe SQL Execution

```typescript
import { sql, executeSql } from '../helpers';

// Template literal with automatic parameter handling
const users = await sql<UserRow>`
  SELECT * FROM users 
  WHERE github_username = ${username}
  AND profile_embedding IS NOT NULL
`;

// Direct execution with parameters
const results = await executeSql<RepositoryRow>(
  'SELECT * FROM repositories WHERE owner_login = $1',
  ['testowner']
);
```

#### Vector Handling

```typescript
import { formatVector, sql } from '../helpers';

// Automatic vector formatting
const embedding = generateTestEmbedding('test');
await sql`
  INSERT INTO users (github_username, profile_embedding)
  VALUES (${'testuser'}, ${embedding})
`;

// Manual formatting
const formattedVector = formatVector(embedding); // "[0.1,0.2,...]"
```

#### Transaction Support

```typescript
import { withTransaction } from '../helpers';

const result = await withTransaction(async (client) => {
  await client.query('INSERT INTO users (...) VALUES (...)');
  await client.query('INSERT INTO repositories (...) VALUES (...)');
  return client.query('SELECT * FROM users WHERE ...');
});
```

### Vector Test Utils (`vector-test-utils.ts`)

#### Vector Similarity Testing

```typescript
import { VectorTestUtils } from '../helpers';

const vectorUtils = new VectorTestUtils(databaseUrl);
await vectorUtils.connect();

// Test HNSW index performance
const results = await vectorUtils.testVectorSimilaritySearch(
  'opportunities',
  'title_embedding',
  queryEmbedding,
  10
);

console.log(`Execution time: ${results.executionTime}ms`);
console.log(`Index used: ${results.indexUsed}`);
console.log(`Top similarity: ${results.topSimilarity}`);
```

#### Hybrid Search Testing

```typescript
// Test combined text and vector search
const hybridResults = await vectorUtils.testHybridSearch(
  'opportunities',
  'title',
  'title_embedding',
  'React components',
  queryEmbedding,
  0.3, // text weight
  0.7  // vector weight
);
```

#### Embedding Generation

```typescript
// Generate realistic test embeddings
const embedding = vectorUtils.generateFakeEmbedding('test-seed');
const similarEmbeddings = vectorUtils.generateSimilarEmbeddings(
  embedding, 
  5,    // count
  0.85  // similarity threshold
);
```

### Test Factories (`test-factories.ts`)

#### Zod-Based Data Generation

```typescript
import { 
  UserFactory, 
  RepositoryFactory, 
  OpportunityFactory,
  generateTestEmbedding 
} from '../helpers';

// Create individual entities
const user = UserFactory.create({
  github_username: 'testuser',
  preferred_languages: ['TypeScript', 'Python'],
  profile_embedding: generateTestEmbedding('user-1')
});

const repository = RepositoryFactory.create({
  full_name: 'testowner/test-repo',
  language: 'TypeScript',
  topics: ['ai', 'github', 'contributions']
});

const opportunity = OpportunityFactory.create({
  repository_id: repository.id!,
  type: 'feature',
  difficulty: 'intermediate',
  good_first_issue: true
});
```

#### Batch Creation

```typescript
// Create multiple related entities
const users = UserFactory.createMany(10, {
  role: 'developer',
  skill_level: 'advanced'
});

const repositories = RepositoryFactory.createMany(5, {
  owner_login: 'testorg',
  status: 'active'
});
```

#### Test Scenarios

```typescript
import { TestScenarios } from '../helpers';

// Complete test scenario
const scenario = TestScenarios.createUserWithRepositoryAndOpportunities({
  userOverrides: { skill_level: 'expert' },
  opportunityCount: 5,
  opportunityOverrides: { type: 'bug_fix' }
});

// Similar opportunities for vector testing
const baseOpportunity = OpportunityFactory.create();
const similarOpportunities = TestScenarios.createSimilarOpportunities(
  baseOpportunity, 
  10
);
```

### MSW Factories (`msw-factories.ts`)

#### Type-Safe API Mocking

```typescript
import { 
  MSWHandlerFactory, 
  GitHubUserMockFactory,
  CommonHandlerSets 
} from '../helpers';

// Create specific handlers
const userHandler = MSWHandlerFactory.createUserHandler({
  login: 'testuser',
  public_repos: 15
});

const repoHandler = MSWHandlerFactory.createRepositoryHandler(
  'testowner', 
  'test-repo',
  { stargazers_count: 100 }
);

// Use common handler sets
const handlers = CommonHandlerSets.comprehensive();
```

#### Error Scenario Testing

```typescript
// Test authentication errors
const authErrorHandler = MSWHandlerFactory.createErrorHandler(
  '/user', 
  401
);

// Test rate limiting
const rateLimitHandler = MSWHandlerFactory.createErrorHandler(
  '/search/repositories',
  403,
  { message: 'API rate limit exceeded' }
);
```

#### GraphQL Mocking

```typescript
const graphQLHandler = MSWHandlerFactory.createGraphQLHandler({
  'viewer': {
    viewer: { login: 'testuser', name: 'Test User' }
  },
  'repository': {
    repository: { name: 'test-repo', stargazerCount: 100 }
  }
});
```

### Test Setup and Cleanup

#### Database Setup

```typescript
import { TestSetup, TestCleanup } from '../helpers';

// In beforeAll
const { executeSql } = await TestSetup.database();

// In beforeEach
TestCleanup.resetCounters();

// In afterAll
await TestCleanup.database();
```

#### Vector Testing Setup

```typescript
// In beforeAll
const vectorUtils = await TestSetup.vector();

// Test vector operations
const results = await vectorUtils.testVectorSimilaritySearch(...);

// In afterAll
await TestCleanup.database(vectorUtils);
```

#### Integration Testing

```typescript
// Complete setup
const { database, api } = await TestSetup.integration();

// Use both database and API mocking
const user = UserFactory.create();
await database.executeSql`INSERT INTO users (...) VALUES (...)`;

// Complete cleanup
await TestCleanup.all({ vectorUtils });
```

## Testing Patterns

### Database Testing Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestSetup, TestCleanup, sql, UserFactory } from '../helpers';

describe('User Database Operations', () => {
  let testDb: Awaited<ReturnType<typeof TestSetup.database>>;

  beforeAll(async () => {
    testDb = await TestSetup.database();
  });

  afterAll(async () => {
    await TestCleanup.database();
  });

  it('should create user with embedding', async () => {
    const userData = UserFactory.create();
    
    await sql`
      INSERT INTO users (github_id, github_username, profile_embedding)
      VALUES (${userData.github_id}, ${userData.github_username}, ${userData.profile_embedding})
    `;

    const users = await sql<{ github_username: string }>`
      SELECT github_username FROM users WHERE github_id = ${userData.github_id}
    `;

    expect(users).toHaveLength(1);
    expect(users[0]?.github_username).toBe(userData.github_username);
  });
});
```

### API Testing Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { TestSetup, MSWHandlerFactory, GitHubUserMockFactory } from '../helpers';

describe('GitHub API Integration', () => {
  TestSetup.api();

  it('should fetch user data', async () => {
    const expectedUser = GitHubUserMockFactory.create({
      login: 'testuser'
    });

    // MSW will automatically handle the request
    const response = await fetch('https://api.github.com/user');
    const user = await response.json();

    expect(user.login).toBe(expectedUser.login);
  });
});
```

### Vector Testing Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestSetup, TestCleanup, generateTestEmbedding } from '../helpers';

describe('Vector Similarity Search', () => {
  let vectorUtils: VectorTestUtils;

  beforeAll(async () => {
    vectorUtils = await TestSetup.vector();
  });

  afterAll(async () => {
    await TestCleanup.database(vectorUtils);
  });

  it('should perform similarity search', async () => {
    const queryEmbedding = generateTestEmbedding('test-query');
    
    const results = await vectorUtils.testVectorSimilaritySearch(
      'opportunities',
      'title_embedding',
      queryEmbedding
    );

    expect(results.resultCount).toBeGreaterThan(0);
    expect(results.indexUsed).toBe(true);
    expect(results.executionTime).toBeLessThan(1000);
  });
});
```

## Performance Considerations

### Database Queries
- Use `executeSql` with client parameter for transactions
- Enable `logQuery` option for debugging slow queries
- Use proper indexes for vector operations

### Vector Operations
- HNSW indexes require proper configuration (`m=16`, `ef_construction=200`)
- Batch vector operations when possible
- Monitor index usage with `EXPLAIN ANALYZE`

### API Mocking
- Reset handlers between tests with `mswServer.resetHandlers()`
- Use factory patterns for consistent test data
- Avoid overly complex mock responses

## Environment Variables

Required for different test scenarios:

```bash
# Database testing
DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/test_db
DATABASE_URL=postgresql://user:pass@localhost:5432/dev_db

# API testing (optional)
GITHUB_TOKEN=your_token_here

# CI/CD
CI=true
```

## Error Handling

### Common Issues and Solutions

1. **Vector dimension mismatch**
   ```typescript
   // ❌ Wrong
   const embedding = [1, 2, 3]; // Only 3 dimensions
   
   // ✅ Correct
   const embedding = generateTestEmbedding('test'); // 1536 dimensions
   ```

2. **Database connection issues**
   ```typescript
   // ❌ Wrong
   const result = await sql`SELECT * FROM users`;
   
   // ✅ Correct
   try {
     const result = await sql`SELECT * FROM users`;
   } catch (error) {
     if (error.message.includes('connection')) {
       // Handle connection issues
     }
   }
   ```

3. **MSW handler conflicts**
   ```typescript
   // ❌ Wrong - handlers conflict
   mswServer.use(handler1, handler2); // Both handle same endpoint
   
   // ✅ Correct
   mswServer.resetHandlers(handler1); // Replace existing handlers
   ```

## Best Practices

1. **Always use factories for test data**
2. **Reset counters between test suites**
3. **Use proper cleanup in afterAll hooks**
4. **Validate schemas with Zod in factories**
5. **Use type-safe query functions**
6. **Test both success and error scenarios**
7. **Monitor performance with benchmarks**
8. **Use realistic test data patterns**

## Contributing

When adding new test utilities:

1. Follow TypeScript strict mode requirements
2. Add Zod schemas for validation
3. Include comprehensive documentation
4. Add test coverage for utilities themselves
5. Update this README with examples
6. Export utilities from `index.ts`