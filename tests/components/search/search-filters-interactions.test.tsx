/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Interactions Test Suite
 * Tests for user interactions and callback functionality - limited to 2 tests to avoid test interference
 */

import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated, getSelectByIndex } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Interactions (Part 1)', () => {
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

  describe('Select Filter Interactions', () => {
    it('should call onFiltersChange when difficulty changes', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )
      
      // Create user event instance AFTER component is rendered
      const user = userEvent.setup()

      const difficultySelect = getSelectByIndex(result.container, 0)
      expect(difficultySelect).toBeInTheDocument()

      if (difficultySelect) {
        await user.selectOptions(difficultySelect, 'advanced')
      }

      // Check that onFiltersChange was called
      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        difficulty: 'advanced',
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })

    it('should call onFiltersChange when type changes', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )
      
      // Create user event instance AFTER component is rendered
      const user = userEvent.setup()

      const typeSelect = getSelectByIndex(result.container, 1)
      expect(typeSelect).toBeInTheDocument()

      if (typeSelect) {
        await user.selectOptions(typeSelect, 'feature')
      }

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        type: 'feature',
      })
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})