/**
 * Enhanced E2E Test Utilities and Helpers
 * Comprehensive utilities for end-to-end testing across all user journeys
 */

import { expect, type Page, type BrowserContext, type Locator } from '@playwright/test'

// Test data and fixtures
export const testData = {
  search: {
    validQueries: ['react', 'typescript', 'nextjs', 'open source'],
    invalidQueries: ['', '   ', 'x'.repeat(1000)],
    githubRepos: [
      { name: 'facebook/react', language: 'JavaScript' },
      { name: 'microsoft/TypeScript', language: 'TypeScript' },
      { name: 'vercel/next.js', language: 'JavaScript' },
    ],
  },
  auth: {
    providers: ['github', 'google'],
    mockUsers: [
      {
        id: 'test-user-1',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
      },
    ],
  },
  opportunities: {
    sampleData: [
      {
        id: '1',
        title: 'Good First Issue',
        repository: 'facebook/react',
        difficulty: 'beginner',
        language: 'JavaScript',
      },
    ],
  },
}

// Enhanced page utilities
export class PageHelpers {
  constructor(private page: Page) {}

  /**
   * Wait for page to be fully loaded including all async content
   */
  async waitForFullLoad(timeout = 10000) {
    await this.page.waitForLoadState('domcontentloaded')
    await this.page.waitForLoadState('networkidle', { timeout })
    
    // Wait for any React hydration to complete
    await this.page.waitForFunction(
      () => {
        // Check if React has finished hydrating
        const reactRoot = document.querySelector('[data-reactroot]')
        if (reactRoot) return true
        
        // Check for Next.js hydration
        return !document.documentElement.classList.contains('next-loading')
      },
      { timeout: 5000 }
    ).catch(() => {
      // Hydration check failed, but continue
      console.log('Hydration check timed out, continuing...')
    })
  }

  /**
   * Take a full page screenshot with proper naming
   */
  async takeScreenshot(name: string, options: { fullPage?: boolean; clip?: any } = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `test-results/screenshots/${name}-${timestamp}.png`
    
    await this.page.screenshot({
      path: filename,
      fullPage: options.fullPage ?? true,
      clip: options.clip,
    })
    
    return filename
  }

  /**
   * Monitor console errors during test execution
   */
  setupErrorMonitoring(): string[] {
    const errors: string[] = []
    
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    this.page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`)
    })
    
    return errors
  }

  /**
   * Monitor network requests for API calls
   */
  setupNetworkMonitoring() {
    const requests: Array<{ url: string; method: string; status?: number }> = []
    
    this.page.on('request', request => {
      if (request.url().includes('/api/')) {
        requests.push({
          url: request.url(),
          method: request.method(),
        })
      }
    })
    
    this.page.on('response', response => {
      const request = requests.find(req => req.url === response.url())
      if (request) {
        request.status = response.status()
      }
    })
    
    return requests
  }

  /**
   * Simulate slow network conditions
   */
  async simulateSlowNetwork() {
    await this.page.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.continue()
    })
  }

  /**
   * Clear all local storage and cookies
   */
  async clearBrowserData() {
    await this.page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    
    await this.page.context().clearCookies()
  }
}

// Authentication helpers
export class AuthHelpers {
  constructor(private page: Page) {}

  /**
   * Navigate to sign-in page and wait for it to load
   */
  async navigateToSignIn() {
    await this.page.goto('/auth/signin')
    await this.page.waitForLoadState('domcontentloaded')
    await this.page.waitForSelector('[data-provider], text=GitHub', { timeout: 10000 })
  }

  /**
   * Check if user is authenticated by checking session
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await this.page.request.get('/api/auth/session')
      if (response.status() === 200) {
        const session = await response.json()
        return session && session.user
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Mock successful authentication
   */
  async mockSuccessfulAuth(provider = 'github') {
    // Intercept auth requests and return success
    await this.page.route(`/api/auth/signin/${provider}`, async route => {
      await route.fulfill({
        status: 302,
        headers: {
          Location: '/?auth=success',
        },
      })
    })
    
    await this.page.route('/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: testData.auth.mockUsers[0],
          expires: new Date(Date.now() + 86400000).toISOString(),
        }),
      })
    })
  }

  /**
   * Test authentication provider button click
   */
  async testProviderButton(provider: string) {
    const button = this.page.locator(`[data-provider="${provider}"], text=${provider}`, {
      hasText: new RegExp(provider, 'i'),
    })
    
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
    
    return button
  }
}

// Search functionality helpers
export class SearchHelpers {
  constructor(private page: Page) {}

  /**
   * Perform a search operation
   */
  async performSearch(query: string, waitForResults = true) {
    const searchInput = this.page.locator('.search-input, [aria-label="Search input"]')
    const searchButton = this.page.locator('.search-button, [aria-label="Search"]')
    
    await searchInput.fill(query)
    await searchButton.click()
    
    if (waitForResults) {
      await this.waitForSearchResults()
    }
  }

  /**
   * Wait for search results to load
   */
  async waitForSearchResults(timeout = 10000) {
    await this.page.waitForSelector(
      '.search-results, .opportunity-card, .repository-card, [data-testid="search-results"]',
      { timeout }
    )
  }

  /**
   * Get search result count
   */
  async getResultCount(): Promise<number> {
    const results = this.page.locator('.opportunity-card, .repository-card, [data-testid="result-item"]')
    return await results.count()
  }

  /**
   * Apply search filters
   */
  async applyFilters(filters: { language?: string; difficulty?: string; type?: string }) {
    if (filters.language) {
      await this.page.selectOption('[data-filter="language"]', filters.language)
    }
    
    if (filters.difficulty) {
      await this.page.selectOption('[data-filter="difficulty"]', filters.difficulty)
    }
    
    if (filters.type) {
      await this.page.selectOption('[data-filter="type"]', filters.type)
    }
    
    await this.waitForSearchResults()
  }

  /**
   * Test search result interaction
   */
  async testResultInteraction(index = 0) {
    const results = this.page.locator('.opportunity-card, .repository-card')
    const result = results.nth(index)
    
    await expect(result).toBeVisible()
    await result.hover()
    
    // Check if result is clickable
    const isClickable = await result.evaluate(el => {
      const style = window.getComputedStyle(el)
      return style.cursor === 'pointer' || el.getAttribute('role') === 'button'
    })
    
    return { result, isClickable }
  }
}

// Accessibility testing helpers
export class AccessibilityHelpers {
  constructor(private page: Page) {}

  /**
   * Test keyboard navigation
   */
  async testKeyboardNavigation() {
    const focusableElements: string[] = []
    
    // Tab through all focusable elements
    for (let i = 0; i < 10; i++) {
      await this.page.keyboard.press('Tab')
      
      const focused = await this.page.evaluate(() => {
        const element = document.activeElement
        if (element && element !== document.body) {
          return {
            tagName: element.tagName,
            role: element.getAttribute('role'),
            ariaLabel: element.getAttribute('aria-label'),
            text: element.textContent?.trim().substring(0, 50),
          }
        }
        return null
      })
      
      if (focused) {
        focusableElements.push(JSON.stringify(focused))
      }
    }
    
    return focusableElements
  }

  /**
   * Check for ARIA labels and roles
   */
  async checkAriaCompliance() {
    const issues: string[] = []
    
    // Check buttons have accessible names
    const buttons = await this.page.locator('button').all()
    for (const button of buttons) {
      const ariaLabel = await button.getAttribute('aria-label')
      const text = await button.textContent()
      
      if (!ariaLabel && !text?.trim()) {
        issues.push('Button without accessible name found')
      }
    }
    
    // Check images have alt text
    const images = await this.page.locator('img').all()
    for (const img of images) {
      const alt = await img.getAttribute('alt')
      const ariaLabel = await img.getAttribute('aria-label')
      
      if (!alt && !ariaLabel) {
        issues.push('Image without alt text found')
      }
    }
    
    // Check form inputs have labels
    const inputs = await this.page.locator('input').all()
    for (const input of inputs) {
      const ariaLabel = await input.getAttribute('aria-label')
      const id = await input.getAttribute('id')
      
      let hasLabel = false
      if (ariaLabel) hasLabel = true
      if (id) {
        const label = await this.page.locator(`label[for="${id}"]`).count()
        if (label > 0) hasLabel = true
      }
      
      if (!hasLabel) {
        issues.push('Input without label found')
      }
    }
    
    return issues
  }

  /**
   * Test color contrast (basic check)
   */
  async checkColorContrast() {
    const elements = await this.page.locator('body *').all()
    const lowContrastElements: string[] = []
    
    for (const element of elements.slice(0, 20)) { // Check first 20 elements
      const styles = await element.evaluate(el => {
        const style = window.getComputedStyle(el)
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          tagName: el.tagName,
        }
      })
      
      // Basic contrast check (simplified)
      if (styles.color && styles.backgroundColor && 
          styles.color !== 'rgba(0, 0, 0, 0)' && 
          styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        // This is a simplified check - in real scenarios, use axe-core
        if (styles.color === styles.backgroundColor) {
          lowContrastElements.push(`${styles.tagName}: ${styles.color} on ${styles.backgroundColor}`)
        }
      }
    }
    
    return lowContrastElements
  }
}

// Performance testing helpers
export class PerformanceHelpers {
  constructor(private page: Page) {}

  /**
   * Measure page load performance
   */
  async measurePageLoad(url: string) {
    const startTime = Date.now()
    
    await this.page.goto(url)
    await this.page.waitForLoadState('domcontentloaded')
    
    const domContentLoaded = Date.now() - startTime
    
    await this.page.waitForLoadState('networkidle')
    const networkIdle = Date.now() - startTime
    
    // Get Core Web Vitals
    const vitals = await this.page.evaluate(() => {
      return new Promise(resolve => {
        let lcp = 0
        let fid = 0
        let cls = 0
        
        // LCP (Largest Contentful Paint)
        new PerformanceObserver(list => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1]
          lcp = lastEntry.startTime
        }).observe({ entryTypes: ['largest-contentful-paint'] })
        
        // CLS (Cumulative Layout Shift)
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value
            }
          }
        }).observe({ entryTypes: ['layout-shift'] })
        
        setTimeout(() => resolve({ lcp, fid, cls }), 2000)
      })
    })
    
    return {
      domContentLoaded,
      networkIdle,
      vitals,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Measure API response times
   */
  async measureApiPerformance(endpoint: string, method = 'GET') {
    const startTime = Date.now()
    
    const response = await this.page.request.fetch(endpoint, { method })
    const responseTime = Date.now() - startTime
    
    return {
      endpoint,
      method,
      status: response.status(),
      responseTime,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Monitor memory usage during test
   */
  async measureMemoryUsage() {
    const memoryInfo = await this.page.evaluate(() => {
      if ('memory' in performance) {
        return {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
        }
      }
      return null
    })
    
    return memoryInfo
  }
}

// Cross-browser compatibility helpers
export class CompatibilityHelpers {
  constructor(private page: Page) {}

  /**
   * Test feature support
   */
  async checkFeatureSupport() {
    const features = await this.page.evaluate(() => {
      return {
        localStorage: typeof Storage !== 'undefined',
        sessionStorage: typeof sessionStorage !== 'undefined',
        indexedDB: typeof indexedDB !== 'undefined',
        webGL: !!document.createElement('canvas').getContext('webgl'),
        webWorkers: typeof Worker !== 'undefined',
        serviceWorkers: 'serviceWorker' in navigator,
        notifications: 'Notification' in window,
        geolocation: 'geolocation' in navigator,
        history: 'pushState' in history,
        fetch: typeof fetch !== 'undefined',
      }
    })
    
    return features
  }

  /**
   * Test responsive design at different viewport sizes
   */
  async testResponsiveDesign() {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
    ]
    
    const results = []
    
    for (const viewport of viewports) {
      await this.page.setViewportSize({ width: viewport.width, height: viewport.height })
      await this.page.waitForTimeout(500) // Allow for responsive changes
      
      const layout = await this.page.evaluate(() => {
        const body = document.body
        return {
          width: body.scrollWidth,
          height: body.scrollHeight,
          overflow: getComputedStyle(body).overflow,
        }
      })
      
      results.push({
        viewport: viewport.name,
        size: viewport,
        layout,
      })
    }
    
    return results
  }
}

// Export all helpers as a single utility class
export class E2ETestUtils {
  public page: PageHelpers
  public auth: AuthHelpers
  public search: SearchHelpers
  public accessibility: AccessibilityHelpers
  public performance: PerformanceHelpers
  public compatibility: CompatibilityHelpers
  
  constructor(page: Page) {
    this.page = new PageHelpers(page)
    this.auth = new AuthHelpers(page)
    this.search = new SearchHelpers(page)
    this.accessibility = new AccessibilityHelpers(page)
    this.performance = new PerformanceHelpers(page)
    this.compatibility = new CompatibilityHelpers(page)
  }
}

// Common test assertions
export const assertions = {
  /**
   * Assert page loads without errors
   */
  async pageLoadsCleanly(page: Page, errors: string[]) {
    expect(errors).toHaveLength(0)
    expect(page.url()).not.toContain('error')
  },
  
  /**
   * Assert API response is valid
   */
  async apiResponseIsValid(response: any, expectedStatus = 200) {
    expect(response.status()).toBe(expectedStatus)
    if (expectedStatus === 200) {
      const data = await response.json()
      expect(data).toBeDefined()
    }
  },
  
  /**
   * Assert element is accessible
   */
  async elementIsAccessible(element: Locator) {
    await expect(element).toBeVisible()
    await expect(element).toBeEnabled()
    
    const ariaLabel = await element.getAttribute('aria-label')
    const text = await element.textContent()
    expect(ariaLabel || text).toBeTruthy()
  },
}
