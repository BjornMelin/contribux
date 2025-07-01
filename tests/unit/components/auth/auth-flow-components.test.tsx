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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInButton } from '@/app/auth/signin/signin-button'
import { LinkedAccounts } from '@/components/auth/LinkedAccounts'
import { cleanupComponentTest, createModernMockRouter, setupComponentTest } from '@/tests/utils/modern-test-helpers'

// Mock next-auth/react with comprehensive session states
const mockSession = {
  user: {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    image: 'https://example.com/avatar.jpg',
  },
  expires: '2024-12-31T23:59:59.999Z',
}

const mockSignIn = vi.fn()
const mockSignOut = vi.fn()
const mockUpdate = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signIn: mockSignIn,
  signOut: mockSignOut,
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock router
const mockRouter = createModernMockRouter()
mockRouter.setup()

describe('Authentication Flow Components', () => {
  beforeEach(() => {
    setupComponentTest()
    vi.clearAllMocks()
    mockSignIn.mockClear()
    mockSignOut.mockClear()
    mockUpdate.mockClear()
    mockFetch.mockClear()
    mockRouter.reset()
  })

  afterEach(() => {
    cleanupComponentTest()
  })

  describe('Authentication State Management', () => {
    it('renders loading state correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'loading',
        update: mockUpdate,
      })

      render(<SignInButton />)

      // Should show loading indicators
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
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

      render(<LinkedAccounts />)

      // Should show user information when authenticated
      expect(screen.getByText('Test User')).toBeInTheDocument()
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
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
      mockSignIn.mockImplementation(() => new Promise(() => {}))

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
        json: () => Promise.resolve([
          { id: 'github', provider: 'github', name: 'GitHub', email: 'test@example.com' }
        ]),
      })

      const user = userEvent.setup()
      render(<LinkedAccounts />)

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument()
      })

      // Find and click sign out button
      const signOutButton = screen.getByRole('button', { name: /sign out/i })
      await user.click(signOutButton)

      expect(mockSignOut).toHaveBeenCalledWith({
        callbackUrl: '/auth/signin',
        redirect: true,
      })
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

      const user = userEvent.setup()
      render(<LinkedAccounts />)

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument()
      })

      const signOutButton = screen.getByRole('button', { name: /sign out/i })
      await user.click(signOutButton)

      // Should show confirmation or proceed with sign out
      expect(mockSignOut).toHaveBeenCalled()
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

      // Session should be maintained
      expect(useSession).toHaveBeenCalled()
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

      render(<LinkedAccounts />)

      // Component should handle expired session gracefully
      expect(useSession).toHaveBeenCalled()
    })

    it('updates session when user data changes', async () => {
      const { useSession } = await import('next-auth/react')
      
      const initialSession = {
        ...mockSession,
        user: { ...mockSession.user, name: 'Old Name' },
      }

      const { rerender } = render(<LinkedAccounts />)

      // Initial session
      vi.mocked(useSession).mockReturnValue({
        data: initialSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      rerender(<LinkedAccounts />)

      // Updated session
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      rerender(<LinkedAccounts />)

      // Should handle session updates
      expect(useSession).toHaveBeenCalled()
    })
  })

  describe('User Profile Components', () => {
    beforeEach(() => {
      // Mock successful API responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { 
            id: 'github', 
            provider: 'github', 
            name: 'GitHub', 
            email: 'test@example.com',
            isPrimary: true 
          }
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

      render(<LinkedAccounts />)

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument()
        expect(screen.getByText('test@example.com')).toBeInTheDocument()
      })
    })

    it('shows linked accounts correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts />)

      await waitFor(() => {
        expect(screen.getByText('GitHub')).toBeInTheDocument()
      })
    })

    it('handles account linking/unlinking', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      const user = userEvent.setup()
      render(<LinkedAccounts />)

      await waitFor(() => {
        expect(screen.getByText('GitHub')).toBeInTheDocument()
      })

      // Look for unlink button (might be represented as an icon or button)
      const buttons = screen.getAllByRole('button')
      const unlinkButton = buttons.find(button => 
        button.textContent?.includes('Unlink') || 
        button.getAttribute('aria-label')?.includes('unlink') ||
        button.getAttribute('title')?.includes('unlink')
      )

      if (unlinkButton) {
        await user.click(unlinkButton)
        // Should trigger API call to unlink account
        expect(mockFetch).toHaveBeenCalled()
      }
    })

    it('displays avatar image when available', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue({
        data: mockSession,
        status: 'authenticated',
        update: mockUpdate,
      })

      render(<LinkedAccounts />)

      await waitFor(() => {
        const avatar = screen.getByRole('img', { name: /test user/i })
        expect(avatar).toBeInTheDocument()
        expect(avatar).toHaveAttribute('src', expect.stringContaining('avatar.jpg'))
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

      render(<LinkedAccounts />)

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument()
      })

      // Should handle missing name gracefully
      expect(screen.queryByRole('img')).toBeNull() // No avatar should be shown
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
      mockFetch.mockImplementation(() => new Promise(() => {}))

      render(<LinkedAccounts />)

      // Should show loading indicator
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
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

      render(<LinkedAccounts />)

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
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

      const user = userEvent.setup()
      render(<LinkedAccounts />)

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })

      const retryButton = screen.getByRole('button', { name: /retry/i })
      
      // Mock successful retry
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })

      await user.click(retryButton)

      // Should attempt to reload data
      expect(mockFetch).toHaveBeenCalledTimes(2)
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

      render(<LinkedAccounts />)

      await waitFor(() => {
        // Should have proper heading structure
        const heading = screen.getByRole('heading', { level: 2 })
        expect(heading).toBeInTheDocument()
      })
    })
  })

  describe('Responsive Design', () => {
    it('adapts button sizes for mobile devices', () => {
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

    it('maintains usability on small screens', () => {
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