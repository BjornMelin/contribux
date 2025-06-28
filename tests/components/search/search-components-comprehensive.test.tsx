/**
 * @vitest-environment jsdom
 */

/**
 * Comprehensive Search Components Test Suite
 * Tests all search-related components with realistic user scenarios
 */

import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OpportunityCard } from '@/components/features/OpportunityCard'
import { OpportunityList } from '@/components/features/OpportunityList'
import { SearchBar } from '@/components/features/SearchBar'
import { SearchFilters } from '@/components/features/SearchFilters'
import {
  goodFirstIssueOpportunity,
  longDescriptionOpportunity,
  minimalOpportunity,
  mockOpportunities,
  sharedMockOpportunity,
} from './fixtures/search-component-data'
import {
  createDefaultFilters,
  renderIsolated,
  setupTestContainer,
  teardownTestContainer,
} from './utils/search-test-helpers'

describe('Search Components - Comprehensive Suite', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = setupTestContainer()
    vi.clearAllMocks()
  })

  afterEach(() => {
    teardownTestContainer(container)
  })

  describe('SearchBar Component', () => {
    describe('Basic Functionality', () => {
      it('renders with default placeholder text', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        expect(input).toHaveAttribute('placeholder', 'Search opportunities...')
      })

      it('renders with custom placeholder text', () => {
        const onSearch = vi.fn()
        renderIsolated(
          <SearchBar onSearch={onSearch} placeholder="Find your next contribution..." />
        )

        const input = screen.getByPlaceholderText('Find your next contribution...')
        expect(input).toBeInTheDocument()
      })

      it('displays default value when provided', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} defaultValue="typescript bug" />)

        const input = screen.getByDisplayValue('typescript bug')
        expect(input).toBeInTheDocument()
      })
    })

    describe('User Interactions', () => {
      it('calls onSearch when form is submitted', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const submitButton = screen.getByRole('button', { name: /search/i })

        await user.type(input, 'react hooks')
        await user.click(submitButton)

        expect(onSearch).toHaveBeenCalledWith('react hooks')
      })

      it('calls onSearch when Enter key is pressed', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })

        await user.type(input, 'vue components')
        await user.keyboard('{Enter}')

        expect(onSearch).toHaveBeenCalledWith('vue components')
      })

      it('disables submit button when query is empty', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const submitButton = screen.getByRole('button', { name: /search/i })
        expect(submitButton).toBeDisabled()
      })

      it('enables submit button when query has content', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const submitButton = screen.getByRole('button', { name: /search/i })

        await user.type(input, 'test')

        expect(submitButton).not.toBeDisabled()
      })
    })

    describe('Loading States', () => {
      it('shows loading state correctly', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} loading={true} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const submitButton = screen.getByRole('button', { name: /searching\.\.\./i })

        expect(input).toBeDisabled()
        expect(submitButton).toBeDisabled()
        expect(submitButton).toHaveTextContent('Searching...')
      })

      it('shows normal state when not loading', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} loading={false} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const submitButton = screen.getByRole('button', { name: /search/i })

        expect(input).not.toBeDisabled()
        expect(submitButton).toHaveTextContent('Search')
      })
    })
  })

  describe('SearchFilters Component', () => {
    describe('Basic Rendering', () => {
      it('renders all filter sections', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        expect(screen.getByLabelText(/difficulty/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
        expect(screen.getByText(/languages/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/good first issue/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/help wanted/i)).toBeInTheDocument()
        expect(screen.getByText(/minimum relevance score/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument()
      })

      it('shows current filter values correctly', () => {
        const filters = {
          ...createDefaultFilters(),
          difficulty: 'intermediate' as const,
          type: 'feature' as const,
          languages: ['TypeScript', 'Python'],
          goodFirstIssue: true,
          helpWanted: true,
          minScore: 0.7,
        }
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        expect(screen.getByDisplayValue('intermediate')).toBeInTheDocument()
        expect(screen.getByDisplayValue('feature')).toBeInTheDocument()
        expect(screen.getByLabelText('typescript')).toBeChecked()
        expect(screen.getByLabelText('python')).toBeChecked()
        expect(screen.getByLabelText(/good first issue/i)).toBeChecked()
        expect(screen.getByLabelText(/help wanted/i)).toBeChecked()
        expect(screen.getByDisplayValue('0.7')).toBeInTheDocument()
      })
    })

    describe('Filter Interactions', () => {
      it('calls onFiltersChange when difficulty is changed', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const difficultySelect = screen.getByLabelText(/difficulty/i)
        await user.selectOptions(difficultySelect, 'advanced')

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          difficulty: 'advanced',
        })
      })

      it('calls onFiltersChange when type is changed', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const typeSelect = screen.getByLabelText(/type/i)
        await user.selectOptions(typeSelect, 'bug_fix')

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          type: 'bug_fix',
        })
      })

      it('toggles language checkboxes correctly', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const typescriptCheckbox = screen.getByLabelText('typescript')
        await user.click(typescriptCheckbox)

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          languages: ['TypeScript'],
        })
      })

      it('removes language when already selected', async () => {
        const user = userEvent.setup()
        const filters = {
          ...createDefaultFilters(),
          languages: ['TypeScript', 'Python'],
        }
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const typescriptCheckbox = screen.getByLabelText('typescript')
        await user.click(typescriptCheckbox)

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          languages: ['Python'],
        })
      })

      it('resets all filters when reset button is clicked', async () => {
        const user = userEvent.setup()
        const filters = {
          ...createDefaultFilters(),
          difficulty: 'intermediate' as const,
          languages: ['TypeScript'],
          goodFirstIssue: true,
        }
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const resetButton = screen.getByRole('button', { name: /reset filters/i })
        await user.click(resetButton)

        expect(onFiltersChange).toHaveBeenCalledWith(
          expect.objectContaining({
            query: '',
            difficulty: undefined,
            type: undefined,
            languages: [],
            goodFirstIssue: false,
            helpWanted: false,
            minScore: 0,
            maxScore: 1,
          })
        )
      })
    })

    describe('Loading and Disabled States', () => {
      it('disables all controls when loading', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(
          <SearchFilters filters={filters} onFiltersChange={onFiltersChange} loading={true} />
        )

        expect(screen.getByLabelText(/difficulty/i)).toBeDisabled()
        expect(screen.getByLabelText(/type/i)).toBeDisabled()
        expect(screen.getByLabelText('typescript')).toBeDisabled()
        expect(screen.getByLabelText(/good first issue/i)).toBeDisabled()
        expect(screen.getByRole('button', { name: /reset filters/i })).toBeDisabled()
      })
    })
  })

  describe('OpportunityCard Component', () => {
    describe('Basic Rendering', () => {
      it('displays opportunity information correctly', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        expect(screen.getByText(sharedMockOpportunity.title)).toBeInTheDocument()
        expect(screen.getByText(sharedMockOpportunity.difficulty)).toBeInTheDocument()
        expect(screen.getByText(sharedMockOpportunity.type.replace('_', ' '))).toBeInTheDocument()
        expect(screen.getByText(sharedMockOpportunity.repository.fullName)).toBeInTheDocument()
        expect(screen.getByText('⭐ 1250')).toBeInTheDocument()
      })

      it('truncates long descriptions', () => {
        const onSelect = vi.fn()
        renderIsolated(
          <OpportunityCard opportunity={longDescriptionOpportunity} onSelect={onSelect} />
        )

        const description = screen.getByText(
          /This is a very long description that should be truncated/
        )
        expect(description.textContent).toMatch(/\.\.\./)
        expect(description.textContent?.length).toBeLessThan(
          longDescriptionOpportunity.description?.length || 0
        )
      })

      it('handles opportunities without description', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={minimalOpportunity} onSelect={onSelect} />)

        expect(screen.queryByText(/description/i)).not.toBeInTheDocument()
      })

      it('displays good first issue badge when applicable', () => {
        const onSelect = vi.fn()
        renderIsolated(
          <OpportunityCard opportunity={goodFirstIssueOpportunity} onSelect={onSelect} />
        )

        expect(screen.getByText('Good First Issue')).toBeInTheDocument()
      })

      it('displays help wanted badge when applicable', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        expect(screen.getByText('Help Wanted')).toBeInTheDocument()
      })

      it('shows estimated hours when available', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        expect(screen.getByText('4h')).toBeInTheDocument()
      })

      it('displays relevance score as percentage', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        expect(screen.getByText('95%')).toBeInTheDocument()
      })
    })

    describe('Interactions', () => {
      it('calls onSelect when clicked', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button', { name: /view opportunity/i })
        await user.click(card)

        expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
      })

      it('calls onSelect when Enter key is pressed', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button', { name: /view opportunity/i })
        card.focus()
        await user.keyboard('{Enter}')

        expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
      })

      it('calls onSelect when Space key is pressed', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button', { name: /view opportunity/i })
        card.focus()
        await user.keyboard(' ')

        expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
      })
    })

    describe('Accessibility', () => {
      it('has proper ARIA labels', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button', {
          name: `View opportunity: ${sharedMockOpportunity.title}`,
        })
        expect(card).toBeInTheDocument()
      })

      it('has proper test id for testing', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByTestId(`opportunity-${sharedMockOpportunity.id}`)
        expect(card).toBeInTheDocument()
      })
    })
  })

  describe('OpportunityList Component', () => {
    describe('Content States', () => {
      it('displays list of opportunities', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={mockOpportunities}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByTestId('opportunity-list')).toBeInTheDocument()
        expect(screen.getByText('Fix TypeScript errors')).toBeInTheDocument()
        expect(screen.getByText('Add new feature')).toBeInTheDocument()
      })

      it('shows loading state', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            loading={true}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByText('Loading opportunities...')).toBeInTheDocument()
        expect(screen.getByRole('status', { name: /loading opportunities/i })).toBeInTheDocument()
      })

      it('shows empty state with default message', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList opportunities={[]} onOpportunitySelect={onOpportunitySelect} />
        )

        expect(screen.getByText('No opportunities found')).toBeInTheDocument()
      })

      it('shows empty state with custom message', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            onOpportunitySelect={onOpportunitySelect}
            emptyMessage="Try adjusting your search filters"
          />
        )

        expect(screen.getByText('Try adjusting your search filters')).toBeInTheDocument()
      })

      it('shows error state with retry button', () => {
        const onOpportunitySelect = vi.fn()
        const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {
          // Mock implementation for window.location.reload
        })

        renderIsolated(
          <OpportunityList
            opportunities={[]}
            error="Failed to load opportunities"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(
          screen.getByText(/Error loading opportunities: Failed to load opportunities/)
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

        reloadSpy.mockRestore()
      })
    })

    describe('Interactions', () => {
      it('calls onOpportunitySelect when opportunity is clicked', async () => {
        const user = userEvent.setup()
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={mockOpportunities}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const firstOpportunity = screen.getByTestId(`opportunity-${mockOpportunities[0].id}`)
        await user.click(firstOpportunity)

        expect(onOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
      })

      it('calls window.location.reload when retry button is clicked', async () => {
        const user = userEvent.setup()
        const onOpportunitySelect = vi.fn()
        const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {
          // Mock implementation for window.location.reload
        })

        renderIsolated(
          <OpportunityList
            opportunities={[]}
            error="Network error"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const retryButton = screen.getByRole('button', { name: /retry/i })
        await user.click(retryButton)

        expect(reloadSpy).toHaveBeenCalled()
        reloadSpy.mockRestore()
      })
    })

    describe('Accessibility', () => {
      it('has proper role for error state', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            error="Test error"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      it('has proper live region for loading state', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            loading={true}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const loadingElement = screen.getByText('Loading opportunities...')
        expect(loadingElement.closest('[aria-live="polite"]')).toBeInTheDocument()
      })
    })
  })

  describe('Integration Scenarios', () => {
    describe('Search Workflow', () => {
      it('handles complete search workflow', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        const onFiltersChange = vi.fn()
        const onOpportunitySelect = vi.fn()
        const filters = createDefaultFilters()

        const { unmount: unmountSearch } = renderIsolated(<SearchBar onSearch={onSearch} />)
        const { unmount: unmountFilters } = renderIsolated(
          <SearchFilters filters={filters} onFiltersChange={onFiltersChange} />
        )
        const { unmount: unmountList } = renderIsolated(
          <OpportunityList
            opportunities={mockOpportunities}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        // User types a search query
        const searchInput = screen.getByRole('textbox', { name: /search input/i })
        await user.type(searchInput, 'typescript')
        await user.keyboard('{Enter}')

        expect(onSearch).toHaveBeenCalledWith('typescript')

        // User applies filters
        const difficultySelect = screen.getByLabelText(/difficulty/i)
        await user.selectOptions(difficultySelect, 'intermediate')

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          difficulty: 'intermediate',
        })

        // User selects an opportunity
        const firstOpportunity = screen.getByTestId(`opportunity-${mockOpportunities[0].id}`)
        await user.click(firstOpportunity)

        expect(onOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])

        // Clean up
        unmountSearch()
        unmountFilters()
        unmountList()
      })
    })

    describe('Error Handling', () => {
      it('maintains component state during error recovery', async () => {
        const user = userEvent.setup()
        const onOpportunitySelect = vi.fn()
        const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {
          // Mock implementation for window.location.reload
        })

        const { rerender } = renderIsolated(
          <OpportunityList
            opportunities={[]}
            error="Network timeout"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        // Error state is displayed
        expect(screen.getByText(/Error loading opportunities: Network timeout/)).toBeInTheDocument()

        // User clicks retry
        const retryButton = screen.getByRole('button', { name: /retry/i })
        await user.click(retryButton)

        expect(reloadSpy).toHaveBeenCalled()

        // Simulate successful reload with data
        rerender(
          <OpportunityList
            opportunities={mockOpportunities}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByText('Fix TypeScript errors')).toBeInTheDocument()
        expect(screen.queryByText(/Error loading opportunities/)).not.toBeInTheDocument()

        reloadSpy.mockRestore()
      })
    })
  })
})
