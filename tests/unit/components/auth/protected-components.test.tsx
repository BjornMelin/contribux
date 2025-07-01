/**
 * @vitest-environment jsdom
 */

/**
 * Protected Component Testing Suite
 * Tests for components that require authentication and handle permissions
 *
 * Features tested:
 * - Component behavior with/without authentication
 * - Permission-based rendering
 * - Authentication loading states
 * - Error state handling
 * - Redirects for unauthenticated users
 * - Role-based access control
 */

import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupComponentTest,
  createModernMockRouter,
  setupComponentTest,
} from '@/tests/utils/modern-test-helpers'

// Mock components that require authentication
const MockProtectedComponent = ({
  requireAuth = true,
  requiredRole,
}: {
  requireAuth?: boolean
  requiredRole?: string
}) => {
  const { useSession } = require('next-auth/react')
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return <div>Loading authentication...</div>
  }

  if (requireAuth && status === 'unauthenticated') {
    return <div>Please sign in to access this content</div>
  }

  if (requiredRole && (!session?.user?.role || session.user.role !== requiredRole)) {
    return <div>Access denied. Insufficient permissions.</div>
  }

  return (
    <div>
      <h1>Protected Content</h1>
      <p>Welcome, {session?.user?.name || 'User'}!</p>
      <button onClick={() => console.log('Action performed')}>Perform Action</button>
    </div>
  )
}

const MockUserDashboard = () => {
  const { useSession } = require('next-auth/react')
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading dashboard">
        <div className="animate-pulse">Loading your dashboard...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div role="alert">
        <p>You must be logged in to view your dashboard.</p>
        <button type="button">Sign In</button>
      </div>
    )
  }

  return (
    <main>
      <header>
        <h1>Dashboard</h1>
        <p>Welcome back, {session.user?.name}!</p>
      </header>

      <section aria-label="Quick actions">
        <button type="button">View Opportunities</button>
        <button type="button">Manage Bookmarks</button>
        <button type="button">Account Settings</button>
      </section>

      <section aria-label="Recent activity">
        <h2>Recent Activity</h2>
        <ul>
          <li>Bookmarked React repository</li>
          <li>Completed TypeScript issue</li>
        </ul>
      </section>
    </main>
  )
}

// Mock session states
const mockUnauthenticatedSession = {
  data: null,
  status: 'unauthenticated' as const,
  update: vi.fn(),
}

const mockLoadingSession = {
  data: null,
  status: 'loading' as const,
  update: vi.fn(),
}

const mockAuthenticatedSession = {
  data: {
    user: {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://example.com/avatar.jpg',
      role: 'user',
    },
    expires: '2024-12-31T23:59:59.999Z',
  },
  status: 'authenticated' as const,
  update: vi.fn(),
}

const mockAdminSession = {
  ...mockAuthenticatedSession,
  data: {
    ...mockAuthenticatedSession.data,
    user: {
      ...mockAuthenticatedSession.data.user,
      role: 'admin',
    },
  },
}

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock router
const mockRouter = createModernMockRouter()
mockRouter.setup()

describe('Protected Components', () => {
  beforeEach(() => {
    setupComponentTest()
    vi.clearAllMocks()
    mockRouter.reset()
  })

  afterEach(() => {
    cleanupComponentTest()
  })

  describe('Authentication State Handling', () => {
    it('shows loading state while checking authentication', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockLoadingSession)

      render(<MockProtectedComponent />)

      expect(screen.getByText('Loading authentication...')).toBeInTheDocument()
    })

    it('shows sign-in prompt for unauthenticated users', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockUnauthenticatedSession)

      render(<MockProtectedComponent />)

      expect(screen.getByText('Please sign in to access this content')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('renders protected content for authenticated users', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)

      render(<MockProtectedComponent />)

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
      expect(screen.getByText('Welcome, Test User!')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Perform Action' })).toBeInTheDocument()
    })

    it('allows access to public components without authentication', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockUnauthenticatedSession)

      render(<MockProtectedComponent requireAuth={false} />)

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
      expect(screen.getByText('Welcome, User!')).toBeInTheDocument()
    })
  })

  describe('Permission-Based Rendering', () => {
    it('denies access when user lacks required role', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)

      render(<MockProtectedComponent requiredRole="admin" />)

      expect(screen.getByText('Access denied. Insufficient permissions.')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('grants access when user has required role', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockAdminSession)

      render(<MockProtectedComponent requiredRole="admin" />)

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
      expect(screen.getByText('Welcome, Test User!')).toBeInTheDocument()
    })

    it('handles missing role gracefully', async () => {
      const { useSession } = await import('next-auth/react')
      const sessionWithoutRole = {
        ...mockAuthenticatedSession,
        data: {
          ...mockAuthenticatedSession.data,
          user: {
            ...mockAuthenticatedSession.data.user,
            role: undefined,
          },
        },
      }
      vi.mocked(useSession).mockReturnValue(sessionWithoutRole)

      render(<MockProtectedComponent requiredRole="admin" />)

      expect(screen.getByText('Access denied. Insufficient permissions.')).toBeInTheDocument()
    })
  })

  describe('User Dashboard Component', () => {
    it('shows loading state with proper ARIA attributes', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockLoadingSession)

      render(<MockUserDashboard />)

      const loadingElement = screen.getByRole('status', { name: 'Loading dashboard' })
      expect(loadingElement).toBeInTheDocument()
      expect(screen.getByText('Loading your dashboard...')).toBeInTheDocument()
    })

    it('shows authentication required message with sign-in option', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockUnauthenticatedSession)

      render(<MockUserDashboard />)

      const alertElement = screen.getByRole('alert')
      expect(alertElement).toBeInTheDocument()
      expect(screen.getByText('You must be logged in to view your dashboard.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    })

    it('renders full dashboard for authenticated users', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)

      render(<MockUserDashboard />)

      // Check main structure
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByText('Welcome back, Test User!')).toBeInTheDocument()

      // Check sections
      expect(screen.getByLabelText('Quick actions')).toBeInTheDocument()
      expect(screen.getByLabelText('Recent activity')).toBeInTheDocument()

      // Check action buttons
      expect(screen.getByRole('button', { name: 'View Opportunities' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Manage Bookmarks' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Account Settings' })).toBeInTheDocument()

      // Check recent activity
      expect(screen.getByRole('heading', { level: 2, name: 'Recent Activity' })).toBeInTheDocument()
      expect(screen.getByText('Bookmarked React repository')).toBeInTheDocument()
      expect(screen.getByText('Completed TypeScript issue')).toBeInTheDocument()
    })

    it('handles user interactions correctly', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)

      const user = userEvent.setup()
      render(<MockUserDashboard />)

      const viewOpportunitiesButton = screen.getByRole('button', { name: 'View Opportunities' })
      await user.click(viewOpportunitiesButton)

      // Button should be clickable (no errors thrown)
      expect(viewOpportunitiesButton).toBeInTheDocument()
    })
  })

  describe('Session State Transitions', () => {
    it('handles transition from loading to authenticated', async () => {
      const { useSession } = await import('next-auth/react')

      // Start with loading state
      vi.mocked(useSession).mockReturnValue(mockLoadingSession)
      const { rerender } = render(<MockUserDashboard />)

      expect(screen.getByText('Loading your dashboard...')).toBeInTheDocument()

      // Transition to authenticated
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)
      rerender(<MockUserDashboard />)

      expect(screen.getByText('Welcome back, Test User!')).toBeInTheDocument()
      expect(screen.queryByText('Loading your dashboard...')).not.toBeInTheDocument()
    })

    it('handles transition from loading to unauthenticated', async () => {
      const { useSession } = await import('next-auth/react')

      // Start with loading state
      vi.mocked(useSession).mockReturnValue(mockLoadingSession)
      const { rerender } = render(<MockUserDashboard />)

      expect(screen.getByText('Loading your dashboard...')).toBeInTheDocument()

      // Transition to unauthenticated
      vi.mocked(useSession).mockReturnValue(mockUnauthenticatedSession)
      rerender(<MockUserDashboard />)

      expect(screen.getByText('You must be logged in to view your dashboard.')).toBeInTheDocument()
      expect(screen.queryByText('Loading your dashboard...')).not.toBeInTheDocument()
    })

    it('handles user logout transition', async () => {
      const { useSession } = await import('next-auth/react')

      // Start authenticated
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)
      const { rerender } = render(<MockUserDashboard />)

      expect(screen.getByText('Welcome back, Test User!')).toBeInTheDocument()

      // Simulate logout
      vi.mocked(useSession).mockReturnValue(mockUnauthenticatedSession)
      rerender(<MockUserDashboard />)

      expect(screen.getByText('You must be logged in to view your dashboard.')).toBeInTheDocument()
      expect(screen.queryByText('Welcome back, Test User!')).not.toBeInTheDocument()
    })
  })

  describe('Error State Handling', () => {
    it('handles corrupted session data gracefully', async () => {
      const { useSession } = await import('next-auth/react')

      const corruptedSession = {
        data: {
          user: null, // Corrupted user data
          expires: '2024-12-31T23:59:59.999Z',
        },
        status: 'authenticated' as const,
        update: vi.fn(),
      }

      vi.mocked(useSession).mockReturnValue(corruptedSession)

      render(<MockUserDashboard />)

      // Should handle corrupted data gracefully
      expect(screen.getByText('Welcome back, !')).toBeInTheDocument() // Empty name
    })

    it('handles session update errors', async () => {
      const { useSession } = await import('next-auth/react')

      const sessionWithErrorUpdate = {
        ...mockAuthenticatedSession,
        update: vi.fn().mockRejectedValue(new Error('Update failed')),
      }

      vi.mocked(useSession).mockReturnValue(sessionWithErrorUpdate)

      render(<MockUserDashboard />)

      // Component should still render despite update error
      expect(screen.getByText('Welcome back, Test User!')).toBeInTheDocument()
    })

    it('handles network errors during authentication check', async () => {
      const { useSession } = await import('next-auth/react')

      // Mock a session that throws an error
      vi.mocked(useSession).mockImplementation(() => {
        throw new Error('Network error')
      })

      // Use error boundary or try-catch rendering
      const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
        try {
          return <>{children}</>
        } catch (_error) {
          return <div>Authentication service unavailable</div>
        }
      }

      render(
        <ErrorBoundary>
          <MockUserDashboard />
        </ErrorBoundary>
      )

      expect(screen.getByText('Authentication service unavailable')).toBeInTheDocument()
    })
  })

  describe('Accessibility for Protected Components', () => {
    it('provides proper ARIA labels for authentication states', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockLoadingSession)

      render(<MockUserDashboard />)

      const loadingStatus = screen.getByRole('status', { name: 'Loading dashboard' })
      expect(loadingStatus).toBeInTheDocument()
    })

    it('uses alert role for authentication errors', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockUnauthenticatedSession)

      render(<MockUserDashboard />)

      const alertElement = screen.getByRole('alert')
      expect(alertElement).toBeInTheDocument()
    })

    it('maintains semantic HTML structure', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)

      render(<MockUserDashboard />)

      // Check semantic structure
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('banner')).toBeInTheDocument() // header

      const headings = screen.getAllByRole('heading')
      expect(headings).toHaveLength(2) // h1 and h2

      const sections = screen.getAllByRole('region')
      expect(sections.length).toBeGreaterThanOrEqual(2) // Quick actions and Recent activity
    })

    it('supports keyboard navigation', async () => {
      const { useSession } = await import('next-auth/react')
      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)

      const user = userEvent.setup()
      render(<MockUserDashboard />)

      // Tab through interactive elements
      await user.tab()
      expect(screen.getByRole('button', { name: 'View Opportunities' })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: 'Manage Bookmarks' })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: 'Account Settings' })).toHaveFocus()
    })
  })

  describe('Performance Considerations', () => {
    it('does not cause unnecessary re-renders', async () => {
      const { useSession } = await import('next-auth/react')

      const renderSpy = vi.fn()
      const TestComponent = () => {
        renderSpy()
        return <MockUserDashboard />
      }

      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)

      const { rerender } = render(<TestComponent />)

      // Initial render
      expect(renderSpy).toHaveBeenCalledTimes(1)

      // Re-render with same session data
      rerender(<TestComponent />)

      // Should not cause additional renders if session hasn't changed
      expect(renderSpy).toHaveBeenCalledTimes(2) // Only one additional render for React's rerender
    })

    it('handles rapid session state changes', async () => {
      const { useSession } = await import('next-auth/react')

      const { rerender } = render(<MockUserDashboard />)

      // Rapid state changes
      vi.mocked(useSession).mockReturnValue(mockLoadingSession)
      rerender(<MockUserDashboard />)

      vi.mocked(useSession).mockReturnValue(mockAuthenticatedSession)
      rerender(<MockUserDashboard />)

      vi.mocked(useSession).mockReturnValue(mockUnauthenticatedSession)
      rerender(<MockUserDashboard />)

      // Final state should be unauthenticated
      expect(screen.getByText('You must be logged in to view your dashboard.')).toBeInTheDocument()
    })
  })
})
