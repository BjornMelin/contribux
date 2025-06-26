/**
 * @vitest-environment jsdom
 */

/**
 * Search Results Display Test Suite
 * Tests for search results display, opportunity cards, and list rendering
 */

import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpportunityCard, OpportunityList } from '@/components/features'
import { renderIsolated, setupTestContainer, teardownTestContainer } from './utils/search-test-helpers'
import { setupWithRouter } from './setup/component-setup'
import {
  sharedMockOpportunity,
  mockOpportunities,
  longDescriptionOpportunity,
  goodFirstIssueOpportunity,
  minimalOpportunity,
} from './fixtures/search-component-data'
import '../setup'

describe('Search Results Display', () => {
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

  describe('OpportunityCard - Content Display', () => {
    it('should render opportunity information correctly', () => {
      const onSelect = vi.fn()
      const { getByText, container } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Fix TypeScript type errors in search module')).toBeInTheDocument()
      expect(getByText(/Several type errors need to be fixed/)).toBeInTheDocument()
      expect(getByText('intermediate')).toBeInTheDocument()
      expect(getByText('bug fix')).toBeInTheDocument()
      expect(getByText('company/search-engine')).toBeInTheDocument()
      
      // Check for TypeScript in repository language section
      const repositoryLanguageElements = Array.from(container.querySelectorAll('*')).filter(
        el => el.textContent?.includes('TypeScript') && el.closest('.repository-language')
      )
      expect(repositoryLanguageElements.length).toBeGreaterThan(0)
      
      expect(getByText('⭐ 1250')).toBeInTheDocument()
      expect(getByText('Help Wanted')).toBeInTheDocument()
      expect(getByText('4h')).toBeInTheDocument()
      expect(getByText('95%')).toBeInTheDocument()
    })

    it('should truncate long descriptions', () => {
      const onSelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityCard opportunity={longDescriptionOpportunity} onSelect={onSelect} />
      )

      // Check that the text is truncated with "..." at the end
      expect(
        getByText(
          /This is a very long description that should be truncated when it exceeds the character limit set for the opportunity card display to ensure proper lay\.\.\./
        )
      ).toBeInTheDocument()
    })

    it('should show good first issue tag when applicable', () => {
      const onSelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityCard opportunity={goodFirstIssueOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Good First Issue')).toBeInTheDocument()
    })

    it('should limit displayed technologies and show more indicator', () => {
      const onSelect = vi.fn()
      const { getByText, container } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      // Check for TypeScript in skill tags section (not repository language)
      const skillTagElements = Array.from(container.querySelectorAll('*')).filter(
        el => el.textContent?.includes('TypeScript') && el.closest('.skill-tag')
      )
      expect(skillTagElements.length).toBeGreaterThan(0)
      expect(getByText('Node.js')).toBeInTheDocument()
      expect(getByText('Jest')).toBeInTheDocument()
      expect(getByText('+1 more')).toBeInTheDocument()
    })

    it('should handle missing optional fields gracefully', () => {
      const onSelect = vi.fn()
      const { getByText, queryByText } = renderIsolated(
        <OpportunityCard opportunity={minimalOpportunity} onSelect={onSelect} />
      )

      expect(getByText('Fix TypeScript type errors in search module')).toBeInTheDocument()
      expect(queryByText('4h')).not.toBeInTheDocument()
    })
  })

  describe('OpportunityCard - User Interactions', () => {
    it('should call onSelect when clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })
      await user.click(card)

      expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
    })

    it('should call onSelect when Enter or Space is pressed', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      card.focus()
      await user.keyboard('{Enter}')
      expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)

      await user.keyboard(' ')
      expect(onSelect).toHaveBeenCalledTimes(2)
    })

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      // Should be focusable
      await user.tab()
      expect(card).toHaveFocus()

      // Should respond to keyboard activation
      await user.keyboard('{Enter}')
      expect(onSelect).toHaveBeenCalled()
    })

    it('should handle rapid clicks gracefully', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityCard opportunity={sharedMockOpportunity} onSelect={onSelect} />
      )

      const card = getByRole('button', { name: /view opportunity.*fix typescript type errors/i })

      // Rapid successive clicks
      await user.click(card)
      await user.click(card)
      await user.click(card)

      expect(onSelect).toHaveBeenCalledTimes(3)
      expect(onSelect).toHaveBeenCalledWith(sharedMockOpportunity)
    })
  })

  describe('OpportunityList - List Rendering', () => {
    it('should render list of opportunities', () => {
      const onOpportunitySelect = vi.fn()
      const { getAllByRole, getByText } = renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(screen.getByTestId('opportunity-list')).toBeInTheDocument()
      expect(getAllByRole('button')).toHaveLength(2)
      expect(getByText('Fix TypeScript errors')).toBeInTheDocument()
      expect(getByText('Add new feature')).toBeInTheDocument()
    })

    it('should call onOpportunitySelect when opportunity is clicked', async () => {
      const user = userEvent.setup()
      const onOpportunitySelect = vi.fn()
      const { container } = renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const firstOpportunity = container.querySelector(`[data-testid="opportunity-${mockOpportunities[0]?.id}"]`)
      expect(firstOpportunity).toBeInTheDocument()
      
      if (firstOpportunity) {
        await user.click(firstOpportunity)
        expect(onOpportunitySelect).toHaveBeenCalledWith(mockOpportunities[0])
      }
    })

    it('should handle empty opportunities array', () => {
      const onOpportunitySelect = vi.fn()
      const { queryByTestId } = renderIsolated(
        <OpportunityList opportunities={[]} onOpportunitySelect={onOpportunitySelect} />
      )

      expect(queryByTestId('opportunity-list')).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('should maintain list order', () => {
      const onOpportunitySelect = vi.fn()
      const { getAllByRole } = renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const buttons = getAllByRole('button')
      expect(buttons[0]).toHaveTextContent('Fix TypeScript errors')
      expect(buttons[1]).toHaveTextContent('Add new feature')
    })
  })

  describe('OpportunityList - State Management', () => {
    it('should show loading state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          loading={true}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(getByText('Loading opportunities...')).toBeInTheDocument()
      // Check for aria-live region instead of status role
      const loadingDiv = getByText('Loading opportunities...').closest('[aria-live]')
      expect(loadingDiv).toHaveAttribute('aria-live', 'polite')
    })

    it('should show error state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByRole, getByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          error="Failed to load data"
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(getByRole('alert')).toBeInTheDocument()
      expect(getByText('Error loading opportunities: Failed to load data')).toBeInTheDocument()
      expect(getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    it('should show empty state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityList opportunities={[]} onOpportunitySelect={onOpportunitySelect} />
      )

      expect(getByText('No opportunities found')).toBeInTheDocument()
    })

    it('should show custom empty message', () => {
      const onOpportunitySelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          onOpportunitySelect={onOpportunitySelect}
          emptyMessage="Try adjusting your search filters"
        />
      )

      expect(getByText('Try adjusting your search filters')).toBeInTheDocument()
    })

    it('should prioritize error over loading state', () => {
      const onOpportunitySelect = vi.fn()
      const { getByRole, queryByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          loading={true}
          error="Something went wrong"
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(getByRole('alert')).toBeInTheDocument()
      expect(queryByText('Loading opportunities...')).not.toBeInTheDocument()
    })
  })

  describe('Display Optimization', () => {
    it('should handle large lists efficiently', () => {
      const largeOpportunityList = Array.from({ length: 100 }, (_, i) => ({
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

      // Should render all opportunities
      expect(container.querySelectorAll('[data-testid^="opportunity-"]')).toHaveLength(100)
    })

    it('should handle opportunities with varying content lengths', () => {
      const varyingOpportunities = [
        { ...mockOpportunities[0], description: 'Short' },
        { ...mockOpportunities[1], description: 'A'.repeat(500) },
      ]

      const onOpportunitySelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityList
          opportunities={varyingOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      expect(getByText('Short')).toBeInTheDocument()
      expect(getByText(/A{100,}/)).toBeInTheDocument()
    })

    it('should maintain performance with frequent updates', () => {
      const onOpportunitySelect = vi.fn()
      const { rerender } = renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      // Simulate multiple rapid updates
      for (let i = 0; i < 5; i++) {
        rerender(
          <OpportunityList
            opportunities={mockOpportunities.slice(0, i + 1)}
            onOpportunitySelect={onOpportunitySelect}
          />
        )
      }

      // Should still render correctly
      expect(screen.getByTestId('opportunity-list')).toBeInTheDocument()
    })
  })

  describe('Accessibility Features', () => {
    it('should have proper ARIA attributes for list', () => {
      const onOpportunitySelect = vi.fn()
      renderIsolated(
        <OpportunityList
          opportunities={mockOpportunities}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const list = screen.getByTestId('opportunity-list')
      expect(list).toHaveAttribute('role', 'list')
    })

    it('should announce loading states properly', () => {
      const onOpportunitySelect = vi.fn()
      const { getByText } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          loading={true}
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const loadingMessage = getByText('Loading opportunities...')
      expect(loadingMessage.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')
    })

    it('should have proper error announcement', () => {
      const onOpportunitySelect = vi.fn()
      const { getByRole } = renderIsolated(
        <OpportunityList
          opportunities={[]}
          error="Test error"
          onOpportunitySelect={onOpportunitySelect}
        />
      )

      const errorMessage = getByRole('alert')
      expect(errorMessage).toBeInTheDocument()
    })
  })
})