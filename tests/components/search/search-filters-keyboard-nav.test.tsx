/**
 * @vitest-environment jsdom
 */

/**
 * Search Filters Keyboard Navigation Test Suite
 * Single test for keyboard navigation to avoid test interference
 */

import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchFilters as SearchFiltersComponent } from '@/components/features'
import { renderIsolated, getSelectByIndex } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
} from './fixtures/search-component-data'
import '../setup'

describe('SearchFilters - Keyboard Navigation', () => {
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

  describe('Keyboard Accessibility', () => {
    it('should support keyboard interactions on key controls', async () => {
      const onFiltersChange = vi.fn()
      const result = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const user = userEvent.setup()
      const difficultySelect = getSelectByIndex(result.container, 0)
      const typeSelect = getSelectByIndex(result.container, 1)
      const typescriptCheckbox = result.getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })
      const slider = result.getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })

      // Test that controls are focusable and respond to keyboard interaction
      
      // Focus and interact with difficulty select using keyboard
      if (difficultySelect) {
        difficultySelect.focus()
        expect(difficultySelect).toHaveFocus()
        await user.keyboard('{ArrowDown}')
        // Should trigger change (specific value doesn't matter for keyboard test)
      }

      // Focus and interact with type select using keyboard
      if (typeSelect) {
        typeSelect.focus()
        expect(typeSelect).toHaveFocus()
        await user.keyboard('{ArrowDown}')
      }

      // Focus and interact with checkbox using keyboard
      typescriptCheckbox.focus()
      expect(typescriptCheckbox).toHaveFocus()
      await user.keyboard(' ') // Space key to toggle checkbox
      expect(onFiltersChange).toHaveBeenCalled()

      // Focus and interact with slider using keyboard
      slider.focus()
      expect(slider).toHaveFocus()
      await user.keyboard('{ArrowRight}') // Arrow key to change slider value
      
      // Explicitly unmount to ensure cleanup
      result.unmount()
    })
  })
})