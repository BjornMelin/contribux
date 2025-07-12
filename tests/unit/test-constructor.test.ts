/**
 * Test GitHubClient constructor to isolate initialization issues
 */

import { describe, expect, it } from 'vitest'

describe('GitHubClient Constructor Test', () => {
  it('should test constructor step by step', async () => {
    const { GitHubClient } = await import('@/lib/github/client')

    console.log('1. GitHubClient imported')

    try {
      const client = new GitHubClient({})
      console.log('2. GitHubClient instantiated successfully')
      console.log('3. Client type:', typeof client)
      console.log('4. Client constructor name:', client.constructor.name)
    } catch (error) {
      console.error('Constructor failed:', error)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
      throw error
    }
  })

  it('should test class definition structure', async () => {
    const { GitHubClient } = await import('@/lib/github/client')

    const prototypeMethods = Object.getOwnPropertyNames(GitHubClient.prototype)
    const classSource = GitHubClient.toString()

    // Create detailed debug info to show in failure message
    const debugInfo = {
      classType: typeof GitHubClient,
      className: GitHubClient.name,
      prototypeMethods,
      classSourceLength: classSource.length,
      containsGetUser: classSource.includes('getUser'),
      containsGetRepository: classSource.includes('getRepository'),
      containsSearchRepositories: classSource.includes('searchRepositories'),
      classSourceSnippet: `${classSource.substring(0, 500)}...`,
    }

    // Force test to fail to see debug info
    expect(
      prototypeMethods.length,
      `Debug info: ${JSON.stringify(debugInfo, null, 2)}`
    ).toBeGreaterThan(1)
  })

  it('should test individual method definitions', async () => {
    const { GitHubClient } = await import('@/lib/github/client')

    const descriptors = Object.getOwnPropertyDescriptors(GitHubClient.prototype)
    console.log('Property descriptors:', Object.keys(descriptors))

    for (const [key, descriptor] of Object.entries(descriptors)) {
      console.log(`${key}:`, {
        value: typeof descriptor.value,
        writable: descriptor.writable,
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
      })
    }
  })
})
