/**
 * Integration Test Configuration
 * 
 * Provides configuration for GitHub integration tests including
 * test organization setup, authentication, and environment isolation.
 */

import { z } from 'zod';

/**
 * Environment variables schema for integration tests
 */
export const IntegrationTestEnvSchema = z.object({
  // GitHub Test Configuration
  GITHUB_TEST_TOKEN: z.string().min(1).describe('GitHub personal access token for integration tests'),
  GITHUB_TEST_ORG: z.string().min(1).describe('GitHub organization for integration tests'),
  GITHUB_TEST_REPO_PREFIX: z.string().default('contribux-test-').describe('Prefix for test repositories'),
  
  // GitHub App Test Configuration (optional)
  GITHUB_APP_ID: z.string().optional().describe('GitHub App ID for app authentication tests'),
  GITHUB_APP_PRIVATE_KEY: z.string().optional().describe('GitHub App private key'),
  GITHUB_APP_INSTALLATION_ID: z.string().optional().describe('GitHub App installation ID'),
  
  // Webhook Testing
  WEBHOOK_TEST_SECRET: z.string().default('test-webhook-secret').describe('Webhook secret for testing'),
  WEBHOOK_TEST_PORT: z.string().default('3001').transform(Number).describe('Port for webhook endpoint'),
  
  // Test Environment
  TEST_TIMEOUT: z.string().default('60000').transform(Number).describe('Integration test timeout in ms'),
  TEST_CONCURRENCY: z.string().default('3').transform(Number).describe('Max concurrent test operations'),
  TEST_CLEANUP: z.string().default('true').transform(v => v === 'true').describe('Clean up test resources'),
  
  // Performance Testing
  LOAD_TEST_ENABLED: z.string().default('false').transform(v => v === 'true').describe('Enable load testing'),
  LOAD_TEST_DURATION: z.string().default('30000').transform(Number).describe('Load test duration in ms'),
  LOAD_TEST_CONCURRENT_USERS: z.string().default('10').transform(Number).describe('Concurrent users for load test'),
  
  // Monitoring
  METRICS_ENABLED: z.string().default('true').transform(v => v === 'true').describe('Enable metrics collection'),
  MEMORY_PROFILING: z.string().default('true').transform(v => v === 'true').describe('Enable memory profiling'),
});

export type IntegrationTestEnv = z.infer<typeof IntegrationTestEnvSchema>;

/**
 * Load and validate integration test environment
 */
export function loadIntegrationTestEnv(): IntegrationTestEnv {
  try {
    return IntegrationTestEnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Integration test environment validation failed:');
      console.error(error.format());
      throw new Error('Invalid integration test environment configuration');
    }
    throw error;
  }
}

/**
 * Test repository configuration
 */
export interface TestRepository {
  name: string;
  description: string;
  private: boolean;
  hasIssues: boolean;
  hasWiki: boolean;
  hasProjects: boolean;
  autoInit: boolean;
}

/**
 * Default test repositories to create
 */
export const TEST_REPOSITORIES: TestRepository[] = [
  {
    name: 'public-api-test',
    description: 'Public repository for API integration tests',
    private: false,
    hasIssues: true,
    hasWiki: false,
    hasProjects: true,
    autoInit: true,
  },
  {
    name: 'private-api-test',
    description: 'Private repository for API integration tests',
    private: true,
    hasIssues: true,
    hasWiki: false,
    hasProjects: false,
    autoInit: true,
  },
  {
    name: 'webhook-test',
    description: 'Repository for webhook integration tests',
    private: false,
    hasIssues: true,
    hasWiki: false,
    hasProjects: false,
    autoInit: true,
  },
  {
    name: 'load-test',
    description: 'Repository for load testing scenarios',
    private: false,
    hasIssues: true,
    hasWiki: false,
    hasProjects: false,
    autoInit: true,
  },
];

/**
 * Test data configuration
 */
export const TEST_DATA = {
  issues: [
    {
      title: 'Test Issue #1',
      body: 'This is a test issue for integration testing',
      labels: ['bug', 'test'],
    },
    {
      title: 'Test Issue #2',
      body: 'Another test issue with different labels',
      labels: ['enhancement', 'test'],
    },
  ],
  pullRequests: [
    {
      title: 'Test PR #1',
      body: 'This is a test pull request',
      head: 'test-branch-1',
      base: 'main',
    },
  ],
  webhookEvents: [
    'push',
    'pull_request',
    'issues',
    'issue_comment',
    'pull_request_review',
    'pull_request_review_comment',
    'repository',
    'release',
  ],
};

/**
 * Rate limit test configuration
 */
export const RATE_LIMIT_TEST_CONFIG = {
  // Number of requests to trigger rate limit
  requestsToTriggerLimit: 100,
  // Expected rate limit for REST API
  expectedRestLimit: 5000,
  // Expected rate limit for GraphQL
  expectedGraphQLLimit: 5000,
  // Expected rate limit for search
  expectedSearchLimit: 30,
  // Delay between rate limit tests (ms)
  rateLimitTestDelay: 1000,
};

/**
 * Cache test configuration
 */
export const CACHE_TEST_CONFIG = {
  // Cache TTL for testing (ms)
  cacheTTL: 5000,
  // Number of requests for cache hit testing
  cacheHitTestRequests: 10,
  // Expected minimum cache hit rate
  expectedMinCacheHitRate: 0.8,
  // DataLoader batch size
  dataLoaderBatchSize: 100,
};

/**
 * Memory test configuration
 */
export const MEMORY_TEST_CONFIG = {
  // Maximum memory growth allowed (MB)
  maxMemoryGrowth: 50,
  // Memory sampling interval (ms)
  memorySampleInterval: 100,
  // Number of operations for memory leak testing
  memoryLeakTestOperations: 1000,
  // GC runs between measurements
  gcRunsBetweenMeasurements: 3,
};

/**
 * Integration test context
 */
export interface IntegrationTestContext {
  env: IntegrationTestEnv;
  repositories: Map<string, { owner: string; repo: string; id: number }>;
  webhookEndpoint?: string;
  metricsCollector?: MetricsCollector;
  cleanupFunctions: Array<() => Promise<void>>;
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  recordApiCall(endpoint: string, duration: number, status: number): void;
  recordCacheHit(key: string): void;
  recordCacheMiss(key: string): void;
  recordMemoryUsage(usage: number): void;
  recordRateLimit(resource: string, remaining: number, limit: number): void;
  getMetrics(): TestMetrics;
  reset(): void;
}

/**
 * Test metrics interface
 */
export interface TestMetrics {
  apiCalls: {
    total: number;
    byEndpoint: Record<string, number>;
    averageDuration: number;
    errorRate: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  memory: {
    peak: number;
    average: number;
    growth: number;
  };
  rateLimit: {
    triggered: number;
    minimumRemaining: number;
  };
}