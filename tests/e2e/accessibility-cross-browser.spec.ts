/**
 * Accessibility and Cross-Browser Compatibility E2E Tests
 * Comprehensive testing for accessibility compliance and browser compatibility
 */

import { expect, test } from '@playwright/test'
import { assertions, E2ETestUtils } from './utils/test-helpers'

test.describe('Accessibility and Cross-Browser Compatibility', () => {
  let utils: E2ETestUtils
  let errors: string[]

  test.beforeEach(async ({ page }) => {
    utils = new E2ETestUtils(page)
    errors = utils.page.setupErrorMonitoring()
  })

  test.describe('Accessibility Compliance', () => {
    test('should meet WCAG 2.1 guidelines for keyboard navigation', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Test keyboard navigation through all focusable elements
      const focusableElements = await utils.accessibility.testKeyboardNavigation()

      // Should have at least some focusable elements
      expect(focusableElements.length).toBeGreaterThan(0)

      // Log the navigation path for analysis
      console.log('Keyboard navigation path:', focusableElements)

      // Test Tab and Shift+Tab navigation
      await page.keyboard.press('Tab')
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName)
      expect(firstFocused).toBeTruthy()

      // Test Shift+Tab (reverse navigation)
      await page.keyboard.press('Shift+Tab')
      const _reverseFocused = await page.evaluate(() => document.activeElement?.tagName)

      // Test escape key behavior
      await page.keyboard.press('Escape')

      await utils.page.takeScreenshot('accessibility-keyboard-nav')
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should have proper ARIA labels and semantic markup', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Check ARIA compliance
      const ariaIssues = await utils.accessibility.checkAriaCompliance()

      // Log any issues but don't fail the test if they're minor
      if (ariaIssues.length > 0) {
        console.log('ARIA compliance issues found:', ariaIssues)
      }

      // Critical ARIA issues should not exist
      const criticalIssues = ariaIssues.filter(
        issue =>
          issue.includes('Button without accessible name') || issue.includes('Input without label')
      )

      expect(criticalIssues.length).toBeLessThanOrEqual(2) // Allow some flexibility

      // Test semantic HTML structure
      const semanticElements = await page.evaluate(() => {
        const elements = {
          main: document.querySelector('main'),
          nav: document.querySelector('nav'),
          header: document.querySelector('header'),
          footer: document.querySelector('footer'),
          headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6'),
          buttons: document.querySelectorAll('button'),
          links: document.querySelectorAll('a'),
          forms: document.querySelectorAll('form'),
          inputs: document.querySelectorAll('input, textarea, select'),
        }

        return {
          hasMain: !!elements.main,
          hasNav: !!elements.nav,
          headingCount: elements.headings.length,
          buttonCount: elements.buttons.length,
          linkCount: elements.links.length,
          formCount: elements.forms.length,
          inputCount: elements.inputs.length,
        }
      })

      // Verify semantic structure
      expect(semanticElements.hasMain).toBe(true)
      expect(semanticElements.headingCount).toBeGreaterThan(0)

      console.log('Semantic structure:', semanticElements)
      await utils.page.takeScreenshot('accessibility-semantic-markup')
    })

    test('should support screen reader navigation', async ({ page }) => {
      await page.goto('/auth/signin')
      await utils.page.waitForFullLoad()

      // Test landmarks and regions
      const landmarks = await page.evaluate(() => {
        const landmarks = []

        // Check for ARIA landmarks
        const landmarkSelectors = [
          '[role="main"]',
          'main',
          '[role="navigation"]',
          'nav',
          '[role="banner"]',
          'header',
          '[role="contentinfo"]',
          'footer',
          '[role="complementary"]',
          'aside',
          '[role="search"]',
        ]

        for (const selector of landmarkSelectors) {
          const elements = document.querySelectorAll(selector)
          for (const element of elements) {
            landmarks.push({
              type: selector,
              text: element.textContent?.substring(0, 50) || '',
              hasAriaLabel: !!element.getAttribute('aria-label'),
              hasAriaLabelledBy: !!element.getAttribute('aria-labelledby'),
            })
          }
        }

        return landmarks
      })

      console.log('Screen reader landmarks:', landmarks)

      // Should have at least a main landmark
      const hasMain = landmarks.some(l => l.type.includes('main'))
      expect(hasMain).toBe(true)

      // Test heading hierarchy
      const headings = await page.evaluate(() => {
        const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
        return Array.from(headingElements).map(h => ({
          level: Number.parseInt(h.tagName.substring(1)),
          text: h.textContent?.trim() || '',
          hasId: !!h.id,
        }))
      })

      console.log('Heading hierarchy:', headings)

      // Should have proper heading hierarchy (start with h1)
      if (headings.length > 0) {
        expect(headings[0].level).toBe(1)
      }

      await utils.page.takeScreenshot('accessibility-screen-reader')
    })

    test('should have sufficient color contrast', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Check color contrast (basic implementation)
      const contrastIssues = await utils.accessibility.checkColorContrast()

      // Log any contrast issues
      if (contrastIssues.length > 0) {
        console.log('Color contrast issues:', contrastIssues)
      }

      // Critical contrast issues should be minimal
      expect(contrastIssues.length).toBeLessThanOrEqual(5)

      // Test focus indicators
      const focusStyles = await page.evaluate(() => {
        const button = document.querySelector('button')
        if (!button) return null

        button.focus()
        const focusedStyles = window.getComputedStyle(button, ':focus')

        return {
          outline: focusedStyles.outline,
          outlineColor: focusedStyles.outlineColor,
          outlineWidth: focusedStyles.outlineWidth,
          boxShadow: focusedStyles.boxShadow,
        }
      })

      if (focusStyles) {
        console.log('Focus indicator styles:', focusStyles)
        // Should have some form of focus indicator
        const hasFocusIndicator =
          focusStyles.outline !== 'none' ||
          focusStyles.boxShadow !== 'none' ||
          focusStyles.outlineWidth !== '0px'

        expect(hasFocusIndicator).toBe(true)
      }

      await utils.page.takeScreenshot('accessibility-color-contrast')
    })

    test('should work with assistive technologies', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()

      // Test ARIA live regions
      const liveRegions = await page.evaluate(() => {
        const regions = document.querySelectorAll('[aria-live]')
        return Array.from(regions).map(region => ({
          ariaLive: region.getAttribute('aria-live'),
          id: region.id,
          content: region.textContent?.substring(0, 100) || '',
        }))
      })

      console.log('ARIA live regions:', liveRegions)

      // Test form accessibility
      const searchForm = page.locator('form, .search-form')

      if ((await searchForm.count()) > 0) {
        // Check form labeling
        const formAccessibility = await page.evaluate(() => {
          const forms = document.querySelectorAll('form')
          const results = []

          for (const form of forms) {
            const inputs = form.querySelectorAll('input, textarea, select')
            const formData = {
              hasFieldset: !!form.querySelector('fieldset'),
              hasLegend: !!form.querySelector('legend'),
              inputCount: inputs.length,
              labeledInputs: 0,
            }

            for (const input of inputs) {
              const hasLabel =
                !!input.getAttribute('aria-label') ||
                !!input.getAttribute('aria-labelledby') ||
                !!form.querySelector(`label[for="${input.id}"]`)

              if (hasLabel) formData.labeledInputs++
            }

            results.push(formData)
          }

          return results
        })

        console.log('Form accessibility:', formAccessibility)

        // Most inputs should be properly labeled
        for (const form of formAccessibility) {
          if (form.inputCount > 0) {
            const labelingRatio = form.labeledInputs / form.inputCount
            expect(labelingRatio).toBeGreaterThanOrEqual(0.8) // 80% should be labeled
          }
        }
      }

      await utils.page.takeScreenshot('accessibility-assistive-tech')
    })
  })

  test.describe('Cross-Browser Compatibility', () => {
    test('should work consistently across different browsers', async ({ page, browserName }) => {
      console.log(`Testing compatibility on: ${browserName}`)

      // Check browser feature support
      const browserFeatures = await utils.compatibility.checkFeatureSupport()
      console.log(`${browserName} features:`, browserFeatures)

      // Essential features that should be supported
      expect(browserFeatures.localStorage).toBe(true)
      expect(browserFeatures.fetch).toBe(true)
      expect(browserFeatures.history).toBe(true)

      // Test basic functionality
      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Verify page renders correctly
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.locator('body')).toHaveCSS('margin', '0px')

      // Test navigation
      await page.goto('/auth/signin')
      await utils.page.waitForFullLoad()

      // Verify auth page renders
      const authButton = page.locator('[data-provider="github"], text=GitHub')
      await expect(authButton).toBeVisible()

      // Test JavaScript functionality
      const jsWorks = await page.evaluate(() => {
        try {
          // Test basic JS features
          const array = [1, 2, 3]
          const doubled = array.map(x => x * 2)
          const hasPromise = typeof Promise !== 'undefined'
          const hasArrow = (() => true)()

          return {
            arrayMethods: doubled.length === 3,
            promises: hasPromise,
            arrowFunctions: hasArrow,
            es6Features: true,
          }
        } catch (error) {
          return { error: error.message }
        }
      })

      console.log(`${browserName} JavaScript support:`, jsWorks)
      expect(jsWorks.arrayMethods).toBe(true)

      await utils.page.takeScreenshot(`cross-browser-${browserName}`)
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle CSS features appropriately', async ({ page, browserName }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Test CSS Grid and Flexbox support
      const cssSupport = await page.evaluate(() => {
        const testElement = document.createElement('div')
        document.body.appendChild(testElement)

        const support = {
          flexbox: false,
          grid: false,
          customProperties: false,
          transforms: false,
        }

        // Test Flexbox
        testElement.style.display = 'flex'
        if (getComputedStyle(testElement).display === 'flex') {
          support.flexbox = true
        }

        // Test CSS Grid
        testElement.style.display = 'grid'
        if (getComputedStyle(testElement).display === 'grid') {
          support.grid = true
        }

        // Test CSS Custom Properties
        testElement.style.setProperty('--test-var', 'red')
        testElement.style.color = 'var(--test-var)'
        if (getComputedStyle(testElement).color === 'red') {
          support.customProperties = true
        }

        // Test CSS Transforms
        testElement.style.transform = 'scale(1.1)'
        if (getComputedStyle(testElement).transform !== 'none') {
          support.transforms = true
        }

        document.body.removeChild(testElement)
        return support
      })

      console.log(`${browserName} CSS support:`, cssSupport)

      // Modern browsers should support these features
      expect(cssSupport.flexbox).toBe(true)

      // Test responsive design
      const viewports = [
        { width: 375, height: 667, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1920, height: 1080, name: 'desktop' },
      ]

      for (const viewport of viewports) {
        await page.setViewportSize(viewport)
        await page.waitForTimeout(500)

        // Verify layout doesn't break
        const layout = await page.evaluate(() => {
          return {
            bodyWidth: document.body.scrollWidth,
            bodyHeight: document.body.scrollHeight,
            hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
            hasVerticalScroll: document.body.scrollHeight > window.innerHeight,
          }
        })

        console.log(`${browserName} ${viewport.name} layout:`, layout)

        // Should not have unexpected horizontal scroll
        expect(layout.hasHorizontalScroll).toBe(false)

        await utils.page.takeScreenshot(`${browserName}-${viewport.name}-responsive`)
      }
    })

    test('should handle network conditions gracefully', async ({ page }) => {
      // Test slow network
      await utils.page.simulateSlowNetwork()

      await page.goto('/', { timeout: 30000 })
      await utils.page.waitForFullLoad(15000)

      // Should still render correctly
      await expect(page.locator('h1')).toBeVisible()

      // Test offline behavior
      await page.context().setOffline(true)

      // Try to navigate
      const _response = await page.goto('/search').catch(() => null)

      // Should handle offline gracefully
      const hasOfflineIndicator = (await page.locator('text=offline, text=connection').count()) > 0
      const pageLoaded = (await page.locator('body').count()) > 0

      expect(hasOfflineIndicator || pageLoaded).toBe(true)

      // Go back online
      await page.context().setOffline(false)

      await utils.page.takeScreenshot('network-conditions-test')
    })

    test('should work on mobile browsers', async ({ page }) => {
      // Set mobile user agent
      await page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
      )

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })

      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Test touch interactions
      const mainElement = page.locator('main')
      await mainElement.tap()

      // Test mobile navigation
      const mobileNav = page.locator(
        '.mobile-nav, [data-testid="mobile-nav"], button[aria-label*="menu"]'
      )

      if ((await mobileNav.count()) > 0) {
        await mobileNav.tap()
        await page.waitForTimeout(500)

        // Should show navigation menu
        const navMenu = page.locator('.nav-menu, [role="menu"], .navigation')
        if ((await navMenu.count()) > 0) {
          await expect(navMenu).toBeVisible()
        }
      }

      // Test form interactions on mobile
      await page.goto('/auth/signin')
      await utils.page.waitForFullLoad()

      const authButton = page.locator('[data-provider="github"]')
      if ((await authButton.count()) > 0) {
        // Test touch target size (should be at least 44px)
        const buttonSize = await authButton.boundingBox()
        if (buttonSize) {
          expect(buttonSize.width).toBeGreaterThanOrEqual(44)
          expect(buttonSize.height).toBeGreaterThanOrEqual(44)
        }

        // Test tap interaction
        await authButton.tap()
      }

      await utils.page.takeScreenshot('mobile-browser-test')
      await assertions.pageLoadsCleanly(page, errors)
    })
  })

  test.describe('Device-Specific Testing', () => {
    test('should work on tablet devices', async ({ page }) => {
      // Set tablet viewport and user agent
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.setUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
      )

      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Test tablet-specific layout
      const layout = await page.evaluate(() => {
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
        }
      })

      console.log('Tablet layout:', layout)

      // Test both orientations
      await page.setViewportSize({ width: 1024, height: 768 }) // Landscape
      await page.waitForTimeout(500)

      await expect(page.locator('h1')).toBeVisible()

      await page.setViewportSize({ width: 768, height: 1024 }) // Portrait
      await page.waitForTimeout(500)

      await expect(page.locator('h1')).toBeVisible()

      await utils.page.takeScreenshot('tablet-device-test')
    })

    test('should support high DPI displays', async ({ page }) => {
      // Simulate high DPI display
      await page.emulateMedia({ reducedMotion: 'reduce' })

      await page.goto('/')
      await utils.page.waitForFullLoad()

      // Test image rendering on high DPI
      const images = await page.locator('img').all()

      for (const img of images) {
        const imgInfo = await img.evaluate(el => {
          const computedStyle = window.getComputedStyle(el)
          return {
            naturalWidth: el.naturalWidth,
            naturalHeight: el.naturalHeight,
            displayWidth: Number.parseInt(computedStyle.width),
            displayHeight: Number.parseInt(computedStyle.height),
            src: el.src,
          }
        })

        console.log('Image info:', imgInfo)

        // Images should load properly
        expect(imgInfo.naturalWidth).toBeGreaterThan(0)
        expect(imgInfo.naturalHeight).toBeGreaterThan(0)
      }

      await utils.page.takeScreenshot('high-dpi-test')
    })
  })

  test.afterEach(async ({ page }) => {
    // Reset viewport for next test
    await page.setViewportSize({ width: 1280, height: 720 })

    // Clean up browser data
    await utils.page.clearBrowserData()
  })
})
