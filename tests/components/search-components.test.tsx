/**
 * @vitest-environment jsdom
 */

/**
 * Search Components Test Suite
 * Tests for critical search-related UI components
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './setup'

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
    getByRole: (role: string, options?: object) => within(testContainer).getByRole(role, options),
    getByText: (text: string | RegExp, options?: object) =>
      within(testContainer).getByText(text, options),
    getByTestId: (testId: string, options?: object) =>
      within(testContainer).getByTestId(testId, options),
    getByPlaceholderText: (text: string, options?: object) =>
      within(testContainer).getByPlaceholderText(text, options),
    getByDisplayValue: (value: string, options?: object) =>
      within(testContainer).getByDisplayValue(value, options),
    getAllByRole: (role: string, options?: object) =>
      within(testContainer).getAllByRole(role, options),
    getAllByText: (text: string | RegExp, options?: object) =>
      within(testContainer).getAllByText(text, options),
    queryByText: (text: string | RegExp, options?: object) =>
      within(testContainer).queryByText(text, options),
    queryByRole: (role: string, options?: object) =>
      within(testContainer).queryByRole(role, options),
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
import type { UUID } from '@/types/base'
// Import types and schemas
import {
  type Opportunity,
  OpportunitySchema,
  type Repository,
  type SearchFilters,
  SearchFiltersSchema,
} from '@/types/search'

// Helper function to cast strings to UUID for testing
const asUUID = (str: string): UUID => str as UUID

// Helper function to create minimal Repository object for testing
const createMockRepository = (overrides: {
  name: string
  fullName: string
  language?: string | undefined
  starsCount?: number
}): Repository => ({
  // BaseEntity fields
  id: asUUID('550e8400-e29b-41d4-a716-446655440000'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),

  // Repository fields with defaults
  githubId: 12345,
  name: overrides.name,
  fullName: overrides.fullName,
  description: 'A test repository',
  language: overrides.language || 'TypeScript',
  topics: [],
  starsCount: overrides.starsCount || 100,
  forksCount: 10,
  issuesCount: 5,
  url: `https://github.com/${overrides.fullName}`,
  defaultBranch: 'main',
  lastPushedAt: new Date('2024-01-01T00:00:00Z'),
  health: {
    score: 0.8,
    status: 'good' as const,
    metrics: {
      commitFrequency: 5.0,
      issueResponseTime: 24,
      prMergeTime: 48,
      maintainerActivity: 0.8,
      communityEngagement: 0.7,
      documentationQuality: 0.9,
      codeQuality: 0.85,
      testCoverage: 0.75,
    },
    lastUpdated: new Date('2024-01-01T00:00:00Z'),
  },
  isArchived: false,
  isFork: false,
  hasIssues: true,
  hasProjects: true,
  hasWiki: true,
})

// Use real React for component definitions - imported at the top

describe('Search Components', () => {
  // Use container approach for better test isolation
  let container: HTMLElement

  // Shared mock opportunity for all tests
  const sharedMockOpportunity: Opportunity = {
    // BaseEntity fields
    id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),

    // Opportunity fields
    repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
    githubIssueId: 123,
    title: 'Fix TypeScript type errors in search module',
    description:
      'Several type errors need to be fixed in the search functionality to improve type safety',
    type: 'bug_fix',
    difficulty: 'intermediate',
    labels: [],
    technologies: ['TypeScript', 'Node.js', 'Jest', 'ESLint'],
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
  }

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
    if (container?.parentNode) {
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

      // Wait for input to be filled
      expect(input).toHaveValue('TypeScript')

      await user.click(button)

      // Check that onSearch was called immediately (no waitFor needed for synchronous events)
      expect(onSearch).toHaveBeenCalledWith('TypeScript')
    })

    it('should call onSearch when Enter is pressed', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: 'Search input' })

      await user.type(input, 'React')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('React')
    })

    it('should disable input and button when loading', () => {
      const onSearch = vi.fn()
      const { getByRole, getByText } = renderIsolated(
        <SearchBar onSearch={onSearch} loading={true} />
      )

      expect(getByRole('textbox', { name: 'Search input' })).toBeDisabled()
      expect(getByRole('button', { name: 'Search' })).toBeDisabled()
      expect(getByText('Searching...')).toBeInTheDocument()
    })

    it('should disable search button when query is empty', () => {
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      expect(getByRole('button', { name: 'Search' })).toBeDisabled()
    })

    it('should show default value', () => {
      const onSearch = vi.fn()
      const { getByDisplayValue } = renderIsolated(
        <SearchBar onSearch={onSearch} defaultValue="initial query" />
      )

      expect(getByDisplayValue('initial query')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const onSearch = vi.fn()
      renderIsolated(<SearchBar onSearch={onSearch} className="custom-search" />)

      expect(document.querySelector('.search-bar.custom-search')).toBeInTheDocument()
    })
  })

  describe('SearchFilters', () => {
    const defaultFilters: SearchFilters = {
      query: '',
      difficulty: undefined,
      type: undefined,
      languages: [],
      goodFirstIssue: false,
      helpWanted: false,
      hasAssignee: undefined,
      minScore: 0,
      maxScore: 1,
      minStars: undefined,
      maxStars: undefined,
      createdAfter: undefined,
      createdBefore: undefined,
      updatedAfter: undefined,
      updatedBefore: undefined,
      repositoryHealthMin: undefined,
      estimatedHoursMin: undefined,
      estimatedHoursMax: undefined,
      requiresMaintainerResponse: undefined,
      hasLinkedPR: undefined,
      page: 1,
      limit: 20,
      sortBy: 'relevance',
      order: 'desc',
    }

    it('should render all filter controls', () => {
      const onFiltersChange = vi.fn()
      const { getByRole, container } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      // Use proper selectors for dynamically generated IDs
      expect(
        container.querySelector('select[aria-label="Difficulty"]') ||
          container.querySelector('select')?.closest('select')
      ).toBeTruthy()
      expect(container.querySelectorAll('select').length).toBeGreaterThanOrEqual(2)
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
        goodFirstIssue: true,
        minScore: 0.5,
      }

      const onFiltersChange = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <SearchFiltersComponent filters={filters} onFiltersChange={onFiltersChange} />
      )

      // Check that the correct options are selected by finding the select elements and checking their values
      const selects = container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
      expect(selects.length).toBeGreaterThanOrEqual(2)
      // First select should be difficulty, second should be type
      const difficultySelect = selects[0]
      const typeSelect = selects[1]
      expect(difficultySelect?.value).toBe('intermediate')
      expect(typeSelect?.value).toBe('bug_fix')
      expect(getByRole('checkbox', { name: /typescript/i })).toBeChecked()
      expect(getByRole('checkbox', { name: /python/i })).toBeChecked()
      expect(getByRole('checkbox', { name: /good first issue/i })).toBeChecked()
      expect(getByText('Minimum Relevance Score: 0.50')).toBeInTheDocument()
    })

    it('should call onFiltersChange when difficulty changes', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { container } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const selects = container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
      const difficultySelect = selects[0] // First select should be difficulty
      expect(difficultySelect).toBeInTheDocument()

      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'advanced')
      }

      // Check that onFiltersChange was called
      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        difficulty: 'advanced',
      })
    })

    it('should call onFiltersChange when type changes', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { container } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const selects = container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
      const typeSelect = selects[1] // Second select should be type
      expect(typeSelect).toBeInTheDocument()

      if (typeSelect) {
        await user.selectOptions(typeSelect, 'feature')
      }

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        type: 'feature',
      })
    })

    it('should toggle languages correctly', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
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
      const { getByRole } = renderIsolated(
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
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const gfiCheckbox = getByRole('checkbox', { name: /good first issue/i })
      await user.click(gfiCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          goodFirstIssue: true,
        })
      })
    })

    it('should update minimum score slider', async () => {
      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const slider = getByRole('slider', { name: /minimum relevance score/i })
      fireEvent.change(slider, { target: { value: '0.7' } })

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minScore: 0.7,
      })
    })

    it('should reset all filters', async () => {
      const filtersWithValues: SearchFilters = {
        ...defaultFilters,
        query: 'test',
        difficulty: 'advanced',
        type: 'feature',
        languages: ['TypeScript'],
        goodFirstIssue: true,
        helpWanted: true,
        minScore: 0.8,
      }

      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
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

      const selects = container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
      expect(selects[0]).toBeDisabled() // Difficulty select
      expect(selects[1]).toBeDisabled() // Type select
      expect(getByRole('checkbox', { name: /typescript/i })).toBeDisabled()
      expect(getByRole('checkbox', { name: /good first issue/i })).toBeDisabled()
      expect(getByRole('slider', { name: /minimum relevance score/i })).toBeDisabled()
      expect(getByRole('button', { name: /reset filters/i })).toBeDisabled()
    })
  })

  describe('OpportunityCard', () => {
    it('should render opportunity information correctly', () => {
      const onSelect = vi.fn()
      const { getByText, container } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
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
        ...sharedMockOpportunity,
        description:
          'This is a very long description that should be truncated when it exceeds the character limit set for the opportunity card display to ensure proper layout',
      }

      const onSelect = vi.fn()
      const { getByText } = renderIsolated(
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
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })
      await user.click(card)

      expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
    })

    it('should call onSelect when Enter or Space is pressed', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      card.focus()
      await user.keyboard('{Enter}')
      expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)

      await user.keyboard(' ')
      expect(onSelect).toHaveBeenCalledTimes(2)
    })

    it('should show good first issue tag when applicable', () => {
      const gfiOpportunity = { ...sharedMockOpportunity, goodFirstIssue: true }
      const onSelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityCard opportunity={gfiOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Good First Issue')).toBeInTheDocument()
    })

    it('should limit displayed technologies and show more indicator', () => {
      const onSelect = vi.fn()
      const { getByText, container } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
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
        ...sharedMockOpportunity,
        description: undefined,
        estimatedHours: undefined,
        repository: {
          ...sharedMockOpportunity.repository,
          language: undefined,
        },
      }

      const onSelect = vi.fn()
      const { getByText, queryByText } = renderIsolated(
        <OpportunityCard opportunity={minimalOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Fix TypeScript type errors in search module')).toBeInTheDocument()
      expect(queryByText('4h')).not.toBeInTheDocument()
    })
  })

  describe('OpportunityList', () => {
    const mockOpportunities: Opportunity[] = [
      {
        ...sharedMockOpportunity,
        id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
        title: 'Fix TypeScript errors',
        description: 'Fix type errors in search module',
        type: 'bug_fix',
        difficulty: 'intermediate',
        requiredSkills: ['TypeScript'],
        technologies: ['TypeScript'],
        goodFirstIssue: false,
        helpWanted: true,
        estimatedHours: 4,
        relevanceScore: 0.95,
        repository: createMockRepository({
          name: 'search-engine',
          fullName: 'company/search-engine',
          language: 'TypeScript',
          starsCount: 1250,
        }),
      },
      {
        ...sharedMockOpportunity,
        id: asUUID('550e8400-e29b-41d4-a716-446655440002'),
        title: 'Add new feature',
        description: 'Implement new search capability',
        type: 'feature',
        difficulty: 'advanced',
        requiredSkills: ['Python'],
        technologies: ['Python'],
        goodFirstIssue: false,
        helpWanted: false,
        estimatedHours: 8,
        relevanceScore: 0.78,
        repository: createMockRepository({
          name: 'ml-platform',
          fullName: 'company/ml-platform',
          language: 'Python',
          starsCount: 890,
        }),
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
      const { getByText } = renderIsolated(
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

      const firstOpportunity = screen.getByTestId(`opportunity-${mockOpportunities[0]?.id}`)
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
        ...sharedMockOpportunity,
        id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
        title: 'Test Opportunity',
        description: 'Test description',
        type: 'bug_fix',
        difficulty: 'intermediate',
        requiredSkills: ['TypeScript'],
        technologies: ['TypeScript', 'React'],
        goodFirstIssue: true,
        helpWanted: false,
        estimatedHours: 5,
        relevanceScore: 0.85,
        repository: createMockRepository({
          name: 'test-repo',
          fullName: 'org/test-repo',
          language: 'TypeScript',
          starsCount: 100,
        }),
      }

      expect(() => OpportunitySchema.parse(validOpportunity)).not.toThrow()
    })

    it('should validate search filters schema', () => {
      const validFilters = {
        query: 'TypeScript',
        difficulty: 'intermediate',
        type: 'bug_fix',
        languages: ['TypeScript', 'Python'],
        goodFirstIssue: true,
        helpWanted: false,
        hasAssignee: undefined,
        minScore: 0.5,
        maxScore: 1.0,
        minStars: undefined,
        maxStars: undefined,
        createdAfter: undefined,
        createdBefore: undefined,
        updatedAfter: undefined,
        updatedBefore: undefined,
        repositoryHealthMin: undefined,
        estimatedHoursMin: undefined,
        estimatedHoursMax: undefined,
        requiresMaintainerResponse: undefined,
        hasLinkedPR: undefined,
        page: 1,
        limit: 20,
        sortBy: 'relevance',
        order: 'desc',
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
        difficulty: undefined,
        type: undefined,
        languages: [],
        goodFirstIssue: false,
        helpWanted: false,
        hasAssignee: undefined,
        minScore: 0,
        maxScore: 1,
        minStars: undefined,
        maxStars: undefined,
        createdAfter: undefined,
        createdBefore: undefined,
        updatedAfter: undefined,
        updatedBefore: undefined,
        repositoryHealthMin: undefined,
        estimatedHoursMin: undefined,
        estimatedHoursMax: undefined,
        requiresMaintainerResponse: undefined,
        hasLinkedPR: undefined,
        page: 1,
        limit: 20,
        sortBy: 'relevance',
        order: 'desc',
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
      const selects = container.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
      const difficultySelect = selects[0] // First select should be difficulty
      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'beginner')
      }

      expect(handleFiltersChange).toHaveBeenCalledWith({
        ...filters,
        difficulty: 'beginner',
      })
    })
  })
})
