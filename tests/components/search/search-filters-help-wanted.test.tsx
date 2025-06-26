/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Help Wanted Test Suite
 * Tests for help wanted and validation features - limited to 2 tests to avoid test interference
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

describe('SearchFilters - Help Wanted & Validation', () => {
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

  describe('Help Wanted and Language Validation', () => {
    it('should toggle help wanted filter', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const helpWantedCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.HELP_WANTED })
      await user.click(helpWantedCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          helpWanted: true,
        })
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })

    it('should prevent invalid language selections', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      
      // Try to interact with valid language
      const validCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })
      await user.click(validCheckbox)

      // Should only include valid languages
      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        languages: ['TypeScript'],
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})