/**
 * Integration Test Workflow Helpers
 *
 * Shared utilities for GitHub integration testing workflows and scenarios.
 * Provides common patterns for testing end-to-end GitHub operations.
 */

import type { GitHubClient } from '@/lib/github/client'

export interface WorkflowTestResult<T = unknown> {
  success: boolean
  duration: number
  data?: T
  error?: Error
}

export interface WorkflowMetrics {
  totalSteps: number
  successfulSteps: number
  failedSteps: number
  totalDuration: number
  averageStepDuration: number
}

/**
 * Execute a multi-step workflow and track results
 */
export async function executeWorkflow<T = unknown>(
  steps: Array<() => Promise<T>>,
  options: {
    stopOnError?: boolean
    trackMetrics?: boolean
  } = {}
): Promise<{
  results: WorkflowTestResult[]
  metrics: WorkflowMetrics
}> {
  const results: WorkflowTestResult[] = []
  const startTime = Date.now()

  for (const [_index, step] of steps.entries()) {
    const stepStart = Date.now()

    try {
      const data = await step()
      const duration = Date.now() - stepStart

      results.push({
        success: true,
        duration,
        data,
      })
    } catch (error) {
      const duration = Date.now() - stepStart

      results.push({
        success: false,
        duration,
        error: error as Error,
      })

      if (options.stopOnError) {
        break
      }
    }
  }

  const totalDuration = Date.now() - startTime
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  const metrics: WorkflowMetrics = {
    totalSteps: results.length,
    successfulSteps: successful,
    failedSteps: failed,
    totalDuration,
    averageStepDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
  }

  return { results, metrics }
}

/**
 * Create a repository discovery workflow
 */
export function createRepositoryDiscoveryWorkflow(client: GitHubClient, searchQuery: string) {
  return [
    // Step 1: Search repositories
    async () => {
      const searchResults = await client.searchRepositories({
        q: searchQuery,
        sort: 'stars',
        order: 'desc',
        per_page: 5,
      })
      return searchResults
    },

    // Step 2: Get details for first repository
    async () => {
      const searchResults = await client.searchRepositories({
        q: searchQuery,
        sort: 'stars',
        order: 'desc',
        per_page: 1,
      })

      if (searchResults.items.length === 0) {
        throw new Error('No repositories found')
      }

      const firstRepo = searchResults.items[0]
      const repoDetails = await client.getRepository({
        owner: firstRepo.owner.login,
        repo: firstRepo.name,
      })

      return repoDetails
    },

    // Step 3: Verify repository accessibility
    async () => {
      const user = await client.getAuthenticatedUser()
      return { accessible: true, user: user.login }
    },
  ]
}

/**
 * Create a user profile workflow
 */
export function createUserProfileWorkflow(client: GitHubClient) {
  return [
    // Step 1: Get authenticated user
    async () => {
      const user = await client.getAuthenticatedUser()
      return user
    },

    // Step 2: Get user's repositories
    async () => {
      const repos = await client.rest.repos.listForAuthenticatedUser({
        type: 'owner',
        sort: 'updated',
        per_page: 5,
      })
      return repos.data
    },

    // Step 3: Check rate limits
    async () => {
      const rateLimit = await client.getRateLimit()
      return rateLimit
    },
  ]
}

/**
 * Validate workflow results against expected patterns
 */
export function validateWorkflowResults(
  results: WorkflowTestResult[],
  expectations: {
    minSuccessRate?: number
    maxAverageDuration?: number
    requiredSteps?: number
  }
): {
  valid: boolean
  violations: string[]
  metrics: {
    successRate: number
    averageDuration: number
    totalSteps: number
  }
} {
  const violations: string[] = []
  const successRate = (results.filter(r => r.success).length / results.length) * 100
  const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length

  if (expectations.minSuccessRate !== undefined && successRate < expectations.minSuccessRate) {
    violations.push(
      `Success rate ${successRate.toFixed(1)}% below minimum ${expectations.minSuccessRate}%`
    )
  }

  if (
    expectations.maxAverageDuration !== undefined &&
    averageDuration > expectations.maxAverageDuration
  ) {
    violations.push(
      `Average duration ${averageDuration.toFixed(1)}ms exceeds maximum ${expectations.maxAverageDuration}ms`
    )
  }

  if (expectations.requiredSteps !== undefined && results.length < expectations.requiredSteps) {
    violations.push(
      `Only ${results.length} steps completed, required ${expectations.requiredSteps}`
    )
  }

  return {
    valid: violations.length === 0,
    violations,
    metrics: {
      successRate,
      averageDuration,
      totalSteps: results.length,
    },
  }
}

/**
 * Create a comprehensive integration test workflow
 */
export function createIntegrationTestWorkflow(
  client: GitHubClient,
  options: {
    testRepository?: { owner: string; repo: string }
    includeSearch?: boolean
    includeUserProfile?: boolean
  } = {}
) {
  const steps: Array<() => Promise<unknown>> = []

  if (options.includeUserProfile) {
    steps.push(...createUserProfileWorkflow(client))
  }

  if (options.includeSearch) {
    steps.push(...createRepositoryDiscoveryWorkflow(client, 'react'))
  }

  if (options.testRepository) {
    steps.push(async () => {
      const repo = await client.getRepository(
        options.testRepository as { owner: string; repo: string }
      )
      return repo
    })
  }

  return steps
}

/**
 * Simulate realistic user interaction patterns
 */
export async function simulateUserInteraction(
  client: GitHubClient,
  pattern: 'browsing' | 'searching' | 'development'
): Promise<WorkflowTestResult[]> {
  let workflow: Array<() => Promise<unknown>>

  switch (pattern) {
    case 'browsing':
      workflow = [
        () => client.getAuthenticatedUser(),
        () => client.getRateLimit(),
        () => client.searchRepositories({ q: 'javascript', per_page: 5 }),
      ]
      break

    case 'searching':
      workflow = [
        () => client.searchRepositories({ q: 'typescript', sort: 'stars', per_page: 10 }),
        () => client.searchRepositories({ q: 'react hooks', per_page: 5 }),
        () => client.getRateLimit(),
      ]
      break

    case 'development':
      workflow = [
        () => client.getAuthenticatedUser(),
        () => client.rest.repos.listForAuthenticatedUser({ per_page: 10 }),
        () => client.getRateLimit(),
      ]
      break

    default:
      throw new Error(`Unknown interaction pattern: ${pattern}`)
  }

  const { results } = await executeWorkflow(workflow, { stopOnError: false })
  return results
}

/**
 * Performance benchmarking utilities
 */
export class WorkflowBenchmark {
  private results: Array<{ name: string; duration: number; success: boolean }> = []

  async benchmark<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now()
    try {
      const result = await operation()
      const duration = Date.now() - start
      this.results.push({ name, duration, success: true })
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.results.push({ name, duration, success: false })
      throw error
    }
  }

  getResults() {
    return [...this.results]
  }

  getSummary() {
    const successful = this.results.filter(r => r.success)
    const failed = this.results.filter(r => !r.success)

    return {
      total: this.results.length,
      successful: successful.length,
      failed: failed.length,
      averageDuration: successful.reduce((sum, r) => sum + r.duration, 0) / successful.length || 0,
      totalDuration: this.results.reduce((sum, r) => sum + r.duration, 0),
    }
  }

  reset() {
    this.results = []
  }
}
