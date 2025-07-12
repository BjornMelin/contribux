/**
 * Test with real GitHubClient - no mocks
 */

import { describe, expect, it, vi } from 'vitest'

// Disable all mocking for this test
vi.mock('@/lib/github/client', () => vi.importActual('@/lib/github/client'))

describe('Real GitHubClient Test', () => {
  it('should use the real GitHubClient class', async () => {
    const { GitHubClient } = await import('@/lib/github/client')

    const prototypeMethods = Object.getOwnPropertyNames(GitHubClient.prototype)
    const classSource = GitHubClient.toString()

    // Debug info to see if we get the real class
    const debugInfo = {
      classType: typeof GitHubClient,
      className: GitHubClient.name,
      prototypeMethods,
      classSourceLength: classSource.length,
      containsGetUser: classSource.includes('getUser'),
      containsGetRepository: classSource.includes('getRepository'),
      containsSearchRepositories: classSource.includes('searchRepositories'),
      isRealClass: GitHubClient.name === 'GitHubClient' && prototypeMethods.length > 1,
    }

    console.log('Debug info:', JSON.stringify(debugInfo, null, 2))

    // This should pass if we get the real class
    expect(prototypeMethods.length).toBeGreaterThan(1)
    expect(GitHubClient.name).toBe('GitHubClient')
  })
})
