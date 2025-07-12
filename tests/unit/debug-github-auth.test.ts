/**
 * Debug GitHub Authentication Test
 * Test to verify correct GitHubClient configuration format
 */

import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github/client'
import { githubHandlers } from '../mocks/github-handlers'

// Setup MSW server
const server = setupServer(...githubHandlers)

describe('Debug GitHub Authentication', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('should authenticate with correct config format', async () => {
    // Test the CORRECT configuration format that matches the actual GitHubClient
    const client = new GitHubClient({
      accessToken: 'ghp_test_token',
    })

    expect(client).toBeInstanceOf(GitHubClient)

    // Test that the client can make authenticated requests
    const user = await client.getAuthenticatedUser()

    expect(user).toBeDefined()
    expect(user.login).toBe('testuser')
    expect(user.id).toBe(12345)
  })

  it('should show what happens with old config format', async () => {
    // This is the WRONG configuration that the failing tests are using
    try {
      const wrongConfig = {
        auth: { type: 'token' as const, token: 'ghp_test_token' },
      } as unknown as ConstructorParameters<typeof GitHubClient>[0]

      const client = new GitHubClient(wrongConfig)
      console.log('Wrong config actually works?', client)
    } catch (error) {
      console.log('Wrong config fails as expected:', error.message)
      expect(error).toBeDefined()
    }
  })

  it('should test getUser method', async () => {
    const client = new GitHubClient({
      accessToken: 'ghp_test_token',
    })

    const user = await client.getUser('testuser')
    expect(user).toBeDefined()
    expect(user.login).toBe('testuser')
  })
})
