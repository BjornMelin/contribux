# Testing Guide

Step-by-step guide to implementing comprehensive testing in contribux using Vitest and modern testing patterns.

## Overview

This tutorial will walk you through creating tests that achieve 90%+ coverage through meaningful scenarios, following our TDD approach and testing standards.

## Setting Up Your Test Environment

### 1. Test Configuration

First, ensure your test environment is properly configured:

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

### 2. Global Test Setup

Configure MSW and test isolation:

```typescript
// tests/setup.ts
import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./mocks/handlers";

// MSW server for HTTP mocking
const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});

// Enhanced test isolation
beforeEach(() => {
  // Reset any global state
  process.env.NODE_ENV = "test";
});
```

## Test-Driven Development Workflow

### Step 1: Write Failing Tests

Start with a failing test that describes the behavior you want:

```typescript
// tests/features/github/github-client-core.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { GitHubClient } from "@/lib/github/client";
import { createTestConfig } from "@/tests/helpers/config";

describe("GitHubClient Core Functionality", () => {
  let client: GitHubClient;

  beforeEach(() => {
    const config = createTestConfig();
    client = new GitHubClient(config);
  });

  describe("Repository Search", () => {
    it("should search repositories with valid query parameters", async () => {
      // This test will fail initially
      const searchQuery = {
        query: "language:typescript stars:>1000",
        limit: 30,
        page: 1,
      };

      const result = await client.searchRepositories(searchQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repositories).toHaveLength(30);
        expect(result.data.repositories[0]).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          owner: expect.any(String),
          stars: expect.any(Number),
          language: "TypeScript",
        });
        expect(result.data.pagination).toMatchObject({
          page: 1,
          limit: 30,
          total: expect.any(Number),
        });
      }
    });

    it("should handle pagination correctly", async () => {
      const searchQuery = {
        query: "react",
        limit: 20,
        page: 2,
      };

      const result = await client.searchRepositories(searchQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pagination.page).toBe(2);
        expect(result.data.pagination.limit).toBe(20);
      }
    });
  });
});
```

### Step 2: Create MSW Handlers

Set up HTTP mocking for external APIs:

```typescript
// tests/mocks/github-handlers.ts
import { http, HttpResponse } from "msw";

export const githubHandlers = [
  http.get("https://api.github.com/search/repositories", ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    const perPage = parseInt(url.searchParams.get("per_page") || "30");

    // Simulate different responses based on query
    const mockRepositories = Array.from({ length: perPage }, (_, index) => ({
      id: (page - 1) * perPage + index + 1,
      name: `repo-${(page - 1) * perPage + index + 1}`,
      full_name: `owner/repo-${(page - 1) * perPage + index + 1}`,
      owner: {
        login: "test-owner",
        id: 12345,
        avatar_url: "https://github.com/images/error/octocat_happy.gif",
      },
      description: `Test repository ${(page - 1) * perPage + index + 1}`,
      stargazers_count: 1000 + index,
      language: query.includes("typescript") ? "TypeScript" : "JavaScript",
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-12-01T00:00:00Z",
    }));

    return HttpResponse.json({
      total_count: 1000,
      incomplete_results: false,
      items: mockRepositories,
    });
  }),

  http.get("https://api.github.com/repos/:owner/:repo", ({ params }) => {
    const { owner, repo } = params;

    return HttpResponse.json({
      id: 123456,
      name: repo,
      full_name: `${owner}/${repo}`,
      owner: {
        login: owner,
        id: 12345,
      },
      description: "Test repository description",
      stargazers_count: 1500,
      language: "TypeScript",
      topics: ["api", "typescript", "nodejs"],
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-12-01T00:00:00Z",
    });
  }),

  // Rate limiting simulation
  http.get("https://api.github.com/rate_limit", () => {
    return HttpResponse.json({
      rate: {
        limit: 5000,
        remaining: 4999,
        reset: Math.floor(Date.now() / 1000) + 3600,
      },
    });
  }),
];
```

### Step 3: Implement to Make Tests Pass

Now implement the minimum code to make your tests pass:

```typescript
// src/lib/github/client.ts
import { z } from "zod";

// Define schemas first
const RepositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  description: z.string().optional(),
  stars: z.number(),
  language: z.string().optional(),
  topics: z.array(z.string()).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const SearchQuerySchema = z.object({
  query: z.string().min(1),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(30),
  sort: z.enum(["stars", "forks", "updated"]).default("stars"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const SearchResultSchema = z.object({
  repositories: z.array(RepositorySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

type Repository = z.infer<typeof RepositorySchema>;
type SearchQuery = z.infer<typeof SearchQuerySchema>;
type SearchResult = z.infer<typeof SearchResultSchema>;

export class GitHubClient {
  constructor(private config: GitHubConfig) {}

  async searchRepositories(query: unknown): Promise<Result<SearchResult>> {
    try {
      // Validate input
      const validQuery = SearchQuerySchema.parse(query);

      // Build GitHub API query
      const searchParams = new URLSearchParams({
        q: validQuery.query,
        sort: validQuery.sort,
        order: validQuery.order,
        page: validQuery.page.toString(),
        per_page: validQuery.limit.toString(),
      });

      // Make API request
      const response = await fetch(
        `https://api.github.com/search/repositories?${searchParams}`,
        {
          headers: {
            Authorization: `token ${this.config.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();

      // Transform and validate response
      const repositories = data.items.map((item: any) => ({
        id: item.id.toString(),
        name: item.name,
        owner: item.owner.login,
        description: item.description,
        stars: item.stargazers_count,
        language: item.language,
        topics: item.topics || [],
        createdAt: new Date(item.created_at),
        updatedAt: new Date(item.updated_at),
      }));

      const result = SearchResultSchema.parse({
        repositories,
        pagination: {
          page: validQuery.page,
          limit: validQuery.limit,
          total: data.total_count,
          hasNext: validQuery.page * validQuery.limit < data.total_count,
          hasPrev: validQuery.page > 1,
        },
      });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }
}
```

## Advanced Testing Patterns

### Testing Error Scenarios

Create realistic error scenarios:

```typescript
// tests/features/github/github-client-edge-cases.test.ts
describe("GitHubClient Error Handling", () => {
  it("should handle rate limiting gracefully", async () => {
    // Override handler for this specific test
    server.use(
      http.get("https://api.github.com/search/repositories", () => {
        return new HttpResponse(
          JSON.stringify({
            message: "API rate limit exceeded",
            documentation_url:
              "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting",
          }),
          {
            status: 403,
            headers: {
              "X-RateLimit-Limit": "5000",
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": (
                Math.floor(Date.now() / 1000) + 3600
              ).toString(),
            },
          }
        );
      })
    );

    const client = new GitHubClient(createTestConfig());
    const result = await client.searchRepositories({
      query: "test",
      limit: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain("rate limit");
  });

  it("should handle network timeouts", async () => {
    server.use(
      http.get("https://api.github.com/search/repositories", async () => {
        // Simulate timeout
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return HttpResponse.json({});
      })
    );

    const client = new GitHubClient({
      ...createTestConfig(),
      timeout: 1000, // 1 second timeout
    });

    const result = await client.searchRepositories({
      query: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain("timeout");
  });

  it("should validate input parameters", async () => {
    const client = new GitHubClient(createTestConfig());

    // Invalid query (empty string)
    const result1 = await client.searchRepositories({
      query: "",
      limit: 10,
    });

    expect(result1.success).toBe(false);

    // Invalid limit (too large)
    const result2 = await client.searchRepositories({
      query: "test",
      limit: 200,
    });

    expect(result2.success).toBe(false);
  });
});
```

### Database Testing

Test database operations with proper setup and teardown:

```typescript
// tests/database/repository-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RepositoryService } from "@/lib/services/repository";
import {
  createTestDatabase,
  cleanupTestDatabase,
} from "@/tests/helpers/database";

describe("RepositoryService Database Operations", () => {
  let service: RepositoryService;
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    service = new RepositoryService(testDb.client);
  });

  afterEach(async () => {
    await cleanupTestDatabase(testDb);
  });

  describe("Repository Creation", () => {
    it("should create repository with valid data", async () => {
      const repositoryData = {
        githubId: 123456,
        name: "test-repo",
        owner: "test-owner",
        description: "Test repository",
        language: "TypeScript",
        stars: 100,
      };

      const result = await service.createRepository(repositoryData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBeDefined();
        expect(result.data.name).toBe(repositoryData.name);
        expect(result.data.owner).toBe(repositoryData.owner);
      }

      // Verify in database
      const dbResult = await testDb.client.query(
        "SELECT * FROM repositories WHERE github_id = $1",
        [repositoryData.githubId]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].name).toBe(repositoryData.name);
    });

    it("should handle duplicate GitHub IDs", async () => {
      const repositoryData = {
        githubId: 123456,
        name: "test-repo",
        owner: "test-owner",
        stars: 100,
      };

      // Create first repository
      const result1 = await service.createRepository(repositoryData);
      expect(result1.success).toBe(true);

      // Attempt to create duplicate
      const result2 = await service.createRepository({
        ...repositoryData,
        name: "different-name",
      });

      expect(result2.success).toBe(false);
      expect(result2.error.message).toContain("already exists");
    });
  });

  describe("Vector Search", () => {
    beforeEach(async () => {
      // Seed test data with embeddings
      await testDb.seedRepositoriesWithEmbeddings([
        {
          name: "react-typescript-app",
          description: "React application built with TypeScript",
          language: "TypeScript",
          embedding: generateTestEmbedding("react typescript frontend"),
        },
        {
          name: "node-api-server",
          description: "Node.js API server with Express",
          language: "JavaScript",
          embedding: generateTestEmbedding("nodejs express backend api"),
        },
        {
          name: "python-ml-project",
          description: "Machine learning project with Python",
          language: "Python",
          embedding: generateTestEmbedding("python machine learning ai"),
        },
      ]);
    });

    it("should find similar repositories using vector search", async () => {
      const queryEmbedding = generateTestEmbedding("typescript react frontend");

      const result = await service.searchSimilarRepositories(queryEmbedding, {
        threshold: 0.7,
        limit: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("react-typescript-app");
        expect(result.data[0].similarityScore).toBeGreaterThan(0.7);
      }
    });

    it("should respect similarity threshold", async () => {
      const queryEmbedding = generateTestEmbedding(
        "completely different topic"
      );

      const result = await service.searchSimilarRepositories(queryEmbedding, {
        threshold: 0.9,
        limit: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });
});
```

### Integration Testing

Test end-to-end workflows:

```typescript
// tests/features/search/search-integration.test.ts
describe("Search Integration Workflow", () => {
  it("should complete full search workflow from query to results", async () => {
    // 1. User submits search query
    const searchRequest = {
      query: "machine learning python",
      filters: {
        language: "Python",
        minStars: 100,
      },
      preferences: {
        difficulty: "intermediate",
        skills: ["python", "machine-learning"],
      },
    };

    // 2. Search service processes request
    const searchService = new SearchService(
      mockGitHubClient,
      mockEmbeddingService,
      mockDatabaseClient
    );

    const result = await searchService.searchOpportunities(searchRequest);

    // 3. Verify search results
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opportunities).toBeDefined();
      expect(result.data.opportunities.length).toBeGreaterThan(0);

      // Verify ranking and filtering
      const firstResult = result.data.opportunities[0];
      expect(firstResult.repository.language).toBe("Python");
      expect(firstResult.repository.stars).toBeGreaterThanOrEqual(100);
      expect(firstResult.matchScore).toBeGreaterThan(0.5);
      expect(firstResult.difficulty).toBe("intermediate");
    }

    // 4. Verify analytics tracking
    expect(mockAnalytics.trackSearchEvent).toHaveBeenCalledWith({
      query: searchRequest.query,
      resultCount: result.success ? result.data.opportunities.length : 0,
      filters: searchRequest.filters,
    });
  });
});
```

## Test Helpers and Utilities

### Database Test Helpers

```typescript
// tests/helpers/database.ts
import { Pool } from "pg";
import { z } from "zod";

export interface TestDatabase {
  client: Pool;
  cleanup: () => Promise<void>;
}

export const createTestDatabase = async (): Promise<TestDatabase> => {
  const client = new Pool({
    connectionString: process.env.DATABASE_URL_TEST,
    max: 5,
  });

  // Ensure clean state
  await cleanupTestData(client);

  return {
    client,
    cleanup: () => cleanupTestData(client),
  };
};

export const cleanupTestDatabase = async (
  testDb: TestDatabase
): Promise<void> => {
  await testDb.cleanup();
  await testDb.client.end();
};

const cleanupTestData = async (client: Pool): Promise<void> => {
  // Clean up in reverse dependency order
  await client.query("DELETE FROM contribution_outcomes");
  await client.query("DELETE FROM opportunities");
  await client.query("DELETE FROM repositories");
  await client.query("DELETE FROM user_preferences");
  await client.query("DELETE FROM users");
};

export const seedTestRepositories = async (
  client: Pool,
  repositories: Array<{
    name: string;
    owner: string;
    description?: string;
    language?: string;
    stars?: number;
    embedding?: number[];
  }>
): Promise<void> => {
  for (const repo of repositories) {
    await client.query(
      `INSERT INTO repositories (github_id, name, owner, description, language, stars, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        Math.floor(Math.random() * 1000000),
        repo.name,
        repo.owner,
        repo.description,
        repo.language,
        repo.stars || 0,
        repo.embedding ? JSON.stringify(repo.embedding) : null,
      ]
    );
  }
};

export const generateTestEmbedding = (text: string): number[] => {
  // Generate deterministic test embedding based on text
  const hash = simpleHash(text);
  return Array.from({ length: 1536 }, (_, i) => Math.sin(hash + i) * 0.5 + 0.5);
};

const simpleHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
};
```

### Configuration Helpers

```typescript
// tests/helpers/config.ts
export const createTestConfig = (
  overrides: Partial<GitHubConfig> = {}
): GitHubConfig => {
  return {
    token: "test-token",
    apiUrl: "https://api.github.com",
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
    ...overrides,
  };
};

export const createTestUser = (overrides: Partial<User> = {}): User => {
  return {
    id: "test-user-id",
    githubId: 123456,
    username: "testuser",
    email: "test@example.com",
    skills: ["TypeScript", "React", "Node.js"],
    preferences: {
      difficulty: "intermediate",
      interests: ["web-development", "open-source"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};
```

## Running and Monitoring Tests

### Test Execution Commands

```bash
# Run all tests
pnpm test

# Watch mode during development
pnpm test:watch

# Coverage report
pnpm test:coverage

# Specific test files
pnpm test github-client
pnpm test database/

# Debug mode
pnpm test:debug

# CI mode
pnpm test:ci
```

### Coverage Analysis

```bash
# Generate HTML coverage report
pnpm test:coverage

# Open coverage report
open coverage/index.html

# Coverage by file
pnpm test:coverage --reporter=text-summary
```

### Test Performance

Monitor test execution time:

```typescript
// tests/performance/test-performance.test.ts
describe("Test Performance Monitoring", () => {
  it("should complete database operations within acceptable time", async () => {
    const startTime = Date.now();

    const service = new RepositoryService(testDb.client);
    await service.searchSimilarRepositories(testEmbedding, { limit: 100 });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // Under 1 second
  });
});
```

## Common Testing Scenarios

### API Error Handling

```typescript
describe("API Error Scenarios", () => {
  it("should handle various HTTP status codes", async () => {
    const testCases = [
      { status: 401, expectedError: "UNAUTHORIZED" },
      { status: 403, expectedError: "FORBIDDEN" },
      { status: 404, expectedError: "NOT_FOUND" },
      { status: 500, expectedError: "INTERNAL_SERVER_ERROR" },
    ];

    for (const { status, expectedError } of testCases) {
      server.use(
        http.get("https://api.github.com/search/repositories", () => {
          return new HttpResponse(null, { status });
        })
      );

      const result = await client.searchRepositories({ query: "test" });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(expectedError);
    }
  });
});
```

### Concurrent Operations

```typescript
describe("Concurrent Operations", () => {
  it("should handle multiple simultaneous requests", async () => {
    const requests = Array.from({ length: 10 }, (_, i) =>
      client.searchRepositories({ query: `test-${i}` })
    );

    const results = await Promise.all(requests);

    results.forEach((result, index) => {
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repositories).toBeDefined();
      }
    });
  });
});
```

This comprehensive testing guide provides the foundation for implementing robust, maintainable tests that achieve high coverage through meaningful scenarios while following TDD principles.
