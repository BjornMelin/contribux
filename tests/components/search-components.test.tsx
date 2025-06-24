/**
 * Search Components Test Suite
 * Tests for critical search-related UI components
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import '@testing-library/jest-dom'

// Create isolated render helper
function renderIsolated(component: React.ReactElement) {
  // Create a fresh container for this render
  const testContainer = document.createElement('div')
  testContainer.id = `test-container-${Date.now()}-${Math.random()}`
  document.body.appendChild(testContainer)

  const result = render(component, { container: testContainer })

  // Return enhanced result with scoped queries
  return {
    ...result,
    // Override queries to be scoped to this container
    getByRole: (role: string, options?: any) => within(testContainer).getByRole(role, options),
    getByText: (text: string | RegExp, options?: any) =>
      within(testContainer).getByText(text, options),
    getByTestId: (testId: string, options?: any) =>
      within(testContainer).getByTestId(testId, options),
    getByPlaceholderText: (text: string, options?: any) =>
      within(testContainer).getByPlaceholderText(text, options),
    getByDisplayValue: (value: string, options?: any) =>
      within(testContainer).getByDisplayValue(value, options),
    getAllByRole: (role: string, options?: any) =>
      within(testContainer).getAllByRole(role, options),
    getAllByText: (text: string | RegExp, options?: any) =>
      within(testContainer).getAllByText(text, options),
    queryByText: (text: string | RegExp, options?: any) =>
      within(testContainer).queryByText(text, options),
    queryByRole: (role: string, options?: any) => within(testContainer).queryByRole(role, options),
    container: testContainer,
  }
}

// Mock Next.js router
const mockPush = vi.fn()
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
    toString: vi.fn().mockReturnValue(''),
  }),
  usePathname: () => '/search',
}))

// React hooks are not mocked for component tests - use real React behavior

// Import actual components (rename SearchFilters component to avoid name conflict)
import {
  OpportunityCard,
  OpportunityList,
  SearchBar,
  SearchFilters as SearchFiltersComponent,
} from '@/components/features'
// Import types and schemas
import {
  type Opportunity,
  OpportunitySchema,
  type SearchFilters,
  SearchFiltersSchema,
} from '@/types/search'

// Use real React for component definitions - imported at the top

describe('Search Components', () => {
  // Use container approach for better test isolation
  let container: HTMLElement

  beforeEach(() => {
    // Create a fresh container for each test
    cleanup()
    document.body.innerHTML = ''
    container = document.createElement('div')
    container.id = 'test-container'
    document.body.appendChild(container)

    vi.clearAllMocks()
    mockPush.mockClear()
    mockReplace.mockClear()
  })

  afterEach(() => {
    // Remove the container completely
    cleanup()
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
    document.body.innerHTML = ''
  })

  describe('SearchBar', () => {
    it('should render with default props', () => {
      const onSearch = vi.fn()
      const { getByRole, getByPlaceholderText } = renderIsolated(<SearchBar onSearch={onSearch} />)

      expect(getByRole('textbox', { name: 'Search input' })).toBeInTheDocument()
      expect(getByRole('button', { name: 'Search' })).toBeInTheDocument()
      expect(getByPlaceholderText('Search opportunities...')).toBeInTheDocument()
    })

    it('should call onSearch when form is submitted', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: 'Search input' })
      const button = getByRole('button', { name: 'Search' })

      await user.type(input, 'TypeScript')
      await user.click(button)

      // Wait for the onSearch to be called
      await vi.waitFor(() => {
        expect(onSearch).toHaveBeenCalledWith('TypeScript')
      })
    })

    it('should call onSearch when Enter is pressed', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: 'Search input' })

      await user.type(input, 'React{Enter}')

      await vi.waitFor(() => {
        expect(onSearch).toHaveBeenCalledWith('React')
      })
    })

    it('should disable input and button when loading', () => {
      const onSearch = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getByDisplayValue, container } =
        renderIsolated(<SearchBar onSearch={onSearch} loading={true} />)

      expect(getByRole('textbox', { name: 'Search input' })).toBeDisabled()
      expect(getByRole('button', { name: 'Search' })).toBeDisabled()
      expect(getByText('Searching...')).toBeInTheDocument()
    })

    it('should disable search button when query is empty', () => {
      const onSearch = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getByDisplayValue, container } =
        renderIsolated(<SearchBar onSearch={onSearch} />)

      expect(getByRole('button', { name: 'Search' })).toBeDisabled()
    })

    it('should show default value', () => {
      const onSearch = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getByDisplayValue, container } =
        renderIsolated(<SearchBar onSearch={onSearch} defaultValue="initial query" />)

      expect(getByDisplayValue('initial query')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const onSearch = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getByDisplayValue, container } =
        renderIsolated(<SearchBar onSearch={onSearch} className="custom-search" />)

      expect(document.querySelector('.search-bar.custom-search')).toBeInTheDocument()
    })
  })

  describe('SearchFilters', () => {
    const defaultFilters: SearchFilters = {
      query: '',
      difficulty: '',
      type: '',
      languages: [],
      good_first_issue: false,
      help_wanted: false,
      min_score: 0,
    }

    it('should render all filter controls', () => {
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        )

      expect(container.querySelector('#difficulty-select')).toBeInTheDocument()
      expect(container.querySelector('#type-select')).toBeInTheDocument()
      expect(getByRole('checkbox', { name: /good first issue/i })).toBeInTheDocument()
      expect(getByRole('checkbox', { name: /help wanted/i })).toBeInTheDocument()
      expect(getByRole('slider', { name: /minimum relevance score/i })).toBeInTheDocument()
      expect(getByRole('button', { name: /reset filters/i })).toBeInTheDocument()
    })

    it('should display current filter values', () => {
      const filters: SearchFilters = {
        ...defaultFilters,
        difficulty: 'intermediate',
        type: 'bug_fix',
        languages: ['TypeScript', 'Python'],
        good_first_issue: true,
        min_score: 0.5,
      }

      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={filters} onFiltersChange={onFiltersChange} />
        )

      // Check that the correct options are selected by finding the select elements and checking their values
      const difficultySelect = container.querySelector('#difficulty-select') as HTMLSelectElement
      const typeSelect = container.querySelector('#type-select') as HTMLSelectElement
      expect(difficultySelect.value).toBe('intermediate')
      expect(typeSelect.value).toBe('bug_fix')
      expect(getByRole('checkbox', { name: /typescript/i })).toBeChecked()
      expect(getByRole('checkbox', { name: /python/i })).toBeChecked()
      expect(getByRole('checkbox', { name: /good first issue/i })).toBeChecked()
      expect(getByText('Minimum Relevance Score: 0.50')).toBeInTheDocument()
    })

    it('should call onFiltersChange when difficulty changes', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        )

      const difficultySelect = container.querySelector('#difficulty-select') as HTMLSelectElement
      expect(difficultySelect).toBeInTheDocument()

      await user.selectOptions(difficultySelect, 'advanced')

      // Wait for the event to be processed
      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          difficulty: 'advanced',
        })
      })
    })

    it('should call onFiltersChange when type changes', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        )

      const typeSelect = container.querySelector('#type-select') as HTMLSelectElement
      expect(typeSelect).toBeInTheDocument()

      await user.selectOptions(typeSelect, 'feature')

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          type: 'feature',
        })
      })
    })

    it('should toggle languages correctly', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        )

      const typescriptCheckbox = getByRole('checkbox', { name: /typescript/i })
      await user.click(typescriptCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          languages: ['TypeScript'],
        })
      })
    })

    it('should remove languages correctly', async () => {
      const user = userEvent.setup()
      const filtersWithLang = { ...defaultFilters, languages: ['TypeScript', 'Python'] }
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={filtersWithLang} onFiltersChange={onFiltersChange} />
        )

      const pythonCheckbox = getByRole('checkbox', { name: /python/i })
      await user.click(pythonCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filtersWithLang,
          languages: ['TypeScript'],
        })
      })
    })

    it('should update boolean filters', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        )

      const gfiCheckbox = getByRole('checkbox', { name: /good first issue/i })
      await user.click(gfiCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          good_first_issue: true,
        })
      })
    })

    it('should update minimum score slider', async () => {
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        )

      const slider = getByRole('slider', { name: /minimum relevance score/i })
      fireEvent.change(slider, { target: { value: '0.7' } })

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        min_score: 0.7,
      })
    })

    it('should reset all filters', async () => {
      const filtersWithValues: SearchFilters = {
        query: 'test',
        difficulty: 'advanced',
        type: 'feature',
        languages: ['TypeScript'],
        good_first_issue: true,
        help_wanted: true,
        min_score: 0.8,
      }

      const onFiltersChange = vi.fn()
      const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } =
        renderIsolated(
          <SearchFiltersComponent filters={filtersWithValues} onFiltersChange={onFiltersChange} />
        )

      const resetButton = getByRole('button', { name: /reset filters/i })
      const user2 = userEvent.setup()
      await user2.click(resetButton)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith(defaultFilters)
      })
    })

    it('should disable all controls when loading', () => {
      const onFiltersChange = vi.fn()
      const { getByRole, container } = renderIsolated(
        <SearchFiltersComponent
          filters={defaultFilters}
          onFiltersChange={onFiltersChange}
          loading={true}
        />
      )

      expect(container.querySelector('#difficulty-select')).toBeDisabled()
      expect(container.querySelector('#type-select')).toBeDisabled()
      expect(getByRole('checkbox', { name: /typescript/i })).toBeDisabled()
      expect(getByRole('checkbox', { name: /good first issue/i })).toBeDisabled()
      expect(getByRole('slider', { name: /minimum relevance score/i })).toBeDisabled()
      expect(getByRole('button', { name: /reset filters/i })).toBeDisabled()
    })
  })

  describe('OpportunityCard', () => {
    const mockOpportunity: Opportunity = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Fix TypeScript type errors in search module',
      description:
        'Several type errors need to be fixed in the search functionality to improve type safety',
      type: 'bug_fix',
      difficulty: 'intermediate',
      required_skills: ['TypeScript', 'debugging'],
      technologies: ['TypeScript', 'Node.js', 'Jest', 'ESLint'],
      good_first_issue: false,
      help_wanted: true,
      estimated_hours: 4,
      relevance_score: 0.95,
      repository: {
        name: 'search-engine',
        full_name: 'company/search-engine',
        language: 'TypeScript',
        stars_count: 1250,
      },
    }

    it('should render opportunity information correctly', () => {
      const onSelect = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Fix TypeScript type errors in search module')).toBeInTheDocument()
      expect(getByText(/Several type errors need to be fixed/)).toBeInTheDocument()
      expect(getByText('intermediate')).toBeInTheDocument()
      expect(getByText('bug fix')).toBeInTheDocument()
      expect(getByText('company/search-engine')).toBeInTheDocument()
      // Check for TypeScript in repository language section
      const repositoryLanguageElements = Array.from(container.querySelectorAll('*')).filter(
        el => el.textContent?.includes('TypeScript') && el.closest('.repository-language')
      )
      expect(repositoryLanguageElements.length).toBeGreaterThan(0)
      expect(getByText('⭐ 1250')).toBeInTheDocument()
      expect(getByText('Help Wanted')).toBeInTheDocument()
      expect(getByText('4h')).toBeInTheDocument()
      expect(getByText('95%')).toBeInTheDocument()
    })

    it('should truncate long descriptions', () => {
      const longOpportunity = {
        ...mockOpportunity,
        description:
          'This is a very long description that should be truncated when it exceeds the character limit set for the opportunity card display to ensure proper layout',
      }

      const onSelect = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <OpportunityCard opportunity={longOpportunity} onSelect={onSelect} />
      )

      // Check that the text is truncated with "..." at the end
      expect(
        getByText(
          /This is a very long description that should be truncated when it exceeds the character limit set for the opportunity card display to ensure proper lay\.\.\./
        )
      ).toBeInTheDocument()
    })

    it('should call onSelect when clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })
      await user.click(card)

      expect(onSelect).toHaveBeenCalledWith(mockOpportunity)
    })

    it('should call onSelect when Enter or Space is pressed', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      card.focus()
      await user.keyboard('{Enter}')
      expect(onSelect).toHaveBeenCalledWith(mockOpportunity)

      await user.keyboard(' ')
      expect(onSelect).toHaveBeenCalledTimes(2)
    })

    it('should show good first issue tag when applicable', () => {
      const gfiOpportunity = { ...mockOpportunity, good_first_issue: true }
      const onSelect = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <OpportunityCard opportunity={gfiOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Good First Issue')).toBeInTheDocument()
    })

    it('should limit displayed technologies and show more indicator', () => {
      const onSelect = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />
      )

      // Check for TypeScript in skill tags section (not repository language)
      const skillTagElements = Array.from(container.querySelectorAll('*')).filter(
        el => el.textContent?.includes('TypeScript') && el.closest('.skill-tag')
      )
      expect(skillTagElements.length).toBeGreaterThan(0)
      expect(getByText('Node.js')).toBeInTheDocument()
      expect(getByText('Jest')).toBeInTheDocument()
      expect(getByText('+1 more')).toBeInTheDocument()
    })

    it('should handle missing optional fields gracefully', () => {
      const minimalOpportunity: Opportunity = {
        ...mockOpportunity,
        description: null,
        estimated_hours: null,
        repository: {
          ...mockOpportunity.repository,
          language: null,
        },
      }

      const onSelect = vi.fn()
      const { getByRole, getByText, queryByText, container } = renderIsolated(
        <OpportunityCard opportunity={minimalOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Fix TypeScript type errors in search module')).toBeInTheDocument()
      expect(queryByText('4h')).not.toBeInTheDocument()
    })
  })

  describe('OpportunityList', () => {
    const mockOpportunities: Opportunity[] = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Fix TypeScript errors',
        description: 'Fix type errors in search module',
        type: 'bug_fix',
        difficulty: 'intermediate',
        required_skills: ['TypeScript'],
        technologies: ['TypeScript'],
        good_first_issue: false,
        help_wanted: true,
        estimated_hours: 4,
        relevance_score: 0.95,
        repository: {
          name: 'search-engine',
          full_name: 'company/search-engine',
          language: 'TypeScript',
          stars_count: 1250,
        },
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Add new feature',
        description: 'Implement new search capability',
        type: 'feature',
        difficulty: 'advanced',
        required_skills: ['Python'],
        technologies: ['Python'],
        good_first_issue: false,
        help_wanted: false,
        estimated_hours: 8,
        relevance_score: 0.78,
        repository: {
          name: 'ml-platform',
          full_name: 'company/ml-platform',
          language: 'Python',
          stars_count: 890,
        },
      },
    ]

    it('should render list of opportunities', () => {
      const onOpportunitySelect = vi.fn()
      const { getAllByRole, getByText } = renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(screen.getByTestId('opportunity-list')).toBeInTheDocument()
      expect(getAllByRole('button')).toHaveLength(2)
      expect(getByText('Fix TypeScript errors')).toBeInTheDocument()
      expect(getByText('Add new feature')).toBeInTheDocument()
    })

    it('should show loading state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          loading={true}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(getByText('Loading opportunities...')).toBeInTheDocument()
      // Check for aria-live region instead of status role
      const loadingDiv = getByText('Loading opportunities...').closest('[aria-live]')
      expect(loadingDiv).toHaveAttribute('aria-live', 'polite')
    })

    it('should show error state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByRole, getByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          error="Failed to load data"
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(getByRole('alert')).toBeInTheDocument()
      expect(getByText('Error loading opportunities: Failed to load data')).toBeInTheDocument()
      expect(getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    it('should show empty state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByRole, getByText, getAllByRole, container } = renderIsolated(
        <OpportunityList opportunities={[]} onOpportunitySelect={onOpportunitySelect} />
      )

      expect(getByText('No opportunities found')).toBeInTheDocument()
    })

    it('should show custom empty message', () => {
      const onOpportunitySelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          onOpportunitySelect={onOpportunitySelect}
          emptyMessage="Try adjusting your search filters"
        />
      )

      expect(getByText('Try adjusting your search filters')).toBeInTheDocument()
    })

    it('should call onOpportunitySelect when opportunity is clicked', async () => {
      const user = userEvent.setup()
      const onOpportunitySelect = vi.fn()
      render(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const firstOpportunity = screen.getByTestId(`opportunity-${mockOpportunities[0].id}`)
      await user.click(firstOpportunity)

      expect(onOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
    })

    it('should prioritize error over loading state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByRole, queryByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          loading={true}
          error="Something went wrong"
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(getByRole('alert')).toBeInTheDocument()
      expect(queryByText('Loading opportunities...')).not.toBeInTheDocument()
    })
  })

  describe('Component Integration', () => {
    it('should validate opportunity schema', () => {
      const validOpportunity = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Test Opportunity',
        description: 'Test description',
        type: 'bug_fix',
        difficulty: 'intermediate',
        required_skills: ['TypeScript'],
        technologies: ['TypeScript', 'React'],
        good_first_issue: true,
        help_wanted: false,
        estimated_hours: 5,
        relevance_score: 0.85,
        repository: {
          name: 'test-repo',
          full_name: 'org/test-repo',
          language: 'TypeScript',
          stars_count: 100,
        },
      }

      expect(() => OpportunitySchema.parse(validOpportunity)).not.toThrow()
    })

    it('should validate search filters schema', () => {
      const validFilters = {
        query: 'TypeScript',
        difficulty: 'intermediate',
        type: 'bug_fix',
        languages: ['TypeScript', 'Python'],
        good_first_issue: true,
        help_wanted: false,
        min_score: 0.5,
      }

      expect(() => SearchFiltersSchema.parse(validFilters)).not.toThrow()
    })

    it('should handle search flow integration', async () => {
      const user = userEvent.setup()
      const handleSearch = vi.fn()
      const handleFiltersChange = vi.fn()
      const handleOpportunitySelect = vi.fn()

      const filters: SearchFilters = {
        query: '',
        difficulty: '',
        type: '',
        languages: [],
        good_first_issue: false,
        help_wanted: false,
        min_score: 0,
      }

      const { getByRole, container } = renderIsolated(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />
          <OpportunityList opportunities={[]} onOpportunitySelect={handleOpportunitySelect} />
        </div>
      )

      // Test search interaction
      const searchInput = getByRole('textbox', { name: 'Search input' })
      await user.type(searchInput, 'React')
      await user.keyboard('{Enter}')

      expect(handleSearch).toHaveBeenCalledWith('React')

      // Test filter interaction
      const difficultySelect = container.querySelector('#difficulty-select') as HTMLSelectElement
      await user.selectOptions(difficultySelect, 'beginner')

      expect(handleFiltersChange).toHaveBeenCalledWith({
        ...filters,
        difficulty: 'beginner',
      })
    })
  })
})
