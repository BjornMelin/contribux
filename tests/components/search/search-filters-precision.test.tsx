/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Precision Test Suite
 * Tests for decimal precision and rapid changes - limited to 2 tests to avoid test interference
 */

import { fireEvent } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated, getSelectByIndex } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Precision & Rapid Changes', () => {
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

  describe('Precision and Performance Tests', () => {
    it('should handle decimal precision in slider', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const slider = result.getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })
      fireEvent.change(slider, { target: { value: '0.333' } })

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minScore: 0.333,
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })

    it('should handle rapid filter changes', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const difficultySelect = getSelectByIndex(result.container, 0)
      const typeSelect = getSelectByIndex(result.container, 1)
      const gfiCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.GOOD_FIRST_ISSUE })

      // Rapid changes
      if (difficultySelect) await user.selectOptions(difficultySelect, 'advanced')
      if (typeSelect) await user.selectOptions(typeSelect, 'feature')
      await user.click(gfiCheckbox)

      // Should handle all changes
      expect(onFiltersChange).toHaveBeenCalledTimes(3)
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})