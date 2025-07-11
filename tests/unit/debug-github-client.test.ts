/**
 * Debug test for GitHubClient instantiation issues
 */

import { describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github/client'

describe('GitHubClient Debug', () => {
  it('should create a GitHubClient instance', () => {
    let client: any
    let error: any
    
    try {
      client = new GitHubClient({ accessToken: 'test-token' })
      console.log('✅ Client created successfully')
    } catch (e) {
      error = e
      console.log('❌ Constructor failed:', e)
    }
    
    if (client) {
      console.log('Client instance:', client)
      console.log('Client constructor:', client.constructor.name)
      console.log('Client prototype:', Object.getPrototypeOf(client))
      console.log('Client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)))
      console.log('Has getRepository:', typeof client.getRepository)
      console.log('Has searchRepositories:', typeof client.searchRepositories)
      
      // Check if it's actually the right class
      console.log('Instance of GitHubClient?', client instanceof GitHubClient)
      
      expect(client).toBeInstanceOf(GitHubClient)
      expect(typeof client.getRepository).toBe('function')
      expect(typeof client.searchRepositories).toBe('function')
    } else {
      console.log('Client is null/undefined:', client)
      if (error) {
        throw error
      }
      throw new Error('Failed to create client')
    }
  })
})