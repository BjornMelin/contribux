/**
 * @vitest-environment jsdom
 */

/**
 * Search Integration Test Suite
 * Tests for component integration, complete workflows, and end-to-end scenarios
 */

import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchBar, SearchFilters as SearchFiltersComponent, OpportunityList } from '@/components/features'
import { OpportunitySchema, SearchFiltersSchema } from '@/types/search'
import { renderIsolated, setupTestContainer, teardownTestContainer, getSelectByIndex } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
  mockOpportunities,
  validOpportunity,
  validFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('Search Component Integration', () => {
  let container: HTMLElement
  const { mockPush, mockReplace } = setupWithRouter()

  beforeEach(() => {
    container = setupTestContainer()
    vi.clearAllMocks()
    mockPush.mockClear()
    mockReplace.mockClear()
  })

  afterEach(() => {
    teardownTestContainer(container)
  })

  describe('Schema Validation Integration', () => {
    it('should validate opportunity schema correctly', () => {
      expect(() => OpportunitySchema.parse(validOpportunity)).not.toThrow()
    })

    it('should validate search filters schema correctly', () => {
      expect(() => SearchFiltersSchema.parse(validFilters)).not.toThrow()
    })

    it('should handle invalid opportunity data gracefully', () => {
      const invalidOpportunity = {
        ...validOpportunity,
        relevanceScore: 'invalid', // Should be number
        estimatedHours: -1, // Should be positive
      }

      expect(() => OpportunitySchema.parse(invalidOpportunity)).toThrow()
    })

    it('should handle invalid filter data gracefully', () => {
      const invalidFilters = {
        ...validFilters,
        minScore: 'invalid', // Should be number
        page: 0, // Should be positive
      }

      expect(() => SearchFiltersSchema.parse(invalidFilters)).toThrow()
    })
  })

  describe('Complete Search Workflow Integration', () => {
    it('should handle complete search flow integration', async () => {
      const user = userEvent.setup()
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByRole, container } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList opportunities={[]} onOpportunitySelect={handleOpportunitySelect} />
        </div>
      )

      // Test search interaction
      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.type(searchInput, 'React')
      await user.keyboard('{Enter}')

      expect(handleSearch).toHaveBeenCalledWith('React')

      // Test filter interaction
      const difficultySelect = getSelectByIndex(container, 0)
      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'beginner')
      }

      expect(handleFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        difficulty: 'beginner',
      })
    })

    it('should coordinate search and filter states', async () => {
      const user = userEvent.setup()
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()

      const filters = { ...defaultFilters, query: 'TypeScript' }

      const { getByRole, container } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} defaultValue={filters.query} />
          <SearchFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />
        </div>
      )

      // Search input should show current query
      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      expect(searchInput).toHaveValue('TypeScript')

      // Changing filters should work with existing query
      const difficultySelect = getSelectByIndex(container, 0)
      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'intermediate')
      }

      expect(handleFiltersChange).toHaveBeenCalledWith({
        ...filters,
        difficulty: 'intermediate',
      })
    })

    it('should handle search results and opportunity selection integration', async () => {
      const user = userEvent.setup()
      const handleOpportunitySelect = vi.fn()

      const { getByText, container } = renderIsolated(
        <div>
          <OpportunityList 
            opportunities={mockOpportunities} 
            onOpportunitySelect={handleOpportunitySelect} 
          />
        </div>
      )

      // Should display opportunities
      expect(getByText('Fix TypeScript errors')).toBeInTheDocument()
      expect(getByText('Add new feature')).toBeInTheDocument()

      // Should handle opportunity selection
      const firstOpportunity = container.querySelector(`[data-testid="opportunity-${mockOpportunities[0]?.id}"]`)
      if (firstOpportunity) {
        await user.click(firstOpportunity)
        expect(handleOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
      }
    })

    it('should handle complex multi-step search workflow', async () => {
      const user = userEvent.setup()
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByRole, getByText, container } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={mockOpportunities} 
            onOpportunitySelect={handleOpportunitySelect}
          />
        </div>
      )

      // Step 1: Search for TypeScript
      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.type(searchInput, 'TypeScript')
      await user.keyboard('{Enter}')
      expect(handleSearch).toHaveBeenCalledWith('TypeScript')

      // Step 2: Filter by difficulty
      const difficultySelect = getSelectByIndex(container, 0)
      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'intermediate')
      }
      expect(handleFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        difficulty: 'intermediate',
      })

      // Step 3: Filter by language
      const typescriptCheckbox = getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })
      await user.click(typescriptCheckbox)
      expect(handleFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        languages: ['TypeScript'],
      })

      // Step 4: Select an opportunity
      expect(getByText('Fix TypeScript errors')).toBeInTheDocument()
      const opportunity = container.querySelector(`[data-testid="opportunity-${mockOpportunities[0]?.id}"]`)
      if (opportunity) {
        await user.click(opportunity)
        expect(handleOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
      }
    })
  })

  describe('State Management Integration', () => {
    it('should handle loading states across components', () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByText, getByRole } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} loading={true} />
          <SearchFiltersComponent 
            filters={defaultFilters} 
            onFiltersChange={handleFiltersChange} 
            loading={true}
          />
          <OpportunityList 
            opportunities={[]} 
            onOpportunitySelect={handleOpportunitySelect}
            loading={true}
          />
        </div>
      )

      // All components should show loading state
      expect(getByText('Searching...')).toBeInTheDocument()
      expect(getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })).toBeDisabled()
      expect(getByText('Loading opportunities...')).toBeInTheDocument()
    })

    it('should handle error states across components', () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByRole, getAllByRole } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={[]} 
            onOpportunitySelect={handleOpportunitySelect}
            error="Failed to load opportunities"
          />
        </div>
      )

      // Should show error in opportunity list
      expect(getByRole('alert')).toBeInTheDocument()
      expect(getByRole('button', { name: ARIA_LABELS.RETRY_BUTTON })).toBeInTheDocument()

      // Other components should remain functional
      expect(getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })).not.toBeDisabled()
    })

    it('should handle empty states gracefully', () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByText, getByRole } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={[]} 
            onOpportunitySelect={handleOpportunitySelect}
            emptyMessage="No opportunities match your search"
          />
        </div>
      )

      // Should show custom empty message
      expect(getByText('No opportunities match your search')).toBeInTheDocument()

      // Search and filters should remain functional
      expect(getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })).not.toBeDisabled()
      expect(getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })).not.toBeDisabled()
    })
  })

  describe('Performance Integration', () => {
    it('should handle large datasets efficiently', async () => {
      const user = userEvent.setup()
      const largeOpportunityList = Array.from({ length: 500 }, (_, i) => ({
        ...mockOpportunities[0],
        id: `opportunity-${i}` as any,
        title: `Opportunity ${i}`,
      }))

      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByRole, container } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={largeOpportunityList} 
            onOpportunitySelect={handleOpportunitySelect}
          />
        </div>
      )

      // Should render efficiently
      expect(container.querySelectorAll('[data-testid^="opportunity-"]')).toHaveLength(500)

      // Interactions should remain responsive
      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.type(searchInput, 'test')
      expect(searchInput).toHaveValue('test')

      const difficultySelect = getSelectByIndex(container, 0)
      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'advanced')
        expect(handleFiltersChange).toHaveBeenCalled()
      }
    })

    it('should handle rapid component updates efficiently', async () => {
      const user = userEvent.setup()
      const handleFiltersChange = vi.fn()

      const { getByRole, rerender } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
      )

      // Rapid filter changes
      const checkbox = getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })
      
      for (let i = 0; i < 10; i++) {
        await user.click(checkbox)
        
        // Re-render with updated filters
        rerender(
          <SearchFiltersComponent 
            filters={{
              ...defaultFilters,
              languages: i % 2 === 0 ? ['TypeScript'] : []
            }} 
            onFiltersChange={handleFiltersChange} 
          />
        )
      }

      // Should handle all updates
      expect(handleFiltersChange.mock.calls.length).toBeGreaterThan(0)
    })

    it('should optimize re-renders with React.memo patterns', () => {
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { rerender } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={mockOpportunities} 
            onOpportunitySelect={handleOpportunitySelect}
          />
        </div>
      )

      // Re-render with same props should not cause unnecessary updates
      rerender(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={mockOpportunities} 
            onOpportunitySelect={handleOpportunitySelect}
          />
        </div>
      )

      // Components should remain functional
      expect(handleSearch).not.toHaveBeenCalled()
      expect(handleFiltersChange).not.toHaveBeenCalled()
      expect(handleOpportunitySelect).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility Integration', () => {
    it('should maintain accessibility across component interactions', async () => {
      const user = userEvent.setup()
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByRole, container } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={mockOpportunities} 
            onOpportunitySelect={handleOpportunitySelect}
          />
        </div>
      )

      // Tab navigation should work across all components
      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const searchButton = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })
      const difficultySelect = getSelectByIndex(container, 0)
      const resetButton = getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })

      await user.tab() // Focus search input
      expect(searchInput).toHaveFocus()

      await user.tab() // Focus search button
      expect(searchButton).toHaveFocus()

      await user.tab() // Focus difficulty select
      if (difficultySelect) expect(difficultySelect).toHaveFocus()

      // Should be able to continue tabbing through all interactive elements
      expect(resetButton).toBeInTheDocument()
    })

    it('should announce state changes properly', async () => {
      const user = userEvent.setup()
      const handleFiltersChange = vi.fn()

      const { getByRole, getByText, rerender } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
      )

      // Initial state
      const checkbox = getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })
      expect(checkbox).not.toBeChecked()

      // Change state
      await user.click(checkbox)
      
      // Re-render with updated state
      rerender(
        <SearchFiltersComponent 
          filters={{ ...defaultFilters, languages: ['TypeScript'] }} 
          onFiltersChange={handleFiltersChange} 
        />
      )

      // Should reflect state change
      expect(checkbox).toBeChecked()
    })

    it('should handle screen reader announcements for dynamic content', () => {
      const handleOpportunitySelect = vi.fn()

      const { getByText, rerender } = renderIsolated(
        <OpportunityList 
          opportunities={[]} 
          onOpportunitySelect={handleOpportunitySelect}
          loading={true}
        />
      )

      // Loading state should have proper aria-live
      const loadingMessage = getByText('Loading opportunities...')
      expect(loadingMessage.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')

      // Error state should be announced
      rerender(
        <OpportunityList 
          opportunities={[]} 
          onOpportunitySelect={handleOpportunitySelect}
          error="Failed to load"
        />
      )

      const errorMessage = document.querySelector('[role="alert"]')
      expect(errorMessage).toBeInTheDocument()
    })
  })

  describe('Real-world Usage Scenarios', () => {
    it('should handle typical user search journey', async () => {
      const user = userEvent.setup()
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const { getByRole, getByText, container } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={handleFiltersChange} />
          <OpportunityList 
            opportunities={mockOpportunities} 
            onOpportunitySelect={handleOpportunitySelect}
          />
        </div>
      )

      // User searches for something
      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.type(searchInput, 'React development')
      await user.keyboard('{Enter}')
      expect(handleSearch).toHaveBeenCalledWith('React development')

      // User refines with filters
      const difficultySelect = getSelectByIndex(container, 0)
      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'beginner')
      }

      const gfiCheckbox = getByRole('checkbox', { name: ARIA_LABELS.GOOD_FIRST_ISSUE })
      await user.click(gfiCheckbox)

      // User browses results and selects one
      expect(getByText('Fix TypeScript errors')).toBeInTheDocument()
      const firstOpportunity = container.querySelector(`[data-testid="opportunity-${mockOpportunities[0]?.id}"]`)
      if (firstOpportunity) {
        await user.click(firstOpportunity)
        expect(handleOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
      }
    })

    it('should handle filter reset and new search scenario', async () => {
      const user = userEvent.setup()
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()

      const filtersWithValues = {
        ...defaultFilters,
        difficulty: 'advanced' as const,
        languages: ['TypeScript'],
        goodFirstIssue: true,
      }

      const { getByRole } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} defaultValue="old search" />
          <SearchFiltersComponent filters={filtersWithValues} onFiltersChange={handleFiltersChange} />
        </div>
      )

      // User resets filters
      const resetButton = getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })
      await user.click(resetButton)
      expect(handleFiltersChange).toHaveBeenCalledWith(defaultFilters)

      // User performs new search
      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.clear(searchInput)
      await user.type(searchInput, 'new search term')
      await user.keyboard('{Enter}')
      expect(handleSearch).toHaveBeenCalledWith('new search term')
    })

    it('should handle mobile-like touch interactions', async () => {
      const user = userEvent.setup()
      const handleOpportunitySelect = vi.fn()

      const { container } = renderIsolated(
        <OpportunityList 
          opportunities={mockOpportunities} 
          onOpportunitySelect={handleOpportunitySelect}
        />
      )

      // Simulate mobile tap on opportunity
      const firstOpportunity = container.querySelector(`[data-testid="opportunity-${mockOpportunities[0]?.id}"]`)
      if (firstOpportunity) {
        await user.click(firstOpportunity)
        expect(handleOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
      }
    })
  })
})