/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Slider Edge Cases Test Suite
 * Single test to avoid test interference
 */

import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Slider Edge Cases', () => {
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

  describe('Slider Edge Cases', () => {
    it('should handle slider edge values', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const slider = result.getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })
      
      // Test changing to a different value (not the default 0)
      fireEvent.change(slider, { target: { value: '0.1' } })
      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minScore: 0.1,
      })

      // Test maximum value
      vi.clearAllMocks()
      fireEvent.change(slider, { target: { value: '1' } })
      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minScore: 1,
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})