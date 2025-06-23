# Database Testing with Vitest: Comprehensive Guide

This guide provides best practices for testing database operations in Node.js applications using Vitest, focusing on PostgreSQL/Neon serverless patterns, mocking strategies, and performance optimization.

## Table of Contents

1. [Testing Strategy Overview](#testing-strategy-overview)
2. [Database Mocking Patterns](#database-mocking-patterns)
3. [Test Database Configuration](#test-database-configuration)
4. [Environment Variable Management](#environment-variable-management)
5. [Test Isolation and Cleanup](#test-isolation-and-cleanup)
6. [Performance Optimization](#performance-optimization)
7. [Prisma-Specific Patterns](#prisma-specific-patterns)
8. [Code Examples](#code-examples)

## Testing Strategy Overview

### When to Mock vs Real Database

**Unit Tests**: Use mocking for fast, isolated tests

- In-memory databases or mock clients
- Focus on business logic without database overhead
- Fast execution for CI/CD pipelines

**Integration Tests**: Use real databases for end-to-end validation

- Real database behavior and constraints
- Transaction handling and concurrency
- Performance characteristics

**Recommendation**:

- 80% unit tests with mocks
- 20% integration tests with real databases

## Database Mocking Patterns

### 1. Vitest Mock Functions

```typescript
// Basic database client mocking
import { vi } from "vitest";

// Mock entire database module
vi.mock("./database/client", () => ({
  query: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

// Type-safe mocking with vitest-mock-extended
import { mockDeep } from "vitest-mock-extended";
import type { DatabaseClient } from "./types";

const mockDb = mockDeep<DatabaseClient>();
```

### 2. Prisma Client Mocking

```typescript
// Install: pnpm add -D vitest-mock-extended prisma-mock-vitest

// Mock Prisma Client
import { mockDeep, mockReset, DeepMockProxy } from "vitest-mock-extended";
import { PrismaClient } from "@prisma/client";

const mockPrisma = mockDeep<PrismaClient>();

vi.mock("./lib/prisma", () => ({
  prisma: mockPrisma,
}));

// In tests
beforeEach(() => {
  mockReset(mockPrisma);
});

test("should create user", async () => {
  const mockUser = { id: "1", email: "test@example.com", name: "Test User" };

  mockPrisma.user.create.mockResolvedValue(mockUser);

  const result = await userService.createUser({
    email: "test@example.com",
    name: "Test User",
  });

  expect(result).toEqual(mockUser);
  expect(mockPrisma.user.create).toHaveBeenCalledWith({
    data: { email: "test@example.com", name: "Test User" },
  });
});
```

### 3. In-Memory Database with PGlite

```typescript
// For PostgreSQL-compatible testing without Docker
import { vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

vi.mock("src/db", async (importOriginal) => {
  const { default: _, ...rest } = await importOriginal();
  const { PGlite } = await vi.importActual("@electric-sql/pglite");
  const { drizzle } = await vi.importActual("drizzle-orm/pglite");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Apply schema to in-memory database
  const { pushSchema } = require("drizzle-kit/api");
  const { apply } = await pushSchema(schema, db);
  await apply();

  // Seed test data
  await db.insert(User).values({
    email: "test@example.com",
    externalId: "test-id",
  });

  return { default: db, ...rest };
});
```

## Test Database Configuration

### 1. Environment-Specific Setup

```typescript
// vitest.config.ts
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  test: {
    // Load all environment variables, not just VITE_ prefixed
    env: loadEnv(mode, process.cwd(), ""),

    // Disable isolation for better performance with proper cleanup
    isolate: false,

    // Use single thread for database tests to prevent race conditions
    threads: false,

    // Setup files for database initialization
    setupFiles: ["./tests/setup.ts"],

    // Global test configuration
    globals: true,
    environment: "node",

    // Longer timeout for database operations
    testTimeout: 30000,
  },
}));
```

### 2. Database Connection Management

```typescript
// tests/setup.ts
import { loadEnv } from "vite";
import { beforeAll, afterAll } from "vitest";

// Load test environment variables
const testEnv = loadEnv("test", process.cwd(), "");

// Set test database configuration
process.env.DATABASE_URL = testEnv.DATABASE_URL_TEST;
process.env.NODE_ENV = "test";

let testDatabase: any;

beforeAll(async () => {
  // Initialize test database connection
  testDatabase = await createTestDatabaseConnection();

  // Run migrations or push schema
  await setupTestSchema();

  return async () => {
    // Cleanup after all tests
    await testDatabase?.close();
  };
});

// Per-test cleanup
beforeEach(async () => {
  // Truncate all tables for clean slate
  await truncateAllTables();

  // Seed common test data if needed
  await seedTestData();
});
```

### 3. Docker-Based Testing

```yaml
# tests/docker-compose.test.yml
version: "3"
services:
  test-db:
    image: postgres:16
    container_name: test-postgres
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_pass
      POSTGRES_DB: test_db
    tmpfs:
      - /var/lib/postgresql/data # In-memory for speed
```

```typescript
// tests/database/docker-setup.ts
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function startTestDatabase() {
  try {
    await execAsync("docker-compose -f tests/docker-compose.test.yml up -d");

    // Wait for database to be ready
    await waitForDatabase();

    // Run migrations
    await execAsync("npm run db:migrate:test");
  } catch (error) {
    console.error("Failed to start test database:", error);
    throw error;
  }
}

export async function stopTestDatabase() {
  await execAsync("docker-compose -f tests/docker-compose.test.yml down");
}
```

## Environment Variable Management

### 1. Environment File Structure

```bash
# .env (development)
DATABASE_URL="postgresql://user:pass@localhost:5432/dev_db"

# .env.test (testing)
DATABASE_URL="postgresql://test_user:test_pass@localhost:5433/test_db"
DATABASE_URL_TEST="postgresql://test_user:test_pass@localhost:5433/test_db"

# .env.ci (CI/CD)
DATABASE_URL="postgresql://ci_user:ci_pass@postgres:5432/ci_db"
```

### 2. Dynamic Environment Loading

```typescript
// tests/environment.ts
import { loadEnv } from "vite";

export function setupTestEnvironment() {
  const mode = process.env.NODE_ENV || "test";
  const env = loadEnv(mode, process.cwd(), "");

  // Override environment variables for testing
  Object.assign(process.env, {
    ...env,
    NODE_ENV: "test",
    LOG_LEVEL: "error", // Reduce noise in tests
  });

  // Validate required environment variables
  const required = ["DATABASE_URL_TEST"];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}
```

## Test Isolation and Cleanup

### 1. Transaction-Based Isolation

```typescript
// tests/transaction-isolation.ts
import { beforeEach, afterEach } from "vitest";

let currentTransaction: any;

beforeEach(async () => {
  // Start transaction for each test
  currentTransaction = await db.transaction();

  // Use transaction client for all operations
  global.testDb = currentTransaction;
});

afterEach(async () => {
  // Rollback transaction to clean state
  await currentTransaction.rollback();
});
```

### 2. Table Truncation Strategy

```typescript
// tests/cleanup.ts
export async function truncateAllTables() {
  const tables = await db.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    AND tablename NOT LIKE '%_prisma_%'
  `);

  // Disable foreign key checks temporarily
  await db.query("SET session_replication_role = replica;");

  // Truncate all tables
  for (const { tablename } of tables) {
    await db.query(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE;`);
  }

  // Re-enable foreign key checks
  await db.query("SET session_replication_role = DEFAULT;");
}

// Alternative: Use TRUNCATE with foreign key handling
export async function safeTruncateAllTables() {
  const tableNames = await getTableNames();

  if (tableNames.length > 0) {
    await db.query(`
      TRUNCATE TABLE ${tableNames.map((name) => `"${name}"`).join(", ")} 
      RESTART IDENTITY CASCADE
    `);
  }
}
```

### 3. Cleanup Hooks

```typescript
// Advanced cleanup with Vitest hooks
import { onTestFinished, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  // Setup test data
  const testData = await setupTestData();

  // Register cleanup for this specific test
  onTestFinished(async () => {
    await cleanupTestData(testData.id);
  });
});

afterEach(() => {
  // Clear mocks and reset state
  vi.clearAllMocks();
  vi.resetModules();
});
```

## Performance Optimization

### 1. Vitest Configuration for Speed

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // Disable isolation for faster tests (requires proper cleanup)
    isolate: false,

    // Single thread to prevent database race conditions
    threads: false,

    // Increase test timeout for database operations
    testTimeout: 15000,

    // Pool configuration for performance
    poolOptions: {
      forks: {
        isolate: false,
      },
    },

    // Coverage configuration
    coverage: {
      provider: "v8",
      exclude: [
        "**/tests/**",
        "**/coverage/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
  },
});
```

### 2. Database Connection Pooling

```typescript
// lib/test-db.ts
import { Pool } from "pg";

let testPool: Pool | null = null;

export function getTestDatabasePool() {
  if (!testPool) {
    testPool = new Pool({
      connectionString: process.env.DATABASE_URL_TEST,
      max: 1, // Single connection for tests
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  return testPool;
}

export async function closeTestDatabasePool() {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}
```

### 3. Parallel Test Optimization

```typescript
// For tests that can run in parallel
export default defineConfig({
  test: {
    // Enable parallel execution for unit tests
    include: ["**/*.unit.test.ts"],
    threads: true,
    isolate: true,
  },
});

// Separate config for integration tests
export const integrationConfig = defineConfig({
  test: {
    include: ["**/*.integration.test.ts"],
    threads: false, // Sequential for database tests
    isolate: false,
  },
});
```

## Prisma-Specific Patterns

### 1. Prisma Test Client Setup

```typescript
// tests/prisma-setup.ts
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

let prismaTestClient: PrismaClient;

export async function setupPrismaTest() {
  // Generate test database URL
  const testDbUrl = process.env.DATABASE_URL_TEST;

  // Push schema to test database (faster than migrate)
  execSync("npx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });

  // Create test client
  prismaTestClient = new PrismaClient({
    datasources: {
      db: { url: testDbUrl },
    },
  });

  await prismaTestClient.$connect();

  return prismaTestClient;
}

export async function teardownPrismaTest() {
  await prismaTestClient?.$disconnect();
}
```

### 2. Prisma Mock Factory

```typescript
// tests/mocks/prisma.ts
import { PrismaClient } from "@prisma/client";
import { mockDeep, DeepMockProxy } from "vitest-mock-extended";

export type MockPrismaClient = DeepMockProxy<PrismaClient>;

export function createMockPrismaClient(): MockPrismaClient {
  return mockDeep<PrismaClient>();
}

// Usage in tests
export function mockPrismaResponses(mockPrisma: MockPrismaClient) {
  return {
    user: {
      findMany: (data: any[]) => {
        mockPrisma.user.findMany.mockResolvedValue(data);
      },
      create: (data: any) => {
        mockPrisma.user.create.mockResolvedValue(data);
      },
      update: (data: any) => {
        mockPrisma.user.update.mockResolvedValue(data);
      },
      delete: (data: any) => {
        mockPrisma.user.delete.mockResolvedValue(data);
      },
    },
  };
}
```

## Code Examples

### 1. Complete Test Setup

```typescript
// tests/integration/user.integration.test.ts
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { setupTestDatabase, teardownTestDatabase } from "../helpers/database";
import { UserService } from "../../src/services/user";

describe("User Integration Tests", () => {
  let userService: UserService;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const { db, cleanup: dbCleanup } = await setupTestDatabase();
    cleanup = dbCleanup;
    userService = new UserService(db);
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedTestData();
  });

  test("should create and retrieve user", async () => {
    // Arrange
    const userData = {
      email: "test@example.com",
      name: "Test User",
      githubId: "test-github-id",
    };

    // Act
    const createdUser = await userService.createUser(userData);
    const retrievedUser = await userService.getUserById(createdUser.id);

    // Assert
    expect(createdUser).toMatchObject(userData);
    expect(retrievedUser).toEqual(createdUser);
  });

  test("should handle user preferences", async () => {
    // Test user preferences functionality
    const user = await userService.createUser({
      email: "prefs@example.com",
      name: "Prefs User",
      githubId: "prefs-github",
    });

    const preferences = {
      programmingLanguages: ["TypeScript", "Python"],
      minStars: 100,
      maxComplexity: 5,
      notificationSettings: {
        email: true,
        push: false,
      },
    };

    await userService.updatePreferences(user.id, preferences);
    const updatedUser = await userService.getUserById(user.id);

    expect(updatedUser.preferences).toMatchObject(preferences);
  });
});
```

### 2. Unit Test with Mocks

```typescript
// tests/unit/user.unit.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { DatabaseClient } from "../../src/types";
import { UserService } from "../../src/services/user";

const mockDb = mockDeep<DatabaseClient>();

vi.mock("../../src/lib/database", () => ({
  db: mockDb,
}));

describe("User Service Unit Tests", () => {
  let userService: UserService;

  beforeEach(() => {
    mockReset(mockDb);
    userService = new UserService(mockDb);
  });

  test("should create user with valid data", async () => {
    // Arrange
    const userData = {
      email: "test@example.com",
      name: "Test User",
      githubId: "test-github-id",
    };

    const expectedUser = {
      id: "user-123",
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockDb.user.create.mockResolvedValue(expectedUser);

    // Act
    const result = await userService.createUser(userData);

    // Assert
    expect(result).toEqual(expectedUser);
    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: userData,
    });
  });

  test("should throw error for duplicate email", async () => {
    // Arrange
    const userData = {
      email: "duplicate@example.com",
      name: "Duplicate User",
      githubId: "duplicate-github",
    };

    mockDb.user.create.mockRejectedValue(new Error("Unique constraint failed"));

    // Act & Assert
    await expect(userService.createUser(userData)).rejects.toThrow(
      "User with this email already exists"
    );
  });
});
```

### 3. Test Utilities

```typescript
// tests/helpers/database.ts
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

export async function setupTestDatabase() {
  const testDbUrl = process.env.DATABASE_URL_TEST!;

  // Push schema to test database
  execSync("npx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "ignore",
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: testDbUrl } },
  });

  await prisma.$connect();

  return {
    db: prisma,
    cleanup: async () => {
      await prisma.$disconnect();
    },
  };
}

export async function seedTestData(prisma: PrismaClient) {
  // Create test users
  await prisma.user.createMany({
    data: [
      {
        email: "admin@example.com",
        name: "Admin User",
        githubId: "admin-github",
      },
      {
        email: "user@example.com",
        name: "Regular User",
        githubId: "user-github",
      },
    ],
  });

  // Create test repositories
  await prisma.repository.createMany({
    data: [
      {
        name: "test-repo",
        fullName: "owner/test-repo",
        description: "Test repository",
        stars: 150,
        healthScore: 85,
      },
    ],
  });
}

export async function truncateAllTables(prisma: PrismaClient) {
  const tableNames = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE '%_prisma_%'
  `;

  if (tableNames.length > 0) {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE ${tableNames
        .map(({ tablename }) => `"${tablename}"`)
        .join(", ")} 
      RESTART IDENTITY CASCADE
    `);
  }
}
```

### 4. Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --config vitest.unit.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",

    "db:test-setup": "dotenv -e .env.test -- npx prisma db push --accept-data-loss",
    "db:test-seed": "dotenv -e .env.test -- npx prisma db seed",
    "db:test-reset": "dotenv -e .env.test -- npx prisma migrate reset --force",

    "test:db": "run-s db:test-setup test:integration",
    "test:ci": "run-s db:test-setup test:unit test:integration"
  }
}
```

## Summary

This comprehensive guide covers:

1. **Strategic Testing Approach**: When to use mocks vs real databases
2. **Modern Mocking Patterns**: Type-safe mocking with vitest-mock-extended
3. **Database Setup**: Docker, in-memory, and cloud-based testing
4. **Environment Management**: Proper configuration for different environments
5. **Performance Optimization**: Threading, pooling, and isolation strategies
6. **Prisma Integration**: Specific patterns for Prisma ORM
7. **Real-world Examples**: Complete test suites and utilities

Key takeaways:

- Use mocks for unit tests, real databases for integration tests
- Disable Vitest threading for database tests to prevent race conditions
- Implement proper cleanup strategies for test isolation
- Leverage modern tools like PGlite for fast in-memory PostgreSQL testing
- Configure environment variables properly for different test scenarios
- Use transaction rollbacks or table truncation for cleanup strategies

This approach ensures reliable, fast, and maintainable database tests that scale with your application.
