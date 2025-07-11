/**
 * Super simple test for GitHubClient
 */

import { describe, expect, it } from 'vitest'

describe('Simple GitHub Test', () => {
  it('should import the GitHubClient', async () => {
    try {
      const { GitHubClient } = await import('@/lib/github/client')
      console.log('✅ Import successful')
      console.log('GitHubClient type:', typeof GitHubClient)
      console.log('GitHubClient name:', GitHubClient.name)

      expect(GitHubClient).toBeDefined()
      expect(typeof GitHubClient).toBe('function')

      // Try to create instance
      const client = new GitHubClient({})
      console.log('✅ Client created')
      console.log('Client type:', typeof client)
      console.log('Client constructor:', client.constructor.name)
      console.log('Has getRepository:', typeof client.getRepository)
      console.log('Has searchRepositories:', typeof client.searchRepositories)
      console.log('All methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)))

      expect(client).toBeDefined()
      expect(typeof client.getRepository).toBe('function')
      expect(typeof client.searchRepositories).toBe('function')
    } catch (error) {
      console.log('❌ Error:', error)
      throw error
    }
  })
})
