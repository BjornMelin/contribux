/**
 * Minimal test to isolate GitHubClient instantiation issue
 */

import { describe, expect, it } from 'vitest'

describe('GitHubClient Minimal Test', () => {
  it('should be able to import GitHubClient', async () => {
    const { GitHubClient } = await import('@/lib/github/client')
    expect(GitHubClient).toBeDefined()
    expect(typeof GitHubClient).toBe('function')
  })

  it('should be able to instantiate GitHubClient', async () => {
    const { GitHubClient } = await import('@/lib/github/client')
    const client = new GitHubClient({})
    expect(client).toBeDefined()
    expect(client).toBeInstanceOf(GitHubClient)
    console.log('Client constructor name:', client.constructor.name)
  })

  it('should have expected methods on GitHubClient instance', async () => {
    const { GitHubClient } = await import('@/lib/github/client')
    const client = new GitHubClient({})

    console.log('Available methods on client:')
    console.log('getUser:', typeof client.getUser)
    console.log('getRepository:', typeof client.getRepository)
    console.log('graphql:', typeof client.graphql)
    console.log('getCacheStats:', typeof client.getCacheStats)
    console.log('clearCache:', typeof client.clearCache)
    console.log('getAuthenticatedUser:', typeof client.getAuthenticatedUser)
    console.log('getRateLimit:', typeof client.getRateLimit)
    console.log('searchRepositories:', typeof client.searchRepositories)

    // This is what's failing in the other tests
    expect(client.getUser).toBeDefined()
    expect(typeof client.getUser).toBe('function')
    expect(client.getRepository).toBeDefined()
    expect(typeof client.getRepository).toBe('function')
    expect(client.graphql).toBeDefined()
    expect(typeof client.graphql).toBe('function')
  })

  it('should show prototype methods', async () => {
    const { GitHubClient } = await import('@/lib/github/client')
    const prototypeMethods = Object.getOwnPropertyNames(GitHubClient.prototype)
    console.log('GitHubClient prototype methods:', prototypeMethods)

    const client = new GitHubClient({})
    const clientProperties = Object.getOwnPropertyNames(client)
    console.log('Client own properties:', clientProperties)

    // Check if getUser exists on prototype
    const hasGetUserOnPrototype = 'getUser' in GitHubClient.prototype
    console.log('getUser exists on prototype:', hasGetUserOnPrototype)

    // Check descriptor
    const getUserDescriptor = Object.getOwnPropertyDescriptor(GitHubClient.prototype, 'getUser')
    console.log('getUser descriptor:', getUserDescriptor)

    // Force the test to fail so we can see the output
    expect(prototypeMethods).toContain('getUser')
    expect(clientProperties).toContain('getUser')
  })
})
