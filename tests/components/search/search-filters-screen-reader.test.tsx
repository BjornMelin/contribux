/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Screen Reader Test Suite
 * Single test for screen reader support to avoid test interference
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

describe('SearchFilters - Screen Reader Support', () => {
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

  describe('Screen Reader Accessibility', () => {
    it('should have proper screen reader support for filter changes', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const gfiCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.GOOD_FIRST_ISSUE })
      
      // Verify checkbox has proper aria labels for screen readers
      expect(gfiCheckbox).toHaveAttribute('aria-label', 'Good first issue')
      
      // Changes should trigger callbacks that announce to screen readers
      await user.click(gfiCheckbox)
      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        goodFirstIssue: true,
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})