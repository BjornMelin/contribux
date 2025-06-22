/**
 * Global Teardown for Integration Tests
 * 
 * Performs cleanup after all integration tests complete,
 * including resource cleanup, final report generation,
 * and performance analysis.
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { GlobalTeardownContext } from 'vitest/node'
import { createPerformanceAnalyzer } from './performance-analyzer'

export default async function globalTeardown({ provide }: GlobalTeardownContext) {
  console.log('\n🧹 Starting Integration Test Global Teardown')
  console.log('=' .repeat(60))

  const teardownStartTime = Date.now()

  try {
    const reportsDir = './tests/integration/reports'
    const cleanupTasksPath = join(reportsDir, 'cleanup-tasks.json')

    // Perform test data cleanup
    if (existsSync(cleanupTasksPath)) {
      try {
        const cleanupTasks = JSON.parse(readFileSync(cleanupTasksPath, 'utf-8'))
        console.log(`🗑️  Performing cleanup for ${cleanupTasks.length} test artifacts`)
        
        for (const task of cleanupTasks) {
          try {
            await performCleanupTask(task)
          } catch (error) {
            console.warn(`⚠️  Failed to cleanup ${task.type} ${task.identifier}:`, error)
          }
        }
        
        console.log('✅ Test data cleanup completed')
      } catch (error) {
        console.warn('⚠️  Failed to read cleanup tasks:', error)
      }
    }

    // Generate final memory report
    if (global.gc) {
      global.gc()
      const finalMemory = process.memoryUsage()
      
      const memoryReport = {
        timestamp: new Date().toISOString(),
        finalMemory: {
          rss: finalMemory.rss,
          heapTotal: finalMemory.heapTotal,
          heapUsed: finalMemory.heapUsed,
          external: finalMemory.external,
          arrayBuffers: finalMemory.arrayBuffers,
        },
        formattedMemory: {
          rss: `${(finalMemory.rss / 1024 / 1024).toFixed(2)}MB`,
          heapTotal: `${(finalMemory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
          heapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          external: `${(finalMemory.external / 1024 / 1024).toFixed(2)}MB`,
        },
        gcStats: {
          forced: true,
          timestamp: Date.now()
        }
      }
      
      const memoryReportPath = join(reportsDir, 'final-memory-report.json')
      writeFileSync(memoryReportPath, JSON.stringify(memoryReport, null, 2))
      
      console.log('🧠 Final Memory Report:')
      console.log(`  - RSS: ${memoryReport.formattedMemory.rss}`)
      console.log(`  - Heap Used: ${memoryReport.formattedMemory.heapUsed}`)
      console.log(`  - Heap Total: ${memoryReport.formattedMemory.heapTotal}`)
      console.log(`  - External: ${memoryReport.formattedMemory.external}`)
    }

    // Generate final performance analysis
    try {
      const latestReportPath = join(reportsDir, 'latest-report.json')
      if (existsSync(latestReportPath)) {
        const report = JSON.parse(readFileSync(latestReportPath, 'utf-8'))
        const analyzer = createPerformanceAnalyzer({
          baselineDir: join(reportsDir, 'baselines'),
          reportsDir
        })
        
        const analysis = analyzer.analyzePerformance(report)
        
        console.log('\n📈 Final Performance Analysis:')
        console.log(`  - Total Tests: ${analysis.summary.totalTests}`)
        console.log(`  - Regressions: ${analysis.summary.regressions}`)
        console.log(`  - Improvements: ${analysis.summary.improvements}`)
        console.log(`  - Critical Issues: ${analysis.summary.criticalIssues}`)
        
        if (analysis.summary.criticalIssues > 0) {
          console.log('\n🚨 Critical Performance Issues Detected:')
          analysis.regressions
            .filter(r => r.severity === 'critical')
            .forEach(regression => {
              console.log(`  - ${regression.testName}: ${regression.metric} increased by ${regression.regressionPercent.toFixed(1)}%`)
            })
        }
        
        // Generate performance summary
        const performanceSummaryPath = join(reportsDir, 'performance-summary.txt')
        const summary = analyzer.generatePerformanceReport(analysis)
        writeFileSync(performanceSummaryPath, summary)
        
        console.log('✅ Performance analysis completed')
      }
    } catch (error) {
      console.warn('⚠️  Failed to generate performance analysis:', error)
    }

    // Generate test execution summary
    const teardownEndTime = Date.now()
    const teardownDuration = teardownEndTime - teardownStartTime
    
    const executionSummary = {
      teardown: {
        startTime: teardownStartTime,
        endTime: teardownEndTime,
        duration: teardownDuration,
        success: true
      },
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
        env: process.env.NODE_ENV
      }
    }
    
    const summaryPath = join(reportsDir, 'execution-summary.json')
    writeFileSync(summaryPath, JSON.stringify(executionSummary, null, 2))

    // Clean up temporary files
    await cleanupTemporaryFiles(reportsDir)

    console.log(`\n✅ Global teardown completed in ${teardownDuration}ms`)
    console.log('=' .repeat(60))

  } catch (error) {
    console.error('❌ Global teardown failed:', error)
    
    // Save error report
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : 'Unknown'
      },
      teardownDuration: Date.now() - teardownStartTime
    }
    
    try {
      const errorPath = join('./tests/integration/reports', 'teardown-error.json')
      writeFileSync(errorPath, JSON.stringify(errorReport, null, 2))
    } catch (writeError) {
      console.error('Failed to save error report:', writeError)
    }
    
    // Don't throw - we want the test results to be available even if teardown fails
    console.warn('⚠️  Continuing despite teardown errors')
  }
}

/**
 * Perform individual cleanup task
 */
async function performCleanupTask(task: {
  type: string
  identifier: string
  timestamp: string
}): Promise<void> {
  switch (task.type) {
    case 'github-repository':
      await cleanupGitHubRepository(task.identifier)
      break
    case 'github-webhook':
      await cleanupGitHubWebhook(task.identifier)
      break
    case 'test-file':
      await cleanupTestFile(task.identifier)
      break
    case 'temp-directory':
      await cleanupTempDirectory(task.identifier)
      break
    default:
      console.warn(`Unknown cleanup task type: ${task.type}`)
  }
}

/**
 * Cleanup GitHub repository created during testing
 */
async function cleanupGitHubRepository(identifier: string): Promise<void> {
  // Implementation would depend on GitHub API client
  console.log(`🗑️  Cleaning up GitHub repository: ${identifier}`)
  // Example: await githubClient.repos.delete({ owner, repo })
}

/**
 * Cleanup GitHub webhook created during testing
 */
async function cleanupGitHubWebhook(identifier: string): Promise<void> {
  console.log(`🗑️  Cleaning up GitHub webhook: ${identifier}`)
  // Example: await githubClient.repos.deleteWebhook({ owner, repo, hook_id })
}

/**
 * Cleanup test file
 */
async function cleanupTestFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true })
    console.log(`🗑️  Removed test file: ${filePath}`)
  }
}

/**
 * Cleanup temporary directory
 */
async function cleanupTempDirectory(dirPath: string): Promise<void> {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true })
    console.log(`🗑️  Removed temp directory: ${dirPath}`)
  }
}

/**
 * Clean up temporary files and old reports
 */
async function cleanupTemporaryFiles(reportsDir: string): Promise<void> {
  try {
    const tempFiles = [
      join(reportsDir, 'cleanup-tasks.json'),
      join(reportsDir, 'metrics-config.json'),
    ]
    
    for (const file of tempFiles) {
      if (existsSync(file)) {
        rmSync(file, { force: true })
      }
    }
    
    console.log('🧹 Temporary files cleaned up')
  } catch (error) {
    console.warn('⚠️  Failed to cleanup temporary files:', error)
  }
}