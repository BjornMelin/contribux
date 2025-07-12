/**
 * Authentication Component Testing Utilities
 * Reusable helpers for testing NextAuth.js v5 components
 *
 * Features:
 * - Session state mocking utilities
 * - Authentication flow helpers
 * - Component wrappers with auth context
 * - Custom render functions for auth components
 * - API mocking for auth endpoints
 */

import { type RenderOptions, render } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type React from 'react'
import { vi } from 'vitest'

// Session state types
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface MockUser {
  id: string
  email: string
  name?: string
  image?: string
  role?: string
  provider?: string
}

export interface MockSession {
  user: MockUser
  expires: string
  accessToken?: string
  refreshToken?: string
}

export interface MockSessionState {
  data: MockSession | null
  status: SessionStatus
  update: ReturnType<typeof vi.fn>
}

// Common mock users
export const mockUsers = {
  regular: {
    id: '1',
    email: 'user@example.com',
    name: 'Regular User',
    image: 'https://example.com/user.jpg',
    role: 'user',
    provider: 'github',
  },
  admin: {
    id: '2',
    email: 'admin@example.com',
    name: 'Admin User',
    image: 'https://example.com/admin.jpg',
    role: 'admin',
    provider: 'github',
  },
  incomplete: {
    id: '3',
    email: 'incomplete@example.com',
    // Missing name, image, role
  },
  multiProvider: {
    id: '4',
    email: 'multi@example.com',
    name: 'Multi Provider User',
    image: 'https://example.com/multi.jpg',
    role: 'user',
    provider: 'google',
  },
} as const

// Session state factories
export const createMockSession = (
  user: MockUser,
  overrides?: Partial<MockSession>
): MockSession => ({
  user,
  expires: '2024-12-31T23:59:59.999Z',
  ...overrides,
})

export const createSessionState = (
  sessionData: MockSession | null,
  status: SessionStatus = sessionData ? 'authenticated' : 'unauthenticated'
): MockSessionState => ({
  data: sessionData,
  status,
  update: vi.fn(),
})

// Pre-configured session states
export const sessionStates = {
  loading: createSessionState(null, 'loading'),
  unauthenticated: createSessionState(null, 'unauthenticated'),
  authenticatedUser: createSessionState(createMockSession(mockUsers.regular)),
  authenticatedAdmin: createSessionState(createMockSession(mockUsers.admin)),
  authenticatedIncomplete: createSessionState(createMockSession(mockUsers.incomplete)),
  authenticatedMultiProvider: createSessionState(createMockSession(mockUsers.multiProvider)),
  expiredSession: createSessionState(
    createMockSession(mockUsers.regular, { expires: '2020-01-01T00:00:00.000Z' })
  ),
}

// Mock next-auth/react functions
export const createAuthMocks = () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
})

// Setup auth mocks with a specific session state
export const setupAuthMocks = (sessionState: MockSessionState) => {
  const mocks = createAuthMocks()
  mocks.useSession.mockReturnValue(sessionState)

  vi.doMock('next-auth/react', () => ({
    ...mocks,
    SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  }))

  return mocks
}

// API response mocking for auth endpoints
export const createAuthApiMocks = () => {
  const mockFetch = vi.fn()
  global.fetch = mockFetch

  const responses = {
    providers: {
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'github', name: 'GitHub', type: 'oauth' },
          { id: 'google', name: 'Google', type: 'oauth' },
        ]),
    },
    linkedAccounts: {
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'github',
            provider: 'github',
            name: 'GitHub',
            email: 'user@example.com',
            isPrimary: true,
          },
        ]),
    },
    linkAccount: {
      ok: true,
      json: () => Promise.resolve({ success: true }),
    },
    unlinkAccount: {
      ok: true,
      json: () => Promise.resolve({ success: true }),
    },
    setPrimaryProvider: {
      ok: true,
      json: () => Promise.resolve({ success: true }),
    },
    canUnlink: {
      ok: true,
      json: () => Promise.resolve({ canUnlink: true }),
    },
    error: {
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    },
  }

  return {
    mockFetch,
    responses,
    setupResponse: (endpoint: keyof typeof responses, response = responses[endpoint]) => {
      mockFetch.mockResolvedValueOnce(response)
    },
    setupError: (error = new Error('Network error')) => {
      mockFetch.mockRejectedValueOnce(error)
    },
    reset: () => {
      mockFetch.mockClear()
    },
  }
}

// Custom render function for auth components
interface AuthRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  sessionState?: MockSessionState
  apiMocks?: boolean
}

export const renderWithAuth = (
  ui: React.ReactElement,
  {
    sessionState = sessionStates.unauthenticated,
    apiMocks = true,
    ...renderOptions
  }: AuthRenderOptions = {}
) => {
  // Setup auth mocks
  const authMocks = setupAuthMocks(sessionState)

  // Setup API mocks if requested
  let apiMockUtils: ReturnType<typeof createAuthApiMocks> | undefined
  if (apiMocks) {
    apiMockUtils = createAuthApiMocks()
  }

  // Create wrapper that provides auth context
  const AuthWrapper = ({ children }: { children: React.ReactNode }) => {
    // In a real app, this would be SessionProvider
    return <div data-testid="auth-wrapper">{children}</div>
  }

  const result = render(ui, {
    wrapper: AuthWrapper,
    ...renderOptions,
  })

  return {
    ...result,
    user: userEvent.setup(),
    authMocks,
    apiMocks: apiMockUtils,
    // Helper to change session state
    updateSession: (newSessionState: MockSessionState) => {
      authMocks.useSession.mockReturnValue(newSessionState)
      result.rerender(ui)
    },
  }
}

// Authentication flow testing helpers
export const authFlowHelpers = {
  // Simulate sign in flow
  simulateSignIn: async (
    authMocks: ReturnType<typeof createAuthMocks>,
    provider = 'github',
    callbackUrl = '/dashboard'
  ) => {
    authMocks.signIn.mockResolvedValueOnce({
      ok: true,
      error: null,
      status: 200,
      url: callbackUrl,
    })

    return authMocks.signIn(provider, { callbackUrl, redirect: true })
  },

  // Simulate sign out flow
  simulateSignOut: async (
    authMocks: ReturnType<typeof createAuthMocks>,
    callbackUrl = '/auth/signin'
  ) => {
    authMocks.signOut.mockResolvedValueOnce({ url: callbackUrl })

    return authMocks.signOut({ callbackUrl, redirect: true })
  },

  // Simulate authentication error
  simulateAuthError: (authMocks: ReturnType<typeof createAuthMocks>, error = 'OAuthCallback') => {
    authMocks.signIn.mockRejectedValueOnce(new Error(error))
  },

  // Simulate session update
  simulateSessionUpdate: async (
    authMocks: ReturnType<typeof createAuthMocks>,
    updatedUser: Partial<MockUser>
  ) => {
    const currentSession = authMocks.useSession().data
    const updatedSession = {
      ...currentSession,
      user: { ...currentSession?.user, ...updatedUser },
    }

    authMocks.update.mockResolvedValueOnce(updatedSession)
    return authMocks.update(updatedUser)
  },
}

// Component state assertion helpers
export const authAssertions = {
  // Assert loading state
  expectLoadingState: (container: HTMLElement) => {
    const loadingElement =
      container.querySelector('[role="status"]') ||
      container.querySelector('[aria-label*="loading" i]') ||
      container.querySelector('[aria-label*="Loading" i]')
    expect(loadingElement).toBeInTheDocument()
  },

  // Assert unauthenticated state
  expectUnauthenticatedState: (container: HTMLElement) => {
    const signInButton =
      container.querySelector('button[aria-label*="sign in" i]') ||
      container.querySelector('button[aria-label*="Sign in" i]') ||
      container.querySelector('button:contains("Sign in")') ||
      container.querySelector('a[href*="signin"]')
    expect(signInButton).toBeInTheDocument()
  },

  // Assert authenticated state
  expectAuthenticatedState: (container: HTMLElement, userName?: string) => {
    if (userName) {
      expect(container).toHaveTextContent(userName)
    }

    // Should not show sign-in prompts
    const signInButton = container.querySelector('button[aria-label*="sign in" i]')
    expect(signInButton).not.toBeInTheDocument()
  },

  // Assert access denied state
  expectAccessDenied: (container: HTMLElement) => {
    const accessDeniedText =
      container.textContent?.toLowerCase().includes('access denied') ||
      container.textContent?.toLowerCase().includes('permission') ||
      container.textContent?.toLowerCase().includes('unauthorized')
    expect(accessDeniedText).toBeTruthy()
  },

  // Assert error state
  expectErrorState: (container: HTMLElement, errorMessage?: string) => {
    const errorElement =
      container.querySelector('[role="alert"]') ||
      container.querySelector('[aria-live="polite"]') ||
      container.querySelector('.error, .alert, [class*="error"]')
    expect(errorElement).toBeInTheDocument()

    if (errorMessage) {
      expect(container).toHaveTextContent(errorMessage)
    }
  },
}

// Test data generators
export const testDataGenerators = {
  // Generate user with random data
  generateRandomUser: (overrides: Partial<MockUser> = {}): MockUser => ({
    id: Math.random().toString(36).substr(2, 9),
    email: `user${Date.now()}@example.com`,
    name: `Test User ${Math.random().toString(36).substr(2, 5)}`,
    image: `https://example.com/avatar${Math.random().toString(36).substr(2, 5)}.jpg`,
    role: 'user',
    provider: 'github',
    ...overrides,
  }),

  // Generate session with various states
  generateSessionStates: (baseUser: MockUser) => ({
    fresh: createSessionState(createMockSession(baseUser)),
    almostExpired: createSessionState(
      createMockSession(baseUser, {
        expires: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      })
    ),
    expired: createSessionState(
      createMockSession(baseUser, {
        expires: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
      })
    ),
  }),

  // Generate linked accounts data
  generateLinkedAccounts: (userId: string) => [
    {
      id: 'github',
      provider: 'github',
      name: 'GitHub',
      email: `${userId}@github.example`,
      isPrimary: true,
    },
    {
      id: 'google',
      provider: 'google',
      name: 'Google',
      email: `${userId}@gmail.com`,
      isPrimary: false,
    },
  ],
}

// Accessibility testing helpers for auth components
export const authA11yHelpers = {
  // Check auth component accessibility
  checkAuthAccessibility: async (container: HTMLElement) => {
    // Check for proper ARIA labels
    const buttons = container.querySelectorAll('button')
    buttons.forEach(button => {
      const hasLabel =
        button.getAttribute('aria-label') ||
        button.getAttribute('aria-labelledby') ||
        button.textContent?.trim()
      expect(hasLabel).toBeTruthy()
    })

    // Check for proper heading structure
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    headings.forEach(heading => {
      expect(heading.textContent?.trim()).toBeTruthy()
    })

    // Check for proper status messages
    const statusElements = container.querySelectorAll('[role="status"], [role="alert"]')
    statusElements.forEach(element => {
      expect(element.textContent?.trim()).toBeTruthy()
    })
  },

  // Check keyboard navigation
  checkKeyboardNavigation: async (
    container: HTMLElement,
    user: ReturnType<typeof userEvent.setup>
  ) => {
    const focusableElements = container.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements.length === 0) return

    // Tab through all focusable elements
    for (let i = 0; i < focusableElements.length; i++) {
      await user.tab()
      const activeElement = document.activeElement
      expect(focusableElements).toContain(activeElement)
    }
  },

  // Check color contrast and visual indicators
  checkVisualAccessibility: (container: HTMLElement) => {
    // Check for focus indicators
    const interactiveElements = container.querySelectorAll('button, a, input, select, textarea')
    interactiveElements.forEach(element => {
      const styles = getComputedStyle(element)
      const pseudoStyles = getComputedStyle(element, ':focus')

      // Should have some kind of focus indication
      const hasFocusIndicator =
        pseudoStyles.outline !== 'none' ||
        pseudoStyles.boxShadow !== 'none' ||
        styles.outline !== 'none' ||
        element.className.includes('focus')

      expect(hasFocusIndicator).toBeTruthy()
    })
  },
}

// Performance testing helpers
export const authPerformanceHelpers = {
  // Measure component render time
  measureRenderTime: async (renderFn: () => { unmount: () => void }) => {
    const start = performance.now()
    const result = renderFn()
    const end = performance.now()

    return {
      renderTime: end - start,
      result,
    }
  },

  // Check for memory leaks in auth components
  checkMemoryLeaks: (renderFn: () => { result: { unmount: () => void } }, iterations = 10) => {
    const initialMemory = performance.memory?.usedJSHeapSize || 0

    for (let i = 0; i < iterations; i++) {
      const { result } = renderFn()
      result.unmount()
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    const finalMemory = performance.memory?.usedJSHeapSize || 0
    const memoryIncrease = finalMemory - initialMemory

    return {
      initialMemory,
      finalMemory,
      memoryIncrease,
      iterations,
    }
  },
}

export default {
  mockUsers,
  sessionStates,
  createMockSession,
  createSessionState,
  setupAuthMocks,
  createAuthApiMocks,
  renderWithAuth,
  authFlowHelpers,
  authAssertions,
  testDataGenerators,
  authA11yHelpers,
  authPerformanceHelpers,
}
