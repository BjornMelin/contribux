/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Multiple Language Test Suite
 * Single test to avoid test interference
 */

import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Multiple Language Selection', () => {
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

  describe('Multiple Language Selection', () => {
    it('should handle multiple language selections correctly', async () => {
      const onFiltersChange = vi.fn()
      
      // Start with TypeScript already selected to test accumulation
      const filtersWithTypescript = {
        ...defaultFilters,
        languages: ['TypeScript'],
      }
      
      const result = renderIsolated(
        <SearchFiltersComponent filters={filtersWithTypescript} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()

      // Select Python to add to existing TypeScript selection
      const pythonCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.PYTHON_CHECKBOX })
      await user.click(pythonCheckbox)

      // Should call with both languages
      expect(onFiltersChange).toHaveBeenCalledWith({
        ...filtersWithTypescript,
        languages: expect.arrayContaining(['TypeScript', 'Python']),
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})