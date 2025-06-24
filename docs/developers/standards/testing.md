# Testing Standards

This document outlines comprehensive testing standards for the contribux project using Vitest.

## Overview

contribux maintains 90%+ test coverage through meaningful, realistic test scenarios:

- **Framework**: Vitest 3.2+ with V8 coverage provider
- **Organization**: Feature-based test structure
- **Quality Focus**: Real-world scenarios over coverage metrics
- **Modern Patterns**: MSW for HTTP mocking, property-based testing

## Test-Driven Development (TDD)

### TDD Workflow

1. **Write failing test** for the feature requirement
2. **Implement minimal code** to make test pass
3. **Refactor** while keeping tests green
4. **Repeat** until feature is complete

```typescript
// 1. Write failing test
describe("UserService", () => {
  it("should create user with valid data", async () => {
    const userData = { email: "test@example.com", name: "Test User" };
    const result = await userService.createUser(userData);

    expect(result.success).toBe(true);
    expect(result.data.email).toBe(userData.email);
  });
});

// 2. Implement to make test pass
// 3. Refactor and add more tests
```

### TDD Benefits

- **Design clarity**: Tests define the API before implementation
- **Comprehensive coverage**: Natural 90%+ coverage through meaningful tests
- **Regression protection**: Immediate feedback on breaking changes
- **Documentation**: Tests serve as usage examples

## Testing Framework Configuration

### Vitest Setup

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        global: {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

### Global Test Setup

```typescript
// tests/setup.ts
import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./mocks/handlers";

// MSW server setup
const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Enhanced test isolation
beforeEach(() => {
  // Reset any global state
  vi.clearAllMocks();
});
```

## Test Organization Standards

### File Structure

```text
tests/
├── database/                    # Database-specific tests
│   ├── connection.test.ts
│   ├── migrations.test.ts
│   └── queries.test.ts
├── features/                    # Feature-based organization
│   ├── auth/
│   │   ├── auth-core.test.ts
│   │   ├── auth-edge-cases.test.ts
│   │   └── auth-integration.test.ts
│   └── users/
│       ├── users-core.test.ts
│       ├── users-edge-cases.test.ts
│       └── users-comprehensive.test.ts
├── mocks/                       # MSW handlers and fixtures
│   ├── handlers.ts
│   └── fixtures/
└── setup.ts                    # Global test configuration
```

### Test File Naming Convention

- `feature-core.test.ts` - Basic functionality, configuration, defaults
- `feature-edge-cases.test.ts` - Error handling, boundary conditions
- `feature-integration.test.ts` - End-to-end flows, multi-service integration
- `feature-comprehensive.test.ts` - Full API testing, happy path scenarios

### Test Organization Pattern

```typescript
// users-core.test.ts
describe("UserService Core Functionality", () => {
  describe("User Creation", () => {
    it("should create user with valid email and name", async () => {
      // Test implementation
    });

    it("should generate unique user ID", async () => {
      // Test implementation
    });
  });

  describe("User Retrieval", () => {
    it("should find user by ID", async () => {
      // Test implementation
    });

    it("should return null for non-existent user", async () => {
      // Test implementation
    });
  });
});
```

## Testing Best Practices

### ✅ Do: Meaningful Test Scenarios

```typescript
describe("GitHub Repository Analysis", () => {
  it("should identify high-impact opportunities for senior developers", async () => {
    // Arrange: Set up realistic repository data
    const repository = createTestRepository({
      stars: 15000,
      issues: [
        createIssue({ labels: ["good-first-issue", "documentation"] }),
        createIssue({ labels: ["enhancement", "help-wanted"] }),
      ],
      languages: { TypeScript: 85, JavaScript: 15 },
    });

    // Act: Analyze repository
    const opportunities = await analyzeRepository(repository);

    // Assert: Verify meaningful results
    expect(opportunities).toHaveLength(2);
    expect(opportunities[0].impact).toBe("high");
    expect(opportunities[0].skillMatch).toBeGreaterThan(0.8);
  });
});
```

### ✅ Do: User-Centric Testing

```typescript
describe("Opportunity Discovery API", () => {
  it("should surface personalized opportunities based on user preferences", async () => {
    // Test from API consumer perspective
    const user = await createTestUser({
      skills: ["TypeScript", "React", "AI"],
      experience: "senior",
      interests: ["open-source", "ai-engineering"],
    });

    const response = await request(app)
      .get("/api/opportunities")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);

    expect(response.body.opportunities).toBeDefined();
    expect(response.body.opportunities[0]).toMatchObject({
      repository: expect.objectContaining({
        name: expect.any(String),
        stars: expect.any(Number),
      }),
      match_score: expect.any(Number),
      difficulty: expect.oneOf(["beginner", "intermediate", "advanced"]),
    });
  });
});
```

### ✅ Do: Realistic Error Scenarios

```typescript
describe("Database Connection Handling", () => {
  it("should gracefully handle connection timeouts", async () => {
    // Simulate realistic database timeout
    const mockDb = vi.mocked(database);
    mockDb.query.mockRejectedValueOnce(
      new Error("Connection timeout after 30s")
    );

    const result = await getUserProfile("user-123");

    expect(result.success).toBe(false);
    expect(result.error.code).toBe("DATABASE_TIMEOUT");
    expect(result.error.retryable).toBe(true);
  });
});
```

## Testing Anti-Patterns to Avoid

### ❌ Don't: Coverage-Driven Testing

```typescript
// BAD: Test written solely for coverage
it("should cover line 42", () => {
  // Artificial test that hits specific lines
  const result = someFunction();
  expect(result).toBeDefined(); // Meaningless assertion
});
```

### ❌ Don't: Internal Implementation Testing

```typescript
// BAD: Testing private methods
it("should call internal hash function", () => {
  const spy = vi.spyOn(userService, "_hashPassword");
  userService.createUser(userData);
  expect(spy).toHaveBeenCalled();
});
```

### ❌ Don't: Artificial Error Scenarios

```typescript
// BAD: Fabricated edge case that wouldn't occur in production
it("should handle negative user ID", () => {
  // This scenario would never happen in real usage
  expect(() => getUserById(-1)).toThrow();
});
```

## Modern Testing Patterns

### MSW for HTTP Mocking

```typescript
// mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/users/:id", ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      id,
      email: `user-${id}@example.com`,
      name: `User ${id}`,
    });
  }),

  http.post("/api/opportunities", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: "opp-123",
      ...body,
      created_at: new Date().toISOString(),
    });
  }),
];
```

### Property-Based Testing

```typescript
import { fc } from "fast-check";

describe("User Validation", () => {
  it("should validate email format for any string input", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = validateEmail(input);
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);

        expect(result.valid).toBe(isValidEmail);
      })
    );
  });
});
```

### Database Testing

```typescript
describe("Database Operations", () => {
  beforeEach(async () => {
    // Clean database state
    await clearTestDatabase();
    await seedTestData();
  });

  it("should maintain data consistency across transactions", async () => {
    const user = await createUser({ email: "test@example.com" });
    const opportunity = await createOpportunity({
      userId: user.id,
      repositoryId: "repo-123",
    });

    // Verify referential integrity
    const fetchedOpportunity = await getOpportunity(opportunity.id);
    expect(fetchedOpportunity.user.email).toBe("test@example.com");
  });
});
```

## Test Commands

### Development Commands

```bash
# Watch mode for active development
pnpm test:watch

# Run specific test file
pnpm test users-core.test.ts

# Run tests for specific feature
pnpm test features/auth/

# Test UI interface
pnpm test:ui
```

### Coverage and Reports

```bash
# Generate coverage report
pnpm test:coverage

# Database-specific tests
pnpm test:db

# CI mode with verbose output
pnpm test:ci
```

### Debugging Tests

```bash
# Run with debugger
pnpm test --inspect-brk

# Verbose output
pnpm test --reporter=verbose

# Show console logs
pnpm test --no-coverage
```

## Quality Checklist

Before committing, ensure:

- [ ] Tests organized by functionality, not coverage metrics
- [ ] All scenarios represent realistic usage patterns
- [ ] MSW used for HTTP mocking with proper setup/teardown
- [ ] Proper async/await patterns throughout
- [ ] No artificial timing dependencies
- [ ] Test names describe business value
- [ ] 90%+ coverage achieved through meaningful scenarios
- [ ] Each test file has clear, logical sections

## Performance Testing

### Load Testing

```typescript
describe("API Performance", () => {
  it("should handle concurrent opportunity requests", async () => {
    const concurrentRequests = 10;
    const requests = Array.from({ length: concurrentRequests }, () =>
      request(app).get("/api/opportunities")
    );

    const responses = await Promise.all(requests);

    expect(responses).toHaveLength(concurrentRequests);
    responses.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body.opportunities).toBeDefined();
    });
  });
});
```

### Vector Search Performance

```typescript
describe("Vector Search Performance", () => {
  it("should complete similarity searches within acceptable time", async () => {
    const startTime = Date.now();

    const results = await searchSimilarRepositories(
      "AI machine learning TypeScript",
      { limit: 10 }
    );

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000); // Under 1 second
    expect(results).toHaveLength(10);
    expect(results[0].similarity_score).toBeGreaterThan(0.7);
  });
});
```
