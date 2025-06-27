/**
 * Test Assertions Utilities
 * Provides custom test assertions and validation helpers
 */

import { expect } from 'vitest'

/**
 * Assert that a vector embedding is valid (1536 dimensions, all numbers)
 */
export function isValidEmbedding(embedding: unknown): asserts embedding is number[] {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array')
  }

  if (embedding.length !== 1536) {
    throw new Error(`Embedding must have exactly 1536 dimensions, got ${embedding.length}`)
  }

  for (let i = 0; i < embedding.length; i++) {
    if (typeof embedding[i] !== 'number' || Number.isNaN(embedding[i])) {
      throw new Error(`Embedding element at index ${i} is not a valid number: ${embedding[i]}`)
    }
  }
}

/**
 * Assert that a similarity score is valid (-1 to 1 range)
 */
export function isValidSimilarityScore(score: unknown): asserts score is number {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    throw new Error(`Similarity score must be a number, got ${typeof score}: ${score}`)
  }

  if (score < -1 || score > 1) {
    throw new Error(`Similarity score must be between -1 and 1, got ${score}`)
  }
}

/**
 * Assert that query results have the expected structure
 */
export function hasValidQueryStructure(
  results: unknown,
  expectedFields: string[]
): asserts results is Record<string, unknown>[] {
  if (!Array.isArray(results)) {
    throw new Error('Query results must be an array')
  }

  for (let i = 0; i < results.length; i++) {
    const row = results[i]
    if (typeof row !== 'object' || row === null) {
      throw new Error(`Row ${i} is not an object: ${typeof row}`)
    }

    for (const field of expectedFields) {
      if (!(field in row)) {
        throw new Error(`Missing expected field: ${field} in row ${i}`)
      }
    }
  }
}

/**
 * Assert that search results are properly ordered by relevance
 */
export function isProperlyOrdered(
  results: Array<{ relevance_score?: number; similarity?: number }>,
  descending = true
): void {
  if (results.length <= 1) return

  for (let i = 1; i < results.length; i++) {
    const current = results[i]
    const previous = results[i - 1]
    if (!current || !previous) continue

    const currentScore = current.relevance_score || current.similarity || 0
    const previousScore = previous.relevance_score || previous.similarity || 0

    if (descending) {
      if (currentScore > previousScore) {
        throw new Error(
          `Results not properly ordered: item ${i} (${currentScore}) > item ${i - 1} (${previousScore})`
        )
      }
    } else {
      if (currentScore < previousScore) {
        throw new Error(
          `Results not properly ordered: item ${i} (${currentScore}) < item ${i - 1} (${previousScore})`
        )
      }
    }
  }
}

/**
 * Assert that a GitHub API response has the expected structure
 */
export function isValidGitHubUser(user: unknown): asserts user is {
  id: number
  login: string
  avatar_url: string
  html_url: string
  type: string
} {
  if (typeof user !== 'object' || user === null) {
    throw new Error('GitHub user must be an object')
  }

  const userObj = user as Record<string, unknown>
  const requiredFields = ['id', 'login', 'avatar_url', 'html_url', 'type']

  for (const field of requiredFields) {
    if (!(field in userObj)) {
      throw new Error(`GitHub user missing required field: ${field}`)
    }
  }

  if (typeof userObj.id !== 'number') {
    throw new Error('GitHub user id must be a number')
  }

  if (typeof userObj.login !== 'string') {
    throw new Error('GitHub user login must be a string')
  }
}

/**
 * Assert that a GitHub repository has the expected structure
 */
export function isValidGitHubRepository(repo: unknown): asserts repo is {
  id: number
  name: string
  full_name: string
  html_url: string
  owner: { login: string }
} {
  if (typeof repo !== 'object' || repo === null) {
    throw new Error('GitHub repository must be an object')
  }

  const repoObj = repo as Record<string, unknown>
  const requiredFields = ['id', 'name', 'full_name', 'html_url', 'owner']

  for (const field of requiredFields) {
    if (!(field in repoObj)) {
      throw new Error(`GitHub repository missing required field: ${field}`)
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: GitHub API owner type varies, requires runtime type guard
  if (typeof repoObj.owner !== 'object' || !(repoObj.owner as any)?.login) {
    throw new Error('GitHub repository owner must have a login field')
  }
}

/**
 * Assert that pagination metadata is valid
 */
export function hasValidPagination(
  results: unknown[],
  page: number,
  limit: number,
  total?: number
): void {
  if (!Array.isArray(results)) {
    throw new Error('Results must be an array for pagination validation')
  }

  if (page < 1) {
    throw new Error('Page number must be >= 1')
  }

  if (limit < 1) {
    throw new Error('Limit must be >= 1')
  }

  if (results.length > limit) {
    throw new Error(`Results length (${results.length}) exceeds limit (${limit})`)
  }

  if (total !== undefined) {
    const expectedMaxResults = Math.min(limit, Math.max(0, total - (page - 1) * limit))
    if (results.length > expectedMaxResults) {
      throw new Error(
        `Results length (${results.length}) exceeds expected for page ${page} of ${total} total items`
      )
    }
  }
}

/**
 * Assert that a date string is valid ISO format
 */
export function isValidISODate(dateString: unknown): asserts dateString is string {
  if (typeof dateString !== 'string') {
    throw new Error('Date must be a string')
  }

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateString}`)
  }

  // Check if it's in ISO format
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(dateString)) {
    throw new Error(`Date string not in ISO format: ${dateString}`)
  }
}

/**
 * Assert that an opportunity has all required fields
 */
export function isValidOpportunity(opportunity: unknown): asserts opportunity is {
  id: string
  title: string
  repository_id: string
  type: string
  difficulty: string
} {
  if (typeof opportunity !== 'object' || opportunity === null) {
    throw new Error('Opportunity must be an object')
  }

  const oppObj = opportunity as Record<string, unknown>
  const requiredFields = ['id', 'title', 'repository_id', 'type', 'difficulty']

  for (const field of requiredFields) {
    if (!(field in oppObj)) {
      throw new Error(`Opportunity missing required field: ${field}`)
    }

    if (typeof oppObj[field] !== 'string') {
      throw new Error(`Opportunity field ${field} must be a string`)
    }
  }
}

/**
 * Assert that a UUID string is valid
 */
export function isValidUUID(uuid: unknown): asserts uuid is string {
  if (typeof uuid !== 'string') {
    throw new Error('UUID must be a string')
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(uuid)) {
    throw new Error(`Invalid UUID format: ${uuid}`)
  }
}

/**
 * Assert that API response times are reasonable
 */
export function hasReasonableResponseTime(startTime: number, endTime: number, maxMs = 5000): void {
  const duration = endTime - startTime
  if (duration > maxMs) {
    throw new Error(`Response time ${duration}ms exceeds maximum ${maxMs}ms`)
  }

  if (duration < 0) {
    throw new Error(`Invalid response time: end time (${endTime}) before start time (${startTime})`)
  }
}

/**
 * Assert that error responses have the expected structure
 */
export function isValidErrorResponse(error: unknown): asserts error is {
  message: string
  status?: number
  code?: string
} {
  if (typeof error !== 'object' || error === null) {
    throw new Error('Error must be an object')
  }

  const errorObj = error as Record<string, unknown>
  if (typeof errorObj.message !== 'string') {
    throw new Error('Error must have a message string')
  }

  if ('status' in errorObj && typeof errorObj.status !== 'number') {
    throw new Error('Error status must be a number')
  }
}

/**
 * Convenience assertion functions for common patterns
 */

export function assertArrayNotEmpty<T>(arr: T[]): asserts arr is [T, ...T[]] {
  expect(arr).toBeInstanceOf(Array)
  expect(arr.length).toBeGreaterThan(0)
}

export function assertIsNumber(value: unknown): asserts value is number {
  expect(typeof value).toBe('number')
  expect(value).not.toBeNaN()
}

export function assertIsString(value: unknown): asserts value is string {
  expect(typeof value).toBe('string')
  expect((value as string).length).toBeGreaterThan(0)
}

export function assertIsValidEmail(email: unknown): asserts email is string {
  assertIsString(email)
  expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
}

export function assertIsValidUrl(url: unknown): asserts url is string {
  assertIsString(url)
  expect(() => new URL(url)).not.toThrow()
}

/**
 * Database-specific assertions
 */
export function assertValidSearchResults<T extends { relevance_score?: number }>(
  results: T[],
  expectedMinResults = 0,
  expectedMaxResults = 100
): void {
  expect(results).toBeInstanceOf(Array)
  expect(results.length).toBeGreaterThanOrEqual(expectedMinResults)
  expect(results.length).toBeLessThanOrEqual(expectedMaxResults)

  // Check that results are ordered by relevance
  isProperlyOrdered(results)

  // Validate each result has expected structure
  for (const result of results) {
    if (result.relevance_score !== undefined) {
      isValidSimilarityScore(result.relevance_score)
    }
  }
}
