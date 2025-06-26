/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Reset Test Suite
 * Tests for reset functionality - limited to 2 tests to avoid test interference
 */

import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
  filtersWithValues,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Reset Functionality', () => {
  const { mockPush, mockReplace } = setupWithRouter()

  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockClear()
    mockReplace.mockClear()
    
    // Complete document state reset to prevent test interference
    if (typeof document !== 'undefined') {
      while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild)
      }
      document.body.innerHTML = ''
    }
  })

  describe('Filter Reset Operations', () => {
    it('should reset all filters', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={filtersWithValues} onFiltersChange={onFiltersChange} />
      )

      const resetButton = result.getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })
      const user = userEvent.setup()
      await user.click(resetButton)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith(defaultFilters)
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })

    it('should reset to default state correctly', async () => {
      const onFiltersChange = vi.fn()
      const complexFilters = {
        ...defaultFilters,
        query: 'test search',
        difficulty: 'advanced' as const,
        type: 'feature' as const,
        languages: ['TypeScript', 'Python', 'JavaScript'],
        goodFirstIssue: true,
        helpWanted: true,
        minScore: 0.8,
        minStars: 100,
        maxStars: 1000,
      }

      const result = renderIsolated(
        <SearchFiltersComponent filters={complexFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const resetButton = result.getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })
      await user.click(resetButton)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith(defaultFilters)
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})