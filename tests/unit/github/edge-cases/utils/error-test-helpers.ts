/**
 * Error Testing Utilities
 *
 * Comprehensive utilities for testing error scenarios, retry logic,
 * and failure recovery in GitHub client edge cases.
 */

import type { GitHubClient } from '@/lib/github'
import { GitHubError } from '@/lib/github/errors'
import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'
import { mswServer } from '../../msw-setup'

/**
 * Error scenario types for comprehensive testing
 */
export interface ErrorScenario {
  name: string
  status: number
  message: string
  headers?: Record<string, string>
  delay?: number
  shouldRetry?: boolean
}

/**
 * Pre-defined error scenarios for consistent testing
 */
export const ERROR_SCENARIOS: Record<string, ErrorScenario> = {
  SERVER_ERROR: {
    name: 'Internal Server Error',
    status: 500,
    message: 'Internal Server Error',
    shouldRetry: true,
  },
  VALIDATION_ERROR: {
    name: 'Validation Failed',
    status: 422,
    message: 'Validation Failed',
    shouldRetry: false,
  },
  RATE_LIMIT: {
    name: 'Rate Limit Exceeded',
    status: 403,
    message: 'API rate limit exceeded for user ID 1.',
    headers: {
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
      'X-RateLimit-Used': '60',
    },
    shouldRetry: false,
  },
  SECONDARY_RATE_LIMIT: {
    name: 'Secondary Rate Limit',
    status: 403,
    message: 'You have exceeded a secondary rate limit',
    headers: {
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '29',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
      'Retry-After': '60',
    },
    shouldRetry: false,
  },
  BAD_CREDENTIALS: {
    name: 'Bad Credentials',
    status: 401,
    message: 'Bad credentials',
    shouldRetry: false,
  },
  NOT_FOUND: {
    name: 'Not Found',
    status: 404,
    message: 'Not Found',
    shouldRetry: false,
  },
  NETWORK_TIMEOUT: {
    name: 'Network Timeout',
    status: 0,
    message: 'Network timeout',
    delay: 10000,
    shouldRetry: true,
  },
} as const

/**
 * Mock error responses for specific endpoints
 */
export function mockErrorResponse(endpoint: string, scenario: ErrorScenario) {
  const handler = http.get(endpoint, async () => {
    if (scenario.delay) {
      await new Promise(resolve => setTimeout(resolve, scenario.delay))
    }

    if (scenario.status === 0) {
      // Network error
      return HttpResponse.error()
    }

    return HttpResponse.json(
      {
        message: scenario.message,
        documentation_url: 'https://docs.github.com/rest',
      },
      {
        status: scenario.status,
        headers: scenario.headers || {},
      }
    )
  })

  mswServer.use(handler)
  return handler
}

/**
 * Mock malformed JSON response
 */
export function mockMalformedJsonResponse(endpoint: string) {
  const handler = http.get(endpoint, () => {
    return new HttpResponse('{"invalid": json}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  mswServer.use(handler)
  return handler
}

/**
 * Test error propagation and error information
 */
export async function testErrorPropagation(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedErrorType: typeof GitHubError = GitHubError
): Promise<void> {
  try {
    await action()
    throw new Error('Expected action to throw an error')
  } catch (error) {
    if (!(error instanceof expectedErrorType)) {
      throw new Error(`Expected ${expectedErrorType.name}, got ${error?.constructor.name}`)
    }

    if ('status' in error && error.status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${error.status}`)
    }

    if ('response' in error && !error.response) {
      throw new Error('Expected error to have response data')
    }
  }
}

/**
 * Create a spy for monitoring client method calls
 */
export function createClientMethodSpy<T extends GitHubClient>(
  client: T,
  methodName: keyof T
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(client, methodName as keyof T & string)
}

/**
 * Simulate progressive retry failures
 */
export class RetryFailureSimulator {
  private attempts = 0
  private readonly responses: Array<{ status: number; message: string }>

  constructor(responses: Array<{ status: number; message: string }>) {
    this.responses = responses
  }

  getHandler(endpoint: string) {
    return http.get(endpoint, () => {
      const response = this.responses[this.attempts] || this.responses[this.responses.length - 1]
      this.attempts++

      return HttpResponse.json({ message: response.message }, { status: response.status })
    })
  }

  getAttempts(): number {
    return this.attempts
  }

  reset(): void {
    this.attempts = 0
  }
}

/**
 * Validate error response structure
 */
export function validateErrorResponse(error: unknown): asserts error is GitHubError {
  if (!(error instanceof GitHubError)) {
    throw new Error(`Expected GitHubError, got ${error?.constructor.name}`)
  }

  if (typeof error.message !== 'string') {
    throw new Error('Error should have a string message')
  }

  if (typeof error.status !== 'number') {
    throw new Error('Error should have a numeric status')
  }

  if (!error.response) {
    throw new Error('Error should have response data')
  }
}

/**
 * Test concurrent error scenarios
 */
export async function testConcurrentErrors(
  actions: Array<() => Promise<unknown>>,
  expectedResults: Array<'success' | 'failure'>
): Promise<void> {
  const results = await Promise.allSettled(actions.map(action => action()))

  results.forEach((result, index) => {
    const expected = expectedResults[index]
    if (expected === 'success' && result.status === 'rejected') {
      throw new Error(`Action ${index} was expected to succeed but failed: ${result.reason}`)
    }
    if (expected === 'failure' && result.status === 'fulfilled') {
      throw new Error(`Action ${index} was expected to fail but succeeded`)
    }
  })
}

/**
 * Create error handlers for batch testing
 */
export function createBatchErrorHandlers(
  endpoints: Array<{ url: string; scenario: ErrorScenario }>
) {
  const handlers = endpoints.map(({ url, scenario }) => {
    return http.get(url, async () => {
      if (scenario.delay) {
        await new Promise(resolve => setTimeout(resolve, scenario.delay))
      }

      if (scenario.status === 0) {
        return HttpResponse.error()
      }

      return HttpResponse.json(
        { message: scenario.message },
        {
          status: scenario.status,
          headers: scenario.headers || {},
        }
      )
    })
  })

  mswServer.use(...handlers)
  return handlers
}
