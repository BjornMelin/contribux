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
import {
  OpportunityCard,
  OpportunityList,
  SearchBar,
  SearchFilters,
} from '../../../src/components/features'
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
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const form = screen.getByRole('form')
        expect(form).toBeInTheDocument()
      })

      it('has accessible input field', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        expect(input).toHaveAttribute('aria-label', 'Search input')
      })

      it('has accessible submit button', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const button = screen.getByRole('button', { name: /search/i })
        expect(button).toHaveAttribute('aria-label', 'Search')
      })
    })

    describe('Keyboard Navigation', () => {
      it('supports tab navigation', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const button = screen.getByRole('button', { name: /search/i })

        // Tab to input field
        await user.tab()
        expect(input).toHaveFocus()

        // Tab to submit button
        await user.tab()
        expect(button).toHaveFocus()
      })

      it('supports Enter key submission from input field', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })

        await user.type(input, 'accessibility test')
        await user.keyboard('{Enter}')

        expect(onSearch).toHaveBeenCalledWith('accessibility test')
      })
    })

    describe('Focus Management', () => {
      it('maintains focus on input during typing', async () => {
        const user = userEvent.setup()
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} />)

        const input = screen.getByRole('textbox', { name: /search input/i })

        await user.click(input)
        await user.type(input, 'test query')

        expect(input).toHaveFocus()
      })

      it('properly indicates disabled state', () => {
        const onSearch = vi.fn()
        renderIsolated(<SearchBar onSearch={onSearch} loading={true} />)

        const input = screen.getByRole('textbox', { name: /search input/i })
        const button = screen.getByRole('button', { name: /searching/i })

        expect(input).toHaveAttribute('disabled')
        expect(button).toHaveAttribute('disabled')
        expect(input).toHaveAttribute('aria-disabled', 'true')
        expect(button).toHaveAttribute('aria-disabled', 'true')
      })
    })
  })

  describe('SearchFilters Accessibility', () => {
    describe('Form Structure', () => {
      it('has proper fieldset for language selection', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const fieldset = screen.getByRole('group', { name: /languages/i })
        expect(fieldset).toBeInTheDocument()
      })

      it('has proper labels for all form controls', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        expect(screen.getByLabelText(/difficulty/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/minimum relevance score/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/good first issue/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/help wanted/i)).toBeInTheDocument()
      })

      it('has accessible checkbox labels', () => {
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const languages = ['typescript', 'python', 'javascript', 'java', 'go', 'rust']

        languages.forEach(language => {
          const checkbox = screen.getByLabelText(language)
          expect(checkbox).toHaveAttribute('aria-label', language)
        })
      })
    })

    describe('Keyboard Navigation', () => {
      it('supports tab navigation through all controls', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const difficultySelect = screen.getByLabelText(/difficulty/i)
        const typeSelect = screen.getByLabelText(/type/i)
        const firstLanguage = screen.getByLabelText('typescript')
        const goodFirstIssue = screen.getByLabelText(/good first issue/i)
        const helpWanted = screen.getByLabelText(/help wanted/i)
        const scoreSlider = screen.getByLabelText(/minimum relevance score/i)
        const resetButton = screen.getByRole('button', {
          name: /reset filters/i,
        })

        // Tab through controls in order
        await user.tab()
        expect(difficultySelect).toHaveFocus()

        await user.tab()
        expect(typeSelect).toHaveFocus()

        await user.tab()
        expect(firstLanguage).toHaveFocus()

        // Skip through language checkboxes
        for (let i = 0; i < 5; i++) {
          await user.tab()
        }

        await user.tab()
        expect(goodFirstIssue).toHaveFocus()

        await user.tab()
        expect(helpWanted).toHaveFocus()

        await user.tab()
        expect(scoreSlider).toHaveFocus()

        await user.tab()
        expect(resetButton).toHaveFocus()
      })

      it('supports keyboard interaction with checkboxes', async () => {
        const user = userEvent.setup()
        const filters = createDefaultFilters()
        const onFiltersChange = vi.fn()
        renderIsolated(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />)

        const typescriptCheckbox = screen.getByLabelText('typescript')

        typescriptCheckbox.focus()
        await user.keyboard(' ')

        expect(onFiltersChange).toHaveBeenCalledWith({
          ...filters,
          languages: ['TypeScript'],
        })
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
