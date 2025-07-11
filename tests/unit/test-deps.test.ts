/**
 * Test dependencies to isolate import issues
 */

import { describe, expect, it } from 'vitest'

describe('Dependencies Test', () => {
  it('should import auth', async () => {
    try {
      const { auth } = await import('@/lib/auth')
      console.log('Auth imported successfully:', typeof auth)
      expect(auth).toBeDefined()
    } catch (error) {
      console.error('Auth import failed:', error)
      throw error
    }
  })

  it('should import config', async () => {
    try {
      const { config } = await import('@/lib/config/provider')
      console.log('Config imported successfully:', typeof config)
      expect(config).toBeDefined()
    } catch (error) {
      console.error('Config import failed:', error)
      throw error
    }
  })

  it('should import GitHub errors', async () => {
    try {
      const { GitHubError, isRequestError, createRequestContext } = await import(
        '@/lib/github/errors'
      )
      console.log('GitHub errors imported successfully')
      expect(GitHubError).toBeDefined()
      expect(isRequestError).toBeDefined()
      expect(createRequestContext).toBeDefined()
    } catch (error) {
      console.error('GitHub errors import failed:', error)
      throw error
    }
  })

  it('should import octokit dependencies', async () => {
    try {
      const { Octokit } = await import('@octokit/rest')
      const { retry } = await import('@octokit/plugin-retry')
      const { throttling } = await import('@octokit/plugin-throttling')
      console.log('Octokit dependencies imported successfully')
      expect(Octokit).toBeDefined()
      expect(retry).toBeDefined()
      expect(throttling).toBeDefined()
    } catch (error) {
      console.error('Octokit import failed:', error)
      throw error
    }
  })

  it('should create enhanced octokit', async () => {
    try {
      const { Octokit } = await import('@octokit/rest')
      const { retry } = await import('@octokit/plugin-retry')
      const { throttling } = await import('@octokit/plugin-throttling')

      const EnhancedOctokit = Octokit.plugin(retry, throttling)
      console.log('Enhanced Octokit created successfully')
      expect(EnhancedOctokit).toBeDefined()

      // Try to instantiate it
      const instance = new EnhancedOctokit()
      expect(instance).toBeDefined()
    } catch (error) {
      console.error('Enhanced Octokit failed:', error)
      throw error
    }
  })
})
