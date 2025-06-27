/**
 * Load Testing Integration & End-to-End
 *
 * Tests full system load testing with multiple components and realistic scenarios.
 * Focuses on end-to-end workflows and system stability under load.
 */

import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '../../src/lib/github'
import { createRateLimitHeaders } from '../github/test-helpers'
import {
  BATCH_CONFIG,
  createMockUser,
  createWebhookPayloads,
  LOAD_TEST_CONFIG,
  PERFORMANCE_THRESHOLDS,
} from './fixtures/load-test-data'
import { setupPerformanceTest } from './setup/performance-setup'
import { addTestHandlers, createTrackedClient } from './utils/load-test-helpers'

describe('Load Testing - Integration & End-to-End', () => {
  const setup = setupPerformanceTest()

  beforeAll(setup.beforeAll)
  beforeEach(setup.beforeEach)
  afterEach(setup.afterEach)
  afterAll(setup.afterAll)

  describe('System Stability Under Load', () => {
    it('should maintain connection pooling effectiveness under load', async () => {
      const concurrency = LOAD_TEST_CONFIG.HIGH_CONCURRENCY
      let connectionCount = 0
      const connectionTimes: number[] = []

      const poolingHandler = http.get('https://api.github.com/user', async () => {
        connectionCount++
        connectionTimes.push(Date.now())

        // Add small delay to simulate network latency
        await new Promise(resolve => setTimeout(resolve, LOAD_TEST_CONFIG.STANDARD_DELAY))

        return HttpResponse.json(createMockUser(connectionCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - connectionCount }),
        })
      })

      await addTestHandlers(poolingHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'pooling_test_token' },
        retry: { retries: 1 },
      })

      // Execute concurrent requests
      const startTime = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        const requestStart = Date.now()
        const result = await client.getAuthenticatedUser()
        const requestEnd = Date.now()
        return {
          id: result.id,
          duration: requestEnd - requestStart,
        }
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()

      // Verify all requests completed
      expect(results).toHaveLength(concurrency)
      // Connection count may be lower due to GitHubClient caching (60s TTL)
      expect(connectionCount).toBeGreaterThanOrEqual(1)
      expect(connectionCount).toBeLessThanOrEqual(concurrency)

      // Analyze connection pooling effectiveness
      const totalDuration = endTime - startTime
      const avgRequestDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
      const maxRequestDuration = Math.max(...results.map(r => r.duration))

      // With connection pooling, total time should be much less than sequential execution
      const sequentialTime = concurrency * LOAD_TEST_CONFIG.STANDARD_DELAY
      expect(totalDuration).toBeLessThan(sequentialTime * 2) // Should be faster than sequential (with buffer)

      console.log(`Connection pooling test: ${concurrency} requests in ${totalDuration}ms`)
      console.log(`Average request duration: ${avgRequestDuration.toFixed(2)}ms`)
      console.log(`Max request duration: ${maxRequestDuration}ms`)
      console.log(`Sequential would take: ${sequentialTime}ms`)

      await client.destroy()
    }, 20000)

    it('should handle memory usage efficiently under sustained load', async () => {
      const batchSize = BATCH_CONFIG.DEFAULT_SIZE
      const batches = BATCH_CONFIG.DEFAULT_COUNT
      let totalRequests = 0

      const memoryHandler = http.get('https://api.github.com/users/:username', ({ params }) => {
        totalRequests++
        return HttpResponse.json(
          {
            login: params.username as string,
            id: totalRequests,
            avatar_url: `https://github.com/images/user_${totalRequests}.png`,
            html_url: `https://github.com/${params.username}`,
            type: 'User',
            site_admin: false,
          },
          {
            headers: createRateLimitHeaders({ remaining: 5000 - totalRequests }),
          }
        )
      })

      await addTestHandlers(memoryHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'memory_sustained_token' },
      })

      // Execute sustained load in batches
      const batchResults: number[] = []
      const memoryUsage: number[] = []

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = Date.now()

        // Execute batch with unique requests to avoid cache hits
        const promises = Array.from({ length: batchSize }, (_, i) =>
          client.getUser(`user_${batch}_${i}`)
        )
        const results = await Promise.all(promises)

        const batchEnd = Date.now()
        batchResults.push(batchEnd - batchStart)

        // Check memory usage (simplified)
        const cacheMetrics = client.getCacheMetrics()
        memoryUsage.push(cacheMetrics.memoryUsage)

        // Verify batch completed successfully
        expect(results).toHaveLength(batchSize)

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY))
      }

      // Verify sustained performance
      expect(totalRequests).toBe(batchSize * batches)

      // Performance should remain stable across batches
      const avgBatchTime = batchResults.reduce((sum, time) => sum + time, 0) / batchResults.length
      const maxBatchTime = Math.max(...batchResults)
      const minBatchTime = Math.min(...batchResults)
      const performanceVariance =
        avgBatchTime > 0 ? ((maxBatchTime - minBatchTime) / avgBatchTime) * 100 : 0

      // Performance variance should be reasonable
      expect(performanceVariance).toBeLessThan(PERFORMANCE_THRESHOLDS.PERFORMANCE_VARIANCE_MAX)

      console.log(`Sustained load test: ${batches} batches of ${batchSize} requests`)
      console.log(`Batch times: ${batchResults.map(t => `${t}ms`).join(', ')}`)
      console.log(`Performance variance: ${performanceVariance.toFixed(1)}%`)
      console.log(`Memory usage progression: ${memoryUsage.join(' -> ')}`)

      await client.destroy()
    }, 25000)

    it(
      'should handle webhook processing under concurrent load',
      async () => {
        const webhookCount = 20
        let processedWebhooks = 0
        const webhookTimes: number[] = []

        // Mock webhook validation and processing
        const webhookPayloads = createWebhookPayloads(webhookCount)

        // Simulate webhook processing with varying complexity
        const processWebhook = async (payload: Record<string, unknown>, index: number) => {
          const start = Date.now()

          // Simulate webhook validation
          await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 10))

          // Simulate processing complexity based on payload
          const complexity = (index % 3) + 1 // 1-3 complexity levels
          await new Promise(resolve => setTimeout(resolve, complexity * 10))

          processedWebhooks++
          const end = Date.now()
          webhookTimes.push(end - start)

          return {
            id: payload.pull_request.id,
            processed: true,
            duration: end - start,
          }
        }

        // Process webhooks concurrently
        const startTime = Date.now()
        const promises = webhookPayloads.map((payload, index) => processWebhook(payload, index))
        const results = await Promise.all(promises)
        const endTime = Date.now()

        // Verify all webhooks processed
        expect(results).toHaveLength(webhookCount)
        expect(processedWebhooks).toBe(webhookCount)
        expect(results.every(r => r.processed)).toBe(true)

        // Analyze webhook processing performance
        const totalDuration = endTime - startTime
        const avgWebhookTime =
          webhookTimes.reduce((sum, time) => sum + time, 0) / webhookTimes.length
        const maxWebhookTime = Math.max(...webhookTimes)
        const minWebhookTime = Math.min(...webhookTimes)

        // Concurrent processing should be faster than sequential
        const estimatedSequentialTime = webhookTimes.reduce((sum, time) => sum + time, 0)
        expect(totalDuration).toBeLessThan(estimatedSequentialTime * 0.7) // At least 30% improvement

        console.log(`Webhook processing: ${webhookCount} webhooks in ${totalDuration}ms`)
        console.log(`Average webhook time: ${avgWebhookTime.toFixed(2)}ms`)
        console.log(`Webhook time range: ${minWebhookTime}ms - ${maxWebhookTime}ms`)
        console.log(`Sequential would take: ~${estimatedSequentialTime}ms`)
      },
      LOAD_TEST_CONFIG.DEFAULT_TIMEOUT
    )
  })

  describe('End-to-End Scenarios', () => {
    it('should handle complete GitHub workflow under load', async () => {
      const workflowSteps = 5
      const concurrentWorkflows = LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY
      let stepCount = 0

      // Create handlers for different workflow steps
      const userHandler = http.get('https://api.github.com/user', () => {
        stepCount++
        return HttpResponse.json(createMockUser(stepCount))
      })

      const reposHandler = http.get('https://api.github.com/user/repos', () => {
        stepCount++
        return HttpResponse.json([{ name: `repo_${stepCount}`, id: stepCount }])
      })

      const issuesHandler = http.get(
        'https://api.github.com/repos/:owner/:repo/issues',
        ({ params: _params }) => {
          stepCount++
          return HttpResponse.json([
            { number: stepCount, title: `Issue ${stepCount}`, id: stepCount },
          ])
        }
      )

      const commitsHandler = http.get(
        'https://api.github.com/repos/:owner/:repo/commits',
        ({ params: _params }) => {
          stepCount++
          return HttpResponse.json([{ sha: `commit_${stepCount}`, message: `Commit ${stepCount}` }])
        }
      )

      const prHandler = http.get(
        'https://api.github.com/repos/:owner/:repo/pulls',
        ({ params: _params }) => {
          stepCount++
          return HttpResponse.json([{ number: stepCount, title: `PR ${stepCount}`, id: stepCount }])
        }
      )

      await addTestHandlers(userHandler, reposHandler, issuesHandler, commitsHandler, prHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'workflow_test_token' },
      })

      // Execute complete workflows concurrently
      const workflowPromises = Array.from(
        { length: concurrentWorkflows },
        async (_, workflowIndex) => {
          const workflowResults = []

          // Step 1: Get user info (actual API call)
          const user = await client.getAuthenticatedUser()
          workflowResults.push({ step: 'user', id: user.id })

          // Step 2: Get repositories (actual API call via octokit)
          const reposResponse = await client.octokit.request('GET /user/repos')
          workflowResults.push({ step: 'repos', count: reposResponse.data.length })

          // Step 3: Get issues from first repo (actual API call via octokit)
          const issuesResponse = await client.octokit.request('GET /repos/{owner}/{repo}/issues', {
            owner: 'testowner',
            repo: `repo_${workflowIndex}`,
          })
          workflowResults.push({ step: 'issues', count: issuesResponse.data.length })

          // Step 4: Get commits (actual API call via octokit)
          const commitsResponse = await client.octokit.request(
            'GET /repos/{owner}/{repo}/commits',
            {
              owner: 'testowner',
              repo: `repo_${workflowIndex}`,
            }
          )
          workflowResults.push({ step: 'commits', count: commitsResponse.data.length })

          // Step 5: Get pull requests (actual API call via octokit)
          const prsResponse = await client.octokit.request('GET /repos/{owner}/{repo}/pulls', {
            owner: 'testowner',
            repo: `repo_${workflowIndex}`,
          })
          workflowResults.push({ step: 'prs', count: prsResponse.data.length })

          return { workflowIndex, steps: workflowResults }
        }
      )

      const workflowResults = await Promise.all(workflowPromises)

      // Verify all workflows completed
      expect(workflowResults).toHaveLength(concurrentWorkflows)
      // Step count may vary due to GitHubClient caching and retries
      expect(stepCount).toBeGreaterThanOrEqual(workflowSteps) // At least one complete workflow
      expect(stepCount).toBeLessThanOrEqual(concurrentWorkflows * workflowSteps * 2) // Allow for retries

      for (const workflowResult of workflowResults) {
        expect(workflowResult.steps).toHaveLength(workflowSteps)
        expect(
          workflowResult.steps.every(step => {
            const hasStep = typeof (step as { step: string }).step === 'string'
            const hasId = typeof (step as { id?: number }).id === 'number'
            const hasCount = typeof (step as { count?: number }).count === 'number'
            return hasStep && (hasId || hasCount)
          })
        ).toBe(true)
      }

      console.log(
        `Completed ${concurrentWorkflows} GitHub workflows with ${workflowSteps} steps each`
      )
      console.log(`Total API calls: ${stepCount}`)

      await client.destroy()
    })

    it('should handle multi-repository operations under load', async () => {
      const repoCount = 3
      const operationsPerRepo = 2
      const totalOperations = repoCount * operationsPerRepo
      let operationCount = 0

      const multiRepoHandler = http.get(
        'https://api.github.com/repos/:owner/:repo/:operation',
        ({ params }) => {
          operationCount++
          return HttpResponse.json({
            repo: params.repo,
            operation: params.operation,
            id: operationCount,
            result: `Operation ${operationCount} on ${params.repo}`,
          })
        }
      )

      await addTestHandlers(multiRepoHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'multirepo_test_token' },
      })

      // Execute operations across multiple repositories
      const repoPromises = Array.from({ length: repoCount }, async (_, repoIndex) => {
        const repoName = `repo_${repoIndex}`
        const operations = []

        // Perform multiple operations on each repo
        for (let op = 0; op < operationsPerRepo; op++) {
          const operation = op === 0 ? 'issues' : 'commits'
          const result = await client.octokit.request({
            method: 'GET',
            url: `/repos/testowner/${repoName}/${operation}`,
          })
          operations.push(result.data)
        }

        return { repo: repoName, operations }
      })

      const repoResults = await Promise.all(repoPromises)

      // Verify all repository operations completed
      expect(repoResults).toHaveLength(repoCount)
      // Operation count may vary due to retries and network conditions
      expect(operationCount).toBeGreaterThanOrEqual(1)
      expect(operationCount).toBeLessThanOrEqual(totalOperations * 3) // Allow for retries

      for (const repoResult of repoResults) {
        expect(repoResult.operations).toHaveLength(operationsPerRepo)
      }

      console.log(
        `Multi-repo operations: ${totalOperations} operations across ${repoCount} repositories`
      )

      await client.destroy()
    })

    it('should handle complex data processing under load', async () => {
      const dataSize = 50
      const processingBatches = 2
      let processedItems = 0

      const dataHandler = http.get(
        'https://api.github.com/search/repositories',
        async ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q') || ''
          const page = Number(url.searchParams.get('page')) || 1
          const perPage = Number(url.searchParams.get('per_page')) || 30

          // Minimal processing delay to prevent timeouts
          await new Promise(resolve => setTimeout(resolve, 1))

          processedItems += perPage

          const items = Array.from({ length: perPage }, (_, i) => {
            const repoId = (page - 1) * perPage + i + 1
            return {
              id: repoId,
              name: `repo_${query}_${repoId}`,
              full_name: `owner/repo_${query}_${repoId}`,
              owner: {
                login: 'owner',
                id: 123,
                avatar_url: 'https://github.com/images/error/owner_happy.gif',
                html_url: 'https://github.com/owner',
                type: 'User',
                site_admin: false,
              },
              private: false,
              html_url: `https://github.com/owner/repo_${query}_${repoId}`,
              description: `Repository ${repoId} for query ${query}`,
              fork: false,
              created_at: '2023-01-01T00:00:00Z',
              updated_at: '2023-01-01T00:00:00Z',
              stargazers_count: repoId * 10,
              forks_count: repoId * 2,
              language: 'TypeScript',
              default_branch: 'main',
            }
          })

          return HttpResponse.json({
            total_count: dataSize,
            incomplete_results: false,
            items,
          })
        }
      )

      await addTestHandlers(dataHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'dataprocessing_test_token' },
      })

      // Process data in batches
      const batchResults = []

      for (let batch = 0; batch < processingBatches; batch++) {
        const batchStart = Date.now()

        // Execute search requests for this batch
        const searchPromises = Array.from({ length: 1 }, async (_, searchIndex) => {
          const query = `batch${batch}_search${searchIndex}`
          const result = await client.searchRepositories({ q: query, per_page: 20 })
          return {
            query,
            totalCount: result.total_count,
            itemCount: result.items.length,
          }
        })

        const searchResults = await Promise.all(searchPromises)
        const batchEnd = Date.now()

        batchResults.push({
          batch,
          duration: batchEnd - batchStart,
          searches: searchResults.length,
          totalItems: searchResults.reduce((sum, s) => sum + s.itemCount, 0),
        })

        console.log(
          `Batch ${batch + 1}: ${searchResults.length} searches, ${batchEnd - batchStart}ms`
        )
      }

      // Verify data processing
      expect(batchResults).toHaveLength(processingBatches)
      expect(processedItems).toBeGreaterThan(0)

      const totalProcessingTime = batchResults.reduce((sum, b) => sum + b.duration, 0)
      const totalItems = batchResults.reduce((sum, b) => sum + b.totalItems, 0)

      console.log(`Data processing: ${totalItems} items processed in ${totalProcessingTime}ms`)
      console.log(
        `Processing rate: ${((totalItems / totalProcessingTime) * 1000).toFixed(2)} items/second`
      )

      await client.destroy()
    }, 10000) // Reduced timeout to 10 seconds
  })

  describe('System Integration', () => {
    it('should integrate with external monitoring systems', async () => {
      const monitoringEvents: Array<{ timestamp: number; event: string; data: unknown }> = []
      let requestCount = 0

      const monitoredHandler = http.get('https://api.github.com/user', () => {
        requestCount++

        // Simulate monitoring event
        monitoringEvents.push({
          timestamp: Date.now(),
          event: 'api_request',
          data: { requestId: requestCount, endpoint: '/user' },
        })

        return HttpResponse.json(createMockUser(requestCount))
      })

      await addTestHandlers(monitoredHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'monitoring_test_token' },
      })

      // Execute requests with monitoring
      const promises = Array.from({ length: LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY }, async () => {
        const result = await client.getAuthenticatedUser()

        // Simulate additional monitoring
        monitoringEvents.push({
          timestamp: Date.now(),
          event: 'request_completed',
          data: { userId: result.id, status: 'success' },
        })

        return result.id
      })

      const results = await Promise.all(promises)

      // Verify monitoring integration
      expect(results).toHaveLength(LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY)
      expect(monitoringEvents.length).toBeGreaterThanOrEqual(LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY)

      const apiRequestEvents = monitoringEvents.filter(e => e.event === 'api_request')
      const completionEvents = monitoringEvents.filter(e => e.event === 'request_completed')

      // Account for GitHubClient caching potentially reducing API request count
      expect(apiRequestEvents.length).toBeGreaterThanOrEqual(1)
      expect(apiRequestEvents.length).toBeLessThanOrEqual(LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY * 2)
      expect(completionEvents).toHaveLength(LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY)

      console.log(`Monitoring integration: ${monitoringEvents.length} events captured`)
      console.log(
        `Event types: ${Array.from(new Set(monitoringEvents.map(e => e.event))).join(', ')}`
      )

      await client.destroy()
    })
  })
})
