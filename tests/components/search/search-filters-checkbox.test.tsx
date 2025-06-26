/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Checkbox Test Suite
 * Tests for checkbox interactions - limited to 2 tests to avoid test interference
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

describe('SearchFilters - Checkbox Interactions', () => {
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

  describe('Language Checkbox Interactions', () => {
    it('should toggle languages correctly', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const typescriptCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })
      await user.click(typescriptCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          languages: ['TypeScript'],
        })
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })

    it('should update boolean filters', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const gfiCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.GOOD_FIRST_ISSUE })
      await user.click(gfiCheckbox)

      await vi.waitFor(() => {
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          goodFirstIssue: true,
        })
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})