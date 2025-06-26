/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Rendering Test Suite
 * Tests for basic rendering, display, and component states
 */

import { describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated, getSelectByIndex } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
  filtersWithValues,
  filtersWithLanguages,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Rendering Tests', () => {
  const { mockPush, mockReplace } = setupWithRouter()

  describe('Filter Component Rendering', () => {
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
      expect(getByRole('checkbox', { name: ARIA_LABELS.GOOD_FIRST_ISSUE })).toBeInTheDocument()
      expect(getByRole('checkbox', { name: ARIA_LABELS.HELP_WANTED })).toBeInTheDocument()
      expect(getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })).toBeInTheDocument()
      expect(getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })).toBeInTheDocument()
    })

    it('should display current filter values', () => {
      const onFiltersChange = vi.fn()
      const { getByRole, getByText, container } = renderIsolated(
        <SearchFiltersComponent filters={filtersWithLanguages} onFiltersChange={onFiltersChange} />
      )

      // Check that the correct options are selected by finding the select elements and checking their values
      const difficultySelect = getSelectByIndex(container, 0)
      const typeSelect = getSelectByIndex(container, 1)
      
      expect(difficultySelect?.value).toBe('intermediate')
      expect(typeSelect?.value).toBe('bug_fix')
      expect(getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })).toBeChecked()
      expect(getByRole('checkbox', { name: ARIA_LABELS.PYTHON_CHECKBOX })).toBeChecked()
      expect(getByRole('checkbox', { name: ARIA_LABELS.GOOD_FIRST_ISSUE })).toBeChecked()
      expect(getByText('Minimum Relevance Score: 0.50')).toBeInTheDocument()
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

      const difficultySelect = getSelectByIndex(container, 0)
      const typeSelect = getSelectByIndex(container, 1)
      
      expect(difficultySelect).toBeDisabled()
      expect(typeSelect).toBeDisabled()
      expect(getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })).toBeDisabled()
      expect(getByRole('checkbox', { name: ARIA_LABELS.GOOD_FIRST_ISSUE })).toBeDisabled()
      expect(getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })).toBeDisabled()
      expect(getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })).toBeDisabled()
    })

    it('should display current slider value', () => {
      const onFiltersChange = vi.fn()
      const filtersWithScore = { ...defaultFilters, minScore: 0.75 }
      const { getByText } = renderIsolated(
        <SearchFiltersComponent filters={filtersWithScore} onFiltersChange={onFiltersChange} />
      )

      expect(getByText('Minimum Relevance Score: 0.75')).toBeInTheDocument()
    })

    it('should handle invalid filter values gracefully', () => {
      const onFiltersChange = vi.fn()
      const invalidFilters = {
        ...defaultFilters,
        minScore: -1, // Invalid: below minimum
        maxScore: 2,  // Invalid: above maximum
      }

      // Should render without crashing
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent filters={invalidFilters} onFiltersChange={onFiltersChange} />
      )

      expect(getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })).toBeInTheDocument()
    })
  })

  describe('Accessibility and Usability', () => {
    it('should have proper ARIA labels for screen readers', () => {
      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const slider = getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })
      expect(slider).toHaveAttribute('aria-label')
      
      const resetButton = getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })
      expect(resetButton).toBeInTheDocument()
    })

    it('should maintain reset button functionality during loading', () => {
      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent
          filters={filtersWithValues}
          onFiltersChange={onFiltersChange}
          loading={true}
        />
      )

      const resetButton = getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })
      expect(resetButton).toBeDisabled()
    })
  })
})