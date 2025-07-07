/**
 * Instrumented GitHub Client with OpenTelemetry
 * 
 * Enhances the existing GitHub client with comprehensive observability
 */

import { GitHubClient, GitHubClientConfig, GitHubRepository, GitHubIssue, SearchResult } from './client'
import { createGitHubSpan, recordGitHubRateLimit } from '@/lib/telemetry/utils'
import { telemetryLogger } from '@/lib/telemetry/logger'

/**
 * Instrumented GitHub Client that wraps all operations with telemetry
 */
export class InstrumentedGitHubClient extends GitHubClient {
  /**
   * Search repositories with telemetry
   */
  override async searchRepositories(params: {
    query: string
    language?: string
    minStars?: number
    page?: number
    perPage?: number
  }): Promise<SearchResult<GitHubRepository>> {
    return createGitHubSpan(
      'search_repositories',
      async (span) => {
        span.setAttributes({
          'github.query': params.query,
          'github.language': params.language || 'all',
          'github.min_stars': params.minStars || 0,
          'github.page': params.page || 1,
          'github.per_page': params.perPage || 20,
        })

        telemetryLogger.githubApi('Searching repositories', {
          operation: 'search_repositories',
          query: params.query,
          language: params.language,
        })

        const startTime = Date.now()
        try {
          const result = await super.searchRepositories(params)
          
          const duration = Date.now() - startTime
          span.setAttributes({
            'github.results_count': result.items.length,
            'github.total_count': result.total_count,
            'github.incomplete_results': result.incomplete_results,
          })

          telemetryLogger.githubApi('Repository search completed', {
            operation: 'search_repositories',
            duration,
            resultsCount: result.items.length,
            totalCount: result.total_count,
            statusCode: 200,
          })

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Repository search failed', {
            operation: 'search_repositories',
            duration,
            statusCode: 500,
          })
          throw error
        }
      },
      {
        'github.api': 'search',
        'github.resource': 'repositories',
      }
    )
  }

  /**
   * Get repository details with telemetry
   */
  override async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return createGitHubSpan(
      'get_repository',
      async (span) => {
        span.setAttributes({
          'github.owner': owner,
          'github.repo': repo,
          'github.full_name': `${owner}/${repo}`,
        })

        telemetryLogger.githubApi('Getting repository details', {
          operation: 'get_repository',
          owner,
          repo,
        })

        const startTime = Date.now()
        try {
          const result = await super.getRepository(owner, repo)
          
          const duration = Date.now() - startTime
          span.setAttributes({
            'github.stars': result.stargazers_count,
            'github.forks': result.forks_count,
            'github.language': result.language || 'unknown',
            'github.is_fork': result.fork,
          })

          telemetryLogger.githubApi('Repository details retrieved', {
            operation: 'get_repository',
            duration,
            owner,
            repo,
            stars: result.stargazers_count,
            statusCode: 200,
          })

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Repository details retrieval failed', {
            operation: 'get_repository',
            duration,
            owner,
            repo,
            statusCode: 404,
          })
          throw error
        }
      },
      {
        'github.api': 'repos',
        'github.resource': 'repository',
      }
    )
  }

  /**
   * Search issues with telemetry
   */
  override async searchIssues(params: {
    repository?: string
    labels?: string[]
    state?: 'open' | 'closed'
    page?: number
    perPage?: number
  }): Promise<SearchResult<GitHubIssue>> {
    return createGitHubSpan(
      'search_issues',
      async (span) => {
        span.setAttributes({
          'github.repository': params.repository || 'all',
          'github.labels': params.labels?.join(',') || 'none',
          'github.state': params.state || 'open',
          'github.page': params.page || 1,
          'github.per_page': params.perPage || 20,
        })

        telemetryLogger.githubApi('Searching issues', {
          operation: 'search_issues',
          repository: params.repository,
          state: params.state,
        })

        const startTime = Date.now()
        try {
          const result = await super.searchIssues(params)
          
          const duration = Date.now() - startTime
          span.setAttributes({
            'github.results_count': result.items.length,
            'github.total_count': result.total_count,
            'github.incomplete_results': result.incomplete_results,
          })

          telemetryLogger.githubApi('Issue search completed', {
            operation: 'search_issues',
            duration,
            resultsCount: result.items.length,
            totalCount: result.total_count,
            statusCode: 200,
          })

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Issue search failed', {
            operation: 'search_issues',
            duration,
            statusCode: 500,
          })
          throw error
        }
      },
      {
        'github.api': 'search',
        'github.resource': 'issues',
      }
    )
  }

  /**
   * Get authenticated user with telemetry
   */
  override async getCurrentUser() {
    return createGitHubSpan(
      'get_current_user',
      async (span) => {
        telemetryLogger.githubApi('Getting current user', {
          operation: 'get_current_user',
        })

        const startTime = Date.now()
        try {
          const result = await super.getCurrentUser()
          
          const duration = Date.now() - startTime
          span.setAttributes({
            'github.user.login': result.login,
            'github.user.public_repos': result.public_repos,
            'github.user.followers': result.followers,
          })

          telemetryLogger.githubApi('Current user retrieved', {
            operation: 'get_current_user',
            duration,
            statusCode: 200,
          })

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Current user retrieval failed', {
            operation: 'get_current_user',
            duration,
            statusCode: 401,
          })
          throw error
        }
      },
      {
        'github.api': 'user',
        'github.resource': 'authenticated_user',
      }
    )
  }

  /**
   * Health check with telemetry and rate limit monitoring
   */
  override async healthCheck(): Promise<{
    healthy: boolean
    rateLimit?: {
      limit: number
      remaining: number
      reset: number
    }
    error?: string
  }> {
    return createGitHubSpan(
      'health_check',
      async (span) => {
        telemetryLogger.githubApi('Performing health check', {
          operation: 'health_check',
        })

        const startTime = Date.now()
        try {
          const result = await super.healthCheck()
          
          const duration = Date.now() - startTime
          
          if (result.rateLimit) {
            // Record rate limit metrics
            recordGitHubRateLimit(
              result.rateLimit.remaining,
              result.rateLimit.limit,
              result.rateLimit.reset
            )

            span.setAttributes({
              'github.rate_limit.limit': result.rateLimit.limit,
              'github.rate_limit.remaining': result.rateLimit.remaining,
              'github.rate_limit.reset': result.rateLimit.reset,
              'github.rate_limit.percentage': (result.rateLimit.remaining / result.rateLimit.limit) * 100,
            })

            telemetryLogger.githubApi('Health check completed', {
              operation: 'health_check',
              duration,
              rateLimitRemaining: result.rateLimit.remaining,
              statusCode: 200,
            })
          } else {
            telemetryLogger.githubApi('Health check failed', {
              operation: 'health_check',
              duration,
              statusCode: 500,
            })
          }

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Health check failed', {
            operation: 'health_check',
            duration,
            statusCode: 500,
          })
          throw error
        }
      },
      {
        'github.api': 'meta',
        'github.resource': 'rate_limit',
      }
    )
  }

  /**
   * Get repository issues with telemetry
   */
  override async getRepositoryIssues(
    owner: string,
    repo: string,
    params: {
      state?: 'open' | 'closed' | 'all'
      labels?: string
      page?: number
      perPage?: number
    } = {}
  ): Promise<GitHubIssue[]> {
    return createGitHubSpan(
      'get_repository_issues',
      async (span) => {
        span.setAttributes({
          'github.owner': owner,
          'github.repo': repo,
          'github.state': params.state || 'open',
          'github.labels': params.labels || 'none',
          'github.page': params.page || 1,
          'github.per_page': params.perPage || 20,
        })

        const startTime = Date.now()
        try {
          const result = await super.getRepositoryIssues(owner, repo, params)
          
          const duration = Date.now() - startTime
          span.setAttributes({
            'github.results_count': result.length,
          })

          telemetryLogger.githubApi('Repository issues retrieved', {
            operation: 'get_repository_issues',
            duration,
            owner,
            repo,
            resultsCount: result.length,
            statusCode: 200,
          })

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Repository issues retrieval failed', {
            operation: 'get_repository_issues',
            duration,
            owner,
            repo,
            statusCode: 500,
          })
          throw error
        }
      },
      {
        'github.api': 'issues',
        'github.resource': 'repository_issues',
      }
    )
  }

  /**
   * Create authenticated client from session with telemetry
   */
  static async fromSession(): Promise<InstrumentedGitHubClient> {
    return createGitHubSpan(
      'create_from_session',
      async (span) => {
        telemetryLogger.githubApi('Creating client from session', {
          operation: 'create_from_session',
        })

        const startTime = Date.now()
        try {
          const client = await GitHubClient.fromSession()
          const instrumentedClient = new InstrumentedGitHubClient(client)
          
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Client created from session', {
            operation: 'create_from_session',
            duration,
            statusCode: 200,
          })

          return instrumentedClient
        } catch (error) {
          const duration = Date.now() - startTime
          telemetryLogger.githubApi('Client creation from session failed', {
            operation: 'create_from_session',
            duration,
            statusCode: 401,
          })
          throw error
        }
      },
      {
        'github.api': 'auth',
        'github.resource': 'session',
      }
    )
  }
}

/**
 * Factory function for instrumented GitHub client
 */
export function createInstrumentedGitHubClient(config: GitHubClientConfig): InstrumentedGitHubClient {
  return new InstrumentedGitHubClient(config)
}