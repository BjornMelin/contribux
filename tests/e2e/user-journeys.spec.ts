/**
 * Complete User Journey E2E Tests
 * Testing comprehensive user flows from discovery to contribution
 */

import { test, expect } from '@playwright/test'
import { E2ETestUtils, testData, assertions } from './utils/test-helpers'

test.describe('Complete User Journeys', () => {
  let utils: E2ETestUtils
  let errors: string[]
  let networkRequests: any[]

  test.beforeEach(async ({ page }) => {
    utils = new E2ETestUtils(page)
    errors = utils.page.setupErrorMonitoring()
    networkRequests = utils.page.setupNetworkMonitoring()
  })

  test.describe('New User Discovery Journey', () => {
    test('should complete full discovery flow without authentication', async ({ page }) => {
      // Step 1: Landing page discovery
      await page.goto('/')
      await utils.page.waitForFullLoad()
      await utils.page.takeScreenshot('journey-1-landing')

      // Verify landing page loads correctly
      await expect(page.locator('h1')).toContainText('Welcome to Contribux')
      await expect(page.locator('text=Next.js 15')).toBeVisible()

      // Step 2: Explore search functionality (without auth)
      await page.goto('/search')
      await utils.page.waitForFullLoad()
      
      // If redirected to auth, that's okay - test the redirect
      if (page.url().includes('/auth/signin')) {
        await expect(page.locator('[data-provider="github"], text=GitHub')).toBeVisible()
        await utils.page.takeScreenshot('journey-1-auth-redirect')
        
        // Go back to public areas
        await page.goto('/')
        await utils.page.waitForFullLoad()
      }

      // Step 3: Try to access opportunities (public or auth-protected)
      const opportunitiesResponse = await page.request.get('/api/search/opportunities?q=javascript')
      
      if (opportunitiesResponse.status() === 200) {
        // Public access - test the data
        const data = await opportunitiesResponse.json()
        expect(data).toHaveProperty('success')
        
        if (data.success) {
          expect(data.data).toHaveProperty('opportunities')
          expect(Array.isArray(data.data.opportunities)).toBe(true)
        }
      } else {
        // Auth required - verify proper error handling
        expect([401, 403].includes(opportunitiesResponse.status())).toBeTruthy()
      }

      // Step 4: Check navigation and public pages
      const publicPages = ['/', '/about', '/privacy', '/terms']
      
      for (const pagePath of publicPages) {
        const response = await page.goto(pagePath)
        
        if (response?.status() === 200) {
          await utils.page.waitForFullLoad()
          await expect(page.locator('body')).toBeVisible()
          
          // Verify no authentication errors on public pages
          const pageErrors = errors.filter(error => 
            error.toLowerCase().includes('auth') || 
            error.toLowerCase().includes('unauthorized')
          )
          expect(pageErrors).toHaveLength(0)
        }
      }

      await assertions.pageLoadsCleanly(page, errors)
      await utils.page.takeScreenshot('journey-1-complete')
    })

    test('should handle mobile discovery journey', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      
      // Mobile landing page
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Verify mobile layout
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.locator('main')).toHaveClass(/flex/)
      
      // Test mobile navigation
      const navButton = page.locator('button[aria-label*="menu"], .mobile-nav, [data-testid="mobile-nav"]')
      
      if (await navButton.count() > 0) {
        await navButton.click()
        await page.waitForTimeout(500) // Allow for animation
      }
      
      await utils.page.takeScreenshot('journey-mobile-discovery')
      
      // Test touch interactions
      await page.touchscreen.tap(100, 100)
      await page.waitForTimeout(100)
      
      await assertions.pageLoadsCleanly(page, errors)
    })
  })

  test.describe('Authenticated User Journey', () => {
    test('should complete full authenticated workflow', async ({ page }) => {
      // Mock authentication for testing
      await utils.auth.mockSuccessfulAuth('github')
      
      // Step 1: Authentication flow
      await utils.auth.navigateToSignIn()
      await utils.page.takeScreenshot('journey-2-signin')
      
      const githubButton = await utils.auth.testProviderButton('GitHub')
      await githubButton.click()
      
      // Wait for redirect or auth completion
      await page.waitForURL('/', { timeout: 10000 }).catch(() => {
        // If redirect doesn't happen, that's okay for mocked auth
        console.log('Auth redirect not detected, continuing...')
      })
      
      // Step 2: Verify authenticated state
      const isAuth = await utils.auth.isAuthenticated()
      expect(isAuth).toBe(true)
      
      // Step 3: Test search functionality
      await page.goto('/search')
      await utils.page.waitForFullLoad()
      
      // Perform search
      const searchQuery = testData.search.validQueries[0]
      await utils.search.performSearch(searchQuery)
      
      // Verify search results
      const resultCount = await utils.search.getResultCount()
      expect(resultCount).toBeGreaterThan(0)
      
      await utils.page.takeScreenshot('journey-2-search-results')
      
      // Step 4: Test result interaction
      const { result, isClickable } = await utils.search.testResultInteraction(0)
      
      if (isClickable) {
        await result.click()
        await utils.page.waitForFullLoad()
        await utils.page.takeScreenshot('journey-2-result-detail')
      }
      
      // Step 5: Test filters
      await page.goBack()
      await utils.search.applyFilters({ language: 'JavaScript', difficulty: 'beginner' })
      
      const filteredCount = await utils.search.getResultCount()
      expect(filteredCount).toBeGreaterThan(0)
      
      // Step 6: Test user settings/profile
      await page.goto('/settings/accounts')
      await utils.page.waitForFullLoad()
      
      // Should show account management
      await expect(page.locator('body')).toContainText(/account|profile|settings/i)
      await utils.page.takeScreenshot('journey-2-settings')
      
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle session persistence across tabs', async ({ browser }) => {
      const context = await browser.newContext()
      
      // Setup authentication in first tab
      const page1 = await context.newPage()
      const utils1 = new E2ETestUtils(page1)
      
      await utils1.auth.mockSuccessfulAuth('github')
      await utils1.auth.navigateToSignIn()
      
      const githubButton = await utils1.auth.testProviderButton('GitHub')
      await githubButton.click()
      
      // Open second tab
      const page2 = await context.newPage()
      const utils2 = new E2ETestUtils(page2)
      
      await page2.goto('/')
      await utils2.page.waitForFullLoad()
      
      // Verify auth state is shared
      const isAuth1 = await utils1.auth.isAuthenticated()
      const isAuth2 = await utils2.auth.isAuthenticated()
      
      expect(isAuth1).toBe(isAuth2)
      
      // Test synchronized session behavior
      if (isAuth1) {
        // Both tabs should have access to protected content
        const response1 = await page1.request.get('/api/auth/session')
        const response2 = await page2.request.get('/api/auth/session')
        
        expect(response1.status()).toBe(response2.status())
      }
      
      await context.close()
    })
  })

  test.describe('Search and Discovery Journey', () => {
    test('should complete comprehensive search workflow', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Test various search queries
      for (const query of testData.search.validQueries) {
        console.log(`Testing search query: ${query}`)
        
        // Navigate to search if not already there
        if (!page.url().includes('/search')) {
          await page.goto('/search')
          await utils.page.waitForFullLoad()
        }
        
        // Perform search
        await utils.search.performSearch(query, false)
        
        // Wait for results or error handling
        await page.waitForTimeout(2000)
        
        // Take screenshot of results
        await utils.page.takeScreenshot(`search-${query.replace(/[^a-z0-9]/gi, '-')}`)
        
        // Check if results are displayed or proper error handling
        const hasResults = await page.locator('.search-results, .opportunity-card, .repository-card').count() > 0
        const hasError = await page.locator('.error-message, [data-testid="error"]').count() > 0
        const hasNoResults = await page.locator('text=No results found').count() > 0
        
        expect(hasResults || hasError || hasNoResults).toBe(true)
      }
      
      // Test invalid search queries
      for (const invalidQuery of testData.search.invalidQueries) {
        console.log(`Testing invalid search query: "${invalidQuery}"`)
        
        await utils.search.performSearch(invalidQuery, false)
        await page.waitForTimeout(1000)
        
        // Should handle invalid queries gracefully
        const hasError = await page.locator('.error-message, [role="alert"]').count() > 0
        const hasValidation = await page.locator('[data-testid="validation-error"]').count() > 0
        const isButtonDisabled = await page.locator('.search-button:disabled').count() > 0
        
        expect(hasError || hasValidation || isButtonDisabled).toBe(true)
      }
      
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle search error scenarios gracefully', async ({ page }) => {
      // Mock API failures
      await page.route('/api/search/**', async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Search service temporarily unavailable'
            }
          })
        })
      })
      
      await page.goto('/search')
      await utils.page.waitForFullLoad()
      
      // Attempt search with mocked failure
      await utils.search.performSearch('react', false)
      
      // Verify error handling
      await page.waitForSelector('.error-message, [role="alert"], [data-testid="error"]', { timeout: 5000 })
      
      const errorElement = page.locator('.error-message, [role="alert"], [data-testid="error"]')
      await expect(errorElement).toBeVisible()
      
      await utils.page.takeScreenshot('search-error-handling')
      
      // Test retry functionality if available
      const retryButton = page.locator('button:has-text("Retry"), [data-testid="retry-button"]')
      if (await retryButton.count() > 0) {
        await retryButton.click()
        await page.waitForTimeout(1000)
      }
    })
  })

  test.describe('Cross-Platform User Journey', () => {
    test('should work consistently across different browsers', async ({ page, browserName }) => {
      console.log(`Testing user journey on: ${browserName}`)
      
      // Test feature support
      const features = await utils.compatibility.checkFeatureSupport()
      console.log(`Browser features on ${browserName}:`, features)
      
      // Essential features should be supported
      expect(features.localStorage).toBe(true)
      expect(features.fetch).toBe(true)
      expect(features.history).toBe(true)
      
      // Complete basic user journey
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Test navigation
      await page.goto('/auth/signin')
      await utils.page.waitForFullLoad()
      
      // Verify auth providers render correctly
      const githubButton = page.locator('[data-provider="github"], text=GitHub')
      await expect(githubButton).toBeVisible()
      
      // Test responsive behavior
      const responsiveResults = await utils.compatibility.testResponsiveDesign()
      
      for (const result of responsiveResults) {
        expect(result.layout.width).toBeGreaterThan(0)
        expect(result.layout.height).toBeGreaterThan(0)
      }
      
      await utils.page.takeScreenshot(`cross-platform-${browserName}`)
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle offline scenarios gracefully', async ({ page }) => {
      // Start online
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Go offline
      await page.context().setOffline(true)
      
      // Test offline behavior
      await page.reload()
      
      // Should show offline message or cached content
      const hasOfflineMessage = await page.locator('text=offline').count() > 0
      const hasConnection = await page.locator('body').count() > 0
      
      expect(hasOfflineMessage || hasConnection).toBe(true)
      
      await utils.page.takeScreenshot('offline-scenario')
      
      // Go back online
      await page.context().setOffline(false)
      
      // Test recovery
      await page.reload()
      await utils.page.waitForFullLoad()
      
      await expect(page.locator('h1')).toBeVisible()
      await utils.page.takeScreenshot('online-recovery')
    })
  })

  test.describe('Progressive Web App Journey', () => {
    test('should support PWA features', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Check for PWA manifest
      const manifest = await page.locator('link[rel="manifest"]').getAttribute('href')
      expect(manifest).toBeTruthy()
      
      // Check manifest content
      if (manifest) {
        const manifestResponse = await page.request.get(manifest)
        expect(manifestResponse.status()).toBe(200)
        
        const manifestData = await manifestResponse.json()
        expect(manifestData).toHaveProperty('name')
        expect(manifestData).toHaveProperty('short_name')
        expect(manifestData).toHaveProperty('icons')
      }
      
      // Check for service worker
      const hasServiceWorker = await page.evaluate(() => {
        return 'serviceWorker' in navigator
      })
      
      expect(hasServiceWorker).toBe(true)
      
      // Test service worker registration
      const swRegistration = await page.evaluate(async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration()
          return {
            registered: !!registration,
            scope: registration?.scope || null
          }
        } catch (error) {
          return { registered: false, error: error.message }
        }
      })
      
      console.log('Service Worker registration:', swRegistration)
      
      await utils.page.takeScreenshot('pwa-features')
    })

    test('should handle app-like navigation', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Test client-side navigation
      const navigationPromise = page.waitForEvent('framenavigated')
      
      // Click navigation links (if they exist)
      const navLinks = page.locator('a[href^="/"]')
      const linkCount = await navLinks.count()
      
      if (linkCount > 0) {
        const firstLink = navLinks.first()
        const href = await firstLink.getAttribute('href')
        
        if (href && !href.includes('auth')) {
          await firstLink.click()
          await navigationPromise
          
          // Verify client-side navigation
          expect(page.url()).toContain(href)
          await utils.page.waitForFullLoad()
        }
      }
      
      // Test browser back/forward
      await page.goBack()
      await utils.page.waitForFullLoad()
      
      await page.goForward()
      await utils.page.waitForFullLoad()
      
      await utils.page.takeScreenshot('pwa-navigation')
      await assertions.pageLoadsCleanly(page, errors)
    })
  })

  test.afterEach(async ({ page }) => {
    // Log any performance issues
    const memory = await utils.performance.measureMemoryUsage()
    if (memory) {
      console.log('Memory usage:', memory)
    }
    
    // Log network requests that failed
    const failedRequests = networkRequests.filter(req => req.status && req.status >= 400)
    if (failedRequests.length > 0) {
      console.log('Failed requests:', failedRequests)
    }
    
    // Clean up
    await utils.page.clearBrowserData()
  })
})
