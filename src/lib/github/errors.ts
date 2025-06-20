import type { RequestError } from '@octokit/types'

export class GitHubClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubClientError'
  }
}

export class GitHubAuthenticationError extends GitHubClientError {
  constructor(message: string = 'Authentication failed') {
    super(message)
    this.name = 'GitHubAuthenticationError'
  }
}

export class GitHubRateLimitError extends GitHubClientError {
  constructor(
    message: string,
    public readonly retryAfter: number,
    public readonly limit: number,
    public readonly remaining: number,
    public readonly reset: Date
  ) {
    super(message)
    this.name = 'GitHubRateLimitError'
  }
}

export class GitHubGraphQLError extends GitHubClientError {
  constructor(
    message: string,
    public readonly errors: any[],
    public readonly data?: any
  ) {
    super(message)
    this.name = 'GitHubGraphQLError'
  }
}

export class GitHubWebhookError extends GitHubClientError {
  constructor(
    message: string,
    public readonly reason: 'invalid-signature' | 'missing-signature' | 'parse-error'
  ) {
    super(message)
    this.name = 'GitHubWebhookError'
  }
}

export class GitHubTokenExpiredError extends GitHubAuthenticationError {
  constructor(
    message: string = 'Token has expired',
    public readonly expiredAt?: Date
  ) {
    super(message)
    this.name = 'GitHubTokenExpiredError'
  }
}

export class GitHubCacheError extends GitHubClientError {
  constructor(
    message: string,
    public readonly operation: 'get' | 'set' | 'delete' | 'clear'
  ) {
    super(message)
    this.name = 'GitHubCacheError'
  }
}

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof Error && 'status' in error && 'request' in error && 'response' in error
}

export function isRateLimitError(error: unknown): boolean {
  if (!isRequestError(error)) return false
  const response = (error as any).response
  return error.status === 403 && response?.headers?.['x-ratelimit-remaining'] === '0'
}

export function isSecondaryRateLimitError(error: unknown): boolean {
  if (!isRequestError(error)) return false
  const response = (error as any).response
  return error.status === 403 && 'retry-after' in (response?.headers || {})
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'Unknown error occurred'
}
