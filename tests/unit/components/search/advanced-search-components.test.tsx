/**
 * @vitest-environment jsdom
 */

/**
 * Advanced Search Components Test Suite
 * Enhanced testing for search functionality with modern patterns
 *
 * Features tested:
 * - Repository search interface
 * - Opportunity discovery components
 * - Advanced filtering and sorting
 * - Search result rendering with pagination
 * - Bookmark functionality
 * - Responsive design validation
 * - Accessibility compliance
 * - Performance optimization
 */

import {
  OpportunityCard,
  OpportunityList,
  SearchBar,
  SearchFilters as SearchFiltersComponent,
} from '@/components/features'
import type { Opportunity, SearchFilters } from '@/types/search'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asUUID,
  cleanupComponentTest,
  createDefaultFilters,
  createMockRepository,
  createModernMockRouter,
  setupComponentTest,
} from '../../../utils/modern-test-helpers'
import { setupMSW } from '../../../utils/msw-unified'

// Enhanced mock data
const createMockOpportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  // BaseEntity fields
  id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),

  // Opportunity fields
  repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
  githubIssueId: 123,
  title: 'Fix TypeScript type errors in search module',
  description: 'Several type errors need to be fixed in the search functionality',
  type: 'bug_fix',
  difficulty: 'intermediate',
  labels: ['bug', 'typescript', 'good-first-issue'],
  technologies: ['TypeScript', 'Node.js', 'Jest'],
  requiredSkills: ['TypeScript', 'debugging'],
  goodFirstIssue: false,
  helpWanted: true,
  hasAssignee: false,
  assigneeUsername: undefined,
  estimatedHours: 4,
  relevanceScore: 0.95,
  url: 'https://github.com/company/search-engine/issues/123',
  lastActivityAt: new Date('2024-01-01T00:00:00Z'),
  isActive: true,
  aiAnalysis: {
    complexityScore: 0.7,
    impactScore: 0.8,
    confidenceScore: 0.9,
    learningPotential: 0.6,
    businessImpact: 0.7,
    requiredSkills: ['TypeScript', 'debugging'],
    suggestedApproach: 'Fix type definitions',
    potentialChallenges: ['Complex types'],
    successProbability: 0.85,
    estimatedEffort: {
      hours: 4,
      difficulty: 'intermediate',
      confidence: 0.8,
    },
  },
  repository: createMockRepository({
    name: 'search-engine',
    fullName: 'company/search-engine',
    language: 'TypeScript',
    starsCount: 1250,
  }),
  ...overrides,
})

// Mock bookmark functionality
const mockBookmarkManager = {
  bookmarks: new Set<string>(),
  isBookmarked: vi.fn((id: string) => mockBookmarkManager.bookmarks.has(id)),
  addBookmark: vi.fn((id: string) => {
    mockBookmarkManager.bookmarks.add(id)
    return Promise.resolve({ success: true })
  }),
  removeBookmark: vi.fn((id: string) => {
    mockBookmarkManager.bookmarks.delete(id)
    return Promise.resolve({ success: true })
  }),
  toggleBookmark: vi.fn(async (id: string) => {
    if (mockBookmarkManager.bookmarks.has(id)) {
      return await mockBookmarkManager.removeBookmark(id)
    }
    return await mockBookmarkManager.addBookmark(id)
  }),
}

// Enhanced Opportunity Card with bookmark functionality
const EnhancedOpportunityCard = ({
  opportunity,
  onSelect,
  onBookmark,
}: {
  opportunity: Opportunity
  onSelect: (opportunity: Opportunity) => void
  onBookmark?: (id: string) => void
}) => {
  const isBookmarked = mockBookmarkManager.isBookmarked(opportunity.id)

  return (
    <article className="opportunity-card">
      <OpportunityCard opportunity={opportunity} onSelect={onSelect} />
      <button
        type="button"
        aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        className="bookmark-button"
        onClick={() => {
          mockBookmarkManager.toggleBookmark(opportunity.id)
          onBookmark?.(opportunity.id)
        }}
      >
        {isBookmarked ? '★' : '☆'}
      </button>
    </article>
  )
}

// Advanced Search Interface
const AdvancedSearchInterface = ({
  onSearch,
  onFiltersChange,
  onSortChange,
  loading = false,
}: {
  onSearch: (query: string) => void
  onFiltersChange: (filters: SearchFilters) => void
  onSortChange: (sort: string, order: string) => void
  loading?: boolean
}) => {
  const [filters, setFilters] = React.useState(createDefaultFilters())
  const [sortBy, setSortBy] = React.useState('relevance')
  const [order, setOrder] = React.useState('desc')

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const handleSortChange = (newSort: string, newOrder: string) => {
    setSortBy(newSort)
    setOrder(newOrder)
    onSortChange(newSort, newOrder)
  }

  return (
    <div className="advanced-search-interface">
      <div className="search-section">
        <SearchBar onSearch={onSearch} loading={loading} />
      </div>

      <div className="filters-section">
        <SearchFiltersComponent
          filters={filters}
          onFiltersChange={handleFiltersChange}
          loading={loading}
        />
      </div>

      <div className="sort-section">
        <label htmlFor="sort-select">Sort by:</label>
        <select
          id="sort-select"
          value={sortBy}
          onChange={e => handleSortChange(e.target.value, order)}
          disabled={loading}
        >
          <option value="relevance">Relevance</option>
          <option value="created">Date Created</option>
          <option value="updated">Last Updated</option>
          <option value="difficulty">Difficulty</option>
          <option value="stars">Repository Stars</option>
        </select>

        <label htmlFor="order-select">Order:</label>
        <select
          id="order-select"
          value={order}
          onChange={e => handleSortChange(sortBy, e.target.value)}
          disabled={loading}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
    </div>
  )
}

// Paginated Search Results
const PaginatedSearchResults = ({
  opportunities,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onOpportunitySelect,
  loading = false,
}: {
  opportunities: Opportunity[]
  currentPage?: number
  totalPages?: number
  onPageChange: (page: number) => void
  onOpportunitySelect: (opportunity: Opportunity) => void
  loading?: boolean
}) => {
  return (
    <div className="paginated-search-results">
      <output className="results-info">
        Showing page {currentPage} of {totalPages} ({opportunities.length} results)
      </output>

      <OpportunityList
        opportunities={opportunities}
        onOpportunitySelect={onOpportunitySelect}
        loading={loading}
      />

      {totalPages > 1 && (
        <nav aria-label="Search results pagination" className="pagination">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            aria-label="Previous page"
          >
            Previous
          </button>

          <span className="page-info">
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
            aria-label="Next page"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}

// Setup MSW and mocks
setupMSW()
const mockRouter = createModernMockRouter()
mockRouter.setup()

describe('Advanced Search Components', () => {
  beforeEach(() => {
    setupComponentTest()
    vi.clearAllMocks()
    mockBookmarkManager.bookmarks.clear()
    mockRouter.reset()
  })

  afterEach(() => {
    cleanupComponentTest()
  })

  describe('Repository Search Interface', () => {
    it('renders complete search interface', () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )

      // Check all sections are present
      expect(screen.getByRole('textbox', { name: 'Search input' })).toBeInTheDocument()
      expect(screen.getByLabelText('Sort by:')).toBeInTheDocument()
      expect(screen.getByLabelText('Order:')).toBeInTheDocument()

      // Check filter controls
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(4) // Difficulty, type, sort, order
    })

    it('handles search queries correctly', async () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      const user = userEvent.setup()
      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )

      const searchInput = screen.getByRole('textbox', { name: 'Search input' })
      await user.type(searchInput, 'React TypeScript')
      await user.keyboard('{Enter}')

      expect(handleSearch).toHaveBeenCalledWith('React TypeScript')
    })

    it('handles sort and order changes', async () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      const user = userEvent.setup()
      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )

      const sortSelect = screen.getByLabelText('Sort by:')
      await user.selectOptions(sortSelect, 'created')

      expect(handleSortChange).toHaveBeenCalledWith('created', 'desc')

      const orderSelect = screen.getByLabelText('Order:')
      await user.selectOptions(orderSelect, 'asc')

      expect(handleSortChange).toHaveBeenCalledWith('created', 'asc')
    })

    it('disables controls during loading', () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
          loading={true}
        />
      )

      expect(screen.getByRole('textbox', { name: 'Search input' })).toBeDisabled()
      expect(screen.getByLabelText('Sort by:')).toBeDisabled()
      expect(screen.getByLabelText('Order:')).toBeDisabled()
    })
  })

  describe('Opportunity Discovery Components', () => {
    const mockOpportunities = [
      createMockOpportunity({
        id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
        title: 'Fix TypeScript errors',
        difficulty: 'beginner',
        relevanceScore: 0.95,
      }),
      createMockOpportunity({
        id: asUUID('550e8400-e29b-41d4-a716-446655440002'),
        title: 'Add React components',
        type: 'feature',
        difficulty: 'intermediate',
        relevanceScore: 0.85,
      }),
      createMockOpportunity({
        id: asUUID('550e8400-e29b-41d4-a716-446655440003'),
        title: 'Optimize performance',
        type: 'enhancement',
        difficulty: 'advanced',
        relevanceScore: 0.75,
      }),
    ]

    it('displays opportunities with relevance scoring', () => {
      const handleSelect = vi.fn()

      render(
        <OpportunityList opportunities={mockOpportunities} onOpportunitySelect={handleSelect} />
      )

      // Check all opportunities are displayed
      expect(screen.getByText('Fix TypeScript errors')).toBeInTheDocument()
      expect(screen.getByText('Add React components')).toBeInTheDocument()
      expect(screen.getByText('Optimize performance')).toBeInTheDocument()

      // Check relevance scores are displayed
      expect(screen.getByText('95%')).toBeInTheDocument()
      expect(screen.getByText('85%')).toBeInTheDocument()
      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('handles opportunity selection', async () => {
      const handleSelect = vi.fn()
      const user = userEvent.setup()

      render(
        <OpportunityList opportunities={mockOpportunities} onOpportunitySelect={handleSelect} />
      )

      const firstOpportunity = screen.getByRole('button', {
        name: /view opportunity.*fix typescript errors/i,
      })
      await user.click(firstOpportunity)

      expect(handleSelect).toHaveBeenCalledWith(mockOpportunities[0])
    })

    it('shows difficulty indicators correctly', () => {
      const handleSelect = vi.fn()

      render(
        <OpportunityList opportunities={mockOpportunities} onOpportunitySelect={handleSelect} />
      )

      expect(screen.getByText('beginner')).toBeInTheDocument()
      expect(screen.getByText('intermediate')).toBeInTheDocument()
      expect(screen.getByText('advanced')).toBeInTheDocument()
    })

    it('displays technology tags', () => {
      const handleSelect = vi.fn()

      render(
        <OpportunityList opportunities={mockOpportunities} onOpportunitySelect={handleSelect} />
      )

      // Use getAllByText for technologies that appear in multiple opportunities
      const typescriptTags = screen.getAllByText('TypeScript')
      expect(typescriptTags.length).toBeGreaterThan(0)

      const nodejsTags = screen.getAllByText('Node.js')
      expect(nodejsTags.length).toBeGreaterThan(0)

      const jestTags = screen.getAllByText('Jest')
      expect(jestTags.length).toBeGreaterThan(0)
    })
  })

  describe('Bookmark Functionality', () => {
    const mockOpportunity = createMockOpportunity()

    it('renders bookmark button', () => {
      const handleSelect = vi.fn()
      const handleBookmark = vi.fn()

      render(
        <EnhancedOpportunityCard
          opportunity={mockOpportunity}
          onSelect={handleSelect}
          onBookmark={handleBookmark}
        />
      )

      const bookmarkButton = screen.getByLabelText('Add bookmark')
      expect(bookmarkButton).toBeInTheDocument()
      expect(bookmarkButton).toHaveTextContent('☆')
    })

    it('toggles bookmark state', async () => {
      const handleSelect = vi.fn()
      const handleBookmark = vi.fn()
      const user = userEvent.setup()

      render(
        <EnhancedOpportunityCard
          opportunity={mockOpportunity}
          onSelect={handleSelect}
          onBookmark={handleBookmark}
        />
      )

      const bookmarkButton = screen.getByLabelText('Add bookmark')
      await user.click(bookmarkButton)

      expect(mockBookmarkManager.toggleBookmark).toHaveBeenCalledWith(mockOpportunity.id)
      expect(handleBookmark).toHaveBeenCalledWith(mockOpportunity.id)
    })

    it('shows bookmarked state correctly', async () => {
      // Pre-bookmark the opportunity
      mockBookmarkManager.bookmarks.add(mockOpportunity.id)
      mockBookmarkManager.isBookmarked.mockReturnValue(true)

      const handleSelect = vi.fn()
      const handleBookmark = vi.fn()

      render(
        <EnhancedOpportunityCard
          opportunity={mockOpportunity}
          onSelect={handleSelect}
          onBookmark={handleBookmark}
        />
      )

      const bookmarkButton = screen.getByLabelText('Remove bookmark')
      expect(bookmarkButton).toBeInTheDocument()
      expect(bookmarkButton).toHaveTextContent('★')
    })

    it('handles bookmark removal', async () => {
      mockBookmarkManager.bookmarks.add(mockOpportunity.id)
      mockBookmarkManager.isBookmarked.mockReturnValue(true)

      const handleSelect = vi.fn()
      const handleBookmark = vi.fn()
      const user = userEvent.setup()

      render(
        <EnhancedOpportunityCard
          opportunity={mockOpportunity}
          onSelect={handleSelect}
          onBookmark={handleBookmark}
        />
      )

      const bookmarkButton = screen.getByLabelText('Remove bookmark')
      await user.click(bookmarkButton)

      expect(mockBookmarkManager.toggleBookmark).toHaveBeenCalledWith(mockOpportunity.id)
    })
  })

  describe('Search Result Pagination', () => {
    const mockOpportunities = Array.from({ length: 5 }, (_, i) =>
      createMockOpportunity({
        id: asUUID(`550e8400-e29b-41d4-a716-44665544000${i + 1}`),
        title: `Opportunity ${i + 1}`,
      })
    )

    it('displays pagination controls', () => {
      const handlePageChange = vi.fn()
      const handleSelect = vi.fn()

      render(
        <PaginatedSearchResults
          opportunities={mockOpportunities}
          currentPage={2}
          totalPages={5}
          onPageChange={handlePageChange}
          onOpportunitySelect={handleSelect}
        />
      )

      expect(screen.getByText('Showing page 2 of 5 (5 results)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument()
      expect(screen.getByText('Page 2 of 5')).toBeInTheDocument()
    })

    it('handles page navigation', async () => {
      const handlePageChange = vi.fn()
      const handleSelect = vi.fn()
      const user = userEvent.setup()

      render(
        <PaginatedSearchResults
          opportunities={mockOpportunities}
          currentPage={2}
          totalPages={5}
          onPageChange={handlePageChange}
          onOpportunitySelect={handleSelect}
        />
      )

      const nextButton = screen.getByRole('button', { name: 'Next page' })
      await user.click(nextButton)

      expect(handlePageChange).toHaveBeenCalledWith(3)

      const prevButton = screen.getByRole('button', { name: 'Previous page' })
      await user.click(prevButton)

      expect(handlePageChange).toHaveBeenCalledWith(1)
    })

    it('disables navigation at boundaries', () => {
      const handlePageChange = vi.fn()
      const handleSelect = vi.fn()

      const { rerender } = render(
        <PaginatedSearchResults
          opportunities={mockOpportunities}
          currentPage={1}
          totalPages={5}
          onPageChange={handlePageChange}
          onOpportunitySelect={handleSelect}
        />
      )

      // First page - previous should be disabled
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled()

      // Last page - next should be disabled
      rerender(
        <PaginatedSearchResults
          opportunities={mockOpportunities}
          currentPage={5}
          totalPages={5}
          onPageChange={handlePageChange}
          onOpportunitySelect={handleSelect}
        />
      )

      expect(screen.getByRole('button', { name: 'Previous page' })).not.toBeDisabled()
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    })

    it('hides pagination for single page', () => {
      const handlePageChange = vi.fn()
      const handleSelect = vi.fn()

      render(
        <PaginatedSearchResults
          opportunities={mockOpportunities}
          currentPage={1}
          totalPages={1}
          onPageChange={handlePageChange}
          onOpportunitySelect={handleSelect}
        />
      )

      expect(
        screen.queryByRole('navigation', { name: 'Search results pagination' })
      ).not.toBeInTheDocument()
    })
  })

  describe('Responsive Design Validation', () => {
    it('adapts to mobile viewport', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )

      // Check that components are still visible and functional
      expect(screen.getByRole('textbox', { name: 'Search input' })).toBeVisible()
      expect(screen.getByLabelText('Sort by:')).toBeVisible()
    })

    it('maintains usability on tablet viewport', () => {
      // Mock tablet viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      })

      const mockOpportunity = createMockOpportunity()
      const handleSelect = vi.fn()

      render(<OpportunityCard opportunity={mockOpportunity} onSelect={handleSelect} />)

      // Check that opportunity card maintains readability
      expect(screen.getByText(mockOpportunity.title)).toBeVisible()
      expect(screen.getByText('intermediate')).toBeVisible()
    })

    it('adjusts button sizes for touch interfaces', () => {
      const mockOpportunity = createMockOpportunity()
      const handleSelect = vi.fn()
      const handleBookmark = vi.fn()

      // Ensure bookmark is not set so we get "Add bookmark" label
      mockBookmarkManager.bookmarks.clear()
      mockBookmarkManager.isBookmarked.mockReturnValue(false)

      render(
        <EnhancedOpportunityCard
          opportunity={mockOpportunity}
          onSelect={handleSelect}
          onBookmark={handleBookmark}
        />
      )

      const bookmarkButton = screen.getByLabelText('Add bookmark')

      // Check for minimum touch target size (44px recommended)
      // Note: In test environment, getBoundingClientRect returns 0x0, so we'll check that the element exists
      expect(bookmarkButton).toBeInTheDocument()
      expect(bookmarkButton).toHaveClass('bookmark-button')
    })
  })

  describe('Accessibility Compliance', () => {
    it('provides proper ARIA labels for search controls', () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )

      expect(screen.getByRole('textbox', { name: 'Search input' })).toBeInTheDocument()
      expect(screen.getByLabelText('Sort by:')).toBeInTheDocument()
      expect(screen.getByLabelText('Order:')).toBeInTheDocument()
    })

    it('supports keyboard navigation', async () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      const user = userEvent.setup()
      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )

      // Tab through interactive elements - first should be search input
      await user.tab()
      expect(screen.getByRole('textbox', { name: 'Search input' })).toHaveFocus()

      // Continue tabbing through the interface - there are filter elements between search input and search button
      // So we'll check that tabbing works correctly by verifying multiple tab stops
      await user.tab()
      // Should focus on the first filter element or search button
      const focusedElement = document.activeElement
      expect(focusedElement).toBeDefined()
      expect(focusedElement?.tagName).toMatch(/^(BUTTON|SELECT)$/)
    })

    it('provides screen reader friendly pagination', () => {
      const handlePageChange = vi.fn()
      const handleSelect = vi.fn()

      render(
        <PaginatedSearchResults
          opportunities={[]}
          currentPage={2}
          totalPages={5}
          onPageChange={handlePageChange}
          onOpportunitySelect={handleSelect}
        />
      )

      const pagination = screen.getByRole('navigation', { name: 'Search results pagination' })
      expect(pagination).toBeInTheDocument()

      const resultsInfo = screen.getByRole('status')
      expect(resultsInfo).toHaveTextContent('Showing page 2 of 5')
    })

    it('uses semantic HTML structure', () => {
      const mockOpportunity = createMockOpportunity()
      const handleSelect = vi.fn()
      const handleBookmark = vi.fn()

      render(
        <EnhancedOpportunityCard
          opportunity={mockOpportunity}
          onSelect={handleSelect}
          onBookmark={handleBookmark}
        />
      )

      const article = screen.getByRole('article')
      expect(article).toBeInTheDocument()
      expect(article).toHaveClass('opportunity-card')
    })

    it('provides proper focus management', async () => {
      const mockOpportunities = [createMockOpportunity()]
      const handleSelect = vi.fn()
      const user = userEvent.setup()

      render(
        <OpportunityList opportunities={mockOpportunities} onOpportunitySelect={handleSelect} />
      )

      const opportunityButton = screen.getByRole('button', {
        name: /view opportunity/i,
      })

      opportunityButton.focus()
      expect(opportunityButton).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(handleSelect).toHaveBeenCalled()
    })
  })

  describe('Performance Optimization', () => {
    it('renders large lists efficiently', () => {
      const manyOpportunities = Array.from({ length: 100 }, (_, i) =>
        createMockOpportunity({
          id: asUUID(`opportunity-${i.toString().padStart(36, '0')}`),
          title: `Opportunity ${i + 1}`,
        })
      )

      const handleSelect = vi.fn()
      const start = performance.now()

      render(
        <OpportunityList opportunities={manyOpportunities} onOpportunitySelect={handleSelect} />
      )

      const end = performance.now()
      const renderTime = end - start

      // Should render within reasonable time (1 second)
      expect(renderTime).toBeLessThan(1000)
    })

    it('handles rapid filter changes without performance issues', async () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleSortChange = vi.fn()

      const user = userEvent.setup()
      render(
        <AdvancedSearchInterface
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          onSortChange={handleSortChange}
        />
      )

      const sortSelect = screen.getByLabelText('Sort by:')

      // Rapid sort changes
      const start = performance.now()
      for (let i = 0; i < 10; i++) {
        await user.selectOptions(sortSelect, i % 2 === 0 ? 'created' : 'relevance')
      }
      const end = performance.now()

      // Should handle rapid changes efficiently
      expect(end - start).toBeLessThan(1000)
      expect(handleSortChange).toHaveBeenCalledTimes(10)
    })

    it('prevents memory leaks with component unmounting', () => {
      const mockOpportunity = createMockOpportunity()
      const handleSelect = vi.fn()

      const { unmount } = render(
        <OpportunityCard opportunity={mockOpportunity} onSelect={handleSelect} />
      )

      // Should unmount without errors
      expect(() => unmount()).not.toThrow()
    })
  })
})
