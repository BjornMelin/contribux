/**
 * GitHubClient Usage Examples
 *
 * This file demonstrates how to use the modern GitHubClient
 * with various authentication methods, caching, and error handling.
 */

import { createGitHubClient } from './client'
import { GitHubError } from './errors'

// Octokit throttling types based on @octokit/plugin-throttling
interface ThrottlingOptions {
  method: string
  url: string
  request: {
    retryCount: number
  }
}

// Example 1: Basic Usage with Token Authentication
export async function basicUsageExample() {
  console.log('=== Basic GitHub Client Usage ===')

  // Create client with token authentication
  const client = createGitHubClient({
    auth: {
      type: 'token',
      token: process.env.GITHUB_TOKEN || 'ghp_your_token_here',
    },
  })

  try {
    // Get authenticated user
    const user = await client.getAuthenticatedUser()
    console.log(`Authenticated as: ${user.login}`)

    // Get a repository
    const repo = await client.getRepository({
      owner: 'facebook',
      repo: 'react',
    })
    console.log(`Repository: ${repo.full_name} (${repo.stargazers_count} stars)`)

    // Search repositories
    const searchResults = await client.searchRepositories({
      q: 'language:typescript stars:>1000',
      sort: 'stars',
      order: 'desc',
      per_page: 5,
    })
    console.log(`Found ${searchResults.total_count} TypeScript repositories`)

    // List issues for a repository
    const issues = await client.listIssues(
      { owner: 'microsoft', repo: 'typescript' },
      { state: 'open', per_page: 10 }
    )
    console.log(`Open issues: ${issues.length}`)

    // Check rate limits
    const rateLimit = await client.getRateLimit()
    const core = rateLimit.core
    if (core && typeof core === 'object' && 'remaining' in core && 'limit' in core) {
      console.log(`Rate limit remaining: ${core.remaining}/${core.limit}`)
    } else {
      console.log('Rate limit information not available')
    }
  } catch (error) {
    if (error instanceof GitHubError) {
      console.error(`GitHub API Error: ${error.message} (${error.code})`)
    } else {
      console.error('Unexpected error:', error)
    }
  }
}

// Example 2: Advanced Usage with GitHub App Authentication
export async function advancedUsageExample() {
  console.log('=== Advanced GitHub Client Usage (GitHub App) ===')

  // Create client with GitHub App authentication
  const client = createGitHubClient({
    auth: {
      type: 'app',
      appId: Number(process.env.GITHUB_APP_ID || '123456'),
      privateKey: process.env.GITHUB_PRIVATE_KEY || 'your-private-key',
      installationId: Number(process.env.GITHUB_INSTALLATION_ID || '789012'),
    },
    cache: {
      maxAge: 600, // 10 minutes cache
      maxSize: 500, // Max 500 cached entries
    },
    throttle: {
      onRateLimit: (retryAfter: number, options: ThrottlingOptions) => {
        console.warn(`Rate limit hit. Retrying after ${retryAfter}s`)
        return options.request.retryCount < 3 // Retry up to 3 times
      },
      onSecondaryRateLimit: (retryAfter: number, options: ThrottlingOptions) => {
        console.warn(`Secondary rate limit hit. Retrying after ${retryAfter}s`)
        return options.request.retryCount < 1 // Retry once
      },
    },
  })

  try {
    // Use GraphQL for complex queries
    const graphqlQuery = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          name
          description
          stargazerCount
          forkCount
          issues(states: OPEN, first: 5) {
            totalCount
            nodes {
              title
              number
              author {
                login
              }
            }
          }
        }
      }
    `

    const graphqlResult = await client.graphql(graphqlQuery, {
      owner: 'vercel',
      repo: 'next.js',
    })

    console.log('GraphQL Result:', JSON.stringify(graphqlResult, null, 2))

    // Check cache statistics
    const cacheStats = client.getCacheStats()
    console.log(`Cache usage: ${cacheStats.size}/${cacheStats.maxSize}`)
  } catch (error) {
    if (error instanceof GitHubError) {
      console.error(`GitHub API Error: ${error.message} (${error.code})`)
      if (error.status) {
        console.error(`HTTP Status: ${error.status}`)
      }
    } else {
      console.error('Unexpected error:', error)
    }
  }
}

// Example 3: Error Handling and Retry Logic
export async function errorHandlingExample() {
  console.log('=== Error Handling Example ===')

  const client = createGitHubClient({
    auth: {
      type: 'token',
      token: 'invalid_token', // Intentionally invalid
    },
  })

  try {
    // This will fail with authentication error
    await client.getAuthenticatedUser()
  } catch (error) {
    if (error instanceof GitHubError) {
      console.log(`Expected error caught: ${error.code}`)
      console.log(`Error message: ${error.message}`)
      console.log(`HTTP status: ${error.status}`)
    }
  }

  // Example with non-existent repository
  const validClient = createGitHubClient({
    auth: {
      type: 'token',
      token: process.env.GITHUB_TOKEN || 'ghp_your_token_here',
    },
  })

  try {
    await validClient.getRepository({
      owner: 'non-existent-user',
      repo: 'non-existent-repo',
    })
  } catch (error) {
    if (error instanceof GitHubError) {
      console.log(`Repository not found: ${error.code} (${error.status})`)
    }
  }
}

// Example 4: Performance and Caching Demo
export async function performanceExample() {
  console.log('=== Performance and Caching Demo ===')

  const client = createGitHubClient({
    auth: {
      type: 'token',
      token: process.env.GITHUB_TOKEN || 'ghp_your_token_here',
    },
    cache: {
      maxAge: 300, // 5 minutes
      maxSize: 100, // Small cache for demo
    },
  })

  const repoIdentifier = { owner: 'facebook', repo: 'react' }

  // First request - will hit the API
  console.time('First request (no cache)')
  const repo1 = await client.getRepository(repoIdentifier)
  console.timeEnd('First request (no cache)')
  console.log(`Repository: ${repo1.full_name}`)

  // Second request - should be cached
  console.time('Second request (cached)')
  const repo2 = await client.getRepository(repoIdentifier)
  console.timeEnd('Second request (cached)')
  console.log(`Repository: ${repo2.full_name}`)

  // Check cache stats
  const stats = client.getCacheStats()
  console.log(`Cache stats: ${stats.size}/${stats.maxSize} entries`)

  // Clear cache and try again
  client.clearCache()
  console.log('Cache cleared')

  console.time('Third request (cache cleared)')
  const repo3 = await client.getRepository(repoIdentifier)
  console.timeEnd('Third request (cache cleared)')
  console.log(`Repository: ${repo3.full_name}`)
}

// Example 5: Bulk Operations with Rate Limiting
export async function bulkOperationsExample() {
  console.log('=== Bulk Operations Example ===')

  const client = createGitHubClient({
    auth: {
      type: 'token',
      token: process.env.GITHUB_TOKEN || 'ghp_your_token_here',
    },
    throttle: {
      onRateLimit: (retryAfter: number, options: ThrottlingOptions) => {
        console.log(
          `Rate limit reached. Waiting ${retryAfter}s before retry ${options.request.retryCount + 1}`
        )
        return options.request.retryCount < 2
      },
    },
  })

  const repositories = [
    { owner: 'facebook', repo: 'react' },
    { owner: 'microsoft', repo: 'typescript' },
    { owner: 'vercel', repo: 'next.js' },
    { owner: 'nodejs', repo: 'node' },
    { owner: 'denoland', repo: 'deno' },
  ]

  console.log('Fetching multiple repositories...')

  for (const repoId of repositories) {
    try {
      const repo = await client.getRepository(repoId)
      console.log(`✓ ${repo.full_name}: ${repo.stargazers_count} stars`)
    } catch (error) {
      if (error instanceof GitHubError) {
        console.log(`✗ ${repoId.owner}/${repoId.repo}: ${error.message}`)
      }
    }
  }

  // Check final rate limit status
  const rateLimit = await client.getRateLimit()
  const core = rateLimit.core
  if (core && typeof core === 'object' && 'remaining' in core && 'limit' in core) {
    console.log(`Operations completed. Rate limit: ${core.remaining}/${core.limit}`)
  } else {
    console.log('Operations completed. Rate limit information not available')
  }
}

// Run all examples
export async function runAllExamples() {
  try {
    await basicUsageExample()
    console.log('\n')

    await advancedUsageExample()
    console.log('\n')

    await errorHandlingExample()
    console.log('\n')

    await performanceExample()
    console.log('\n')

    await bulkOperationsExample()
  } catch (error) {
    console.error('Example execution failed:', error)
  }
}

// Export for use in other files
export {
  basicUsageExample as basic,
  advancedUsageExample as advanced,
  errorHandlingExample as errorHandling,
  performanceExample as performance,
  bulkOperationsExample as bulkOperations,
}
