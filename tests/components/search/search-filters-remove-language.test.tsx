/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Remove Language Test Suite
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

describe('SearchFilters - Remove Language', () => {
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

  describe('Language Removal', () => {
    it('should remove languages correctly', async () => {
      const filtersWithLang = { ...defaultFilters, languages: ['TypeScript', 'Python'] }
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={filtersWithLang} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const pythonCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.PYTHON_CHECKBOX })
      await user.click(pythonCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filtersWithLang,
          languages: ['TypeScript'],
        })
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})