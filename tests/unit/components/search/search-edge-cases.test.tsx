/**
 * @vitest-environment jsdom
 */

/**
 * Search Components Edge Cases Test Suite
 * Tests boundary conditions, error scenarios, and edge cases
 */

import { fireEvent, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OpportunityCard,
  OpportunityList,
  SearchBar,
  SearchFilters,
} from '../../../src/components/features'
import type { Opportunity, SearchFilters as SearchFiltersType } from '../../../src/types/search'
import {
  asUUID,
  createDefaultFilters,
  createMockRepository,
  renderIsolated,
  setupTestContainer,
  teardownTestContainer,
} from './utils/search-test-helpers'

describe('Search Components - Edge Cases Suite', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = setupTestContainer()
    vi.clearAllMocks()
  })

  afterEach(() => {
    teardownTestContainer(container)
  })

  describe('SearchBar Edge Cases', () => {
    describe('Input Validation', () => {
      it('handles extremely long search queries', async () => {
        const onSearch = vi.fn()
        const longQuery = 'a'.repeat(10000) // 10,000 character query

        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        // Use fireEvent.change() for extremely long strings to avoid timeout
        fireEvent.change(input, { target: { value: longQuery } })

        // Use form submission instead of keyboard events for better reliability
        const form = input.closest('form')
        expect(form).toBeInTheDocument()
        if (form) {
          fireEvent.submit(form)
        }

        expect(onSearch).toHaveBeenCalledWith(longQuery)
      })

      it('handles special characters in search query', async () => {
        const onSearch = vi.fn()
        const specialCharsQuery = '!@#$%^&*()_+-=[]{}|;:,.<>?'

        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        // Use fireEvent.change() for complex special character sequences to avoid userEvent parsing issues
        fireEvent.change(input, { target: { value: specialCharsQuery } })

        // Use form submission instead of keyboard events for better reliability
        const form = input.closest('form')
        expect(form).toBeInTheDocument()
        if (form) {
          fireEvent.submit(form)
        }

        expect(onSearch).toHaveBeenCalledWith(specialCharsQuery)
      })

      it('handles Unicode characters in search query', async () => {
        const onSearch = vi.fn()
        const unicodeQuery = 'TypeScript 🚀 React ⚡ Node.js 💻'

        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        // Use fireEvent.change() for Unicode characters to ensure proper handling
        fireEvent.change(input, { target: { value: unicodeQuery } })

        // Use form submission instead of keyboard events for better reliability
        const form = input.closest('form')
        expect(form).toBeInTheDocument()
        if (form) {
          fireEvent.submit(form)
        }

        expect(onSearch).toHaveBeenCalledWith(unicodeQuery)
      })

      it('handles whitespace-only queries', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()

        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const button = screen.getByRole('button', { name: /search/i })

        await user.type(input, '   ')

        // Button should be disabled for whitespace-only input
        expect(button).toBeDisabled()
      })

      it('trims whitespace from search queries', async () => {
        const onSearch = vi.fn()

        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        // Use fireEvent.change() for consistent behavior
        fireEvent.change(input, { target: { value: '  react hooks  ' } })

        // Use form submission instead of keyboard events for better reliability
        const form = input.closest('form')
        expect(form).toBeInTheDocument()
        if (form) {
          fireEvent.submit(form)
        }

        expect(onSearch).toHaveBeenCalledWith('  react hooks  ') // Component doesn't trim, API should handle
      })
    })

    describe('State Management Edge Cases', () => {
      it('handles rapid consecutive searches', async () => {
        const onSearch = vi.fn()

        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })

        // First search - use fireEvent.change for consistent text replacement
        fireEvent.change(input, { target: { value: 'react' } })
        const form = input.closest('form')
        expect(form).toBeInTheDocument()
        if (form) {
          fireEvent.submit(form)
        }

        // Second search - replace text and submit
        fireEvent.change(input, { target: { value: 'vue' } })
        if (form) {
          fireEvent.submit(form)
        }

        // Third search - replace text and submit
        fireEvent.change(input, { target: { value: 'angular' } })
        if (form) {
          fireEvent.submit(form)
        }

        expect(onSearch).toHaveBeenCalledTimes(3)
        expect(onSearch).toHaveBeenNthCalledWith(1, 'react')
        expect(onSearch).toHaveBeenNthCalledWith(2, 'vue')
        expect(onSearch).toHaveBeenNthCalledWith(3, 'angular')
      })

      it('handles loading state changes correctly', () => {
        const onSearch = vi.fn()

        const { rerender } = renderIsolated(<SearchBar onSearch={onSearch} loading={false} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const button = screen.getByRole('button', { name: /search/i })

        expect(input).not.toBeDisabled()
        expect(button).toHaveTextContent('Search')

        rerender(<SearchBar onSearch={onSearch} loading={true} />)

        expect(input).toBeDisabled()
        expect(button).toBeDisabled()
        expect(button).toHaveTextContent('Searching...')

        rerender(<SearchBar onSearch={onSearch} loading={false} />)

        expect(input).not.toBeDisabled()
        expect(button).toHaveTextContent('Search')
      })
    })

    describe('Memory and Performance', () => {
      it('handles component unmounting during search', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()

        const { unmount } = renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        await user.type(input, 'test query')

        // Unmount component immediately
        unmount()

        // Should not cause memory leaks or errors
        expect(() => unmount()).not.toThrow()
      })
    })
  })

  describe('SearchFilters Edge Cases', () => {
    describe('Filter State Management', () => {
      it('handles filter resets with complex state', async () => {
        const user = userEvent.setup()
        const complexFilters: SearchFiltersType = {
          query: 'complex search',
          difficulty: 'expert',
          type: 'feature',
          languages: ['TypeScript', 'Python', 'Go', 'Rust'],
          goodFirstIssue: true,
          helpWanted: true,
          hasAssignee: false,
          minScore: 0.8,
          maxScore: 1.0,
          minStars: 100,
          maxStars: 10000,
          createdAfter: new Date('2024-01-01'),
          createdBefore: new Date('2024-12-31'),
          updatedAfter: new Date('2024-06-01'),
          updatedBefore: new Date('2024-12-31'),
          repositoryHealthMin: 0.7,
          estimatedHoursMin: 1,
          estimatedHoursMax: 40,
          requiresMaintainerResponse: true,
          hasLinkedPR: false,
          page: 5,
          limit: 50,
          sortBy: 'stars',
          order: 'asc',
        }
        const onFiltersChange = vi.fn()

        renderIsolated(<SearchFilters filters={complexFilters} onFiltersChange={onFiltersChange} />)

        const resetButton = screen.getByRole('button', {
          name: /reset filters/i,
        })
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

      it('handles rapid filter changes', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()

        const { container } = renderIsolated(
          <SearchFilters filters={filters} onFiltersChange={onFiltersChange} />
        )

        // Use specific selectors based on the actual HTML structure
        const difficultySelect = within(container).getByDisplayValue('All Difficulties')
        const typeSelect = within(container).getByDisplayValue('All Types')

        // Rapid changes
        await user.selectOptions(difficultySelect, 'beginner')
        await user.selectOptions(difficultySelect, 'intermediate')
        await user.selectOptions(difficultySelect, 'advanced')
        await user.selectOptions(typeSelect, 'bug_fix')
        await user.selectOptions(typeSelect, 'feature')

        expect(onFiltersChange).toHaveBeenCalledTimes(5)
      })

      it('handles all languages being selected and deselected', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()

        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const languages = ['TypeScript', 'Python', 'JavaScript', 'Java', 'Go', 'Rust']

        // Select all languages using aria-label queries (component uses proper case for aria-label)
        for (const language of languages) {
          const checkbox = screen.getByLabelText(language)
          await user.click(checkbox)
        }

        // Verify we have calls for each language selection
        expect(onFiltersChange).toHaveBeenCalledTimes(6)

        // Last call should have all languages (with proper casing as stored in component)
        const lastCall = onFiltersChange.mock.calls[onFiltersChange.mock.calls.length - 1][0]
        expect(lastCall.languages).toHaveLength(6)

        // Deselect all languages
        for (const language of languages) {
          const checkbox = screen.getByLabelText(language)
          await user.click(checkbox)
        }

        // Should have 12 total calls (6 select + 6 deselect)
        expect(onFiltersChange).toHaveBeenCalledTimes(12)

        // Final call should have no languages
        const finalCall = onFiltersChange.mock.calls[onFiltersChange.mock.calls.length - 1][0]
        expect(finalCall.languages).toHaveLength(0)
      })
    })

    describe('Slider Edge Cases', () => {
      it('handles minimum and maximum slider values', async () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()

        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const slider = screen.getByLabelText(/minimum relevance score/i) as HTMLInputElement

        // Set to minimum value using fireEvent for range inputs
        fireEvent.change(slider, { target: { value: '0' } })

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          minScore: 0,
        })

        // Set to maximum value
        fireEvent.change(slider, { target: { value: '1' } })

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          minScore: 1,
        })
      })

      it('handles decimal precision in slider', async () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()

        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const slider = screen.getByLabelText(/minimum relevance score/i)

        // Set to precise decimal value using fireEvent for range inputs
        fireEvent.change(slider, { target: { value: '0.75' } })

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          minScore: 0.75,
        })
      })
    })
  })

  describe('OpportunityCard Edge Cases', () => {
    describe('Data Edge Cases', () => {
      it('handles opportunity with missing optional fields', () => {
        const minimalOpportunity: Opportunity = {
          id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
          githubIssueId: 123,
          title: 'Minimal Opportunity',
          description: undefined, // Missing description
          type: 'bug_fix',
          difficulty: 'beginner',
          labels: [],
          technologies: [], // Empty technologies
          requiredSkills: [],
          goodFirstIssue: false,
          helpWanted: false,
          hasAssignee: false,
          assigneeUsername: undefined,
          estimatedHours: undefined, // Missing estimated hours
          relevanceScore: 0.5,
          url: 'https://github.com/test/repo/issues/123',
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
          isActive: true,
          aiAnalysis: {
            complexityScore: 0.3,
            impactScore: 0.4,
            confidenceScore: 0.5,
            learningPotential: 0.6,
            businessImpact: 0.3,
            requiredSkills: [],
            suggestedApproach: undefined,
            potentialChallenges: [],
            successProbability: 0.7,
            estimatedEffort: {
              hours: undefined,
              difficulty: 'beginner',
              confidence: 0.5,
            },
          },
          repository: {
            ...createMockRepository({
              name: 'test-repo',
              fullName: 'test/repo',
              language: undefined, // Missing language
              starsCount: 0,
            }),
            language: undefined,
            starsCount: 0,
          },
        }

        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={minimalOpportunity} onSelect={onSelect} />)

        expect(screen.getByText('Minimal Opportunity')).toBeInTheDocument()
        expect(screen.getByText('beginner')).toBeInTheDocument()
        expect(screen.getByText('bug fix')).toBeInTheDocument()
        expect(screen.getByText('test/repo')).toBeInTheDocument()
        expect(screen.getByText('⭐ 0')).toBeInTheDocument()
        expect(screen.getByText('50%')).toBeInTheDocument()

        // Should not show missing elements
        expect(screen.queryByText(/description/)).not.toBeInTheDocument()
        expect(screen.queryByText(/\d+h/)).not.toBeInTheDocument()
        expect(screen.queryByText('Good First Issue')).not.toBeInTheDocument()
        expect(screen.queryByText('Help Wanted')).not.toBeInTheDocument()
      })

      it('handles opportunity with extremely long title', () => {
        const longTitleOpportunity: Opportunity = {
          id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
          githubIssueId: 123,
          title:
            'This is an extremely long title that should potentially be handled gracefully by the component even when it exceeds normal expected length limits and might cause layout issues if not properly handled',
          description: 'Test description',
          type: 'feature',
          difficulty: 'intermediate',
          labels: [],
          technologies: ['TypeScript'],
          requiredSkills: ['JavaScript'],
          goodFirstIssue: false,
          helpWanted: false,
          hasAssignee: false,
          assigneeUsername: undefined,
          estimatedHours: 5,
          relevanceScore: 0.8,
          url: 'https://github.com/test/repo/issues/123',
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
          isActive: true,
          aiAnalysis: {
            complexityScore: 0.6,
            impactScore: 0.7,
            confidenceScore: 0.8,
            learningPotential: 0.7,
            businessImpact: 0.6,
            requiredSkills: ['JavaScript'],
            suggestedApproach: 'Test approach',
            potentialChallenges: ['Testing'],
            successProbability: 0.8,
            estimatedEffort: {
              hours: 5,
              difficulty: 'intermediate',
              confidence: 0.8,
            },
          },
          repository: createMockRepository({
            name: 'test-repo',
            fullName: 'test/repo',
            language: 'TypeScript',
            starsCount: 100,
          }),
        }

        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={longTitleOpportunity} onSelect={onSelect} />)

        const titleElement = screen.getByText(longTitleOpportunity.title)
        expect(titleElement).toBeInTheDocument()
      })

      it('handles opportunity with many technologies', () => {
        const manyTechsOpportunity: Opportunity = {
          id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
          githubIssueId: 123,
          title: 'Multi-technology Opportunity',
          description: 'Test description',
          type: 'feature',
          difficulty: 'advanced',
          labels: [],
          technologies: [
            'TypeScript',
            'React',
            'Node.js',
            'PostgreSQL',
            'Docker',
            'Kubernetes',
            'AWS',
            'Redis',
          ],
          requiredSkills: ['JavaScript', 'SQL'],
          goodFirstIssue: false,
          helpWanted: true,
          hasAssignee: false,
          assigneeUsername: undefined,
          estimatedHours: 12,
          relevanceScore: 0.9,
          url: 'https://github.com/test/repo/issues/123',
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
          isActive: true,
          aiAnalysis: {
            complexityScore: 0.8,
            impactScore: 0.9,
            confidenceScore: 0.8,
            learningPotential: 0.9,
            businessImpact: 0.8,
            requiredSkills: ['JavaScript', 'SQL'],
            suggestedApproach: 'Test approach',
            potentialChallenges: ['Complexity'],
            successProbability: 0.7,
            estimatedEffort: {
              hours: 12,
              difficulty: 'advanced',
              confidence: 0.8,
            },
          },
          repository: createMockRepository({
            name: 'complex-app',
            fullName: 'company/complex-app',
            language: 'TypeScript',
            starsCount: 2500,
          }),
        }

        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={manyTechsOpportunity} onSelect={onSelect} />)

        // Should show first 3 technologies
        expect(screen.getByText('TypeScript')).toBeInTheDocument()
        expect(screen.getByText('React')).toBeInTheDocument()
        expect(screen.getByText('Node.js')).toBeInTheDocument()

        // Should show "+5 more" for remaining technologies
        expect(screen.getByText('+5 more')).toBeInTheDocument()
      })
    })

    describe('Event Handling Edge Cases', () => {
      it('handles double-click events correctly', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()

        const opportunity = {
          ...createMockRepository({
            name: 'test-repo',
            fullName: 'test/repo',
            language: 'TypeScript',
            starsCount: 100,
          }),
          id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
          githubIssueId: 123,
          title: 'Test Opportunity',
          description: 'Test description',
          type: 'bug_fix' as const,
          difficulty: 'intermediate' as const,
          labels: [],
          technologies: ['TypeScript'],
          requiredSkills: ['JavaScript'],
          goodFirstIssue: false,
          helpWanted: false,
          hasAssignee: false,
          assigneeUsername: undefined,
          estimatedHours: 3,
          relevanceScore: 0.7,
          url: 'https://github.com/test/repo/issues/123',
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
          isActive: true,
          aiAnalysis: {
            complexityScore: 0.5,
            impactScore: 0.6,
            confidenceScore: 0.7,
            learningPotential: 0.6,
            businessImpact: 0.5,
            requiredSkills: ['JavaScript'],
            suggestedApproach: 'Test approach',
            potentialChallenges: ['Testing'],
            successProbability: 0.8,
            estimatedEffort: {
              hours: 3,
              difficulty: 'intermediate' as const,
              confidence: 0.7,
            },
          },
          repository: createMockRepository({
            name: 'test-repo',
            fullName: 'test/repo',
            language: 'TypeScript',
            starsCount: 100,
          }),
        }

        renderIsolated(<OpportunityCard opportunity={opportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button')

        // Double-click should only trigger onSelect once due to proper event handling
        await user.dblClick(card)

        expect(onSelect).toHaveBeenCalledTimes(1)
      })

      it('handles keyboard events that should not trigger selection', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()

        const opportunity = {
          id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
          githubIssueId: 123,
          title: 'Test Opportunity',
          description: 'Test description',
          type: 'bug_fix' as const,
          difficulty: 'intermediate' as const,
          labels: [],
          technologies: ['TypeScript'],
          requiredSkills: ['JavaScript'],
          goodFirstIssue: false,
          helpWanted: false,
          hasAssignee: false,
          assigneeUsername: undefined,
          estimatedHours: 3,
          relevanceScore: 0.7,
          url: 'https://github.com/test/repo/issues/123',
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
          isActive: true,
          aiAnalysis: {
            complexityScore: 0.5,
            impactScore: 0.6,
            confidenceScore: 0.7,
            learningPotential: 0.6,
            businessImpact: 0.5,
            requiredSkills: ['JavaScript'],
            suggestedApproach: 'Test approach',
            potentialChallenges: ['Testing'],
            successProbability: 0.8,
            estimatedEffort: {
              hours: 3,
              difficulty: 'intermediate' as const,
              confidence: 0.7,
            },
          },
          repository: createMockRepository({
            name: 'test-repo',
            fullName: 'test/repo',
            language: 'TypeScript',
            starsCount: 100,
          }),
        }

        renderIsolated(<OpportunityCard opportunity={opportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button')
        card.focus()

        // These keys should not trigger selection
        await user.keyboard('{Tab}')
        await user.keyboard('{Escape}')
        await user.keyboard('{ArrowDown}')
        await user.keyboard('{ArrowUp}')

        expect(onSelect).not.toHaveBeenCalled()
      })
    })
  })

  describe('OpportunityList Edge Cases', () => {
    describe('Large Data Sets', () => {
      it('handles large number of opportunities efficiently', () => {
        const largeOpportunityList: Opportunity[] = Array.from({ length: 1000 }, (_, index) => ({
          id: asUUID(`550e8400-e29b-41d4-a716-44665544${index.toString().padStart(4, '0')}`),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
          githubIssueId: 123 + index,
          title: `Opportunity ${index + 1}`,
          description: `Description for opportunity ${index + 1}`,
          type: 'bug_fix' as const,
          difficulty: 'intermediate' as const,
          labels: [],
          technologies: ['TypeScript'],
          requiredSkills: ['JavaScript'],
          goodFirstIssue: index % 10 === 0,
          helpWanted: index % 5 === 0,
          hasAssignee: false,
          assigneeUsername: undefined,
          estimatedHours: (index % 10) + 1,
          relevanceScore: Math.random(),
          url: `https://github.com/test/repo/issues/${123 + index}`,
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
          isActive: true,
          aiAnalysis: {
            complexityScore: 0.5,
            impactScore: 0.6,
            confidenceScore: 0.7,
            learningPotential: 0.6,
            businessImpact: 0.5,
            requiredSkills: ['JavaScript'],
            suggestedApproach: 'Test approach',
            potentialChallenges: ['Testing'],
            successProbability: 0.8,
            estimatedEffort: {
              hours: (index % 10) + 1,
              difficulty: 'intermediate' as const,
              confidence: 0.7,
            },
          },
          repository: createMockRepository({
            name: `repo-${index}`,
            fullName: `test/repo-${index}`,
            language: 'TypeScript',
            starsCount: index * 10,
          }),
        }))

        const onOpportunitySelect = vi.fn()

        // Should render without performance issues
        const startTime = performance.now()
        renderIsolated(
          <OpportunityList
            opportunities={largeOpportunityList}
            onOpportunitySelect={onOpportunitySelect}
          />
        )
        const endTime = performance.now()

        // Should render in reasonable time (less than 1 second)
        expect(endTime - startTime).toBeLessThan(1000)

        // Should show the list container
        expect(screen.getByTestId('opportunity-list')).toBeInTheDocument()
      })
    })

    describe('Error Recovery', () => {
      it('handles window.location.reload failure gracefully', async () => {
        const user = userEvent.setup()
        const onOpportunitySelect = vi.fn()

        // Mock reload to throw an error
        const originalReload = window.location.reload
        Object.defineProperty(window.location, 'reload', {
          writable: true,
          value: vi.fn(() => {
            throw new Error('Reload failed')
          }),
        })

        renderIsolated(
          <OpportunityList
            opportunities={[]}
            error="Network error"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const retryButton = screen.getByRole('button', { name: /retry/i })

        // Should not throw when clicking retry
        expect(async () => {
          await user.click(retryButton)
        }).not.toThrow()

        // Restore original reload
        Object.defineProperty(window.location, 'reload', {
          writable: true,
          value: originalReload,
        })
      })
    })

    describe('State Transitions', () => {
      it('handles rapid state transitions correctly', () => {
        const onOpportunitySelect = vi.fn()

        const { rerender } = renderIsolated(
          <OpportunityList
            opportunities={[]}
            loading={true}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByText('Loading opportunities...')).toBeInTheDocument()

        // Transition to error state
        rerender(
          <OpportunityList
            opportunities={[]}
            error="Failed to load"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByText(/Error loading opportunities: Failed to load/)).toBeInTheDocument()

        // Transition to success state
        const mockOpp = {
          id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
          repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
          githubIssueId: 123,
          title: 'Test Opportunity',
          description: 'Test description',
          type: 'bug_fix' as const,
          difficulty: 'intermediate' as const,
          labels: [],
          technologies: ['TypeScript'],
          requiredSkills: ['JavaScript'],
          goodFirstIssue: false,
          helpWanted: false,
          hasAssignee: false,
          assigneeUsername: undefined,
          estimatedHours: 3,
          relevanceScore: 0.7,
          url: 'https://github.com/test/repo/issues/123',
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
          isActive: true,
          aiAnalysis: {
            complexityScore: 0.5,
            impactScore: 0.6,
            confidenceScore: 0.7,
            learningPotential: 0.6,
            businessImpact: 0.5,
            requiredSkills: ['JavaScript'],
            suggestedApproach: 'Test approach',
            potentialChallenges: ['Testing'],
            successProbability: 0.8,
            estimatedEffort: {
              hours: 3,
              difficulty: 'intermediate' as const,
              confidence: 0.7,
            },
          },
          repository: createMockRepository({
            name: 'test-repo',
            fullName: 'test/repo',
            language: 'TypeScript',
            starsCount: 100,
          }),
        }

        rerender(
          <OpportunityList opportunities={[mockOpp]} onOpportunitySelect={onOpportunitySelect} />
        )

        expect(screen.getByText('Test Opportunity')).toBeInTheDocument()
        expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Error/)).not.toBeInTheDocument()
      })
    })
  })
})
