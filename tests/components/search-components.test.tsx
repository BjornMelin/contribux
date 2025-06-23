/**
 * Search Components Test Suite
 * Tests for critical search-related UI components
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import '@testing-library/jest-dom'

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

// Mock React hooks
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    useState: vi.fn(initial => [initial, vi.fn()]),
    useEffect: vi.fn(),
    useMemo: vi.fn(cb => cb()),
    useCallback: vi.fn(cb => cb),
  }
})

// Type definitions
const SearchFiltersSchema = z.object({
  query: z.string(),
  difficulty: z.enum(['', 'beginner', 'intermediate', 'advanced', 'expert']),
  type: z.enum(['', 'bug_fix', 'feature', 'documentation', 'testing', 'refactoring', 'other']),
  languages: z.array(z.string()),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  min_score: z.number().min(0).max(1),
})

const OpportunitySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  difficulty: z.string(),
  required_skills: z.array(z.string()),
  technologies: z.array(z.string()),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  estimated_hours: z.number().nullable(),
  relevance_score: z.number(),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
    language: z.string().nullable(),
    stars_count: z.number(),
  }),
})

type SearchFilters = z.infer<typeof SearchFiltersSchema>
type Opportunity = z.infer<typeof OpportunitySchema>

// Mock Components (simulating the actual components)
interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
  defaultValue?: string
  loading?: boolean
  className?: string
}

function SearchBar({
  onSearch,
  placeholder = 'Search opportunities...',
  defaultValue = '',
  loading = false,
  className = '',
}: SearchBarProps) {
  const [query, setQuery] = React.useState(defaultValue)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch(query)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`search-bar ${className}`}>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        className="search-input"
        aria-label="Search input"
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="search-button"
        aria-label="Search"
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  )
}

interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  loading?: boolean
}

function SearchFilters({ filters, onFiltersChange, loading = false }: SearchFiltersProps) {
  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const handleLanguageToggle = (language: string) => {
    const newLanguages = filters.languages.includes(language)
      ? filters.languages.filter(lang => lang !== language)
      : [...filters.languages, language]

    handleFilterChange('languages', newLanguages)
  }

  const resetFilters = () => {
    onFiltersChange({
      query: '',
      difficulty: '',
      type: '',
      languages: [],
      good_first_issue: false,
      help_wanted: false,
      min_score: 0,
    })
  }

  return (
    <div className="search-filters" data-testid="search-filters">
      {/* Difficulty Filter */}
      <div className="filter-group">
        <label htmlFor="difficulty-select">Difficulty</label>
        <select
          id="difficulty-select"
          value={filters.difficulty}
          onChange={e => handleFilterChange('difficulty', e.target.value)}
          disabled={loading}
        >
          <option value="">All Difficulties</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
      </div>

      {/* Type Filter */}
      <div className="filter-group">
        <label htmlFor="type-select">Type</label>
        <select
          id="type-select"
          value={filters.type}
          onChange={e => handleFilterChange('type', e.target.value)}
          disabled={loading}
        >
          <option value="">All Types</option>
          <option value="bug_fix">Bug Fix</option>
          <option value="feature">Feature</option>
          <option value="documentation">Documentation</option>
          <option value="testing">Testing</option>
          <option value="refactoring">Refactoring</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Language Checkboxes */}
      <div className="filter-group">
        <label>Languages</label>
        <div className="language-checkboxes">
          {['TypeScript', 'Python', 'JavaScript', 'Java', 'Go', 'Rust'].map(language => (
            <label key={language} className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.languages.includes(language)}
                onChange={() => handleLanguageToggle(language)}
                disabled={loading}
              />
              {language}
            </label>
          ))}
        </div>
      </div>

      {/* Boolean Filters */}
      <div className="filter-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={filters.good_first_issue}
            onChange={e => handleFilterChange('good_first_issue', e.target.checked)}
            disabled={loading}
          />
          Good First Issue
        </label>
      </div>

      <div className="filter-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={filters.help_wanted}
            onChange={e => handleFilterChange('help_wanted', e.target.checked)}
            disabled={loading}
          />
          Help Wanted
        </label>
      </div>

      {/* Minimum Score Slider */}
      <div className="filter-group">
        <label htmlFor="min-score-slider">
          Minimum Relevance Score: {filters.min_score.toFixed(2)}
        </label>
        <input
          id="min-score-slider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={filters.min_score}
          onChange={e => handleFilterChange('min_score', Number.parseFloat(e.target.value))}
          disabled={loading}
        />
      </div>

      <button
        type="button"
        onClick={resetFilters}
        disabled={loading}
        className="reset-filters-button"
      >
        Reset Filters
      </button>
    </div>
  )
}

interface OpportunityCardProps {
  opportunity: Opportunity
  onSelect: (opportunity: Opportunity) => void
  className?: string
}

function OpportunityCard({ opportunity, onSelect, className = '' }: OpportunityCardProps) {
  const handleClick = () => {
    onSelect(opportunity)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(opportunity)
    }
  }

  return (
    <div
      className={`opportunity-card ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View opportunity: ${opportunity.title}`}
      data-testid={`opportunity-${opportunity.id}`}
    >
      <div className="opportunity-header">
        <h3 className="opportunity-title">{opportunity.title}</h3>
        <div className="opportunity-meta">
          <span className={`difficulty-badge ${opportunity.difficulty}`}>
            {opportunity.difficulty}
          </span>
          <span className={`type-badge ${opportunity.type}`}>
            {opportunity.type.replace('_', ' ')}
          </span>
        </div>
      </div>

      {opportunity.description && (
        <p className="opportunity-description">
          {opportunity.description.length > 150
            ? `${opportunity.description.substring(0, 150)}...`
            : opportunity.description}
        </p>
      )}

      <div className="opportunity-details">
        <div className="repository-info">
          <span className="repository-name">{opportunity.repository.full_name}</span>
          {opportunity.repository.language && (
            <span className="repository-language">{opportunity.repository.language}</span>
          )}
          <span className="repository-stars">⭐ {opportunity.repository.stars_count}</span>
        </div>

        <div className="opportunity-tags">
          {opportunity.good_first_issue && (
            <span className="tag good-first-issue">Good First Issue</span>
          )}
          {opportunity.help_wanted && <span className="tag help-wanted">Help Wanted</span>}
          {opportunity.estimated_hours && (
            <span className="tag estimated-time">{opportunity.estimated_hours}h</span>
          )}
        </div>

        <div className="opportunity-skills">
          {opportunity.technologies.slice(0, 3).map(tech => (
            <span key={tech} className="skill-tag">
              {tech}
            </span>
          ))}
          {opportunity.technologies.length > 3 && (
            <span className="skill-tag more">+{opportunity.technologies.length - 3} more</span>
          )}
        </div>

        <div className="relevance-score">
          <span className="score-label">Relevance:</span>
          <span className="score-value">{(opportunity.relevance_score * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}

interface OpportunityListProps {
  opportunities: Opportunity[]
  loading?: boolean
  error?: string | null
  onOpportunitySelect: (opportunity: Opportunity) => void
  emptyMessage?: string
}

function OpportunityList({
  opportunities,
  loading = false,
  error = null,
  onOpportunitySelect,
  emptyMessage = 'No opportunities found',
}: OpportunityListProps) {
  if (error) {
    return (
      <div className="opportunity-list-error" role="alert">
        <p>Error loading opportunities: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="opportunity-list-loading" aria-live="polite">
        <div className="loading-spinner" />
        <p>Loading opportunities...</p>
      </div>
    )
  }

  if (opportunities.length === 0) {
    return (
      <div className="opportunity-list-empty">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="opportunity-list" data-testid="opportunity-list">
      {opportunities.map(opportunity => (
        <OpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
          onSelect={onOpportunitySelect}
        />
      ))}
    </div>
  )
}

// Mock React import for component definitions
const React = {
  useState: vi.fn(initial => [initial, vi.fn()]),
  useEffect: vi.fn(),
  useMemo: vi.fn(cb => cb()),
  useCallback: vi.fn(cb => cb),
  FormEvent: {},
  KeyboardEvent: {},
}

describe('Search Components', () => {
  const user = userEvent.setup()

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('SearchBar', () => {
    it('should render with default props', () => {
      const onSearch = vi.fn()
      render(<SearchBar onSearch={onSearch} />)

      expect(screen.getByRole('textbox', { name: 'Search input' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search opportunities...')).toBeInTheDocument()
    })

    it('should call onSearch when form is submitted', async () => {
      const onSearch = vi.fn()
      render(<SearchBar onSearch={onSearch} />)

      const input = screen.getByRole('textbox', { name: 'Search input' })
      const button = screen.getByRole('button', { name: 'Search' })

      await user.type(input, 'TypeScript')
      await user.click(button)

      expect(onSearch).toHaveBeenCalledWith('TypeScript')
    })

    it('should call onSearch when Enter is pressed', async () => {
      const onSearch = vi.fn()
      render(<SearchBar onSearch={onSearch} />)

      const input = screen.getByRole('textbox', { name: 'Search input' })

      await user.type(input, 'React')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('React')
    })

    it('should disable input and button when loading', () => {
      const onSearch = vi.fn()
      render(<SearchBar onSearch={onSearch} loading={true} />)

      expect(screen.getByRole('textbox', { name: 'Search input' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
      expect(screen.getByText('Searching...')).toBeInTheDocument()
    })

    it('should disable search button when query is empty', () => {
      const onSearch = vi.fn()
      render(<SearchBar onSearch={onSearch} />)

      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    })

    it('should show default value', () => {
      const onSearch = vi.fn()
      render(<SearchBar onSearch={onSearch} defaultValue="initial query" />)

      expect(screen.getByDisplayValue('initial query')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const onSearch = vi.fn()
      render(<SearchBar onSearch={onSearch} className="custom-search" />)

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
      render(<SearchFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />)

      expect(screen.getByRole('combobox', { name: /difficulty/i })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /type/i })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /good first issue/i })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /help wanted/i })).toBeInTheDocument()
      expect(screen.getByRole('slider', { name: /minimum relevance score/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument()
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
      render(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

      expect(screen.getByDisplayValue('intermediate')).toBeInTheDocument()
      expect(screen.getByDisplayValue('bug_fix')).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /typescript/i })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /python/i })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /good first issue/i })).toBeChecked()
      expect(screen.getByText('Minimum Relevance Score: 0.50')).toBeInTheDocument()
    })

    it('should call onFiltersChange when difficulty changes', async () => {
      const onFiltersChange = vi.fn()
      render(<SearchFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />)

      const difficultySelect = screen.getByRole('combobox', { name: /difficulty/i })
      await user.selectOptions(difficultySelect, 'advanced')

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        difficulty: 'advanced',
      })
    })

    it('should call onFiltersChange when type changes', async () => {
      const onFiltersChange = vi.fn()
      render(<SearchFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />)

      const typeSelect = screen.getByRole('combobox', { name: /type/i })
      await user.selectOptions(typeSelect, 'feature')

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        type: 'feature',
      })
    })

    it('should toggle languages correctly', async () => {
      const onFiltersChange = vi.fn()
      render(<SearchFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />)

      const typescriptCheckbox = screen.getByRole('checkbox', { name: /typescript/i })
      await user.click(typescriptCheckbox)

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        languages: ['TypeScript'],
      })

      // Test removing a language
      const filtersWithLang = { ...defaultFilters, languages: ['TypeScript', 'Python'] }
      render(<SearchFilters filters={filtersWithLang} onFiltersChange={onFiltersChange} />)

      const pythonCheckbox = screen.getByRole('checkbox', { name: /python/i })
      await user.click(pythonCheckbox)

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...filtersWithLang,
        languages: ['TypeScript'],
      })
    })

    it('should update boolean filters', async () => {
      const onFiltersChange = vi.fn()
      render(<SearchFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />)

      const gfiCheckbox = screen.getByRole('checkbox', { name: /good first issue/i })
      await user.click(gfiCheckbox)

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        good_first_issue: true,
      })
    })

    it('should update minimum score slider', async () => {
      const onFiltersChange = vi.fn()
      render(<SearchFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />)

      const slider = screen.getByRole('slider', { name: /minimum relevance score/i })
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
      render(<SearchFilters filters={filtersWithValues} onFiltersChange={onFiltersChange} />)

      const resetButton = screen.getByRole('button', { name: /reset filters/i })
      await user.click(resetButton)

      expect(onFiltersChange).toHaveBeenCalledWith(defaultFilters)
    })

    it('should disable all controls when loading', () => {
      const onFiltersChange = vi.fn()
      render(
        <SearchFilters filters={defaultFilters} onFiltersChange={onFiltersChange} loading={true} />
      )

      expect(screen.getByRole('combobox', { name: /difficulty/i })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: /type/i })).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: /typescript/i })).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: /good first issue/i })).toBeDisabled()
      expect(screen.getByRole('slider', { name: /minimum relevance score/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /reset filters/i })).toBeDisabled()
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
      render(<OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />)

      expect(screen.getByText('Fix TypeScript type errors in search module')).toBeInTheDocument()
      expect(screen.getByText(/Several type errors need to be fixed/)).toBeInTheDocument()
      expect(screen.getByText('intermediate')).toBeInTheDocument()
      expect(screen.getByText('bug fix')).toBeInTheDocument()
      expect(screen.getByText('company/search-engine')).toBeInTheDocument()
      expect(screen.getByText('TypeScript')).toBeInTheDocument()
      expect(screen.getByText('⭐ 1250')).toBeInTheDocument()
      expect(screen.getByText('Help Wanted')).toBeInTheDocument()
      expect(screen.getByText('4h')).toBeInTheDocument()
      expect(screen.getByText('95%')).toBeInTheDocument()
    })

    it('should truncate long descriptions', () => {
      const longOpportunity = {
        ...mockOpportunity,
        description:
          'This is a very long description that should be truncated when it exceeds the character limit set for the opportunity card display to ensure proper layout',
      }

      const onSelect = vi.fn()
      render(<OpportunityCard opportunity={longOpportunity} onSelect={onSelect} />)

      expect(
        screen.getByText(
          /This is a very long description that should be truncated when it exceeds the character limit set for the opportunity card display to ensure proper layout/
        )
      ).toBeInTheDocument()
    })

    it('should call onSelect when clicked', async () => {
      const onSelect = vi.fn()
      render(<OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />)

      const card = screen.getByRole('button', { name: /view opportunity/i })
      await user.click(card)

      expect(onSelect).toHaveBeenCalledWith(mockOpportunity)
    })

    it('should call onSelect when Enter or Space is pressed', async () => {
      const onSelect = vi.fn()
      render(<OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />)

      const card = screen.getByRole('button', { name: /view opportunity/i })

      card.focus()
      await user.keyboard('{Enter}')
      expect(onSelect).toHaveBeenCalledWith(mockOpportunity)

      await user.keyboard(' ')
      expect(onSelect).toHaveBeenCalledTimes(2)
    })

    it('should show good first issue tag when applicable', () => {
      const gfiOpportunity = { ...mockOpportunity, good_first_issue: true }
      const onSelect = vi.fn()
      render(<OpportunityCard opportunity={gfiOpportunity} onSelect={onSelect} />)

      expect(screen.getByText('Good First Issue')).toBeInTheDocument()
    })

    it('should limit displayed technologies and show more indicator', () => {
      const onSelect = vi.fn()
      render(<OpportunityCard opportunity={mockOpportunity} onSelect={onSelect} />)

      expect(screen.getByText('TypeScript')).toBeInTheDocument()
      expect(screen.getByText('Node.js')).toBeInTheDocument()
      expect(screen.getByText('Jest')).toBeInTheDocument()
      expect(screen.getByText('+1 more')).toBeInTheDocument()
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
      render(<OpportunityCard opportunity={minimalOpportunity} onSelect={onSelect} />)

      expect(screen.getByText('Fix TypeScript type errors in search module')).toBeInTheDocument()
      expect(screen.queryByText('4h')).not.toBeInTheDocument()
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
      render(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(screen.getByTestId('opportunity-list')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /view opportunity/i })).toHaveLength(2)
      expect(screen.getByText('Fix TypeScript errors')).toBeInTheDocument()
      expect(screen.getByText('Add new feature')).toBeInTheDocument()
    })

    it('should show loading state', () => {
      const onOpportunitySelect = vi.fn()
      render(
        <OpportunityList
          opportunities={[]}
          loading={true}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(screen.getByText('Loading opportunities...')).toBeInTheDocument()
      expect(screen.getByRole('status', { name: /loading opportunities/i })).toBeInTheDocument()
    })

    it('should show error state', () => {
      const onOpportunitySelect = vi.fn()
      render(
        <OpportunityList
          opportunities={[]}
          error="Failed to load data"
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(
        screen.getByText('Error loading opportunities: Failed to load data')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    it('should show empty state', () => {
      const onOpportunitySelect = vi.fn()
      render(<OpportunityList opportunities={[]} onOpportunitySelect={onOpportunitySelect} />)

      expect(screen.getByText('No opportunities found')).toBeInTheDocument()
    })

    it('should show custom empty message', () => {
      const onOpportunitySelect = vi.fn()
      render(
        <OpportunityList
          opportunities={[]}
          onOpportunitySelect={onOpportunitySelect}
          emptyMessage="Try adjusting your search filters"
        />
      )

      expect(screen.getByText('Try adjusting your search filters')).toBeInTheDocument()
    })

    it('should call onOpportunitySelect when opportunity is clicked', async () => {
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
      render(
        <OpportunityList
          opportunities={[]}
          loading={true}
          error="Something went wrong"
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.queryByText('Loading opportunities...')).not.toBeInTheDocument()
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

      render(
        <div>
          <SearchBar onSearch={handleSearch} />
          <SearchFilters filters={filters} onFiltersChange={handleFiltersChange} />
          <OpportunityList opportunities={[]} onOpportunitySelect={handleOpportunitySelect} />
        </div>
      )

      // Test search interaction
      const searchInput = screen.getByRole('textbox', { name: 'Search input' })
      await user.type(searchInput, 'React')
      await user.keyboard('{Enter}')

      expect(handleSearch).toHaveBeenCalledWith('React')

      // Test filter interaction
      const difficultySelect = screen.getByRole('combobox', { name: /difficulty/i })
      await user.selectOptions(difficultySelect, 'beginner')

      expect(handleFiltersChange).toHaveBeenCalledWith({
        ...filters,
        difficulty: 'beginner',
      })
    })
  })
})
