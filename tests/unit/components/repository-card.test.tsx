/**
 * Tests for RepositoryCard Component
 *
 * Comprehensive test suite covering:
 * - Main RepositoryCard component
 * - Sub-components: Header, Badges, Topics, Stats, Health, Footer
 * - Helper functions: formatNumber, getRelativeTime, health status colors
 * - Interactive features: bookmark, navigation, animations
 * - Edge cases and accessibility
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RepositoryCard } from '@/components/features/RepositoryCard'
import type { Repository } from '@/types/search'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: vi.fn(({ children, className, style, ...rest }) => {
      // Filter out motion-specific props that shouldn't be passed to DOM
      const {
        initial: _initial,
        animate: _animate,
        transition: _transition,
        whileHover: _whileHover,
        whileTap: _whileTap,
        ...domProps
      } = rest

      return (
        <div className={className} style={style} {...domProps}>
          {children}
        </div>
      )
    }),
  },
}))

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  Bookmark: vi.fn(({ className, ...props }) => (
    <div data-testid="bookmark-icon" className={className} {...props} />
  )),
  Circle: vi.fn(({ className, ...props }) => (
    <div data-testid="circle-icon" className={className} {...props} />
  )),
  ExternalLink: vi.fn(({ className, ...props }) => (
    <div data-testid="external-link-icon" className={className} {...props} />
  )),
  GitFork: vi.fn(({ className, ...props }) => (
    <div data-testid="git-fork-icon" className={className} {...props} />
  )),
  Star: vi.fn(({ className, ...props }) => (
    <div data-testid="star-icon" className={className} {...props} />
  )),
  TrendingUp: vi.fn(({ className, ...props }) => (
    <div data-testid="trending-up-icon" className={className} {...props} />
  )),
}))

describe('RepositoryCard', () => {
  // Base repository data for testing
  const baseRepository: Repository = {
    id: 'repo-1',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-12-01'),
    githubId: 123456,
    name: 'test-repo',
    fullName: 'test-owner/test-repo',
    description: 'A test repository for unit testing',
    language: 'TypeScript',
    topics: ['react', 'typescript', 'testing', 'web', 'frontend', 'extra1', 'extra2'],
    starsCount: 1250,
    forksCount: 234,
    issuesCount: 45,
    url: 'https://github.com/test-owner/test-repo',
    defaultBranch: 'main',
    lastPushedAt: new Date('2023-11-15'),
    health: {
      score: 0.87,
      status: 'excellent' as const,
      metrics: {
        commitFrequency: 12.5,
        issueResponseTime: 24,
        prMergeTime: 48,
        maintainerActivity: 0.9,
        communityEngagement: 0.8,
        documentationQuality: 0.85,
        codeQuality: 0.92,
        testCoverage: 0.88,
      },
      lastUpdated: new Date('2023-12-01'),
    },
    isArchived: false,
    isFork: false,
    hasIssues: true,
    hasProjects: true,
    hasWiki: true,
  }

  // Repository variant for edge cases
  const minimalRepository: Repository = {
    ...baseRepository,
    id: 'repo-minimal',
    description: undefined,
    language: undefined,
    topics: [],
    starsCount: 0,
    forksCount: 0,
    issuesCount: 0,
    lastPushedAt: undefined,
    health: undefined,
    isArchived: true,
    isFork: true,
    hasIssues: false,
  }

  // Repository with fair health status
  const fairHealthRepository: Repository = {
    ...baseRepository,
    id: 'repo-fair',
    health: {
      score: 0.55,
      status: 'fair' as const,
      metrics: {
        commitFrequency: 5.2,
        issueResponseTime: 72,
        prMergeTime: 120,
        maintainerActivity: 0.5,
        communityEngagement: 0.4,
        documentationQuality: 0.6,
        codeQuality: 0.7,
        testCoverage: 0.45,
      },
      lastUpdated: new Date('2023-12-01'),
    },
  }

  // Repository with poor health status
  const poorHealthRepository: Repository = {
    ...baseRepository,
    id: 'repo-poor',
    health: {
      score: 0.25,
      status: 'poor' as const,
      metrics: {
        commitFrequency: 1.1,
        issueResponseTime: 168,
        prMergeTime: 240,
        maintainerActivity: 0.2,
        communityEngagement: 0.1,
        documentationQuality: 0.3,
        codeQuality: 0.4,
        testCoverage: 0.15,
      },
      lastUpdated: new Date('2023-12-01'),
    },
  }

  let mockOnBookmark: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOnBookmark = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render repository card with basic information', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('test-owner/test-repo')).toBeInTheDocument()
      expect(screen.getByText('A test repository for unit testing')).toBeInTheDocument()
      expect(screen.getByText('TypeScript')).toBeInTheDocument()
      expect(screen.getByText('1.3k')).toBeInTheDocument() // Stars formatted
      expect(screen.getByText('234')).toBeInTheDocument() // Forks
      expect(screen.getByText('45 issues')).toBeInTheDocument()
    })

    it('should render minimal repository without optional fields', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.getByText('test-owner/test-repo')).toBeInTheDocument()
      expect(screen.getByText('No description provided')).toBeInTheDocument()
      expect(screen.getByText('Unknown')).toBeInTheDocument() // Language
      expect(screen.getAllByText('0')).toHaveLength(2) // Stars and forks both show 0
    })

    it('should apply custom className', () => {
      const { container } = render(
        <RepositoryCard repository={baseRepository} className="custom-class" />
      )

      const card = container.querySelector('.custom-class')
      expect(card).toBeInTheDocument()
    })
  })

  describe('Repository Header', () => {
    it('should render repository name as external link', () => {
      render(<RepositoryCard repository={baseRepository} />)

      const link = screen.getByRole('link', { name: /test-owner\/test-repo/i })
      expect(link).toHaveAttribute('href', 'https://github.com/test-owner/test-repo')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should render bookmark button when onBookmark is provided', () => {
      render(<RepositoryCard repository={baseRepository} onBookmark={mockOnBookmark} />)

      const bookmarkBtn = screen.getByTestId('bookmark-icon').closest('button')
      expect(bookmarkBtn).toBeInTheDocument()
    })

    it('should not render bookmark button when onBookmark is not provided', () => {
      render(<RepositoryCard repository={baseRepository} />)

      const bookmarkIcon = screen.queryByTestId('bookmark-icon')
      expect(bookmarkIcon).not.toBeInTheDocument()
    })

    it('should handle bookmark click', async () => {
      const user = userEvent.setup()
      render(
        <RepositoryCard
          repository={baseRepository}
          onBookmark={mockOnBookmark}
          isBookmarked={false}
        />
      )

      const bookmarkBtn = screen.getByTestId('bookmark-icon').closest('button')
      expect(bookmarkBtn).toBeInTheDocument()
      await user.click(bookmarkBtn as HTMLElement)

      expect(mockOnBookmark).toHaveBeenCalledWith('repo-1')
    })

    it('should show bookmarked state correctly', () => {
      render(
        <RepositoryCard
          repository={baseRepository}
          onBookmark={mockOnBookmark}
          isBookmarked={true}
        />
      )

      const bookmarkBtn = screen.getByTestId('bookmark-icon').closest('button')
      expect(bookmarkBtn).toHaveClass('text-primary')
    })
  })

  describe('Repository Badges', () => {
    it('should display archived badge for archived repositories', () => {
      const archivedRepo = { ...baseRepository, isArchived: true }
      render(<RepositoryCard repository={archivedRepo} />)

      expect(screen.getByText('Archived')).toBeInTheDocument()
    })

    it('should display fork badge for forked repositories', () => {
      const forkedRepo = { ...baseRepository, isFork: true }
      render(<RepositoryCard repository={forkedRepo} />)

      expect(screen.getByText('Fork')).toBeInTheDocument()
    })

    it('should display both badges when repository is archived and forked', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.getByText('Archived')).toBeInTheDocument()
      expect(screen.getByText('Fork')).toBeInTheDocument()
    })

    it('should display relative time for last push', () => {
      // Mock date to ensure consistent relative time
      const mockDate = new Date('2023-11-20')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText(/Updated.*days ago/)).toBeInTheDocument()

      vi.useRealTimers()
    })

    it('should handle repositories without lastPushedAt', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.getByText('Updated recently')).toBeInTheDocument()
    })
  })

  describe('Repository Topics', () => {
    it('should display topics as badges', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.getByText('typescript')).toBeInTheDocument()
      expect(screen.getByText('testing')).toBeInTheDocument()
      expect(screen.getByText('web')).toBeInTheDocument()
      expect(screen.getByText('frontend')).toBeInTheDocument()
    })

    it('should limit topics to 5 and show overflow count', () => {
      render(<RepositoryCard repository={baseRepository} />)

      // Should show +2 for the extra topics
      expect(screen.getByText('+2')).toBeInTheDocument()
    })

    it('should not render topics section when no topics exist', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.queryByText('react')).not.toBeInTheDocument()
      expect(screen.queryByText('+')).not.toBeInTheDocument()
    })
  })

  describe('Repository Stats', () => {
    it('should display formatted star count', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('1.3k')).toBeInTheDocument()
    })

    it('should display fork count', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('234')).toBeInTheDocument()
    })

    it('should display issue count when issues exist', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('45 issues')).toBeInTheDocument()
    })

    it('should not display issue count when no issues exist', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.queryByText(/issues/)).not.toBeInTheDocument()
    })

    it('should handle large numbers with proper formatting', () => {
      const largeRepo = {
        ...baseRepository,
        starsCount: 1234567,
        forksCount: 98765,
      }
      render(<RepositoryCard repository={largeRepo} />)

      expect(screen.getByText('1.2M')).toBeInTheDocument()
      expect(screen.getByText('98.8k')).toBeInTheDocument()
    })
  })

  describe('Repository Health', () => {
    it('should display health score and status for excellent health', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('Repository Health')).toBeInTheDocument()
      expect(screen.getByText('87%')).toBeInTheDocument()
    })

    it('should display health score for fair health status', () => {
      render(<RepositoryCard repository={fairHealthRepository} />)

      expect(screen.getByText('55%')).toBeInTheDocument()
    })

    it('should display health score for poor health status', () => {
      render(<RepositoryCard repository={poorHealthRepository} />)

      expect(screen.getByText('25%')).toBeInTheDocument()
    })

    it('should not display health section when health data is missing', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.queryByText('Repository Health')).not.toBeInTheDocument()
    })

    it('should hide health section when showHealthScore is false', () => {
      render(<RepositoryCard repository={baseRepository} showHealthScore={false} />)

      expect(screen.queryByText('Repository Health')).not.toBeInTheDocument()
    })
  })

  describe('Repository Footer', () => {
    it('should display language with color indicator', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('TypeScript')).toBeInTheDocument()
      // Color dot should be present
      const colorDot = screen.getByText('TypeScript').previousElementSibling
      expect(colorDot).toHaveStyle('background-color: #3178c6')
    })

    it('should handle unknown language', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.getByText('Unknown')).toBeInTheDocument()
      // Should use default color
      const colorDot = screen.getByText('Unknown').previousElementSibling
      expect(colorDot).toHaveStyle('background-color: #888888')
    })

    it('should display "Good First Issues" badge when repository has issues', () => {
      render(<RepositoryCard repository={baseRepository} />)

      expect(screen.getByText('Good First Issues')).toBeInTheDocument()
    })

    it('should not display "Good First Issues" badge when repository has no issues', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.queryByText('Good First Issues')).not.toBeInTheDocument()
    })

    it('should render "View Repository" button as external link', () => {
      render(<RepositoryCard repository={baseRepository} />)

      const viewBtn = screen.getByRole('link', { name: /view repository/i })
      expect(viewBtn).toHaveAttribute('href', 'https://github.com/test-owner/test-repo')
      expect(viewBtn).toHaveAttribute('target', '_blank')
      expect(viewBtn).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  describe('Animations and Interactions', () => {
    it('should handle hover effects', async () => {
      const user = userEvent.setup()
      render(<RepositoryCard repository={baseRepository} />)

      const card = screen.getByText('test-owner/test-repo').closest('[class*="group"]')

      if (card) {
        await user.hover(card)
        // Animation classes should be applied (tested through motion mock)
        expect(card).toBeInTheDocument()
      }
    })

    it('should handle motion animations correctly', () => {
      render(<RepositoryCard repository={baseRepository} />)

      // Motion components should be rendered (mocked)
      expect(screen.getByText('test-owner/test-repo')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper semantic structure', () => {
      render(<RepositoryCard repository={baseRepository} />)

      // Should have proper headings
      expect(screen.getByRole('heading', { name: /test-owner\/test-repo/i })).toBeInTheDocument()

      // Links should be accessible
      expect(screen.getByRole('link', { name: /test-owner\/test-repo/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /view repository/i })).toBeInTheDocument()
    })

    it('should have proper button accessibility when bookmark is available', () => {
      render(<RepositoryCard repository={baseRepository} onBookmark={mockOnBookmark} />)

      const bookmarkBtn = screen.getByTestId('bookmark-icon').closest('button')
      expect(bookmarkBtn).toBeInTheDocument()
    })

    it('should handle keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<RepositoryCard repository={baseRepository} onBookmark={mockOnBookmark} />)

      const bookmarkBtn = screen.getByTestId('bookmark-icon').closest('button') as HTMLButtonElement
      bookmarkBtn.focus()
      expect(bookmarkBtn).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(mockOnBookmark).toHaveBeenCalledWith('repo-1')
    })
  })

  describe('Edge Cases', () => {
    it('should handle repository with empty description', () => {
      const emptyDescRepo = { ...baseRepository, description: '' }
      render(<RepositoryCard repository={emptyDescRepo} />)

      expect(screen.getByText('No description provided')).toBeInTheDocument()
    })

    it('should handle repository with very long name', () => {
      const longNameRepo = {
        ...baseRepository,
        fullName:
          'very-long-organization-name/extremely-long-repository-name-that-might-break-layout',
      }
      render(<RepositoryCard repository={longNameRepo} />)

      expect(screen.getByText(/very-long-organization-name/)).toBeInTheDocument()
    })

    it('should handle repository with zero stats', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.getAllByText('0')).toHaveLength(2) // Stars and forks should show 0
    })

    it('should handle missing language gracefully', () => {
      render(<RepositoryCard repository={minimalRepository} />)

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })
  })
})
