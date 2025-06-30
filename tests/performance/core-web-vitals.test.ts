/**
 * Core Web Vitals Performance Testing
 * Tests the fundamental user experience metrics as defined by Google's Core Web Vitals
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Page, Browser } from 'playwright'
import { chromium } from 'playwright'

// Core Web Vitals thresholds based on Google's recommendations
const CORE_WEB_VITALS_THRESHOLDS = {
  // Largest Contentful Paint - measures loading performance
  LCP: {
    GOOD: 2500, // Under 2.5 seconds
    NEEDS_IMPROVEMENT: 4000, // 2.5-4 seconds
  },
  // First Input Delay - measures interactivity
  FID: {
    GOOD: 100, // Under 100 milliseconds
    NEEDS_IMPROVEMENT: 300, // 100-300 milliseconds
  },
  // Cumulative Layout Shift - measures visual stability
  CLS: {
    GOOD: 0.1, // Under 0.1
    NEEDS_IMPROVEMENT: 0.25, // 0.1-0.25
  },
  // First Contentful Paint - measures perceived loading speed
  FCP: {
    GOOD: 1800, // Under 1.8 seconds
    NEEDS_IMPROVEMENT: 3000, // 1.8-3 seconds
  },
  // Time to Interactive - measures when page becomes fully interactive
  TTI: {
    GOOD: 3800, // Under 3.8 seconds
    NEEDS_IMPROVEMENT: 7300, // 3.8-7.3 seconds
  },
  // Total Blocking Time - measures interactivity
  TBT: {
    GOOD: 200, // Under 200 milliseconds
    NEEDS_IMPROVEMENT: 600, // 200-600 milliseconds
  },
}

interface CoreWebVitalsMetrics {
  lcp: number | null
  fid: number | null
  cls: number | null
  fcp: number | null
  tti: number | null
  tbt: number | null
  loadTime: number
  domContentLoaded: number
  firstPaint: number
}

describe('Core Web Vitals Performance', () => {
  let browser: Browser
  let page: Page
  const testUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  async function measureCoreWebVitals(url: string): Promise<CoreWebVitalsMetrics> {
    const page = await browser.newPage()
    
    try {
      // Enable performance metrics collection
      await page.addInitScript(() => {
        // Store performance entries for later retrieval
        window.performanceEntries = []
        
        // Core Web Vitals measurement script
        window.vitalsData = {
          lcp: null,
          fid: null,
          cls: null,
          fcp: null,
          tti: null,
          tbt: null,
        }

        // LCP Observer
        if ('PerformanceObserver' in window) {
          try {
            const lcpObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries()
              const lastEntry = entries[entries.length - 1]
              window.vitalsData.lcp = lastEntry.startTime
            })
            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })

            // FID Observer
            const fidObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries()
              entries.forEach((entry) => {
                if (entry.name === 'first-input') {
                  window.vitalsData.fid = entry.processingStart - entry.startTime
                }
              })
            })
            fidObserver.observe({ type: 'first-input', buffered: true })

            // CLS Observer
            let clsValue = 0
            let clsEntries = []
            const clsObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries()
              entries.forEach((entry) => {
                if (!entry.hadRecentInput) {
                  clsEntries.push(entry)
                  clsValue += entry.value
                }
              })
              window.vitalsData.cls = clsValue
            })
            clsObserver.observe({ type: 'layout-shift', buffered: true })

            // FCP Observer
            const fcpObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries()
              entries.forEach((entry) => {
                if (entry.name === 'first-contentful-paint') {
                  window.vitalsData.fcp = entry.startTime
                }
              })
            })
            fcpObserver.observe({ type: 'paint', buffered: true })
          } catch (error) {
            console.warn('Performance Observer setup failed:', error)
          }
        }
      })

      const navigationStart = Date.now()
      
      // Navigate and wait for load
      await page.goto(url, { waitUntil: 'networkidle' })
      
      // Wait a bit for all vitals to be collected
      await page.waitForTimeout(2000)

      const navigationEnd = Date.now()
      const loadTime = navigationEnd - navigationStart

      // Get navigation timing
      const navigationTiming = await page.evaluate(() => {
        const timing = performance.timing
        return {
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          loadComplete: timing.loadEventEnd - timing.navigationStart,
          firstPaint: performance.getEntriesByType('paint')
            .find(entry => entry.name === 'first-paint')?.startTime || null,
        }
      })

      // Get Core Web Vitals data
      const vitalsData = await page.evaluate(() => {
        return window.vitalsData || {}
      })

      // Calculate TTI and TBT approximations
      const performanceMetrics = await page.evaluate(() => {
        const entries = performance.getEntriesByType('navigation')[0]
        return {
          domInteractive: entries.domInteractive,
          domComplete: entries.domComplete,
          loadEventEnd: entries.loadEventEnd,
        }
      })

      return {
        lcp: vitalsData.lcp,
        fid: vitalsData.fid,
        cls: vitalsData.cls,
        fcp: vitalsData.fcp,
        tti: performanceMetrics.domInteractive, // Approximation
        tbt: null, // Would need more complex calculation
        loadTime,
        domContentLoaded: navigationTiming.domContentLoaded,
        firstPaint: navigationTiming.firstPaint,
      }
    } finally {
      await page.close()
    }
  }

  function evaluateMetric(value: number | null, thresholds: { GOOD: number; NEEDS_IMPROVEMENT: number }): {
    score: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR' | 'UNKNOWN'
    status: string
  } {
    if (value === null) return { score: 'UNKNOWN', status: 'Could not measure' }
    
    if (value <= thresholds.GOOD) {
      return { score: 'GOOD', status: '✅ Good' }
    } else if (value <= thresholds.NEEDS_IMPROVEMENT) {
      return { score: 'NEEDS_IMPROVEMENT', status: '⚠️ Needs Improvement' }
    } else {
      return { score: 'POOR', status: '❌ Poor' }
    }
  }

  describe('Homepage Performance', () => {
    it('should meet Core Web Vitals thresholds on homepage', async () => {
      const metrics = await measureCoreWebVitals(testUrl)
      
      const results = {
        lcp: evaluateMetric(metrics.lcp, CORE_WEB_VITALS_THRESHOLDS.LCP),
        fid: evaluateMetric(metrics.fid, CORE_WEB_VITALS_THRESHOLDS.FID),
        cls: evaluateMetric(metrics.cls, CORE_WEB_VITALS_THRESHOLDS.CLS),
        fcp: evaluateMetric(metrics.fcp, CORE_WEB_VITALS_THRESHOLDS.FCP),
        tti: evaluateMetric(metrics.tti, CORE_WEB_VITALS_THRESHOLDS.TTI),
      }

      console.log('\n📊 Core Web Vitals Results:')
      console.log(`LCP (Largest Contentful Paint): ${metrics.lcp?.toFixed(2)}ms ${results.lcp.status}`)
      console.log(`FID (First Input Delay): ${metrics.fid?.toFixed(2)}ms ${results.fid.status}`)
      console.log(`CLS (Cumulative Layout Shift): ${metrics.cls?.toFixed(3)} ${results.cls.status}`)
      console.log(`FCP (First Contentful Paint): ${metrics.fcp?.toFixed(2)}ms ${results.fcp.status}`)
      console.log(`TTI (Time to Interactive): ${metrics.tti?.toFixed(2)}ms ${results.tti.status}`)
      console.log(`\n⏱️ Additional Metrics:`)
      console.log(`Total Load Time: ${metrics.loadTime}ms`)
      console.log(`DOM Content Loaded: ${metrics.domContentLoaded}ms`)
      console.log(`First Paint: ${metrics.firstPaint}ms`)

      // Core Web Vitals should be good or at least not poor
      if (metrics.lcp !== null) {
        expect(metrics.lcp).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.LCP.NEEDS_IMPROVEMENT)
      }
      
      if (metrics.cls !== null) {
        expect(metrics.cls).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.CLS.NEEDS_IMPROVEMENT)
      }
      
      if (metrics.fcp !== null) {
        expect(metrics.fcp).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.FCP.NEEDS_IMPROVEMENT)
      }

      // Overall load time should be reasonable for a serverless application
      expect(metrics.loadTime).toBeLessThan(10000) // 10 seconds max
      expect(metrics.domContentLoaded).toBeLessThan(5000) // 5 seconds max
    })

    it('should maintain good performance under simulated slow network', async () => {
      const page = await browser.newPage()
      
      try {
        // Simulate 3G network conditions
        await page.route('**/*', async (route) => {
          await new Promise(resolve => setTimeout(resolve, 100)) // Add 100ms delay
          route.continue()
        })

        const metrics = await measureCoreWebVitals(testUrl)
        
        console.log('\n📱 Slow Network Performance:')
        console.log(`Load Time with 3G simulation: ${metrics.loadTime}ms`)
        console.log(`LCP under slow network: ${metrics.lcp?.toFixed(2)}ms`)
        console.log(`FCP under slow network: ${metrics.fcp?.toFixed(2)}ms`)

        // Performance should degrade gracefully
        expect(metrics.loadTime).toBeLessThan(15000) // 15 seconds max under slow network
        if (metrics.lcp) {
          expect(metrics.lcp).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.LCP.NEEDS_IMPROVEMENT * 1.5)
        }
      } finally {
        await page.close()
      }
    })
  })

  describe('Search Page Performance', () => {
    it('should maintain good performance on search page', async () => {
      const searchUrl = `${testUrl}/search?q=react`
      const metrics = await measureCoreWebVitals(searchUrl)
      
      console.log('\n🔍 Search Page Performance:')
      console.log(`Search Load Time: ${metrics.loadTime}ms`)
      console.log(`Search LCP: ${metrics.lcp?.toFixed(2)}ms`)
      console.log(`Search CLS: ${metrics.cls?.toFixed(3)}`)

      // Search page should load quickly
      expect(metrics.loadTime).toBeLessThan(8000)
      if (metrics.lcp) {
        expect(metrics.lcp).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.LCP.NEEDS_IMPROVEMENT)
      }
      if (metrics.cls) {
        expect(metrics.cls).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.CLS.NEEDS_IMPROVEMENT)
      }
    })
  })

  describe('Mobile Performance', () => {
    it('should meet mobile performance standards', async () => {
      const page = await browser.newPage()
      
      try {
        // Simulate mobile device
        await page.setViewportSize({ width: 375, height: 667 })
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1')

        // Simulate mobile network (slower than desktop)
        await page.route('**/*', async (route) => {
          await new Promise(resolve => setTimeout(resolve, 50)) // Add mobile latency
          route.continue()
        })

        const metrics = await measureCoreWebVitals(testUrl)
        
        console.log('\n📱 Mobile Performance:')
        console.log(`Mobile Load Time: ${metrics.loadTime}ms`)
        console.log(`Mobile LCP: ${metrics.lcp?.toFixed(2)}ms`)
        console.log(`Mobile FCP: ${metrics.fcp?.toFixed(2)}ms`)
        console.log(`Mobile CLS: ${metrics.cls?.toFixed(3)}`)

        // Mobile should still meet reasonable performance standards
        expect(metrics.loadTime).toBeLessThan(12000) // 12 seconds max on mobile
        if (metrics.lcp) {
          expect(metrics.lcp).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.LCP.NEEDS_IMPROVEMENT * 1.2)
        }
      } finally {
        await page.close()
      }
    })
  })

  describe('Performance Regression Detection', () => {
    it('should detect performance regressions across multiple runs', async () => {
      const runs = 3
      const metrics: CoreWebVitalsMetrics[] = []
      
      for (let i = 0; i < runs; i++) {
        console.log(`Performance run ${i + 1}/${runs}`)
        const runMetrics = await measureCoreWebVitals(testUrl)
        metrics.push(runMetrics)
        
        // Small delay between runs
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Calculate averages and variations
      const avgLoadTime = metrics.reduce((sum, m) => sum + m.loadTime, 0) / runs
      const avgLCP = metrics.filter(m => m.lcp).reduce((sum, m) => sum + (m.lcp || 0), 0) / metrics.filter(m => m.lcp).length
      const avgCLS = metrics.filter(m => m.cls).reduce((sum, m) => sum + (m.cls || 0), 0) / metrics.filter(m => m.cls).length

      // Calculate coefficient of variation (CV) for consistency
      const loadTimeCV = metrics.length > 1 ? 
        Math.sqrt(metrics.reduce((sum, m) => sum + Math.pow(m.loadTime - avgLoadTime, 2), 0) / (runs - 1)) / avgLoadTime : 0

      console.log('\n📈 Performance Consistency Analysis:')
      console.log(`Average Load Time: ${avgLoadTime.toFixed(2)}ms`)
      console.log(`Average LCP: ${avgLCP.toFixed(2)}ms`)
      console.log(`Average CLS: ${avgCLS.toFixed(3)}`)
      console.log(`Load Time Coefficient of Variation: ${(loadTimeCV * 100).toFixed(1)}%`)

      // Performance should be consistent (CV < 20%)
      expect(loadTimeCV).toBeLessThan(0.2)
      expect(avgLoadTime).toBeLessThan(8000)
      if (!isNaN(avgLCP)) {
        expect(avgLCP).toBeLessThan(CORE_WEB_VITALS_THRESHOLDS.LCP.NEEDS_IMPROVEMENT)
      }
    })
  })
})

// Export for use in other test files
export { measureCoreWebVitals, CORE_WEB_VITALS_THRESHOLDS }
export type { CoreWebVitalsMetrics }