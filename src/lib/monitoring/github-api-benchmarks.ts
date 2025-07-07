/**
 * GitHub API Performance Benchmarking System
 * 
 * Implements comprehensive performance monitoring and benchmarking for GitHub API
 * client operations, including response times, throughput, error rates, and rate
 * limiting compliance.
 */

import { Octokit } from '@octokit/rest'
import { z } from 'zod'

// ==================== BENCHMARK CONFIGURATION ====================

const BENCHMARK_CONFIG = {
  // Performance thresholds (milliseconds)
  thresholds: {
    fastOperation: 500,    // Under 500ms considered fast
    mediumOperation: 2000, // Under 2s considered acceptable  
    slowOperation: 5000,   // Over 5s considered slow
    timeoutLimit: 10000,   // 10s timeout limit
  },
  
  // Test configuration
  testConfig: {
    maxConcurrentRequests: 5,
    retryAttempts: 3,
    sampleSize: 10,
    warmupRequests: 2,
  },
  
  // Rate limiting compliance
  rateLimit: {
    primaryApiLimit: 5000,   // Per hour for authenticated requests
    searchApiLimit: 30,      // Per minute for search API
    restApiLimit: 1000,      // Per hour for REST API without auth
  },
}

// ==================== BENCHMARK SCHEMAS ====================

const BenchmarkResultSchema = z.object({
  operation: z.string(),
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  samples: z.array(z.object({
    duration: z.number(),
    success: z.boolean(),
    statusCode: z.number().optional(),
    error: z.string().optional(),
    rateLimit: z.object({
      remaining: z.number(),
      total: z.number(),
      resetTime: z.number(),
    }).optional(),
  })),
  metrics: z.object({
    avgDuration: z.number(),
    minDuration: z.number(),
    maxDuration: z.number(),
    p95Duration: z.number(),
    p99Duration: z.number(),
    successRate: z.number(),
    errorRate: z.number(),
    throughput: z.number(),
  }),
  rateLimit: z.object({
    remaining: z.number(),
    total: z.number(),
    resetTime: z.number(),
    compliance: z.boolean(),
  }),
  timestamp: z.number(),
})

type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>

// ==================== PERFORMANCE CATEGORIES ====================

type PerformanceCategory = 'fast' | 'medium' | 'slow' | 'timeout'

interface BenchmarkOperation {
  name: string
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  category: 'read' | 'write' | 'search' | 'metadata'
  expectedCategory: PerformanceCategory
  setup?: () => Promise<any>
  execute: (octokit: Octokit, setupData?: any) => Promise<any>
  cleanup?: (setupData?: any) => Promise<void>
}

// ==================== GITHUB API BENCHMARK SUITE ====================

export class GitHubAPIBenchmark {
  private octokit: Octokit
  private results: BenchmarkResult[] = []
  
  constructor(auth?: string) {
    this.octokit = new Octokit({
      auth,
      request: {
        timeout: BENCHMARK_CONFIG.thresholds.timeoutLimit,
      },
    })
  }

  /**
   * Run comprehensive benchmark suite for GitHub API operations
   */
  async runBenchmarkSuite(): Promise<{
    results: BenchmarkResult[]
    summary: {
      totalOperations: number
      avgPerformance: number
      successRate: number
      rateLimitCompliance: boolean
      performanceByCategory: Record<string, number>
    }
  }> {
    console.log('🚀 Starting GitHub API Performance Benchmarks...')
    
    const operations = this.getStandardOperations()
    this.results = []
    
    // Warmup
    console.log('🔥 Running warmup requests...')
    await this.warmupRequests()
    
    // Execute benchmarks
    for (const operation of operations) {
      console.log(`📊 Benchmarking: ${operation.name}`)
      try {
        const result = await this.benchmarkOperation(operation)
        this.results.push(result)
        
        // Rate limiting compliance check
        if (!result.rateLimit.compliance) {
          console.warn(`⚠️ Rate limit concern for ${operation.name}`)
        }
        
        // Performance category check
        const actualCategory = this.categorizePerformance(result.metrics.avgDuration)
        if (actualCategory !== operation.expectedCategory) {
          console.warn(`⚠️ Performance deviation: ${operation.name} expected ${operation.expectedCategory}, got ${actualCategory}`)
        }
        
      } catch (error) {
        console.error(`❌ Benchmark failed for ${operation.name}:`, error)
      }
      
      // Respect rate limits between tests
      await this.respectRateLimit()
    }
    
    const summary = this.generateSummary()
    console.log('✅ GitHub API benchmarks completed')
    
    return {
      results: this.results,
      summary,
    }
  }

  /**
   * Benchmark a specific operation
   */
  async benchmarkOperation(operation: BenchmarkOperation): Promise<BenchmarkResult> {
    const samples: BenchmarkResult['samples'] = []
    let setupData: any = null
    
    try {
      // Setup if needed
      if (operation.setup) {
        setupData = await operation.setup()
      }
      
      // Execute samples
      for (let i = 0; i < BENCHMARK_CONFIG.testConfig.sampleSize; i++) {
        const sample = await this.executeSample(operation, setupData)
        samples.push(sample)
        
        // Small delay between samples to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Calculate metrics
      const metrics = this.calculateMetrics(samples)
      
      // Get final rate limit status
      const rateLimitInfo = await this.getRateLimitInfo()
      
      const result: BenchmarkResult = {
        operation: operation.name,
        endpoint: operation.endpoint,
        method: operation.method,
        samples,
        metrics,
        rateLimit: {
          remaining: rateLimitInfo.remaining,
          total: rateLimitInfo.total,
          resetTime: rateLimitInfo.resetTime,
          compliance: this.checkRateLimitCompliance(rateLimitInfo),
        },
        timestamp: Date.now(),
      }
      
      return BenchmarkResultSchema.parse(result)
      
    } finally {
      // Cleanup if needed
      if (operation.cleanup && setupData) {
        try {
          await operation.cleanup(setupData)
        } catch (error) {
          console.warn(`Cleanup failed for ${operation.name}:`, error)
        }
      }
    }
  }

  /**
   * Execute a single sample of an operation
   */
  private async executeSample(
    operation: BenchmarkOperation, 
    setupData?: any
  ): Promise<BenchmarkResult['samples'][0]> {
    const startTime = performance.now()
    let success = false
    let statusCode: number | undefined
    let error: string | undefined
    
    try {
      const response = await operation.execute(this.octokit, setupData)
      success = true
      statusCode = response?.status || 200
    } catch (err) {
      success = false
      error = err instanceof Error ? err.message : String(err)
      
      // Extract status code from error if available
      if (err && typeof err === 'object' && 'status' in err) {
        statusCode = err.status as number
      }
    }
    
    const endTime = performance.now()
    const duration = endTime - startTime
    
    // Get rate limit info from headers
    const rateLimitInfo = await this.getRateLimitInfo()
    
    return {
      duration,
      success,
      statusCode,
      error,
      rateLimit: rateLimitInfo,
    }
  }

  /**
   * Standard set of GitHub API operations to benchmark
   */
  private getStandardOperations(): BenchmarkOperation[] {
    return [
      {
        name: 'Get Repository',
        endpoint: '/repos/{owner}/{repo}',
        method: 'GET',
        category: 'read',
        expectedCategory: 'fast',
        execute: async (octokit) => {
          return await octokit.rest.repos.get({
            owner: 'octocat',
            repo: 'Hello-World',
          })
        },
      },
      
      {
        name: 'List Repository Issues',
        endpoint: '/repos/{owner}/{repo}/issues',
        method: 'GET',
        category: 'read',
        expectedCategory: 'fast',
        execute: async (octokit) => {
          return await octokit.rest.issues.listForRepo({
            owner: 'octocat',
            repo: 'Hello-World',
            per_page: 10,
          })
        },
      },
      
      {
        name: 'Get User',
        endpoint: '/user',
        method: 'GET',
        category: 'metadata',
        expectedCategory: 'fast',
        execute: async (octokit) => {
          return await octokit.rest.users.getAuthenticated()
        },
      },
      
      {
        name: 'List User Repositories',
        endpoint: '/user/repos',
        method: 'GET',
        category: 'read',
        expectedCategory: 'medium',
        execute: async (octokit) => {
          return await octokit.rest.repos.listForAuthenticatedUser({
            per_page: 50,
            sort: 'updated',
          })
        },
      },
      
      {
        name: 'Search Repositories',
        endpoint: '/search/repositories',
        method: 'GET',
        category: 'search',
        expectedCategory: 'medium',
        execute: async (octokit) => {
          return await octokit.rest.search.repos({
            q: 'language:javascript stars:>1000',
            per_page: 20,
          })
        },
      },
      
      {
        name: 'Get Repository Contents',
        endpoint: '/repos/{owner}/{repo}/contents/{path}',
        method: 'GET',
        category: 'read',
        expectedCategory: 'fast',
        execute: async (octokit) => {
          return await octokit.rest.repos.getContent({
            owner: 'octocat',
            repo: 'Hello-World',
            path: 'README',
          })
        },
      },
      
      {
        name: 'List Repository Contributors',
        endpoint: '/repos/{owner}/{repo}/contributors',
        method: 'GET',
        category: 'read',
        expectedCategory: 'medium',
        execute: async (octokit) => {
          return await octokit.rest.repos.listContributors({
            owner: 'octocat',
            repo: 'Hello-World',
            per_page: 30,
          })
        },
      },
    ]
  }

  /**
   * Warmup requests to establish connection
   */
  private async warmupRequests(): Promise<void> {
    for (let i = 0; i < BENCHMARK_CONFIG.testConfig.warmupRequests; i++) {
      try {
        await this.octokit.rest.meta.get()
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (error) {
        console.warn('Warmup request failed:', error)
      }
    }
  }

  /**
   * Calculate performance metrics from samples
   */
  private calculateMetrics(samples: BenchmarkResult['samples']): BenchmarkResult['metrics'] {
    const durations = samples.map(s => s.duration)
    const successes = samples.filter(s => s.success).length
    
    durations.sort((a, b) => a - b)
    
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
    const minDuration = Math.min(...durations)
    const maxDuration = Math.max(...durations)
    
    // Calculate percentiles
    const p95Index = Math.floor(durations.length * 0.95)
    const p99Index = Math.floor(durations.length * 0.99)
    const p95Duration = durations[p95Index] || durations[durations.length - 1]
    const p99Duration = durations[p99Index] || durations[durations.length - 1]
    
    const successRate = successes / samples.length
    const errorRate = 1 - successRate
    
    // Calculate throughput (requests per second)
    const totalTime = durations.reduce((sum, d) => sum + d, 0)
    const throughput = (samples.length / totalTime) * 1000 // Convert to per second
    
    return {
      avgDuration,
      minDuration,
      maxDuration,
      p95Duration,
      p99Duration,
      successRate,
      errorRate,
      throughput,
    }
  }

  /**
   * Get current rate limit information
   */
  private async getRateLimitInfo(): Promise<{
    remaining: number
    total: number
    resetTime: number
  }> {
    try {
      const response = await this.octokit.rest.rateLimit.get()
      const { core } = response.data.rate
      
      return {
        remaining: core.remaining,
        total: core.limit,
        resetTime: core.reset * 1000, // Convert to milliseconds
      }
    } catch (error) {
      console.warn('Failed to get rate limit info:', error)
      return {
        remaining: 0,
        total: 5000,
        resetTime: Date.now() + 3600000, // 1 hour from now
      }
    }
  }

  /**
   * Check rate limiting compliance
   */
  private checkRateLimitCompliance(rateLimitInfo: {
    remaining: number
    total: number
    resetTime: number
  }): boolean {
    const usagePercentage = (rateLimitInfo.total - rateLimitInfo.remaining) / rateLimitInfo.total
    
    // Consider compliant if using less than 80% of rate limit
    return usagePercentage < 0.8
  }

  /**
   * Categorize performance based on duration
   */
  private categorizePerformance(duration: number): PerformanceCategory {
    if (duration >= BENCHMARK_CONFIG.thresholds.timeoutLimit) {
      return 'timeout'
    } else if (duration >= BENCHMARK_CONFIG.thresholds.slowOperation) {
      return 'slow'
    } else if (duration >= BENCHMARK_CONFIG.thresholds.mediumOperation) {
      return 'medium'
    } else {
      return 'fast'
    }
  }

  /**
   * Respect rate limits between operations
   */
  private async respectRateLimit(): Promise<void> {
    const rateLimitInfo = await this.getRateLimitInfo()
    
    if (rateLimitInfo.remaining < 10) {
      const waitTime = rateLimitInfo.resetTime - Date.now()
      if (waitTime > 0 && waitTime < 3600000) { // Max 1 hour wait
        console.log(`⏳ Rate limit low, waiting ${Math.round(waitTime / 1000)}s...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    } else {
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  /**
   * Generate performance summary
   */
  private generateSummary(): {
    totalOperations: number
    avgPerformance: number
    successRate: number
    rateLimitCompliance: boolean
    performanceByCategory: Record<string, number>
  } {
    const totalOperations = this.results.length
    const avgPerformance = this.results.reduce((sum, r) => sum + r.metrics.avgDuration, 0) / totalOperations
    const successRate = this.results.reduce((sum, r) => sum + r.metrics.successRate, 0) / totalOperations
    const rateLimitCompliance = this.results.every(r => r.rateLimit.compliance)
    
    const performanceByCategory: Record<string, number> = {}
    for (const result of this.results) {
      const category = this.categorizePerformance(result.metrics.avgDuration)
      performanceByCategory[category] = (performanceByCategory[category] || 0) + 1
    }
    
    return {
      totalOperations,
      avgPerformance,
      successRate,
      rateLimitCompliance,
      performanceByCategory,
    }
  }

  /**
   * Export results to JSON
   */
  exportResults(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      config: BENCHMARK_CONFIG,
      results: this.results,
      summary: this.generateSummary(),
    }, null, 2)
  }

  /**
   * Get results for specific operation
   */
  getOperationResults(operationName: string): BenchmarkResult | undefined {
    return this.results.find(r => r.operation === operationName)
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Quick performance test for specific GitHub operation
 */
export async function quickBenchmark(
  operation: BenchmarkOperation,
  auth?: string
): Promise<BenchmarkResult> {
  const benchmark = new GitHubAPIBenchmark(auth)
  return await benchmark.benchmarkOperation(operation)
}

/**
 * Create GitHub API benchmark with environment configuration
 */
export function createGitHubBenchmark(): GitHubAPIBenchmark {
  const auth = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT
  
  if (!auth) {
    console.warn(
      'No GitHub token found. Benchmarks will use unauthenticated requests with lower rate limits.'
    )
  }
  
  return new GitHubAPIBenchmark(auth)
}

// ==================== EXPORTS ====================

export {
  BENCHMARK_CONFIG,
  type BenchmarkResult,
  type BenchmarkOperation,
  type PerformanceCategory,
}