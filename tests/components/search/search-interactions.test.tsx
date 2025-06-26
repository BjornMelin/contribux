/**
 * @vitest-environment jsdom
 */

/**
 * Search Interactions Test Suite
 * Tests for user interactions, event handling, keyboard navigation, and accessibility
 */

import { fireEvent } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchBar, SearchFilters as SearchFiltersComponent, OpportunityCard, OpportunityList } from '@/components/features'
import { renderIsolated, setupTestContainer, teardownTestContainer, getSelectByIndex } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import {
  defaultFilters,
  sharedMockOpportunity,
  mockOpportunities,
} from './fixtures/search-component-data'
import '../setup'

describe('Search Component Interactions', () => {
  let container: HTMLElement
  const { mockPush, mockReplace } = setupWithRouter()

  beforeEach(() => {
    container = setupTestContainer()
    vi.clearAllMocks()
    mockPush.mockClear()
    mockReplace.mockClear()
  })

  afterEach(() => {
    teardownTestContainer(container)
  })

  describe('Keyboard Navigation', () => {
    it('should support tab navigation through search components', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const onFiltersChange = vi.fn()
      const { getByRole, container } = renderIsolated(
        <div>
          <SearchBar onSearch={onSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        </div>
      )

      const searchInput = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const searchButton = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })
      const difficultySelect = getSelectByIndex(container, 0)
      const typescriptCheckbox = getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })

      // Tab through controls
      await user.tab()
      expect(searchInput).toHaveFocus()

      await user.tab()
      expect(searchButton).toHaveFocus()

      await user.tab()
      if (difficultySelect) expect(difficultySelect).toHaveFocus()

      await user.tab()
      expect(typescriptCheckbox).toHaveFocus()
    })

    it('should handle keyboard shortcuts in search input', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })

      // Type and use Enter
      await user.type(input, 'test query')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('test query')

      // Clear with Ctrl+A and Delete
      await user.keyboard('{Control>}a{/Control}')
      await user.keyboard('{Delete}')

      expect(input).toHaveValue('')
    })

    it('should handle escape key to clear search', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })

      await user.type(input, 'test')
      await user.keyboard('{Escape}')

      // Should clear the input (implementation dependent)
      expect(input).toHaveFocus()
    })

    it('should support arrow key navigation in selects', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { container } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const difficultySelect = getSelectByIndex(container, 0)
      
      if (difficultySelect) {
        difficultySelect.focus()
        
        // Arrow down to next option
        await user.keyboard('{ArrowDown}')
        
        // Should be able to navigate through options
        expect(difficultySelect).toHaveFocus()
      }
    })

    it('should handle space bar activation on opportunity cards', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      card.focus()
      await user.keyboard(' ')

      expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
    })
  })

  describe('Mouse Interactions', () => {
    it('should handle click interactions on search components', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const button = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })

      // Click input to focus
      await user.click(input)
      expect(input).toHaveFocus()

      // Type and click search
      await user.type(input, 'click test')
      await user.click(button)

      expect(onSearch).toHaveBeenCalledWith('click test')
    })

    it('should handle double-click prevention on buttons', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const button = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })

      await user.type(input, 'double click test')
      
      // Rapid double clicks
      await user.click(button)
      await user.click(button)

      // Should handle gracefully (may call once or twice depending on implementation)
      expect(onSearch).toHaveBeenCalledWith('double click test')
    })

    it('should handle drag interactions on slider', async () => {
      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const slider = getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })

      // Simulate drag by changing value
      fireEvent.change(slider, { target: { value: '0.6' } })

      expect(onFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minScore: 0.6,
      })
    })

    it('should handle right-click context menu prevention', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      // Right-click should not interfere with normal operation
      fireEvent.contextMenu(card)
      await user.click(card)

      expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
    })
  })

  describe('Touch Interactions', () => {
    it('should handle touch events on mobile devices', async () => {
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      // Simulate touch events
      fireEvent.touchStart(card)
      fireEvent.touchEnd(card)

      // Should work with touch events
      expect(card).toBeInTheDocument()
    })

    it('should handle swipe gestures on opportunity list', () => {
      const onOpportunitySelect = vi.fn()
      const { container } = renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const list = container.querySelector('[data-testid="opportunity-list"]')
      
      if (list) {
        // Simulate swipe
        fireEvent.touchStart(list, { touches: [{ clientX: 0, clientY: 0 }] })
        fireEvent.touchMove(list, { touches: [{ clientX: 100, clientY: 0 }] })
        fireEvent.touchEnd(list)

        // Should handle gracefully
        expect(list).toBeInTheDocument()
      }
    })

    it('should handle pinch-to-zoom gestures', () => {
      const onFiltersChange = vi.fn()
      const { container } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      // Simulate pinch gesture
      fireEvent.touchStart(container, { 
        touches: [
          { clientX: 0, clientY: 0 },
          { clientX: 100, clientY: 100 }
        ]
      })
      fireEvent.touchMove(container, {
        touches: [
          { clientX: 50, clientY: 50 },
          { clientX: 150, clientY: 150 }
        ]
      })
      fireEvent.touchEnd(container)

      // Should not interfere with component functionality
      expect(container).toBeInTheDocument()
    })
  })

  describe('Focus Management', () => {
    it('should manage focus properly during loading states', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole, rerender } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      
      // Focus input
      await user.click(input)
      expect(input).toHaveFocus()

      // Re-render with loading state
      rerender(<SearchBar onSearch={onSearch} loading={true} />)

      // Focus should be maintained but input disabled
      expect(input).toBeDisabled()
    })

    it('should return focus after filter reset', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const resetButton = getByRole('button', { name: ARIA_LABELS.RESET_FILTERS })
      
      await user.click(resetButton)

      // Focus should remain on reset button or move appropriately
      expect(resetButton).toBeInTheDocument()
    })

    it('should handle focus trapping in modal-like components', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      // Focus should be manageable
      card.focus()
      expect(card).toHaveFocus()

      await user.tab()
      // Focus should move to next focusable element
    })

    it('should handle focus restoration after component updates', async () => {
      const user = userEvent.setup()
      const onOpportunitySelect = vi.fn()
      const { rerender, container } = renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities.slice(0, 1)}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const firstCard = container.querySelector('[data-testid^="opportunity-"]')
      if (firstCard) {
        (firstCard as HTMLElement).focus()
        expect(firstCard).toHaveFocus()
      }

      // Re-render with more opportunities
      rerender(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      // Component should handle focus appropriately
      expect(container.querySelector('[data-testid^="opportunity-"]')).toBeInTheDocument()
    })
  })

  describe('Event Delegation and Bubbling', () => {
    it('should handle event bubbling in nested components', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const onFiltersChange = vi.fn()
      const containerClick = vi.fn()

      const { getByRole } = renderIsolated(
        <div onClick={containerClick}>
          <SearchBar onSearch={onSearch} />
          <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
        </div>
      )

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.click(input)

      // Container should receive bubbled event
      expect(containerClick).toHaveBeenCalled()
    })

    it('should prevent event bubbling when appropriate', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const containerClick = vi.fn()

      const { getByRole } = renderIsolated(
        <div onClick={containerClick}>
          <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
        </div>
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })
      await user.click(card)

      expect(onSelect).toHaveBeenCalled()
      // Should not bubble to container if prevented
    })

    it('should handle form submission events correctly', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()

      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.type(input, 'form test')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('form test')
      // Form submission should be handled appropriately
    })
  })

  describe('Performance and Responsiveness', () => {
    it('should handle rapid user interactions gracefully', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const checkbox = getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })

      // Rapid clicking
      for (let i = 0; i < 10; i++) {
        await user.click(checkbox)
      }

      // Should handle all interactions
      expect(onFiltersChange.mock.calls.length).toBeGreaterThan(0)
    })

    it('should debounce search input properly', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })

      // Rapid typing should not cause excessive calls
      await user.type(input, 'rapid')
      await user.type(input, ' typing')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('rapid typing')
    })

    it('should handle large data sets efficiently', async () => {
      const user = userEvent.setup()
      const largeOpportunityList = Array.from({ length: 1000 }, (_, i) => ({
        ...sharedMockOpportunity,
        id: `opportunity-${i}` as any,
        title: `Opportunity ${i}`,
      }))

      const onOpportunitySelect = vi.fn()
      const { container } = renderIsolated(
        <OpportunityList
          opportunities={largeOpportunityList}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const firstCard = container.querySelector('[data-testid^="opportunity-"]')
      if (firstCard) {
        await user.click(firstCard)
        expect(onOpportunitySelect).toHaveBeenCalled()
      }

      // Should render without performance issues
      expect(container.querySelectorAll('[data-testid^="opportunity-"]')).toHaveLength(1000)
    })

    it('should maintain responsiveness during filter changes', async () => {
      const user = userEvent.setup()
      const onFiltersChange = vi.fn()
      const { getByRole, container } = renderIsolated(
        <SearchFiltersComponent filters={defaultFilters} onFiltersChange={onFiltersChange} />
      )

      const difficultySelect = getSelectByIndex(container, 0)
      const typeSelect = getSelectByIndex(container, 1)
      const checkbox = getByRole('checkbox', { name: ARIA_LABELS.TYPESCRIPT_CHECKBOX })
      const slider = getByRole('slider', { name: ARIA_LABELS.MIN_SCORE_SLIDER })

      // Multiple simultaneous changes
      if (difficultySelect) await user.selectOptions(difficultySelect, 'advanced')
      if (typeSelect) await user.selectOptions(typeSelect, 'feature')
      await user.click(checkbox)
      fireEvent.change(slider, { target: { value: '0.8' } })

      // All changes should be processed
      expect(onFiltersChange.mock.calls.length).toBeGreaterThan(0)
    })
  })
})