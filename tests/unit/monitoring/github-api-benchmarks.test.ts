/**
 * GitHub API Benchmarking System Tests - Fixed Version
 * Tests the performance monitoring and benchmarking functionality
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock audit logger before importing benchmark module
vi.mock('@/lib/security/audit-logger', () => ({
  auditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  },
  AuditEventType: {},
  AuditSeverity: {},
}))

// Mock Octokit with comprehensive API coverage
const createMockOctokit = () => ({
  rest: {
    repos: {
      get: vi.fn().mockResolvedValue({ status: 200 }),
      listForAuthenticatedUser: vi.fn().mockResolvedValue({ status: 200 }),
      getContent: vi.fn().mockResolvedValue({ status: 200 }),
      listContributors: vi.fn().mockResolvedValue({ status: 200 }),
    },
    issues: {
      listForRepo: vi.fn().mockResolvedValue({ status: 200 }),
    },
    users: {
      getAuthenticated: vi.fn().mockResolvedValue({ status: 200 }),
    },
    search: {
      repos: vi.fn().mockResolvedValue({ status: 200 }),
    },
    rateLimit: {
      get: vi.fn().mockResolvedValue({
        data: {
          rate: {
            remaining: 4500,
            limit: 5000,
            reset: Math.floor(Date.now() / 1000) + 3600,
          },
        },
      }),
    },
    meta: {
      get: vi.fn().mockResolvedValue({ status: 200 }),
    },
  },
})

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => createMockOctokit()),
}))

// Mock performance.now for consistent timing
let performanceCounter = 0
Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn().mockImplementation(() => {
      performanceCounter += 100 // 100ms per call
      return performanceCounter
    }),
  },
  writable: true,
})

// Mock setTimeout to be instant
global.setTimeout = vi.fn().mockImplementation(fn => {
  if (typeof fn === 'function') fn()
  return 1
}) as typeof setTimeout

import {
  BENCHMARK_CONFIG,
  GitHubAPIBenchmark,
  createGitHubBenchmark,
  quickBenchmark,
} from '@/lib/monitoring/github-api-benchmarks'

describe('GitHubAPIBenchmark', () => {
  let benchmark: GitHubAPIBenchmark

  beforeEach(() => {
    vi.clearAllMocks()
    performanceCounter = 0

    benchmark = new GitHubAPIBenchmark('test-token')
  })

  describe('constructor', () => {
    it('should create benchmark instance with auth token', () => {
      expect(benchmark).toBeInstanceOf(GitHubAPIBenchmark)
    })

    it('should create benchmark instance without auth token', () => {
      const unauthenticatedBenchmark = new GitHubAPIBenchmark()
      expect(unauthenticatedBenchmark).toBeInstanceOf(GitHubAPIBenchmark)
    })
  })

  describe('benchmarkOperation', () => {
    it('should benchmark individual operation successfully', async () => {
      const testOperation = {
        name: 'Test Operation',
        endpoint: '/test',
        method: 'GET' as const,
        category: 'read' as const,
        expectedCategory: 'fast' as const,
        execute: vi.fn().mockResolvedValue({ status: 200 }),
      }

      const result = await benchmark.benchmarkOperation(testOperation)

      expect(result).toHaveProperty('operation', 'Test Operation')
      expect(result).toHaveProperty('endpoint', '/test')
      expect(result).toHaveProperty('method', 'GET')
      expect(result).toHaveProperty('samples')
      expect(result).toHaveProperty('metrics')
      expect(result).toHaveProperty('rateLimit')
      expect(result).toHaveProperty('timestamp')

      expect(result.samples).toHaveLength(BENCHMARK_CONFIG.testConfig.sampleSize)
      expect(testOperation.execute).toHaveBeenCalledTimes(BENCHMARK_CONFIG.testConfig.sampleSize)
    })

    it('should handle operation setup and cleanup', async () => {
      const setupMock = vi.fn().mockResolvedValue({ testData: 'setup' })
      const cleanupMock = vi.fn().mockResolvedValue(undefined)
      const executeMock = vi.fn().mockResolvedValue({ status: 200 })

      const testOperation = {
        name: 'Test with Setup',
        endpoint: '/test',
        method: 'POST' as const,
        category: 'write' as const,
        expectedCategory: 'medium' as const,
        setup: setupMock,
        execute: executeMock,
        cleanup: cleanupMock,
      }

      await benchmark.benchmarkOperation(testOperation)

      expect(setupMock).toHaveBeenCalledTimes(1)
      expect(cleanupMock).toHaveBeenCalledTimes(1)
      expect(cleanupMock).toHaveBeenCalledWith({ testData: 'setup' })
    })

    it('should capture timing information accurately', async () => {
      const testOperation = {
        name: 'Timing Test',
        endpoint: '/timing',
        method: 'GET' as const,
        category: 'read' as const,
        expectedCategory: 'fast' as const,
        execute: vi.fn().mockResolvedValue({ status: 200 }),
      }

      const result = await benchmark.benchmarkOperation(testOperation)

      // Check that durations are captured
      result.samples.forEach(sample => {
        expect(sample.duration).toBeGreaterThan(0)
        expect(sample.success).toBe(true)
        expect(sample.statusCode).toBe(200)
      })

      // Check metrics calculation
      expect(result.metrics.avgDuration).toBeGreaterThan(0)
      expect(result.metrics.minDuration).toBeGreaterThan(0)
      expect(result.metrics.maxDuration).toBeGreaterThanOrEqual(result.metrics.minDuration)
      expect(result.metrics.successRate).toBe(1)
      expect(result.metrics.errorRate).toBe(0)
    })
  })

  describe('runBenchmarkSuite', () => {
    it('should run complete benchmark suite successfully', async () => {
      const result = await benchmark.runBenchmarkSuite()

      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('summary')
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.results.length).toBe(7) // Standard operations count

      // Check summary structure
      expect(result.summary).toHaveProperty('totalOperations')
      expect(result.summary).toHaveProperty('avgPerformance')
      expect(result.summary).toHaveProperty('successRate')
      expect(result.summary).toHaveProperty('rateLimitCompliance')
      expect(result.summary).toHaveProperty('performanceByCategory')

      expect(result.summary.totalOperations).toBe(7)
      expect(result.summary.successRate).toBe(1) // All mocked calls succeed
    })

    it('should generate performance categories correctly', async () => {
      const result = await benchmark.runBenchmarkSuite()

      expect(result.summary.performanceByCategory).toHaveProperty('fast')
      expect(Object.keys(result.summary.performanceByCategory)).toContain('fast')
    })
  })

  describe('exportResults', () => {
    it('should export results as valid JSON', async () => {
      await benchmark.runBenchmarkSuite()
      const exported = benchmark.exportResults()

      expect(() => JSON.parse(exported)).not.toThrow()

      const parsed = JSON.parse(exported)
      expect(parsed).toHaveProperty('timestamp')
      expect(parsed).toHaveProperty('config')
      expect(parsed).toHaveProperty('results')
      expect(parsed).toHaveProperty('summary')
    })
  })

  describe('getOperationResults', () => {
    it('should retrieve results for specific operation', async () => {
      await benchmark.runBenchmarkSuite()

      const repoResults = benchmark.getOperationResults('Get Repository')
      expect(repoResults).toBeDefined()
      expect(repoResults?.operation).toBe('Get Repository')

      const nonExistent = benchmark.getOperationResults('Non-existent Operation')
      expect(nonExistent).toBeUndefined()
    })
  })
})

describe('Utility Functions', () => {
  describe('quickBenchmark', () => {
    it('should run quick benchmark for single operation', async () => {
      const testOperation = {
        name: 'Quick Test',
        endpoint: '/quick',
        method: 'GET' as const,
        category: 'read' as const,
        expectedCategory: 'fast' as const,
        execute: vi.fn().mockResolvedValue({ status: 200 }),
      }

      const result = await quickBenchmark(testOperation, 'test-token')

      expect(result).toHaveProperty('operation', 'Quick Test')
      expect(result.samples).toHaveLength(BENCHMARK_CONFIG.testConfig.sampleSize)
    })
  })

  describe('createGitHubBenchmark', () => {
    it('should create benchmark with environment token', () => {
      process.env.GITHUB_TOKEN = 'env-token'

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* intentionally empty - suppress console output during tests */
      })

      const benchmark = createGitHubBenchmark()

      expect(benchmark).toBeInstanceOf(GitHubAPIBenchmark)
      expect(consoleWarnSpy).not.toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
      process.env.GITHUB_TOKEN = undefined
    })

    it('should warn when no token is available', () => {
      process.env.GITHUB_TOKEN = undefined
      process.env.GITHUB_PAT = undefined

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* intentionally empty - suppress console output during tests */
      })

      const benchmark = createGitHubBenchmark()

      expect(benchmark).toBeInstanceOf(GitHubAPIBenchmark)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No GitHub token found. Benchmarks will use unauthenticated requests with lower rate limits.'
      )

      consoleWarnSpy.mockRestore()
    })
  })
})
