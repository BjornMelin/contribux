/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Basic Slider Test Suite
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

describe('SearchFilters - Basic Slider', () => {
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

  describe('Basic Slider Interaction', () => {
    it('should update minimum score slider', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const slider = result.getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })
      fireEvent.change(slider, { target: { value: '0.7' } })

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minScore: 0.7,
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})