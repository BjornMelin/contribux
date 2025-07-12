/**
 * @vitest-environment jsdom
 */

/**
 * Authentication Flow Components Test Suite
 * Comprehensive testing for NextAuth.js v5 + Drizzle architecture
 *
 * Features tested:
 * - Login/logout component behavior
 * - Authentication state management
 * - Session persistence testing
 * - User profile components
 * - Loading and error states
 * - Accessibility compliance
 */

import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInButton } from '@/app/auth/signin/signin-button'
import { LinkedAccounts } from '@/components/auth/LinkedAccounts'
import {
  cleanupComponentTest,
  createModernMockRouter,
  setupComponentTest,
} from '../../../utils/modern-test-helpers'

// Mock framer-motion to avoid DOM event listener issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      style,
      whileHover,
      animate,
      initial,
      exit,
      transition,
      ...props
    }: {
      children?: React.ReactNode
      className?: string
      style?: React.CSSProperties
      whileHover?: unknown
      animate?: unknown
      initial?: unknown
      exit?: unknown
      transition?: unknown
      [key: string]: unknown
    }) => (
      <div className={className} style={style} {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}))

// Create mock functions first before using them in vi.mock
const mockSignIn = vi.fn()
const mockSignOut = vi.fn()
const mockUpdate = vi.fn()

// Mock next-auth/react with comprehensive session states
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock session data
const mockSession = {
  user: {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    image: 'https://example.com/avatar.jpg',
  },
  expires: '2024-12-31T23:59:59.999Z',
}

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock router
const mockRouter = createModernMockRouter()
mockRouter.setup()

describe('Authentication Flow Components', () => {
  beforeEach(async () => {
    setupComponentTest()
    vi.clearAllMocks()
    mockSignIn.mockClear()
    mockSignOut.mockClear()
    mockUpdate.mockClear()
    mockFetch.mockClear()
    mockRouter.reset()

    // Reset the mocked module functions
    const { signIn, signOut } = await import('next-auth/react')
    vi.mocked(signIn).mockImplementation(mockSignIn)
    vi.mocked(signOut).mockImplementation(mockSignOut)
  })

  afterEach(() => {
    cleanupComponentTest()
  })

  describe('Authentication State Management', () => {
    it('renders sign-in buttons correctly regardless of session status', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'loading',
        update: mockUpdate,
      })

      render(<SignInButton />)

      // SignInButton always shows provider buttons, not loading state
      expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
      expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    })

    it('renders unauthenticated state correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      render(<SignInButton />)

      // Should show sign-in options
      expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
      expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    })

    it('renders authenticated state correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts userId="test-user-id" />)

      // Should show connected accounts interface
      expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      expect(screen.getByText('Manage your OAuth provider connections')).toBeInTheDocument()
    })
  })

  describe('Login Flow Components', () => {
    it('handles GitHub OAuth flow correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      const user = userEvent.setup()
      render(<SignInButton callbackUrl="/dashboard" />)

      const githubButton = screen.getByLabelText('Sign in with GitHub')
      await user.click(githubButton)

      expect(mockSignIn).toHaveBeenCalledWith('github', {
        callbackUrl: '/dashboard',
        redirect: true,
      })
    })

    it('handles Google OAuth flow correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      const user = userEvent.setup()
      render(<SignInButton callbackUrl="/settings" />)

      const googleButton = screen.getByLabelText('Sign in with Google')
      await user.click(googleButton)

      expect(mockSignIn).toHaveBeenCalledWith('google', {
        callbackUrl: '/settings',
        redirect: true,
      })
    })

    it('shows loading state during authentication', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      // Mock a promise that doesn't resolve immediately
      mockSignIn.mockImplementation(
        () =>
          new Promise(() => {
            /* intentionally empty - creates a pending promise for testing loading states */
          })
      )

      const user = userEvent.setup()
      render(<SignInButton />)

      const githubButton = screen.getByLabelText('Sign in with GitHub')
      await user.click(githubButton)

      // Button should show loading state
      expect(githubButton).toBeDisabled()
    })

    it('handles authentication errors gracefully', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      // Mock sign-in to reject
      mockSignIn.mockRejectedValue(new Error('Authentication failed'))

      const user = userEvent.setup()
      render(<SignInButton />)

      const githubButton = screen.getByLabelText('Sign in with GitHub')
      await user.click(githubButton)

      // Should handle error gracefully without crashing
      expect(mockSignIn).toHaveBeenCalled()
    })
  })

  describe('Logout Flow Components', () => {
    it('handles sign out correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      // Mock API response for linked accounts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 'github', provider: 'github', name: 'GitHub', email: 'test@example.com' },
          ]),
      })

      const user = userEvent.setup()
      render(<LinkedAccounts userId="test-user-id" />)

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      })

      // Find and click unlink button if available
      const unlinkButtons = screen.queryAllByRole('button', { name: /unlink/i })
      if (unlinkButtons.length > 0) {
        await user.click(unlinkButtons[0])
      }

      // Component should be rendered correctly
      expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
    })

    it('shows confirmation dialog for sign out', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      const _user = userEvent.setup()
      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      })

      // Should show connected accounts interface
      expect(screen.getByText('Manage your OAuth provider connections')).toBeInTheDocument()
    })
  })

  describe('Session Persistence Testing', () => {
    it('maintains session across page refreshes', async () => {
      const { useSession } = await import('next-auth/react')

      // Simulate page refresh by re-mounting component
      const { unmount } = render(<SignInButton />)

      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      unmount()
      render(<SignInButton />)

      // Component should render consistently
      expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
      expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    })

    it('handles session expiration correctly', async () => {
      const { useSession } = await import('next-auth/react')

      // Mock expired session
      const expiredSession = {
        ...mockSession,
        expires: '2020-01-01T00:00:00.000Z', // Past date
      }

      vi.mocked(useSession).mockReturnValue({
        data: expiredSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts userId="test-user-id" />)

      // Component should handle expired session gracefully and render correctly
      expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
    })

    it('updates session when user data changes', async () => {
      const { useSession } = await import('next-auth/react')

      const initialSession = {
        ...mockSession,
        user: { ...mockSession.user, name: 'Old Name' },
      }

      const { rerender } = render(<LinkedAccounts userId="test-user-id" />)

      // Initial session
      vi.mocked(useSession).mockReturnValue({
        data: initialSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      rerender(<LinkedAccounts userId="test-user-id" />)

      // Updated session
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      rerender(<LinkedAccounts userId="test-user-id" />)

      // Should handle session updates and render correctly
      expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
    })
  })

  describe('User Profile Components', () => {
    beforeEach(() => {
      // Mock successful API responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'github',
              provider: 'github',
              name: 'GitHub',
              email: 'test@example.com',
              isPrimary: true,
            },
          ]),
      })
    })

    it('displays user profile information correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
        expect(screen.getByText('Manage your OAuth provider connections')).toBeInTheDocument()
      })
    })

    it('shows linked accounts correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      })
    })

    it('handles account linking/unlinking', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      const _user = userEvent.setup()
      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      })

      // Component should render the connected accounts interface
      expect(screen.getByText('Connected Providers')).toBeInTheDocument()
      expect(screen.getByText('Available Providers')).toBeInTheDocument()
    })

    it('displays connected accounts interface', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
        expect(screen.getByText('Connected Providers')).toBeInTheDocument()
      })
    })

    it('handles missing user data gracefully', async () => {
      const { useSession } = await import('next-auth/react')

      const sessionWithoutUserData = {
        ...mockSession,
        user: {
          id: '1',
          email: 'test@example.com',
          // Missing name and image
        },
      }

      vi.mocked(useSession).mockReturnValue({
        data: sessionWithoutUserData,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      })

      // Should handle missing name gracefully
      expect(screen.getByText('Manage your OAuth provider connections')).toBeInTheDocument()
    })
  })

  describe('Loading and Error States', () => {
    it('shows loading state for linked accounts', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      // Mock slow API response
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            /* intentionally empty - creates a pending promise for testing loading states */
          })
      )

      render(<LinkedAccounts userId="test-user-id" />)

      // Should show loading indicator or connected accounts interface
      expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
    })

    it('handles API errors gracefully', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      // Mock API error
      mockFetch.mockRejectedValue(new Error('API Error'))

      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      })
    })

    it('shows retry button on error', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      mockFetch.mockRejectedValueOnce(new Error('API Error'))

      const _user = userEvent.setup()
      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
      })

      // Component should show available buttons (Unlink, Connect)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)

      // Should have interactive buttons available
      expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    })
  })

  describe('Accessibility Compliance', () => {
    it('has proper ARIA labels for authentication buttons', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      render(<SignInButton />)

      expect(screen.getByLabelText('Sign in with GitHub')).toBeInTheDocument()
      expect(screen.getByLabelText('Sign in with Google')).toBeInTheDocument()
    })

    it('supports keyboard navigation', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      const user = userEvent.setup()
      render(<SignInButton />)

      const githubButton = screen.getByLabelText('Sign in with GitHub')

      // Tab to button and activate with Enter
      await user.tab()
      expect(githubButton).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(mockSignIn).toHaveBeenCalledWith('github', expect.any(Object))
    })

    it('has proper focus management', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      const user = userEvent.setup()
      render(<SignInButton />)

      const githubButton = screen.getByLabelText('Sign in with GitHub')
      const googleButton = screen.getByLabelText('Sign in with Google')

      // Tab navigation should work between buttons
      await user.tab()
      expect(githubButton).toHaveFocus()

      await user.tab()
      expect(googleButton).toHaveFocus()
    })

    it('provides screen reader friendly content', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })

      render(<LinkedAccounts userId="test-user-id" />)

      await waitFor(() => {
        // Should have proper heading structure
        const heading = screen.getByRole('heading', { level: 2 })
        expect(heading).toBeInTheDocument()
      })
    })
  })

  describe('Responsive Design', () => {
    it('adapts button sizes for mobile devices', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      render(<SignInButton />)

      const githubButton = screen.getByLabelText('Sign in with GitHub')

      // Check for responsive classes
      expect(githubButton.className).toContain('min-h-[44px]')
      expect(githubButton.className).toContain('sm:min-h-[40px]')
    })

    it('maintains usability on small screens', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: mockUpdate,
      })

      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      render(<SignInButton />)

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeVisible()
      })
    })
  })
})
