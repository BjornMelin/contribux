/**
 * Search and Repository Discovery E2E Tests
 * Comprehensive testing of search functionality, filters, and repository discovery
 */

import { expect, test } from '@playwright/test'
import { E2ETestUtils, assertions, testData } from './utils/test-helpers'

test.describe('Search and Repository Discovery', () => {
  let utils: E2ETestUtils
  let errors: string[]
  let networkRequests: Array<{ url: string; method: string; status?: number }>

  test.beforeEach(async ({ page }) => {
    utils = new E2ETestUtils(page)
    errors = utils.page.setupErrorMonitoring()
    networkRequests = utils.page.setupNetworkMonitoring()
  })

  test.describe('Search Interface Testing', () => {
    test('should render search interface correctly', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()

      // Check for search components
      const searchInput = page.locator(
        '.search-input, [aria-label="Search input"], input[type="text"]'
      )
      const searchButton = page.locator(
        '.search-button, [aria-label="Search"], button[type="submit"]'
      )

      await expect(searchInput).toBeVisible()
      await expect(searchButton).toBeVisible()

      // Test placeholder text
      const placeholder = await searchInput.getAttribute('placeholder')
      expect(placeholder).toContain('Search')

      // Test initial state
      await expect(searchButton).toBeDisabled() // Should be disabled with empty input

      await utils.page.takeScreenshot('search-interface-initial')
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle search input validation', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()

      const searchInput = page.locator('.search-input, [aria-label="Search input"]')
      const searchButton = page.locator('.search-button, [aria-label="Search"]')

      // Test empty search
      await searchInput.fill('')
      await expect(searchButton).toBeDisabled()

      // Test whitespace only
      await searchInput.fill('   ')
      await expect(searchButton).toBeDisabled()

      // Test valid input
      await searchInput.fill('react')
      await expect(searchButton).toBeEnabled()

      // Test maximum length
      const longQuery = 'a'.repeat(500)
      await searchInput.fill(longQuery)

      const inputValue = await searchInput.inputValue()
      expect(inputValue.length).toBeLessThanOrEqual(500)

      await utils.page.takeScreenshot('search-input-validation')
    })

    test('should support keyboard shortcuts and interactions', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()

      const searchInput = page.locator('.search-input, [aria-label="Search input"]')

      // Test focus
      await searchInput.focus()
      await expect(searchInput).toBeFocused()

      // Test typing
      await page.keyboard.type('typescript')
      expect(await searchInput.inputValue()).toBe('typescript')

      // Test Enter key to search
      await page.keyboard.press('Enter')

      // Wait for search to initiate
      await page.waitForTimeout(1000)

      // Test Escape to clear (if implemented)
      await searchInput.focus()
      await page.keyboard.press('Escape')

      // Test Ctrl+A to select all
      await page.keyboard.press('Control+a')
      await page.keyboard.type('new search')
      expect(await searchInput.inputValue()).toBe('new search')

      await utils.page.takeScreenshot('search-keyboard-interactions')
    })
  })

  test.describe('Search Results Testing', () => {
    test('should display search results correctly', async ({ page }) => {
      // Mock successful search results
      await page.route('/api/search/**', async route => {
        const url = route.request().url()

        if (url.includes('opportunities')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                opportunities: testData.opportunities.sampleData,
                total: testData.opportunities.sampleData.length,
                page: 1,
                perPage: 10,
              },
            }),
          })
        } else if (url.includes('repositories')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                repositories: testData.search.githubRepos,
                total: testData.search.githubRepos.length,
                page: 1,
                perPage: 10,
              },
            }),
          })
        }
      })

      await page.goto('/search')
      await utils.page.waitForFullLoad()

      // Perform search
      await utils.search.performSearch('react')

      // Verify results are displayed
      const resultCards = page.locator(
        '.opportunity-card, .repository-card, [data-testid="result-item"]'
      )
      expect(await resultCards.count()).toBeGreaterThan(0)

      // Check result structure
      const firstResult = resultCards.first()
      await expect(firstResult).toBeVisible()

      // Verify result content
      const resultText = await firstResult.textContent()
      expect(resultText).toBeTruthy()
      expect(resultText?.length).toBeGreaterThan(0)

      await utils.page.takeScreenshot('search-results-display')
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle empty search results', async ({ page }) => {
      // Mock empty results
      await page.route('/api/search/**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              opportunities: [],
              repositories: [],
              total: 0,
              page: 1,
              perPage: 10,
            },
          }),
        })
      })

      await page.goto('/search')
      await utils.page.waitForFullLoad()

      await utils.search.performSearch('nonexistentquery123')

      // Verify empty state
      const noResultsMessage = page.locator(
        'text=No results found, .empty-state, [data-testid="no-results"]'
      )
      await expect(noResultsMessage).toBeVisible()

      // Check for helpful suggestions
      const suggestions = page.locator(
        '.suggestions, .search-tips, [data-testid="search-suggestions"]'
      )
      if ((await suggestions.count()) > 0) {
        await expect(suggestions).toBeVisible()
      }

      await utils.page.takeScreenshot('search-empty-results')
    })

    test('should handle search result pagination', async ({ page }) => {
      // Mock paginated results
      let currentPage = 1

      await page.route('/api/search/**', async route => {
        const url = new URL(route.request().url())
        const page = Number.parseInt(url.searchParams.get('page') || '1')
        currentPage = page

        const results = Array.from({ length: 10 }, (_, i) => ({
          id: `item-${page}-${i}`,
          title: `Result ${page * 10 + i}`,
          repository: 'test/repo',
          difficulty: 'beginner',
          language: 'JavaScript',
        }))

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              opportunities: results,
              total: 50, // Total of 5 pages
              page: currentPage,
              perPage: 10,
            },
          }),
        })
      })

      await page.goto('/search')
      await utils.page.waitForFullLoad()

      await utils.search.performSearch('react')

      // Check for pagination controls
      const pagination = page.locator('.pagination, [data-testid="pagination"]')
      const nextButton = page.locator('button:has-text("Next"), [data-testid="next-page"]')
      const prevButton = page.locator(
        'button:has-text("Previous"), button:has-text("Prev"), [data-testid="prev-page"]'
      )

      if ((await pagination.count()) > 0) {
        await expect(pagination).toBeVisible()

        // Test next page
        if ((await nextButton.count()) > 0) {
          await nextButton.click()
          await utils.search.waitForSearchResults()

          // Verify page changed
          const newResults = page.locator('.opportunity-card, .repository-card')
          expect(await newResults.count()).toBeGreaterThan(0)

          await utils.page.takeScreenshot('search-pagination-page2')

          // Test previous page
          if ((await prevButton.count()) > 0) {
            await prevButton.click()
            await utils.search.waitForSearchResults()
          }
        }
      }

      await utils.page.takeScreenshot('search-pagination')
    })
  })

  test.describe('Search Filters Testing', () => {
    test('should apply and clear search filters', async ({ page }) => {
      // Mock filtered results
      await page.route('/api/search/**', async route => {
        const url = new URL(route.request().url())
        const language = url.searchParams.get('language')
        const difficulty = url.searchParams.get('difficulty')

        const filteredResults = testData.opportunities.sampleData.filter(item => {
          if (language && item.language !== language) return false
          if (difficulty && item.difficulty !== difficulty) return false
          return true
        })

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              opportunities: filteredResults,
              total: filteredResults.length,
              page: 1,
              perPage: 10,
            },
          }),
        })
      })

      await page.goto('/search')
      await utils.page.waitForFullLoad()

      // Initial search
      await utils.search.performSearch('react')
      const initialCount = await utils.search.getResultCount()

      // Apply language filter
      const languageFilter = page.locator('[data-filter="language"], select[name="language"]')
      if ((await languageFilter.count()) > 0) {
        await languageFilter.selectOption('JavaScript')
        await utils.search.waitForSearchResults()

        const languageFilteredCount = await utils.search.getResultCount()
        console.log(`Results: ${initialCount} -> ${languageFilteredCount} (language filter)`)

        await utils.page.takeScreenshot('search-language-filter')
      }

      // Apply difficulty filter
      const difficultyFilter = page.locator('[data-filter="difficulty"], select[name="difficulty"]')
      if ((await difficultyFilter.count()) > 0) {
        await difficultyFilter.selectOption('beginner')
        await utils.search.waitForSearchResults()

        const difficultyFilteredCount = await utils.search.getResultCount()
        console.log(`Results after difficulty filter: ${difficultyFilteredCount}`)

        await utils.page.takeScreenshot('search-difficulty-filter')
      }

      // Clear filters
      const clearFiltersButton = page.locator(
        'button:has-text("Clear"), [data-testid="clear-filters"]'
      )
      if ((await clearFiltersButton.count()) > 0) {
        await clearFiltersButton.click()
        await utils.search.waitForSearchResults()

        const clearedCount = await utils.search.getResultCount()
        console.log(`Results after clearing filters: ${clearedCount}`)

        await utils.page.takeScreenshot('search-filters-cleared')
      }
    })

    test('should maintain filter state during navigation', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()

      // Apply filters
      await utils.search.performSearch('typescript')
      await utils.search.applyFilters({ language: 'TypeScript', difficulty: 'intermediate' })

      // Navigate away and back
      await page.goto('/')
      await utils.page.waitForFullLoad()

      await page.goBack()
      await utils.page.waitForFullLoad()

      // Check if filters are maintained (if implemented)
      const languageFilter = page.locator('[data-filter="language"]')
      const difficultyFilter = page.locator('[data-filter="difficulty"]')

      if ((await languageFilter.count()) > 0) {
        const selectedLanguage = await languageFilter.inputValue()
        console.log('Maintained language filter:', selectedLanguage)
      }

      if ((await difficultyFilter.count()) > 0) {
        const selectedDifficulty = await difficultyFilter.inputValue()
        console.log('Maintained difficulty filter:', selectedDifficulty)
      }

      await utils.page.takeScreenshot('search-filter-state-maintenance')
    })
  })

  test.describe('Repository Discovery Testing', () => {
    test('should display repository information correctly', async ({ page }) => {
      // Mock repository data
      await page.route('/api/search/repositories**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              repositories: [
                {
                  id: 1,
                  name: 'facebook/react',
                  description:
                    'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
                  language: 'JavaScript',
                  stars: 220000,
                  forks: 45000,
                  openIssues: 800,
                  lastUpdated: '2024-01-15T10:30:00Z',
                  topics: ['javascript', 'react', 'ui', 'frontend'],
                  license: 'MIT',
                  url: 'https://github.com/facebook/react',
                },
              ],
              total: 1,
              page: 1,
              perPage: 10,
            },
          }),
        })
      })

      await page.goto('/search')
      await utils.page.waitForFullLoad()

      await utils.search.performSearch('react')

      // Verify repository card content
      const repoCard = page.locator('.repository-card, [data-testid="repository-card"]').first()

      if ((await repoCard.count()) > 0) {
        await expect(repoCard).toBeVisible()

        // Check for repository name
        await expect(repoCard).toContainText('facebook/react')

        // Check for description
        await expect(repoCard).toContainText('declarative')

        // Check for language
        await expect(repoCard).toContainText('JavaScript')

        // Check for stats (stars, forks)
        await expect(repoCard).toContainText(/\d+/)

        await utils.page.takeScreenshot('repository-card-display')
      }
    })

    test('should handle repository detail view', async ({ page }) => {
      // Mock repository detail data
      await page.route('/api/repositories/**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              repository: {
                id: 1,
                name: 'facebook/react',
                fullName: 'facebook/react',
                description:
                  'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
                language: 'JavaScript',
                stars: 220000,
                forks: 45000,
                openIssues: 800,
                watchers: 6500,
                size: 15000,
                defaultBranch: 'main',
                createdAt: '2013-05-24T16:15:54Z',
                updatedAt: '2024-01-15T10:30:00Z',
                pushedAt: '2024-01-15T09:45:00Z',
                license: { name: 'MIT License', spdxId: 'MIT' },
                topics: ['javascript', 'react', 'ui', 'frontend'],
                readme: '# React\n\nA JavaScript library for building user interfaces.',
                contributingGuidelines: 'Please read our contributing guidelines.',
                codeOfConduct: 'Be respectful to all contributors.',
                goodFirstIssues: [
                  {
                    id: 1,
                    number: 12345,
                    title: 'Add prop validation example',
                    difficulty: 'beginner',
                    labels: ['good first issue', 'documentation'],
                  },
                ],
              },
            },
          }),
        })
      })

      await page.goto('/repositories/facebook/react')
      await utils.page.waitForFullLoad()

      // Verify repository detail page
      await expect(page.locator('h1, .repository-title')).toContainText('facebook/react')

      // Check for repository stats
      await expect(page.locator('body')).toContainText('220000') // stars
      await expect(page.locator('body')).toContainText('JavaScript') // language

      // Check for description
      await expect(page.locator('body')).toContainText('declarative')

      // Check for good first issues section
      const goodFirstIssues = page.locator('.good-first-issues, [data-testid="good-first-issues"]')
      if ((await goodFirstIssues.count()) > 0) {
        await expect(goodFirstIssues).toBeVisible()
        await expect(goodFirstIssues).toContainText('good first issue')
      }

      await utils.page.takeScreenshot('repository-detail-view')
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle repository bookmarking', async ({ page }) => {
      // Mock authentication and bookmarking
      await utils.auth.mockSuccessfulAuth('github')

      await page.route('/api/bookmarks/**', async route => {
        const method = route.request().method()

        if (method === 'POST') {
          // Add bookmark
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { bookmarked: true },
            }),
          })
        } else if (method === 'DELETE') {
          // Remove bookmark
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { bookmarked: false },
            }),
          })
        }
      })

      await page.goto('/repositories/facebook/react')
      await utils.page.waitForFullLoad()

      // Find bookmark button
      const bookmarkButton = page.locator(
        'button:has-text("Bookmark"), [data-testid="bookmark-button"]'
      )

      if ((await bookmarkButton.count()) > 0) {
        // Test bookmarking
        await bookmarkButton.click()
        await page.waitForTimeout(500)

        // Verify bookmark state changed
        await expect(bookmarkButton).toContainText(/bookmarked|saved/i)

        await utils.page.takeScreenshot('repository-bookmarked')

        // Test removing bookmark
        await bookmarkButton.click()
        await page.waitForTimeout(500)

        await expect(bookmarkButton).toContainText(/bookmark/i)

        await utils.page.takeScreenshot('repository-bookmark-removed')
      }
    })
  })

  test.describe('Search Performance Testing', () => {
    test('should perform search operations efficiently', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()

      // Measure search performance
      const searchQueries = testData.search.validQueries.slice(0, 3)
      const performanceResults = []

      for (const query of searchQueries) {
        const startTime = Date.now()

        await utils.search.performSearch(query)

        const searchTime = Date.now() - startTime
        performanceResults.push({
          query,
          searchTime,
          timestamp: new Date().toISOString(),
        })

        console.log(`Search "${query}" took ${searchTime}ms`)

        // Verify search completed within reasonable time
        expect(searchTime).toBeLessThan(5000) // 5 seconds max
      }

      // Test rapid successive searches
      const rapidSearchStart = Date.now()

      for (let i = 0; i < 3; i++) {
        await utils.search.performSearch(`test${i}`, false)
        await page.waitForTimeout(100)
      }

      const rapidSearchTime = Date.now() - rapidSearchStart
      console.log(`Rapid searches took ${rapidSearchTime}ms`)

      await utils.page.takeScreenshot('search-performance-test')
    })

    test('should handle concurrent search requests', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()

      // Simulate concurrent searches in different tabs
      const promises = testData.search.validQueries.slice(0, 3).map(async (query, index) => {
        const newPage = await page.context().newPage()
        const newUtils = new E2ETestUtils(newPage)

        await newPage.goto('/search')
        await newUtils.page.waitForFullLoad()

        const startTime = Date.now()
        await newUtils.search.performSearch(query)
        const endTime = Date.now()

        await newPage.close()

        return {
          query,
          duration: endTime - startTime,
          index,
        }
      })

      const results = await Promise.all(promises)

      // Verify all searches completed successfully
      expect(results).toHaveLength(3)

      for (const result of results) {
        expect(result.duration).toBeLessThan(10000) // 10 seconds max for concurrent
        console.log(`Concurrent search "${result.query}" took ${result.duration}ms`)
      }
    })
  })

  test.afterEach(async () => {
    // Log search-related performance metrics
    const searchRequests = networkRequests.filter(req => req.url.includes('/api/search'))
    if (searchRequests.length > 0) {
      console.log('Search API requests:', searchRequests)
    }

    // Clean up
    await utils.page.clearBrowserData()
  })
})
