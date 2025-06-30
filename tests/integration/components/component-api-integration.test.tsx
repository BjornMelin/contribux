/**
 * @vitest-environment jsdom
 */

/**
 * Component-API Integration Testing Suite
 * Tests component integration with API endpoints and data flow
 * 
 * Phase 3: Integration Testing
 * - Component→API integration testing
 * - Loading states and error handling
 * - Real-time data updates
 * - Authentication-aware components
 * - Search and filtering integration
 * - Performance monitoring
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { cleanupComponentTest, setupComponentTest } from '@/tests/utils/modern-test-helpers'

// Mock components representing the actual app components
const SearchBar = ({ onSearch, isLoading }: { onSearch: (query: string) => void; isLoading?: boolean }) => {
  const [query, setQuery] = React.useState('')
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
  }

  return (
    <form onSubmit={handleSubmit} role="search">
      <input
        type="text"
        placeholder="Search repositories..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={isLoading}
        aria-label="Search repositories"
      />
      <button type="submit" disabled={isLoading || !query.trim()}>
        {isLoading ? 'Searching...' : 'Search'}
      </button>
    </form>
  )
}

const RepositoryCard = ({ repository, onBookmark }: { 
  repository: any; 
  onBookmark: (repoId: string) => void 
}) => {
  const [isBookmarked, setIsBookmarked] = React.useState(repository.is_bookmarked)

  const handleBookmark = async () => {
    setIsBookmarked(!isBookmarked)
    onBookmark(repository.id)
  }

  return (
    <div role="article" aria-label={`Repository ${repository.name}`}>
      <h3>{repository.name}</h3>
      <p>{repository.description}</p>
      <div>
        <span>{repository.language}</span>
        <span>⭐ {repository.stars}</span>
      </div>
      <button 
        onClick={handleBookmark}
        aria-label={`${isBookmarked ? 'Remove' : 'Add'} bookmark for ${repository.name}`}
      >
        {isBookmarked ? '🔖' : '📌'} {isBookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>
    </div>
  )
}

const OpportunityCard = ({ opportunity, userSkills }: { 
  opportunity: any; 
  userSkills: string[] 
}) => {
  const matchPercentage = React.useMemo(() => {
    const matchingSkills = opportunity.skills_required.filter((skill: string) =>
      userSkills.includes(skill)
    )
    return Math.round((matchingSkills.length / opportunity.skills_required.length) * 100)
  }, [opportunity.skills_required, userSkills])

  return (
    <div role="article" aria-label={`Opportunity ${opportunity.title}`}>
      <h3>{opportunity.title}</h3>
      <p>{opportunity.description}</p>
      <div>
        <span>Difficulty: {opportunity.difficulty}</span>
        <span>Match: {matchPercentage}%</span>
      </div>
      <div role="list" aria-label="Required skills">
        {opportunity.skills_required.map((skill: string) => (
          <span 
            key={skill} 
            role="listitem"
            className={userSkills.includes(skill) ? 'matched-skill' : 'unmatched-skill'}
          >
            {skill}
          </span>
        ))}
      </div>
    </div>
  )
}

const UserProfile = ({ userId }: { userId: string }) => {
  const [profile, setProfile] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/users/${userId}`)
        if (!response.ok) throw new Error('Failed to fetch profile')
        const data = await response.json()
        setProfile(data.user)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [userId])

  if (loading) return <div role="status">Loading profile...</div>
  if (error) return <div role="alert">Error: {error}</div>
  if (!profile) return <div>No profile found</div>

  return (
    <div role="region" aria-label="User profile">
      <h2>{profile.username}</h2>
      <p>{profile.bio}</p>
      <div>
        <span>Repositories: {profile.public_repos}</span>
        <span>Followers: {profile.followers}</span>
      </div>
    </div>
  )
}

// Mock React import
const React = {
  useState: vi.fn(),
  useEffect: vi.fn(),
  useMemo: vi.fn(),
}

// Setup MSW server
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  vi.clearAllMocks()
})
afterAll(() => server.close())

// Mock session data
const mockSession = {
  user: {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    image: 'https://example.com/avatar.jpg',
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
}

// Test wrapper with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={mockSession}>
        {children}
      </SessionProvider>
    </QueryClientProvider>
  )
}

describe('Component-API Integration Testing', () => {
  beforeEach(() => {
    setupComponentTest()
    
    // Mock React hooks
    React.useState.mockImplementation((initial) => {
      const [state, setState] = useState(initial)
      return [state, setState]
    })
    
    React.useEffect.mockImplementation((effect, deps) => {
      useEffect(effect, deps)
    })
    
    React.useMemo.mockImplementation((factory, deps) => {
      return useMemo(factory, deps)
    })
  })

  afterEach(() => {
    cleanupComponentTest()
  })

  describe('Search Integration', () => {
    it('integrates search component with repository API', async () => {
      let searchQuery = ''
      const user = userEvent.setup()

      server.use(
        http.get('/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          searchQuery = url.searchParams.get('q') || ''
          
          return HttpResponse.json({
            success: true,
            data: {
              repositories: [
                {
                  id: 'repo-1',
                  name: 'test-repo',
                  description: 'A test repository',
                  language: 'TypeScript',
                  stars: 150,
                  is_bookmarked: false,
                },
                {
                  id: 'repo-2',
                  name: 'awesome-project',
                  description: 'An awesome project',
                  language: 'JavaScript',
                  stars: 250,
                  is_bookmarked: true,
                },
              ],
              total_count: 2,
              page: 1,
              per_page: 20,
              has_more: false,
            },
            metadata: {
              query: searchQuery,
              execution_time_ms: 45,
            },
          })
        })
      )

      const mockSearch = vi.fn(async (query: string) => {
        const response = await fetch(`/api/search/repositories?q=${encodeURIComponent(query)}`)
        const data = await response.json()
        return data.data.repositories
      })

      render(
        <TestWrapper>
          <SearchBar onSearch={mockSearch} />
        </TestWrapper>
      )

      const searchInput = screen.getByLabelText('Search repositories')
      const searchButton = screen.getByRole('button', { name: 'Search' })

      // Test initial state
      expect(searchButton).toBeDisabled()

      // Enter search query
      await user.type(searchInput, 'typescript')
      expect(searchButton).not.toBeDisabled()

      // Perform search
      await user.click(searchButton)

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith('typescript')
      })

      expect(searchQuery).toBe('typescript')
    })

    it('handles search loading states correctly', async () => {
      const user = userEvent.setup()
      let isLoading = false

      server.use(
        http.get('/api/search/repositories', async () => {
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 100))
          
          return HttpResponse.json({
            success: true,
            data: {
              repositories: [],
              total_count: 0,
              page: 1,
              per_page: 20,
              has_more: false,
            },
          })
        })
      )

      const mockSearch = vi.fn(async (query: string) => {
        isLoading = true
        try {
          const response = await fetch(`/api/search/repositories?q=${encodeURIComponent(query)}`)
          return await response.json()
        } finally {
          isLoading = false
        }
      })

      const { rerender } = render(
        <TestWrapper>
          <SearchBar onSearch={mockSearch} isLoading={isLoading} />
        </TestWrapper>
      )

      const searchInput = screen.getByLabelText('Search repositories')
      const searchButton = screen.getByRole('button')

      await user.type(searchInput, 'test')
      await user.click(searchButton)

      // Rerender with loading state
      rerender(
        <TestWrapper>
          <SearchBar onSearch={mockSearch} isLoading={true} />
        </TestWrapper>
      )

      expect(screen.getByRole('button', { name: 'Searching...' })).toBeInTheDocument()
      expect(searchInput).toBeDisabled()
    })

    it('handles search API errors gracefully', async () => {
      const user = userEvent.setup()
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      server.use(
        http.get('/api/search/repositories', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'SEARCH_FAILED',
              message: 'Search service unavailable',
            },
          }, { status: 500 })
        })
      )

      const mockSearch = vi.fn(async (query: string) => {
        try {
          const response = await fetch(`/api/search/repositories?q=${encodeURIComponent(query)}`)
          if (!response.ok) throw new Error('Search failed')
          return await response.json()
        } catch (error) {
          console.error('Search error:', error)
          throw error
        }
      })

      render(
        <TestWrapper>
          <SearchBar onSearch={mockSearch} />
        </TestWrapper>
      )

      const searchInput = screen.getByLabelText('Search repositories')
      const searchButton = screen.getByRole('button', { name: 'Search' })

      await user.type(searchInput, 'test')
      await user.click(searchButton)

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Search error:',
          expect.any(Error)
        )
      })

      consoleError.mockRestore()
    })
  })

  describe('Repository Card Integration', () => {
    it('integrates bookmark functionality with API', async () => {
      const user = userEvent.setup()
      let bookmarkRequests: string[] = []

      server.use(
        http.post('/api/bookmarks', async ({ request }) => {
          const { repository_id } = await request.json()
          bookmarkRequests.push(repository_id)
          
          return HttpResponse.json({
            success: true,
            data: { bookmarked: true },
          })
        }),
        
        http.delete('/api/bookmarks/:repoId', ({ params }) => {
          bookmarkRequests.push(`delete-${params.repoId}`)
          
          return HttpResponse.json({
            success: true,
            data: { bookmarked: false },
          })
        })
      )

      const repository = {
        id: 'repo-1',
        name: 'test-repo',
        description: 'A test repository',
        language: 'TypeScript',
        stars: 150,
        is_bookmarked: false,
      }

      const mockBookmark = vi.fn(async (repoId: string) => {
        const method = repository.is_bookmarked ? 'DELETE' : 'POST'
        const url = repository.is_bookmarked 
          ? `/api/bookmarks/${repoId}`
          : '/api/bookmarks'
        
        const body = method === 'POST' ? JSON.stringify({ repository_id: repoId }) : undefined

        const response = await fetch(url, {
          method,
          headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
          body,
        })
        
        return response.json()
      })

      render(
        <TestWrapper>
          <RepositoryCard repository={repository} onBookmark={mockBookmark} />
        </TestWrapper>
      )

      const bookmarkButton = screen.getByLabelText('Add bookmark for test-repo')
      await user.click(bookmarkButton)

      await waitFor(() => {
        expect(mockBookmark).toHaveBeenCalledWith('repo-1')
        expect(bookmarkRequests).toContain('repo-1')
      })

      // Button should update to show bookmarked state
      expect(screen.getByLabelText('Remove bookmark for test-repo')).toBeInTheDocument()
    })

    it('displays repository data correctly from API response', () => {
      const repository = {
        id: 'repo-123',
        name: 'awesome-project',
        description: 'An awesome open source project',
        language: 'JavaScript',
        stars: 1250,
        is_bookmarked: true,
      }

      render(
        <TestWrapper>
          <RepositoryCard repository={repository} onBookmark={vi.fn()} />
        </TestWrapper>
      )

      expect(screen.getByRole('article', { name: 'Repository awesome-project' })).toBeInTheDocument()
      expect(screen.getByText('awesome-project')).toBeInTheDocument()
      expect(screen.getByText('An awesome open source project')).toBeInTheDocument()
      expect(screen.getByText('JavaScript')).toBeInTheDocument()
      expect(screen.getByText('⭐ 1250')).toBeInTheDocument()
      expect(screen.getByText('🔖 Bookmarked')).toBeInTheDocument()
    })
  })

  describe('Opportunity Matching Integration', () => {
    it('calculates skill matches correctly with user data', () => {
      const opportunity = {
        id: 'opp-1',
        title: 'Fix TypeScript migration',
        description: 'Help migrate JavaScript codebase to TypeScript',
        difficulty: 'intermediate',
        skills_required: ['TypeScript', 'JavaScript', 'React', 'Node.js'],
      }

      const userSkills = ['TypeScript', 'React', 'Python', 'Docker']

      render(
        <TestWrapper>
          <OpportunityCard opportunity={opportunity} userSkills={userSkills} />
        </TestWrapper>
      )

      expect(screen.getByRole('article', { name: 'Opportunity Fix TypeScript migration' })).toBeInTheDocument()
      expect(screen.getByText('Fix TypeScript migration')).toBeInTheDocument()
      expect(screen.getByText('Difficulty: intermediate')).toBeInTheDocument()
      
      // 2 out of 4 skills match = 50%
      expect(screen.getByText('Match: 50%')).toBeInTheDocument()

      // Check skill highlighting
      const skillsList = screen.getByRole('list', { name: 'Required skills' })
      const skills = within(skillsList).getAllByRole('listitem')
      
      expect(skills).toHaveLength(4)
      expect(skills[0]).toHaveClass('matched-skill') // TypeScript
      expect(skills[1]).toHaveClass('unmatched-skill') // JavaScript
      expect(skills[2]).toHaveClass('matched-skill') // React
      expect(skills[3]).toHaveClass('unmatched-skill') // Node.js
    })

    it('handles edge cases in skill matching', () => {
      const opportunity = {
        id: 'opp-2',
        title: 'Documentation update',
        description: 'Update project documentation',
        difficulty: 'beginner',
        skills_required: ['Markdown', 'Git'],
      }

      // Test with no matching skills
      render(
        <TestWrapper>
          <OpportunityCard opportunity={opportunity} userSkills={['Java', 'Spring']} />
        </TestWrapper>
      )

      expect(screen.getByText('Match: 0%')).toBeInTheDocument()
    })
  })

  describe('User Profile Integration', () => {
    it('fetches and displays user profile data', async () => {
      server.use(
        http.get('/api/users/:userId', ({ params }) => {
          expect(params.userId).toBe('user-123')
          
          return HttpResponse.json({
            success: true,
            user: {
              id: 'user-123',
              username: 'testuser',
              bio: 'Full-stack developer passionate about open source',
              public_repos: 25,
              followers: 150,
            },
          })
        })
      )

      render(
        <TestWrapper>
          <UserProfile userId="user-123" />
        </TestWrapper>
      )

      // Should show loading initially
      expect(screen.getByRole('status', { name: 'Loading profile...' })).toBeInTheDocument()

      // Wait for profile to load
      await waitFor(() => {
        expect(screen.getByRole('region', { name: 'User profile' })).toBeInTheDocument()
      })

      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByText('Full-stack developer passionate about open source')).toBeInTheDocument()
      expect(screen.getByText('Repositories: 25')).toBeInTheDocument()
      expect(screen.getByText('Followers: 150')).toBeInTheDocument()
    })

    it('handles profile API errors', async () => {
      server.use(
        http.get('/api/users/:userId', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User not found',
            },
          }, { status: 404 })
        })
      )

      render(
        <TestWrapper>
          <UserProfile userId="nonexistent-user" />
        </TestWrapper>
      )

      // Should show loading initially
      expect(screen.getByRole('status', { name: 'Loading profile...' })).toBeInTheDocument()

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      expect(screen.getByText('Error: Failed to fetch profile')).toBeInTheDocument()
    })
  })

  describe('Real-time Updates Integration', () => {
    it('handles optimistic updates for bookmarks', async () => {
      const user = userEvent.setup()
      let bookmarkState = false

      server.use(
        http.post('/api/bookmarks', async () => {
          // Simulate slow API response
          await new Promise(resolve => setTimeout(resolve, 100))
          bookmarkState = true
          
          return HttpResponse.json({
            success: true,
            data: { bookmarked: true },
          })
        })
      )

      const repository = {
        id: 'repo-1',
        name: 'test-repo',
        description: 'Test repository',
        language: 'TypeScript',
        stars: 100,
        is_bookmarked: false,
      }

      const mockBookmark = vi.fn()

      render(
        <TestWrapper>
          <RepositoryCard repository={repository} onBookmark={mockBookmark} />
        </TestWrapper>
      )

      const bookmarkButton = screen.getByLabelText('Add bookmark for test-repo')
      await user.click(bookmarkButton)

      // Should immediately show optimistic update
      expect(screen.getByLabelText('Remove bookmark for test-repo')).toBeInTheDocument()
      expect(screen.getByText('🔖 Bookmarked')).toBeInTheDocument()

      await waitFor(() => {
        expect(mockBookmark).toHaveBeenCalledWith('repo-1')
      })
    })
  })

  describe('Performance Integration Testing', () => {
    it('measures component render performance with API data', async () => {
      const repositories = Array.from({ length: 100 }, (_, i) => ({
        id: `repo-${i}`,
        name: `repository-${i}`,
        description: `Description for repository ${i}`,
        language: i % 2 === 0 ? 'TypeScript' : 'JavaScript',
        stars: Math.floor(Math.random() * 1000),
        is_bookmarked: Math.random() > 0.5,
      }))

      server.use(
        http.get('/api/search/repositories', () => {
          return HttpResponse.json({
            success: true,
            data: {
              repositories,
              total_count: repositories.length,
              page: 1,
              per_page: 100,
              has_more: false,
            },
          })
        })
      )

      const start = performance.now()

      render(
        <TestWrapper>
          <div>
            {repositories.map(repo => (
              <RepositoryCard key={repo.id} repository={repo} onBookmark={vi.fn()} />
            ))}
          </div>
        </TestWrapper>
      )

      const end = performance.now()
      const renderTime = end - start

      // Should render 100 repository cards efficiently
      expect(screen.getAllByRole('article')).toHaveLength(100)
      expect(renderTime).toBeLessThan(1000) // Should render in under 1 second

      console.log(`Rendered 100 repository cards in ${renderTime.toFixed(2)}ms`)
    })

    it('monitors memory usage during component lifecycle', () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0

      const { unmount } = render(
        <TestWrapper>
          <div>
            {Array.from({ length: 50 }, (_, i) => (
              <RepositoryCard
                key={i}
                repository={{
                  id: `repo-${i}`,
                  name: `Test Repo ${i}`,
                  description: 'Test description',
                  language: 'TypeScript',
                  stars: 100,
                  is_bookmarked: false,
                }}
                onBookmark={vi.fn()}
              />
            ))}
          </div>
        </TestWrapper>
      )

      const afterRenderMemory = performance.memory?.usedJSHeapSize || 0
      
      unmount()
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      const afterUnmountMemory = performance.memory?.usedJSHeapSize || 0

      const memoryIncrease = afterRenderMemory - initialMemory
      const memoryRecovered = afterRenderMemory - afterUnmountMemory

      console.log(`Memory usage: +${memoryIncrease} bytes after render, -${memoryRecovered} bytes after unmount`)

      // Memory should be reasonably recovered after unmount
      expect(memoryRecovered).toBeGreaterThan(0)
    })
  })

  describe('Error Boundary Integration', () => {
    it('handles component errors gracefully during API failures', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      server.use(
        http.get('/api/users/:userId', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      // Error boundary wrapper
      const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
        const [hasError, setHasError] = React.useState(false)

        React.useEffect(() => {
          const errorHandler = (error: ErrorEvent) => {
            setHasError(true)
            console.error('Component error:', error)
          }

          window.addEventListener('error', errorHandler)
          return () => window.removeEventListener('error', errorHandler)
        }, [])

        if (hasError) {
          return <div role="alert">Something went wrong while loading the profile</div>
        }

        return <>{children}</>
      }

      render(
        <TestWrapper>
          <ErrorBoundary>
            <UserProfile userId="user-123" />
          </ErrorBoundary>
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      consoleError.mockRestore()
    })
  })
})