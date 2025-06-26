/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Test Suite - Main Entry
 * Core validation tests that don't require user interactions
 * 
 * Note: This file has been split into multiple test suites to work around React + JSDOM + Vitest
 * test interference limitations where callback-based tests fail when running multiple tests.
 * 
 * Split test files (25+ tests total):
 * 
 * Multi-test files (2 tests each, no interference observed):
 * - search-filters-rendering.test.tsx - Basic rendering and display tests (8 tests)
 * - search-filters-interactions.test.tsx - Basic select interactions (2 tests)
 * - search-filters-checkbox.test.tsx - Basic checkbox interactions (2 tests)
 * - search-filters-advanced-select.test.tsx - Select validation and edge cases (2 tests)
 * - search-filters-help-wanted.test.tsx - Help wanted and language validation (2 tests)
 * - search-filters-reset.test.tsx - Reset functionality tests (2 tests)
 * - search-filters-precision.test.tsx - Decimal precision and rapid changes (2 tests)
 * 
 * Single-test files (to avoid any interference):
 * - search-filters-keyboard-nav.test.tsx - Keyboard navigation accessibility
 * - search-filters-screen-reader.test.tsx - Screen reader support
 * - search-filters-slider-basic.test.tsx - Basic slider interaction
 * - search-filters-slider-edge.test.tsx - Slider edge cases
 * - search-filters-remove-language.test.tsx - Language removal functionality
 * - search-filters-multiple-language.test.tsx - Multiple language selection
 * 
 * Empty placeholder files (all tests moved to other files):
 * - search-filters-slider.test.tsx
 * - search-filters-advanced-checkbox.test.tsx
 * - search-filters-accessibility.test.tsx
 */

import { describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated } from './utils/search-test-helpers'
import { setupWithRouter } from './setup/component-setup'
import {
  defaultFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Core Validation', () => {
  const { mockPush, mockReplace } = setupWithRouter()

  describe('Filter Validation and Error Handling', () => {
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

      expect(getByRole('slider', { name: /minimum.*score/i })).toBeInTheDocument()
    })

    it('should display current slider value correctly', () => {
      const onFiltersChange = vi.fn()
      const filtersWithScore = { ...defaultFilters, minScore: 0.75 }
      const { getByText } = renderIsolated(
        <SearchFiltersComponent filters={filtersWithScore} onFiltersChange={onFiltersChange} />
      )

      expect(getByText('Minimum Relevance Score: 0.75')).toBeInTheDocument()
    })
  })
})