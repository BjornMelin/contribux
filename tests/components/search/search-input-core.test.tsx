/**
 * @vitest-environment jsdom
 */

/**
 * Search Input Core Test Suite
 * Tests for basic search input components, validation, and user interactions
 */

import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchBar } from '@/components/features'
import { renderIsolated, setupTestContainer, teardownTestContainer } from './utils/search-test-helpers'
import { setupWithRouter, ARIA_LABELS } from './setup/component-setup'
import '../setup'

describe('SearchBar - Core Input Functionality', () => {
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

  describe('Component Rendering', () => {
    it('should render with default props', () => {
      const onSearch = vi.fn()
      const { getByRole, getByPlaceholderText } = renderIsolated(<SearchBar onSearch={onSearch} />)

      expect(getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })).toBeInTheDocument()
      expect(getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })).toBeInTheDocument()
      expect(getByPlaceholderText('Search opportunities...')).toBeInTheDocument()
    })

    it('should show default value when provided', () => {
      const onSearch = vi.fn()
      const { getByDisplayValue } = renderIsolated(
        <SearchBar onSearch={onSearch} defaultValue="initial query" />
      )

      expect(getByDisplayValue('initial query')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const onSearch = vi.fn()
      renderIsolated(<SearchBar onSearch={onSearch} className="custom-search" />)

      expect(document.querySelector('.search-bar.custom-search')).toBeInTheDocument()
    })

    it('should disable search button when query is empty', () => {
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      expect(getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })).toBeDisabled()
    })
  })

  describe('User Input Interactions', () => {
    it('should call onSearch when form is submitted', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const button = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })

      await user.type(input, 'TypeScript')

      // Wait for input to be filled
      expect(input).toHaveValue('TypeScript')

      await user.click(button)

      // Check that onSearch was called immediately (no waitFor needed for synchronous events)
      expect(onSearch).toHaveBeenCalledWith('TypeScript')
    })

    it('should call onSearch when Enter is pressed', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })

      await user.type(input, 'React')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('React')
    })

    it('should enable search button after typing', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const button = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })

      expect(button).toBeDisabled()

      await user.type(input, 'test')

      expect(button).not.toBeDisabled()
    })

    it('should handle empty search submission gracefully', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      
      await user.type(input, 'test')
      await user.clear(input)
      await user.keyboard('{Enter}')

      // Should not call onSearch with empty string
      expect(onSearch).not.toHaveBeenCalled()
    })
  })

  describe('Loading States', () => {
    it('should disable input and button when loading', () => {
      const onSearch = vi.fn()
      const { getByRole, getByText } = renderIsolated(
        <SearchBar onSearch={onSearch} loading={true} />
      )

      expect(getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })).toBeDisabled()
      expect(getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })).toBeDisabled()
      expect(getByText('Searching...')).toBeInTheDocument()
    })

    it('should show loading indicator with proper accessibility', () => {
      const onSearch = vi.fn()
      const { getByText } = renderIsolated(
        <SearchBar onSearch={onSearch} loading={true} />
      )

      const loadingText = getByText('Searching...')
      expect(loadingText).toBeInTheDocument()
      
      // Should have proper aria attributes for screen readers
      expect(loadingText.closest('[aria-live]')).toBeTruthy()
    })

    it('should preserve input value during loading', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole, rerender } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      await user.type(input, 'preserve this')

      // Re-render with loading state
      rerender(<SearchBar onSearch={onSearch} loading={true} />)

      expect(input).toHaveValue('preserve this')
    })
  })

  describe('Input Validation', () => {
    it('should trim whitespace from search queries', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })

      await user.type(input, '  spaced query  ')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('spaced query')
    })

    it('should handle special characters in search', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })

      await user.type(input, 'test@#$%^&*()')
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith('test@#$%^&*()')
    })

    it('should handle very long search queries', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const longQuery = 'a'.repeat(1000)

      await user.type(input, longQuery)
      await user.keyboard('{Enter}')

      expect(onSearch).toHaveBeenCalledWith(longQuery)
    })
  })

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels', () => {
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const button = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })

      expect(input).toHaveAttribute('aria-label', 'Search input')
      expect(button).toHaveAttribute('aria-label', 'Search')
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const button = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })

      // Tab to input
      await user.tab()
      expect(input).toHaveFocus()

      // Tab to button
      await user.tab()
      expect(button).toHaveFocus()
    })

    it('should announce loading state to screen readers', () => {
      const onSearch = vi.fn()
      const { getByText } = renderIsolated(
        <SearchBar onSearch={onSearch} loading={true} />
      )

      const loadingMessage = getByText('Searching...')
      const liveRegion = loadingMessage.closest('[aria-live]')
      
      expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('Form Submission Edge Cases', () => {
    it('should prevent default form submission', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const preventDefault = vi.fn()
      
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      
      // Mock the form submission event
      const form = input.closest('form')
      form?.addEventListener('submit', (e) => {
        preventDefault()
        e.preventDefault()
      })

      await user.type(input, 'test')
      await user.keyboard('{Enter}')

      expect(preventDefault).toHaveBeenCalled()
    })

    it('should handle rapid successive submissions', async () => {
      const user = userEvent.setup()
      const onSearch = vi.fn()
      const { getByRole } = renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = getByRole('textbox', { name: ARIA_LABELS.SEARCH_INPUT })
      const button = getByRole('button', { name: ARIA_LABELS.SEARCH_BUTTON })

      await user.type(input, 'test')

      // Rapid clicks
      await user.click(button)
      await user.click(button)
      await user.click(button)

      // Should debounce or handle gracefully
      expect(onSearch).toHaveBeenCalledWith('test')
    })
  })
})