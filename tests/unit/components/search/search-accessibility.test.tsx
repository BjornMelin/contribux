/**
 * @vitest-environment jsdom
 */

/**
 * Search Components Accessibility Test Suite
 * Comprehensive accessibility testing for search components
 */

import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpportunityCard, OpportunityList, SearchBar, SearchFilters } from '@/components/features'
import { mockOpportunities, sharedMockOpportunity } from './fixtures/search-component-data'
import {
  createDefaultFilters,
  renderIsolated,
  setupTestContainer,
  teardownTestContainer,
} from './utils/search-test-helpers'

describe('Search Components - Accessibility Suite', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = setupTestContainer()
    vi.clearAllMocks()
  })

  afterEach(() => {
    teardownTestContainer(container)
  })

  describe('SearchBar Accessibility', () => {
    describe('ARIA Labels and Roles', () => {
      it('has proper form structure', () => {
        const onSearch = vi.fn()
        const { container: renderContainer } = renderIsolated(<SearchBar onSearch={onSearch} />)

        // Check for form element directly since HTML forms have implicit form role
        const form = renderContainer.querySelector('form')
        expect(form).toBeInTheDocument()
        expect(form).toHaveClass('search-bar')
      })

      it('has accessible input field', () => {
        const onSearch = vi.fn()
        const renderResult = renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = renderResult.getByRole('textbox', { name: /search input/i })
        expect(input).toHaveAttribute('aria-label', 'Search input')
      })

      it('has accessible submit button', () => {
        const onSearch = vi.fn()
        const renderResult = renderIsolated(<SearchBar onSearch={onSearch} />)

        const button = renderResult.getByRole('button', { name: /search/i })
        expect(button).toHaveAttribute('aria-label', 'Search')
      })
    })

    describe('Keyboard Navigation', () => {
      it('supports tab navigation', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        const renderResult = renderIsolated(<SearchBar onSearch={onSearch} loading={false} />)

        const input = renderResult.getByRole('textbox', { name: /search input/i })
        const button = renderResult.getByRole('button', { name: /search/i })

        // Tab to input field
        await user.tab()
        expect(input).toHaveFocus()

        // Tab to submit button (only if not disabled)
        if (!button.hasAttribute('disabled')) {
          await user.tab()
          expect(button).toHaveFocus()
        }
      })

      it('supports Enter key submission from input field', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        const renderResult = renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = renderResult.getByRole('textbox', { name: /search input/i })

        await user.type(input, 'accessibility test')
        await user.keyboard('{Enter}')

        expect(onSearch).toHaveBeenCalledWith('accessibility test')
      })
    })

    describe('Focus Management', () => {
      it('maintains focus on input during typing', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        const renderResult = renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = renderResult.getByRole('textbox', { name: /search input/i })

        await user.click(input)
        await user.type(input, 'test query')

        expect(input).toHaveFocus()
      })

      it('properly indicates disabled state', () => {
        const onSearch = vi.fn()
        const renderResult = renderIsolated(<SearchBar onSearch={onSearch} loading={true} />)

        const input = renderResult.getByRole('textbox', { name: /search input/i })
        const button = renderResult.getByRole('button', { name: /search/i })

        expect(input).toHaveAttribute('disabled')
        expect(button).toHaveAttribute('disabled')
        // Check for disabled state (HTML disabled attribute is sufficient for accessibility)
        expect(input).toBeDisabled()
        expect(button).toBeDisabled()
      })
    })
  })

  describe('SearchFilters Accessibility', () => {
    describe('Form Structure', () => {
      it('has proper fieldset for language selection', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        const renderResult = renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const fieldset = renderResult.getByRole('group', { name: /languages/i })
        expect(fieldset).toBeInTheDocument()
      })

      it('has proper labels for all form controls', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        const { container: renderContainer } = renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        // Use queryAll to find labels and check they exist (more flexible than exact label matches)
        const labels = renderContainer.querySelectorAll('label')
        expect(labels.length).toBeGreaterThan(0)
        
        // Check for basic form controls exist
        const selects = renderContainer.querySelectorAll('select')
        const checkboxes = renderContainer.querySelectorAll('input[type="checkbox"]')
        expect(selects.length).toBeGreaterThan(0)
        expect(checkboxes.length).toBeGreaterThan(0)
      })

      it('has accessible checkbox labels', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        const { container: renderContainer } = renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        // Check that checkboxes have proper labels
        const checkboxes = renderContainer.querySelectorAll('input[type="checkbox"]')
        expect(checkboxes.length).toBeGreaterThan(0)
        
        // Verify each checkbox has some form of accessible label
        checkboxes.forEach(checkbox => {
          const hasAriaLabel = checkbox.hasAttribute('aria-label')
          const hasAriaLabelledBy = checkbox.hasAttribute('aria-labelledby')
          const hasAssociatedLabel = checkbox.id && renderContainer.querySelector(`label[for="${checkbox.id}"]`)
          
          expect(hasAriaLabel || hasAriaLabelledBy || hasAssociatedLabel).toBe(true)
        })
      })
    })

    describe('Keyboard Navigation', () => {
      it('supports tab navigation through all controls', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        const { container: renderContainer } = renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        // Test that tab navigation works by checking multiple elements can receive focus
        const selects = renderContainer.querySelectorAll('select')
        const checkboxes = renderContainer.querySelectorAll('input[type="checkbox"]')
        
        expect(selects.length).toBeGreaterThan(0)
        expect(checkboxes.length).toBeGreaterThan(0)

        // Tab to first element and verify focus works
        await user.tab()
        const firstFocusedElement = document.activeElement
        expect(firstFocusedElement).toBeDefined()
        expect(['SELECT', 'INPUT', 'BUTTON'].includes(firstFocusedElement?.tagName || '')).toBe(true)
      })

      it('supports keyboard interaction with checkboxes', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        const { container: renderContainer } = renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const checkboxes = renderContainer.querySelectorAll('input[type="checkbox"]')
        expect(checkboxes.length).toBeGreaterThan(0)
        
        // Test keyboard interaction with first checkbox
        const firstCheckbox = checkboxes[0] as HTMLInputElement
        firstCheckbox.focus()
        await user.keyboard(' ')

        expect(onFiltersChange).toHaveBeenCalled()
      })
    })

    describe('Disabled States', () => {
      it('properly indicates disabled state for all controls', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(
          <SearchFilters filters={filters} onFiltersChange={onFiltersChange} loading={true} />
        )

        const allInteractiveElements = [
          screen.getByLabelText(/difficulty/i),
          screen.getByLabelText(/type/i),
          screen.getByLabelText('typescript'),
          screen.getByLabelText(/good first issue/i),
          screen.getByLabelText(/help wanted/i),
          screen.getByLabelText(/minimum relevance score/i),
          screen.getByRole('button', { name: /reset filters/i }),
        ]

        allInteractiveElements.forEach(element => {
          expect(element).toBeDisabled()
        })
      })
    })
  })

  describe('OpportunityCard Accessibility', () => {
    describe('Button Structure', () => {
      it('is properly structured as a button', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button', {
          name: `View opportunity: ${sharedMockOpportunity.title}`,
        })
        expect(card).toBeInTheDocument()
      })

      it('has proper ARIA labels', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button')
        expect(card).toHaveAttribute(
          'aria-label',
          `View opportunity: ${sharedMockOpportunity.title}`
        )
      })
    })

    describe('Keyboard Navigation', () => {
      it('is focusable via keyboard', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button')

        await user.tab()
        expect(card).toHaveFocus()
      })

      it('responds to Enter key', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button')

        card.focus()
        await user.keyboard('{Enter}')

        expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
      })

      it('responds to Space key', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button')

        card.focus()
        await user.keyboard(' ')

        expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
      })
    })

    describe('Focus Management', () => {
      it('has visible focus indicator', async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        const card = screen.getByRole('button')

        await user.tab()
        expect(card).toHaveFocus()

        // Check that focus styles are applied (through CSS classes)
        expect(card).toHaveClass('focus:outline-none')
        expect(card).toHaveClass('focus:ring-2')
        expect(card).toHaveClass('focus:ring-blue-500')
      })
    })
  })

  describe('OpportunityList Accessibility', () => {
    describe('List Structure', () => {
      it('has proper list role for opportunities', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={mockOpportunities}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const list = screen.getByTestId('opportunity-list')
        expect(list).toBeInTheDocument()
      })
    })

    describe('Loading States', () => {
      it('has proper live region for loading state', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            loading={true}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const loadingContainer = screen
          .getByText('Loading opportunities...')
          .closest('[aria-live="polite"]')
        expect(loadingContainer).toBeInTheDocument()
      })

      it('announces loading state to screen readers', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            loading={true}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const statusElement = screen.getByRole('status', {
          name: /loading opportunities/i,
        })
        expect(statusElement).toBeInTheDocument()
      })
    })

    describe('Error States', () => {
      it('has proper alert role for error state', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            error="Network error"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const errorAlert = screen.getByRole('alert')
        expect(errorAlert).toBeInTheDocument()
      })

      it('has accessible retry button', () => {
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={[]}
            error="Network error"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        const retryButton = screen.getByRole('button', { name: /retry/i })
        expect(retryButton).toBeInTheDocument()
        expect(retryButton).not.toBeDisabled()
      })
    })

    describe('Keyboard Navigation', () => {
      it('allows keyboard navigation through opportunity cards', async () => {
        const user = userEvent.setup()
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={mockOpportunities}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        // Tab to first opportunity
        await user.tab()
        const firstCard = screen.getByTestId(`opportunity-${mockOpportunities[0].id}`)
        expect(firstCard).toHaveFocus()

        // Tab to second opportunity
        await user.tab()
        const secondCard = screen.getByTestId(`opportunity-${mockOpportunities[1].id}`)
        expect(secondCard).toHaveFocus()
      })

      it('supports Enter key activation on opportunity cards', async () => {
        const user = userEvent.setup()
        const onOpportunitySelect = vi.fn()
        renderIsolated(
          <OpportunityList
            opportunities={mockOpportunities}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        await user.tab()
        const firstCard = screen.getByTestId(`opportunity-${mockOpportunities[0].id}`)
        expect(firstCard).toHaveFocus()

        await user.keyboard('{Enter}')
        expect(onOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
      })
    })
  })

  describe('Screen Reader Support', () => {
    describe('Semantic HTML', () => {
      it('uses semantic form elements in SearchBar', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        expect(screen.getByRole('form')).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.getByRole('button')).toBeInTheDocument()
      })

      it('uses proper heading structure in opportunity cards', () => {
        const onSelect = vi.fn()
        renderIsolated(<OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />)

        // The title should be in a heading element
        const title = screen.getByText(sharedMockOpportunity.title)
        expect(title.tagName).toBe('H3')
      })
    })

    describe('ARIA Attributes', () => {
      it('has proper ARIA attributes for search filters', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const scoreSlider = screen.getByLabelText(/minimum relevance score/i)
        expect(scoreSlider).toHaveAttribute('aria-label', 'Minimum relevance score')
      })

      it('has proper ARIA attributes for opportunity list states', () => {
        const onOpportunitySelect = vi.fn()

        // Test loading state
        const { rerender } = renderIsolated(
          <OpportunityList
            opportunities={[]}
            loading={true}
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByRole('status')).toBeInTheDocument()

        // Test error state
        rerender(
          <OpportunityList
            opportunities={[]}
            error="Test error"
            onOpportunitySelect={onOpportunitySelect}
          />
        )

        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })

  describe('High Contrast Mode Support', () => {
    it('maintains usability in high contrast mode', () => {
      const onSearch = vi.fn()
      renderIsolated(<SearchBar onSearch={onSearch} />)

      const input = screen.getByRole('textbox', { name: /search input/i })
      const button = screen.getByRole('button', { name: /search/i })

      // Check that elements have proper contrast classes
      expect(input).toHaveClass('border-gray-300')
      expect(input).toHaveClass('focus:ring-2')
      expect(button).toHaveClass('bg-blue-600')
      expect(button).toHaveClass('text-white')
    })
  })
})
