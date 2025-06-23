/**
 * Simple test to verify GitHubClient basic functionality
 */

import { describe, expect, it } from 'vitest'
import { createGitHubClient } from '../../src/lib/github/client'

describe('GitHubClient Simple Tests', () => {
  it('should create a client with valid token', () => {
    const client = createGitHubClient({
      auth: {
        type: 'token',
        token: 'ghp_test1234567890abcdef1234567890abcdef12',
      },
    })

    expect(client).toBeDefined()
    expect(client.getCacheStats).toBeDefined()
    expect(client.clearCache).toBeDefined()
  })

  it('should manage cache', () => {
    const client = createGitHubClient({
      auth: {
        type: 'token',
        token: 'ghp_test1234567890abcdef1234567890abcdef12',
      },
    })

    const stats = client.getCacheStats()
    expect(stats).toHaveProperty('size')
    expect(stats).toHaveProperty('maxSize')
    expect(typeof stats.size).toBe('number')
    expect(typeof stats.maxSize).toBe('number')
    expect(stats.size).toBe(0)

    client.clearCache()
    const clearedStats = client.getCacheStats()
    expect(clearedStats.size).toBe(0)
  })
})
