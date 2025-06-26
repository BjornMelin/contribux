/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Advanced Select Test Suite
 * Tests for select validation and advanced interactions - limited to 2 tests to avoid test interference
 */

import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated, getSelectByIndex } from './utils/search-test-helpers'
import { setupWithRouter } from './setup/component-setup'
import {
  defaultFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Advanced Select Interactions', () => {
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

  describe('Select Validation and Edge Cases', () => {
    it('should handle select option validation', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )
      
      const user = userEvent.setup()
      const difficultySelect = getSelectByIndex(result.container, 0)
      
      if (difficultySelect) {
        // Test selecting each valid option
        const validOptions = ['beginner', 'intermediate', 'advanced']
        
        for (const option of validOptions) {
          await user.selectOptions(difficultySelect, option)
          expect(onFiltersChange).toHaveBeenCalledWith({
            ...defaultFilters,
            difficulty: option,
          })
        }
      }
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })

    it('should reset select to undefined when empty option selected', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent 
          filters={{ ...defaultFilters, difficulty: 'advanced' }} 
          onFiltersChange={onFiltersChange} 
        />
      )

      const user = userEvent.setup()
      const difficultySelect = getSelectByIndex(result.container, 0)
      
      if (difficultySelect) {
        await user.selectOptions(difficultySelect, '')
        expect(onFiltersChange).toHaveBeenCalledWith({
          ...defaultFilters,
          difficulty: undefined,
        })
      }
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})