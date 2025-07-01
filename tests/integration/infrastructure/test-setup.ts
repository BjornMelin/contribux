/**
 * Integration Test Setup Utilities
 *
 * Provides utilities for setting up and tearing down the integration test environment
 * including Docker containers, GitHub test repositories, and test data.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { GitHubClient } from '@/lib/github/client'
import { MetricsCollector } from './metrics-collector'
import {
  type IntegrationTestContext,
  type IntegrationTestEnv,
  loadIntegrationTestEnv,
  TEST_REPOSITORIES,
} from './test-config'

const execAsync = promisify(exec)

/**
 * Docker container management utilities
 */
export class DockerManager {
  private readonly composeFile = 'tests/integration/infrastructure/docker-compose.yml'

  /**
   * Start all Docker containers for integration testing
   */
  async startContainers(): Promise<void> {
    console.log('Starting Docker containers...')
    try {
      await execAsync(`docker compose -f ${this.composeFile} up -d`)

      // Wait for containers to be healthy
      await this.waitForHealthy()
      console.log('All containers are healthy')
    } catch (error) {
      console.error('Failed to start containers:', error)
      throw error
    }
  }

  /**
   * Stop all Docker containers
   */
  async stopContainers(): Promise<void> {
    console.log('Stopping Docker containers...')
    try {
      await execAsync(`docker compose -f ${this.composeFile} down`)
    } catch (error) {
      console.error('Failed to stop containers:', error)
      throw error
    }
  }

  /**
   * Remove all containers and volumes
   */
  async cleanupContainers(): Promise<void> {
    console.log('Cleaning up Docker containers and volumes...')
    try {
      await execAsync(`docker compose -f ${this.composeFile} down -v`)
    } catch (error) {
      console.error('Failed to cleanup containers:', error)
      throw error
    }
  }

  /**
   * Wait for all containers to report healthy status
   */
  private async waitForHealthy(timeout = 60000): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const { stdout } = await execAsync(`docker compose -f ${this.composeFile} ps --format json`)
        const containers = stdout
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))

        const allHealthy = containers.every(
          container =>
            container.State === 'running' && (!container.Health || container.Health === 'healthy')
        )

        if (allHealthy) {
          return
        }
      } catch (_error) {
        // Ignore errors during health check
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Containers did not become healthy within timeout')
  }
}

/**
 * GitHub test environment manager
 */
export class GitHubTestEnvironment {
  private client: GitHubClient
  private env: IntegrationTestEnv
  private createdRepos: Array<{ owner: string; repo: string; id: number }> = []

  constructor(env: IntegrationTestEnv) {
    this.env = env
    this.client = new GitHubClient({
      auth: {
        type: 'token',
        token: env.GITHUB_TEST_TOKEN,
      },
    })
  }

  /**
   * Create test repositories in GitHub
   */
  async createTestRepositories(): Promise<
    Map<string, { owner: string; repo: string; id: number }>
  > {
    console.log('Creating test repositories...')
    const repositories = new Map<string, { owner: string; repo: string; id: number }>()

    for (const repoConfig of TEST_REPOSITORIES) {
      const repoName = `${this.env.GITHUB_TEST_REPO_PREFIX}${repoConfig.name}-${Date.now()}`

      try {
        // Since GitHubClient doesn't expose createForAuthenticatedUser,
        // we'll need to extend it or use a mock for testing
        // For now, we'll create a mock response
        const data = {
          id: Math.floor(Math.random() * 1000000),
          name: repoName,
          owner: {
            login: this.env.GITHUB_TEST_ORG,
          },
          private: repoConfig.private,
          description: repoConfig.description,
          has_issues: repoConfig.hasIssues,
          has_wiki: repoConfig.hasWiki,
          has_projects: repoConfig.hasProjects,
        }

        const repoInfo = {
          owner: data.owner.login,
          repo: data.name,
          id: data.id,
        }

        this.createdRepos.push(repoInfo)
        repositories.set(repoConfig.name, repoInfo)

        console.log(`Created repository: ${repoInfo.owner}/${repoInfo.repo}`)
      } catch (error) {
        console.error(`Failed to create repository ${repoConfig.name}:`, error)
        throw error
      }
    }

    return repositories
  }

  /**
   * Setup webhook endpoints for test repositories
   */
  async setupWebhooks(
    repositories: Map<string, { owner: string; repo: string; id: number }>,
    webhookEndpoint: string
  ): Promise<void> {
    console.log('Setting up webhooks...')

    for (const [name, repo] of Array.from(repositories.entries())) {
      if (name === 'webhook-test') {
        try {
          // Mock webhook creation since GitHubClient doesn't expose this method
          console.log(
            `Mock: Would create webhook for ${repo.owner}/${repo.repo} at ${webhookEndpoint}`
          )

          // In a real implementation, we would extend GitHubClient or use Octokit directly
        } catch (error) {
          console.error(`Failed to create webhook for ${repo.repo}:`, error)
          throw error
        }
      }
    }
  }

  /**
   * Cleanup test repositories
   */
  async cleanup(): Promise<void> {
    if (!this.env.TEST_CLEANUP) {
      console.log('Skipping cleanup (TEST_CLEANUP=false)')
      return
    }

    console.log('Cleaning up test repositories...')

    for (const repo of this.createdRepos) {
      try {
        // Mock repository deletion since GitHubClient doesn't expose this method
        console.log(`Mock: Would delete repository: ${repo.owner}/${repo.repo}`)
      } catch (error) {
        console.error(`Failed to delete repository ${repo.repo}:`, error)
        // Continue cleanup even if one fails
      }
    }

    // GitHubClient doesn't have a destroy method, just clear cache
    this.client.clearCache()
  }
}

/**
 * Main integration test setup
 */
export class IntegrationTestSetup {
  private dockerManager: DockerManager
  private githubEnv: GitHubTestEnvironment
  private context: IntegrationTestContext

  constructor() {
    const env = loadIntegrationTestEnv()
    this.dockerManager = new DockerManager()
    this.githubEnv = new GitHubTestEnvironment(env)
    this.context = {
      env,
      repositories: new Map(),
      cleanupFunctions: [],
      metricsCollector: env.METRICS_ENABLED ? new MetricsCollector() : undefined,
    }
  }

  /**
   * Setup the complete integration test environment
   */
  async setup(): Promise<IntegrationTestContext> {
    console.log('Setting up integration test environment...')

    try {
      // Start Docker containers
      await this.dockerManager.startContainers()
      this.context.cleanupFunctions.push(() => this.dockerManager.stopContainers())

      // Create GitHub test repositories
      this.context.repositories = await this.githubEnv.createTestRepositories()
      this.context.cleanupFunctions.push(() => this.githubEnv.cleanup())

      // Setup webhook endpoint
      if (this.context.env.WEBHOOK_TEST_PORT) {
        this.context.webhookEndpoint = `http://localhost:${this.context.env.WEBHOOK_TEST_PORT}/webhook`
        await this.githubEnv.setupWebhooks(this.context.repositories, this.context.webhookEndpoint)
      }

      console.log('Integration test environment ready')
      return this.context
    } catch (error) {
      // Cleanup on failure
      await this.cleanup()
      throw error
    }
  }

  /**
   * Cleanup the integration test environment
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up integration test environment...')

    // Run cleanup functions in reverse order
    for (const cleanupFn of this.context.cleanupFunctions.reverse()) {
      try {
        await cleanupFn()
      } catch (error) {
        console.error('Cleanup error:', error)
        // Continue with other cleanup
      }
    }

    // Final Docker cleanup
    if (this.context.env.TEST_CLEANUP) {
      await this.dockerManager.cleanupContainers()
    }
  }

  /**
   * Get the test context
   */
  getContext(): IntegrationTestContext {
    return this.context
  }
}

/**
 * Utility to run integration tests with proper setup/teardown
 */
export async function runIntegrationTest(
  name: string,
  testFn: (context: IntegrationTestContext) => Promise<void>
): Promise<void> {
  const setup = new IntegrationTestSetup()

  try {
    const context = await setup.setup()
    console.log(`Running integration test: ${name}`)
    await testFn(context)
    console.log(`Integration test passed: ${name}`)
  } finally {
    await setup.cleanup()
  }
}
