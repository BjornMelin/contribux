/**
 * Simplified MSW Setup
 * Fixes parameter passing and handler configuration issues
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

// Create MSW server with simplified handlers
export const mswServer = setupServer(
  // GitHub API handlers with proper parameter handling
  http.get('https://api.github.com/search/repositories', ({ request }) => {
    const url = new URL(request.url)
    const _query = url.searchParams.get('q')
    const _per_page = url.searchParams.get('per_page') || '30'
    const _page = url.searchParams.get('page') || '1'

    return HttpResponse.json({
      total_count: 1,
      incomplete_results: false,
      items: [
        {
          id: 1,
          name: 'test-repo',
          full_name: 'test-owner/test-repo',
          description: 'Test repository',
          html_url: 'https://github.com/test-owner/test-repo',
          stargazers_count: 100,
          language: 'TypeScript',
          topics: ['test', 'repository'],
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-12-01T00:00:00Z',
          owner: {
            login: 'test-owner',
            avatar_url: 'https://github.com/test-owner.png',
          },
        },
      ],
    })
  }),

  // GitHub user API
  http.get('https://api.github.com/user', () => {
    return HttpResponse.json({
      login: 'test-user',
      id: 12345,
      email: 'test@example.com',
      name: 'Test User',
    })
  }),

  // GitHub rate limit
  http.get('https://api.github.com/rate_limit', () => {
    return HttpResponse.json({
      rate: {
        limit: 5000,
        remaining: 4999,
        reset: Date.now() / 1000 + 3600,
      },
    })
  }),

  // Auth endpoints
  http.post('/api/auth/session', () => {
    return HttpResponse.json({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
      },
      expires: '2024-12-31T23:59:59.999Z',
    })
  }),

  // WebAuthn endpoints with proper error handling
  http.post('/api/security/webauthn/register/options', () => {
    return HttpResponse.json({
      challenge: 'test-challenge',
      rp: { name: 'Test App', id: 'localhost' },
      user: {
        id: 'test-user-id',
        name: 'test@example.com',
        displayName: 'Test User',
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      timeout: 60000,
      attestation: 'none',
    })
  }),

  http.post('/api/security/webauthn/register/verify', () => {
    return HttpResponse.json({
      verified: true,
      registrationInfo: {
        credentialID: 'test-credential-id',
        credentialPublicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
      },
    })
  }),

  http.post('/api/security/webauthn/authenticate/options', () => {
    return HttpResponse.json({
      challenge: 'test-auth-challenge',
      allowCredentials: [
        {
          id: 'test-credential-id',
          type: 'public-key',
        },
      ],
      timeout: 60000,
    })
  }),

  http.post('/api/security/webauthn/authenticate/verify', () => {
    return HttpResponse.json({
      verified: true,
      authenticationInfo: {
        credentialID: 'test-credential-id',
        newCounter: 1,
      },
    })
  })
)

// Setup and teardown functions
export function setupMSW() {
  mswServer.listen({
    onUnhandledRequest: 'warn',
  })
}

export function resetMSWHandlers() {
  mswServer.resetHandlers()
}

export function closeMSW() {
  mswServer.close()
}

// Mock console.error for MSW warnings in tests
const originalError = console.error
export function suppressMSWWarnings() {
  console.error = (...args: unknown[]) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('[MSW]')) {
      return
    }
    originalError(...args)
  }
}

export function restoreConsoleError() {
  console.error = originalError
}
