/**
 * Performance and Load Testing E2E Tests
 * Comprehensive performance testing for user flows and system load
 */

import { test, expect } from '@playwright/test'
import { E2ETestUtils, assertions } from './utils/test-helpers'

test.describe('Performance and Load Testing', () => {
  let utils: E2ETestUtils
  let errors: string[]

  test.beforeEach(async ({ page }) => {
    utils = new E2ETestUtils(page)
    errors = utils.page.setupErrorMonitoring()
  })

  test.describe('Page Performance Testing', () => {
    test('should load pages within performance budgets', async ({ page }) => {
      const pagesToTest = [
        { url: '/', name: 'homepage', budget: 3000 },
        { url: '/auth/signin', name: 'signin', budget: 2000 },
        { url: '/search', name: 'search', budget: 2500 }
      ]
      
      const performanceResults = []
      
      for (const pageTest of pagesToTest) {
        console.log(`Testing performance for: ${pageTest.name}`)
        
        const performance = await utils.performance.measurePageLoad(pageTest.url)
        performanceResults.push({
          ...pageTest,
          ...performance
        })
        
        console.log(`${pageTest.name} performance:`, {
          domContentLoaded: performance.domContentLoaded,
          networkIdle: performance.networkIdle,
          vitals: performance.vitals
        })
        
        // Verify performance meets budget
        expect(performance.domContentLoaded).toBeLessThan(pageTest.budget)
        expect(performance.networkIdle).toBeLessThan(pageTest.budget + 2000)
        
        // Core Web Vitals checks
        if (performance.vitals.lcp > 0) {
          expect(performance.vitals.lcp).toBeLessThan(2500) // LCP should be < 2.5s
        }
        
        if (performance.vitals.cls > 0) {
          expect(performance.vitals.cls).toBeLessThan(0.1) // CLS should be < 0.1
        }
        
        await utils.page.takeScreenshot(`performance-${pageTest.name}`)
      }
      
      // Generate performance report
      console.log('Performance Summary:', performanceResults)
      
      await assertions.pageLoadsCleanly(page, errors)
    })

    test('should handle large search result sets efficiently', async ({ page }) => {
      // Mock large result set
      await page.route('/api/search/**', async route => {
        const largeResults = Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          title: `Repository ${i + 1}`,
          description: `This is a sample repository description for item ${i + 1}. `.repeat(10),
          language: ['JavaScript', 'TypeScript', 'Python', 'Go'][i % 4],
          stars: Math.floor(Math.random() * 50000),
          forks: Math.floor(Math.random() * 10000),
          difficulty: ['beginner', 'intermediate', 'advanced'][i % 3],
          tags: [`tag${i % 5}`, `category${i % 3}`, `topic${i % 7}`]
        }))
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              opportunities: largeResults,
              total: largeResults.length,
              page: 1,
              perPage: 100
            }
          })
        })
      })
      
      await page.goto('/search')
      await utils.page.waitForFullLoad()
      
      // Measure search performance with large dataset
      const startTime = Date.now()
      await utils.search.performSearch('large dataset test')
      const searchTime = Date.now() - startTime
      
      console.log(`Large dataset search took: ${searchTime}ms`)
      
      // Should handle large results within reasonable time
      expect(searchTime).toBeLessThan(10000) // 10 seconds max
      
      // Verify results are displayed
      const resultCount = await utils.search.getResultCount()
      expect(resultCount).toBeGreaterThan(50) // Should show substantial results
      
      // Test scroll performance with large list
      const startScroll = Date.now()
      await page.mouse.wheel(0, 2000)
      await page.waitForTimeout(100)
      const scrollTime = Date.now() - startScroll
      
      console.log(`Scroll performance: ${scrollTime}ms`)
      expect(scrollTime).toBeLessThan(500) // Smooth scrolling
      
      await utils.page.takeScreenshot('performance-large-results')
    })

    test('should maintain performance during rapid user interactions', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()
      
      const interactions = [
        () => utils.search.performSearch('react', false),
        () => utils.search.performSearch('typescript', false),
        () => utils.search.performSearch('nextjs', false),
        () => page.click('body'), // Click somewhere
        () => page.keyboard.press('Tab'), // Tab navigation
        () => page.mouse.move(100, 100), // Mouse movement
      ]
      
      // Rapid fire interactions
      const startTime = Date.now()
      
      for (let i = 0; i < 3; i++) {
        for (const interaction of interactions) {
          await interaction()
          await page.waitForTimeout(50) // Small delay between interactions
        }
      }
      
      const totalTime = Date.now() - startTime
      console.log(`Rapid interactions completed in: ${totalTime}ms`)
      
      // Should handle rapid interactions smoothly
      expect(totalTime).toBeLessThan(5000)
      
      // Check for memory leaks
      const memoryUsage = await utils.performance.measureMemoryUsage()
      if (memoryUsage) {
        console.log('Memory usage after rapid interactions:', memoryUsage)
        
        // Memory usage should be reasonable
        const usedMB = memoryUsage.usedJSHeapSize / (1024 * 1024)
        expect(usedMB).toBeLessThan(100) // Less than 100MB
      }
      
      await utils.page.takeScreenshot('performance-rapid-interactions')
    })
  })

  test.describe('API Performance Testing', () => {
    test('should handle API requests efficiently', async ({ page }) => {
      const apiEndpoints = [
        { path: '/api/health', method: 'GET', budget: 500 },
        { path: '/api/simple-health', method: 'GET', budget: 200 },
        { path: '/api/auth/providers', method: 'GET', budget: 1000 },
        { path: '/api/auth/session', method: 'GET', budget: 500 },
        { path: '/api/search/opportunities?q=test', method: 'GET', budget: 3000 }
      ]
      
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      for (const endpoint of apiEndpoints) {
        console.log(`Testing API performance: ${endpoint.path}`)
        
        const performance = await utils.performance.measureApiPerformance(
          endpoint.path,
          endpoint.method
        )
        
        console.log(`${endpoint.path} response time: ${performance.responseTime}ms (status: ${performance.status})`)
        
        // API should respond within budget (if successful)
        if (performance.status < 400) {
          expect(performance.responseTime).toBeLessThan(endpoint.budget)
        } else {
          // Even error responses should be fast
          expect(performance.responseTime).toBeLessThan(endpoint.budget * 2)
        }
      }
    })

    test('should handle concurrent API requests', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Create multiple concurrent requests
      const concurrentRequests = [
        '/api/health',
        '/api/auth/providers',
        '/api/auth/session',
        '/api/search/opportunities?q=javascript',
        '/api/search/opportunities?q=typescript'
      ]
      
      const startTime = Date.now()
      
      const promises = concurrentRequests.map(async (endpoint, index) => {
        const start = Date.now()
        try {
          const response = await page.request.get(endpoint)
          const duration = Date.now() - start
          
          return {
            endpoint,
            status: response.status(),
            duration,
            success: true
          }
        } catch (error) {
          return {
            endpoint,
            error: error.message,
            duration: Date.now() - start,
            success: false
          }
        }
      })
      
      const results = await Promise.all(promises)
      const totalTime = Date.now() - startTime
      
      console.log('Concurrent API results:', results)
      console.log(`All concurrent requests completed in: ${totalTime}ms`)
      
      // All requests should complete within reasonable time
      expect(totalTime).toBeLessThan(10000) // 10 seconds for all concurrent
      
      // Most requests should succeed
      const successCount = results.filter(r => r.success).length
      expect(successCount).toBeGreaterThan(results.length * 0.6) // 60% success rate
      
      // Individual request times should be reasonable
      for (const result of results) {
        if (result.success) {
          expect(result.duration).toBeLessThan(5000) // 5 seconds max per request
        }
      }
    })

    test('should handle API error scenarios gracefully', async ({ page }) => {
      // Mock API failures
      await page.route('/api/search/**', async route => {
        // Simulate slow failing response
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Service temporarily unavailable'
            }
          })
        })
      })
      
      await page.goto('/search')
      await utils.page.waitForFullLoad()
      
      // Test error handling performance
      const startTime = Date.now()
      await utils.search.performSearch('test query', false)
      
      // Wait for error to be displayed
      await page.waitForSelector('.error-message, [role="alert"], [data-testid="error"]', { 
        timeout: 5000 
      })
      
      const errorHandlingTime = Date.now() - startTime
      console.log(`Error handling took: ${errorHandlingTime}ms`)
      
      // Error handling should be fast
      expect(errorHandlingTime).toBeLessThan(3000)
      
      // Error message should be visible
      const errorElement = page.locator('.error-message, [role="alert"]')
      await expect(errorElement).toBeVisible()
      
      await utils.page.takeScreenshot('performance-error-handling')
    })
  })

  test.describe('Load Testing Scenarios', () => {
    test('should handle multiple user sessions', async ({ browser }) => {
      const sessionCount = 5
      const sessions = []
      
      // Create multiple browser contexts (simulating different users)
      for (let i = 0; i < sessionCount; i++) {
        const context = await browser.newContext()
        const page = await context.newPage()
        const sessionUtils = new E2ETestUtils(page)
        
        sessions.push({ context, page, utils: sessionUtils, id: i })
      }
      
      try {
        // Simulate concurrent user activity
        const userActivities = sessions.map(async (session, index) => {
          const { page, utils } = session
          
          console.log(`Starting user session ${index + 1}`)
          
          // User journey simulation
          await page.goto('/')
          await utils.page.waitForFullLoad()
          
          await page.goto('/auth/signin')
          await utils.page.waitForFullLoad()
          
          await page.goto('/search')
          await utils.page.waitForFullLoad()
          
          // Perform search
          await utils.search.performSearch(`test query ${index}`, false)
          await page.waitForTimeout(1000)
          
          return {
            sessionId: index,
            completed: true,
            timestamp: new Date().toISOString()
          }
        })
        
        const startTime = Date.now()
        const results = await Promise.all(userActivities)
        const totalTime = Date.now() - startTime
        
        console.log('Multi-user session results:', results)
        console.log(`All user sessions completed in: ${totalTime}ms`)
        
        // All sessions should complete successfully
        expect(results.length).toBe(sessionCount)
        expect(results.every(r => r.completed)).toBe(true)
        
        // Total time should be reasonable for concurrent users
        expect(totalTime).toBeLessThan(30000) // 30 seconds for all users
        
      } finally {
        // Cleanup all sessions
        for (const session of sessions) {
          await session.context.close()
        }
      }
    })

    test('should maintain performance under sustained load', async ({ page }) => {
      await page.goto('/search')
      await utils.page.waitForFullLoad()
      
      const loadTestDuration = 30000 // 30 seconds
      const operationInterval = 2000 // Every 2 seconds
      const startTime = Date.now()
      
      const performanceMetrics = []
      
      while (Date.now() - startTime < loadTestDuration) {
        const operationStart = Date.now()
        
        // Perform a search operation
        await utils.search.performSearch('sustained load test', false)
        await page.waitForTimeout(500)
        
        const operationTime = Date.now() - operationStart
        
        // Measure memory usage
        const memory = await utils.performance.measureMemoryUsage()
        
        performanceMetrics.push({
          timestamp: Date.now() - startTime,
          operationTime,
          memoryUsage: memory?.usedJSHeapSize || 0
        })
        
        console.log(`Operation ${performanceMetrics.length}: ${operationTime}ms`)
        
        // Wait before next operation
        await page.waitForTimeout(operationInterval - (Date.now() - operationStart))
      }
      
      console.log('Sustained load test completed. Metrics:', {
        operationCount: performanceMetrics.length,
        averageOperationTime: performanceMetrics.reduce((sum, m) => sum + m.operationTime, 0) / performanceMetrics.length,
        peakMemoryUsage: Math.max(...performanceMetrics.map(m => m.memoryUsage))
      })
      
      // Performance should not degrade significantly over time
      const firstHalf = performanceMetrics.slice(0, Math.floor(performanceMetrics.length / 2))
      const secondHalf = performanceMetrics.slice(Math.floor(performanceMetrics.length / 2))
      
      const firstHalfAvg = firstHalf.reduce((sum, m) => sum + m.operationTime, 0) / firstHalf.length
      const secondHalfAvg = secondHalf.reduce((sum, m) => sum + m.operationTime, 0) / secondHalf.length
      
      console.log(`Performance comparison: First half ${firstHalfAvg}ms vs Second half ${secondHalfAvg}ms`)
      
      // Performance degradation should be minimal (less than 50% increase)
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 1.5)
      
      await utils.page.takeScreenshot('sustained-load-test')
    })

    test('should handle memory pressure appropriately', async ({ page }) => {
      await page.goto('/')
      await utils.page.waitForFullLoad()
      
      // Create memory pressure by performing many operations
      const operations = 50
      const memorySnapshots = []
      
      for (let i = 0; i < operations; i++) {
        // Navigate between pages to create memory usage
        await page.goto('/search')
        await utils.page.waitForFullLoad()
        
        await page.goto('/auth/signin')
        await utils.page.waitForFullLoad()
        
        await page.goto('/')
        await utils.page.waitForFullLoad()
        
        // Take memory snapshot every 10 operations
        if (i % 10 === 0) {
          const memory = await utils.performance.measureMemoryUsage()
          if (memory) {
            memorySnapshots.push({
              operation: i,
              memory: memory.usedJSHeapSize / (1024 * 1024), // Convert to MB
              timestamp: Date.now()
            })
            
            console.log(`Operation ${i}: Memory usage ${memory.usedJSHeapSize / (1024 * 1024)}MB`)
          }
        }
      }
      
      // Force garbage collection if available
      await page.evaluate(() => {
        if ('gc' in window) {
          (window as any).gc()
        }
      })
      
      // Take final memory snapshot
      const finalMemory = await utils.performance.measureMemoryUsage()
      if (finalMemory) {
        memorySnapshots.push({
          operation: operations,
          memory: finalMemory.usedJSHeapSize / (1024 * 1024),
          timestamp: Date.now()
        })
      }
      
      console.log('Memory pressure test snapshots:', memorySnapshots)
      
      // Memory usage should not grow excessively
      if (memorySnapshots.length > 1) {
        const maxMemory = Math.max(...memorySnapshots.map(s => s.memory))
        const finalMemory = memorySnapshots[memorySnapshots.length - 1].memory
        
        console.log(`Peak memory: ${maxMemory}MB, Final memory: ${finalMemory}MB`)
        
        // Memory usage should be reasonable
        expect(maxMemory).toBeLessThan(200) // Less than 200MB peak
        
        // Memory should not grow indefinitely
        const memoryGrowth = finalMemory / memorySnapshots[0].memory
        expect(memoryGrowth).toBeLessThan(3) // No more than 3x growth
      }
      
      await utils.page.takeScreenshot('memory-pressure-test')
    })
  })

  test.describe('Real-world Scenario Testing', () => {
    test('should handle typical user workflow efficiently', async ({ page }) => {
      // Simulate realistic user behavior
      const workflow = [
        { action: 'landing', url: '/', expectedTime: 3000 },
        { action: 'auth_page', url: '/auth/signin', expectedTime: 2000 },
        { action: 'search_page', url: '/search', expectedTime: 2500 },
        { action: 'search_react', search: 'react', expectedTime: 3000 },
        { action: 'filter_javascript', filter: { language: 'JavaScript' }, expectedTime: 2000 },
        { action: 'search_typescript', search: 'typescript', expectedTime: 3000 }
      ]
      
      const workflowResults = []
      
      for (const step of workflow) {
        const startTime = Date.now()
        
        if (step.url) {
          await page.goto(step.url)
          await utils.page.waitForFullLoad()
        } else if (step.search) {
          await utils.search.performSearch(step.search)
        } else if (step.filter) {
          await utils.search.applyFilters(step.filter)
        }
        
        const duration = Date.now() - startTime
        
        workflowResults.push({
          action: step.action,
          duration,
          expectedTime: step.expectedTime,
          withinBudget: duration < step.expectedTime
        })
        
        console.log(`${step.action}: ${duration}ms (budget: ${step.expectedTime}ms)`)
        
        // Each step should meet performance budget
        expect(duration).toBeLessThan(step.expectedTime)
        
        // Small pause between actions (realistic user behavior)
        await page.waitForTimeout(500)
      }
      
      console.log('Workflow performance summary:', workflowResults)
      
      const totalWorkflowTime = workflowResults.reduce((sum, r) => sum + r.duration, 0)
      const totalBudget = workflow.reduce((sum, s) => sum + s.expectedTime, 0)
      
      console.log(`Total workflow time: ${totalWorkflowTime}ms (budget: ${totalBudget}ms)`)
      
      // Overall workflow should be efficient
      expect(totalWorkflowTime).toBeLessThan(totalBudget)
      
      // All steps should meet their individual budgets
      expect(workflowResults.every(r => r.withinBudget)).toBe(true)
      
      await utils.page.takeScreenshot('realistic-workflow-complete')
      await assertions.pageLoadsCleanly(page, errors)
    })
  })

  test.afterEach(async ({ page }) => {
    // Log final memory state
    const finalMemory = await utils.performance.measureMemoryUsage()
    if (finalMemory) {
      console.log('Final memory usage:', {
        used: `${(finalMemory.usedJSHeapSize / (1024 * 1024)).toFixed(2)}MB`,
        total: `${(finalMemory.totalJSHeapSize / (1024 * 1024)).toFixed(2)}MB`,
        limit: `${(finalMemory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2)}MB`
      })
    }
    
    // Clean up
    await utils.page.clearBrowserData()
  })
})
