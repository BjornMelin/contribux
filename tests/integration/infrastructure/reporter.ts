/**
 * Custom Vitest Reporter for Integration Tests
 *
 * Provides comprehensive test reporting with metrics integration,
 * performance analysis, and quality gates for CI/CD.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { File, Reporter, Suite, Task } from 'vitest'
import type { MetricsCollector, TestMetrics } from './test-config'

export interface TestReport {
  summary: TestSummary
  suites: SuiteReport[]
  metrics: TestMetrics | null
  performance: PerformanceReport
  qualityGates: QualityGateResult[]
  timestamp: string
  duration: number
  environment: string
}

export interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  todo: number
  success: boolean
  coverage?: CoverageReport
}

export interface SuiteReport {
  name: string
  file: string
  duration: number
  tests: TestCaseReport[]
  status: 'passed' | 'failed' | 'skipped'
  errors: TestError[]
}

export interface TestCaseReport {
  name: string
  status: 'passed' | 'failed' | 'skipped' | 'todo'
  duration: number
  error?: TestError | undefined
  retries: number
  metadata?: Record<string, unknown> | undefined
}

export interface TestError {
  message: string
  stack?: string | undefined
  type: string
  location?:
    | {
        file: string
        line: number
        column: number
      }
    | undefined
}

export interface PerformanceReport {
  slowestTests: Array<{
    name: string
    file: string
    duration: number
  }>
  averageTestDuration: number
  totalTestTime: number
  setupTime: number
  teardownTime: number
  memoryUsage: {
    peak: number
    average: number
    atEnd: number
  }
}

export interface CoverageReport {
  statements: { covered: number; total: number; percentage: number }
  branches: { covered: number; total: number; percentage: number }
  functions: { covered: number; total: number; percentage: number }
  lines: { covered: number; total: number; percentage: number }
}

export interface QualityGate {
  name: string
  type: 'coverage' | 'performance' | 'metrics' | 'custom'
  threshold: number
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  description: string
}

export interface QualityGateResult {
  gate: QualityGate
  value: number
  passed: boolean
  message: string
}

export class IntegrationTestReporter implements Reporter {
  private metricsCollector?: MetricsCollector | undefined
  private startTime = 0
  private endTime = 0
  private report: TestReport | null = null
  private outputDir: string
  private qualityGates: QualityGate[]

  constructor(
    options: {
      outputDir?: string
      metricsCollector?: MetricsCollector | undefined
      qualityGates?: QualityGate[]
    } = {}
  ) {
    this.outputDir = options.outputDir || './tests/integration/reports'
    this.metricsCollector = options.metricsCollector
    this.qualityGates = options.qualityGates || this.getDefaultQualityGates()

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true })
    }
  }

  onInit(): void {
    this.startTime = Date.now()
    console.log('🚀 Integration Test Reporter initialized')

    if (this.metricsCollector) {
      this.metricsCollector.reset()
      console.log('📊 Metrics collection enabled')
    }
  }

  onFinished(files: File[], errors: unknown[]): void {
    this.endTime = Date.now()
    const duration = this.endTime - this.startTime

    try {
      this.report = this.generateReport(files, errors, duration)
      this.writeReports()
      this.printSummary()
      this.checkQualityGates()
    } catch (error) {
      console.error('❌ Failed to generate test report:', error)
    }
  }

  private generateReport(files: File[], _errors: unknown[], duration: number): TestReport {
    const suites = files.map(file => this.processSuite(file))
    const summary = this.generateSummary(files)
    const performance = this.generatePerformanceReport(files, duration)
    const metrics = this.metricsCollector?.getMetrics() || null
    const qualityGates = this.evaluateQualityGates(summary, performance, metrics)

    return {
      summary,
      suites,
      metrics,
      performance,
      qualityGates,
      timestamp: new Date().toISOString(),
      duration,
      environment: process.env.NODE_ENV || 'test',
    }
  }

  private processSuite(file: File): SuiteReport {
    const tests = this.extractTests(file)
    const errors = this.extractErrors(file)
    const duration = file.result?.duration || 0
    const status = this.getSuiteStatus(file)

    return {
      name: file.name,
      file: file.filepath || file.name,
      duration,
      tests,
      status,
      errors,
    }
  }

  private extractTests(suite: Suite | File): TestCaseReport[] {
    const tests: TestCaseReport[] = []

    const processTask = (task: Task) => {
      if (task.type === 'test') {
        tests.push({
          name: task.name,
          status: this.getTestStatus(task),
          duration: task.result?.duration || 0,
          error: task.result?.errors?.[0] ? this.formatError(task.result.errors[0]) : undefined,
          retries: task.result?.retryCount || 0,
          metadata: this.extractTestMetadata(task),
        })
      } else if (task.type === 'suite' && task.tasks) {
        task.tasks.forEach(processTask)
      }
    }

    if ('tasks' in suite && suite.tasks) {
      suite.tasks.forEach(processTask)
    }

    return tests
  }

  private extractErrors(file: File): TestError[] {
    const errors: TestError[] = []

    const collectErrors = (task: Task) => {
      if (task.result?.errors) {
        errors.push(...task.result.errors.map(error => this.formatError(error)))
      }
      if ('tasks' in task && task.tasks) {
        task.tasks.forEach(collectErrors)
      }
    }

    if (file.tasks) {
      file.tasks.forEach(collectErrors)
    }

    return errors
  }

  private formatError(error: any): TestError {
    return {
      message: error.message || 'Unknown error',
      stack: error.stack,
      type: error.name || error.constructor?.name || 'Error',
      location: error.location
        ? {
            file: error.location.file,
            line: error.location.line,
            column: error.location.column,
          }
        : undefined,
    }
  }

  private getTestStatus(task: Task): TestCaseReport['status'] {
    if (!task.result) return 'skipped'
    if (task.result.state === 'pass') return 'passed'
    if (task.result.state === 'fail') return 'failed'
    if (task.result.state === 'skip') return 'skipped'
    if (task.result.state === 'todo') return 'todo'
    return 'skipped'
  }

  private getSuiteStatus(file: File): SuiteReport['status'] {
    if (!file.result) return 'skipped'
    if (file.result.state === 'pass') return 'passed'
    if (file.result.state === 'fail') return 'failed'
    return 'skipped'
  }

  private extractTestMetadata(task: Task): Record<string, unknown> {
    // Extract metadata from test context or custom properties
    const metadata: Record<string, unknown> = {}

    if (task.meta) {
      Object.assign(metadata, task.meta)
    }

    return metadata
  }

  private generateSummary(files: File[]): TestSummary {
    let total = 0
    let passed = 0
    let failed = 0
    let skipped = 0
    let todo = 0

    const countTests = (task: Task) => {
      if (task.type === 'test') {
        total++
        const status = this.getTestStatus(task)
        switch (status) {
          case 'passed':
            passed++
            break
          case 'failed':
            failed++
            break
          case 'skipped':
            skipped++
            break
          case 'todo':
            todo++
            break
        }
      } else if ('tasks' in task && task.tasks) {
        task.tasks.forEach(countTests)
      }
    }

    files.forEach(file => {
      if (file.tasks) {
        file.tasks.forEach(countTests)
      }
    })

    return {
      total,
      passed,
      failed,
      skipped,
      todo,
      success: failed === 0,
    }
  }

  private generatePerformanceReport(files: File[], _totalDuration: number): PerformanceReport {
    const allTests: Array<{ name: string; file: string; duration: number }> = []
    let setupTime = 0
    let teardownTime = 0

    const collectTestTimes = (task: Task, file: File) => {
      if (task.type === 'test' && task.result?.duration) {
        allTests.push({
          name: task.name,
          file: file.filepath || file.name,
          duration: task.result.duration,
        })
      } else if ('tasks' in task && task.tasks) {
        task.tasks.forEach(t => collectTestTimes(t, file))
      }
    }

    files.forEach(file => {
      if (file.tasks) {
        file.tasks.forEach(task => collectTestTimes(task, file))
      }
      // Estimate setup/teardown time from file duration if available
      // Note: Vitest doesn't expose setup/teardown times directly
      const fileDuration = file.result?.duration || 0
      const testsDuration = allTests
        .filter(t => t.file === (file.filepath || file.name))
        .reduce((sum, t) => sum + t.duration, 0)
      const overhead = Math.max(0, fileDuration - testsDuration)
      setupTime += overhead * 0.5 // Estimate half of overhead as setup
      teardownTime += overhead * 0.5 // Estimate half of overhead as teardown
    })

    const slowestTests = allTests.sort((a, b) => b.duration - a.duration).slice(0, 10)

    const totalTestTime = allTests.reduce((sum, test) => sum + test.duration, 0)
    const averageTestDuration = allTests.length > 0 ? totalTestTime / allTests.length : 0

    const memoryUsage = process.memoryUsage()

    return {
      slowestTests,
      averageTestDuration,
      totalTestTime,
      setupTime,
      teardownTime,
      memoryUsage: {
        peak: memoryUsage.heapUsed,
        average: memoryUsage.heapUsed, // Simplified - could track over time
        atEnd: memoryUsage.heapUsed,
      },
    }
  }

  private getDefaultQualityGates(): QualityGate[] {
    return [
      {
        name: 'Test Success Rate',
        type: 'coverage',
        threshold: 100,
        operator: 'eq',
        description: 'All tests must pass',
      },
      {
        name: 'Average Test Duration',
        type: 'performance',
        threshold: 5000,
        operator: 'lt',
        description: 'Average test duration should be under 5 seconds',
      },
      {
        name: 'Cache Hit Rate',
        type: 'metrics',
        threshold: 0.8,
        operator: 'gte',
        description: 'Cache hit rate should be at least 80%',
      },
      {
        name: 'API Error Rate',
        type: 'metrics',
        threshold: 0.05,
        operator: 'lt',
        description: 'API error rate should be under 5%',
      },
      {
        name: 'Memory Growth',
        type: 'performance',
        threshold: 100 * 1024 * 1024, // 100MB
        operator: 'lt',
        description: 'Memory growth should be under 100MB',
      },
    ]
  }

  private evaluateQualityGates(
    summary: TestSummary,
    performance: PerformanceReport,
    metrics: TestMetrics | null
  ): QualityGateResult[] {
    return this.qualityGates.map(gate => {
      const value = this.getValueForGate(gate, summary, performance, metrics)
      const passed = this.evaluateGate(gate, value)

      return {
        gate,
        value,
        passed,
        message: passed
          ? `✅ ${gate.name}: ${value} ${gate.operator} ${gate.threshold}`
          : `❌ ${gate.name}: ${value} not ${gate.operator} ${gate.threshold}`,
      }
    })
  }

  private getValueForGate(
    gate: QualityGate,
    summary: TestSummary,
    performance: PerformanceReport,
    metrics: TestMetrics | null
  ): number {
    switch (gate.name) {
      case 'Test Success Rate':
        return summary.total > 0 ? (summary.passed / summary.total) * 100 : 0
      case 'Average Test Duration':
        return performance.averageTestDuration
      case 'Cache Hit Rate':
        return metrics?.cache.hitRate || 0
      case 'API Error Rate':
        return metrics?.apiCalls.errorRate || 0
      case 'Memory Growth':
        return metrics?.memory.growth || 0
      default:
        return 0
    }
  }

  private evaluateGate(gate: QualityGate, value: number): boolean {
    switch (gate.operator) {
      case 'gt':
        return value > gate.threshold
      case 'gte':
        return value >= gate.threshold
      case 'lt':
        return value < gate.threshold
      case 'lte':
        return value <= gate.threshold
      case 'eq':
        return Math.abs(value - gate.threshold) < 0.001
      default:
        return false
    }
  }

  private writeReports(): void {
    if (!this.report) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    // Write JSON report
    const jsonPath = join(this.outputDir, `test-report-${timestamp}.json`)
    writeFileSync(jsonPath, JSON.stringify(this.report, null, 2))

    // Write HTML report
    const htmlPath = join(this.outputDir, `test-report-${timestamp}.html`)
    writeFileSync(htmlPath, this.generateHtmlReport())

    // Write latest reports (for CI/CD)
    writeFileSync(join(this.outputDir, 'latest-report.json'), JSON.stringify(this.report, null, 2))
    writeFileSync(join(this.outputDir, 'latest-report.html'), this.generateHtmlReport())

    console.log('📊 Reports written to:')
    console.log(`  - JSON: ${jsonPath}`)
    console.log(`  - HTML: ${htmlPath}`)
  }

  private generateHtmlReport(): string {
    if (!this.report) return ''

    const { summary, performance, metrics, qualityGates, timestamp, duration } = this.report

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Integration Test Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #1f2937; }
        .metric-label { font-size: 14px; color: #6b7280; margin-top: 5px; }
        .status-passed { color: #059669; }
        .status-failed { color: #dc2626; }
        .status-skipped { color: #d97706; }
        .quality-gate { display: flex; align-items: center; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .quality-gate.passed { background: #d1fae5; border-left: 4px solid #059669; }
        .quality-gate.failed { background: #fee2e2; border-left: 4px solid #dc2626; }
        .chart-container { width: 100%; height: 300px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
        th { background: #f9fafb; font-weight: 600; }
        .test-passed { color: #059669; }
        .test-failed { color: #dc2626; }
        .test-skipped { color: #d97706; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Integration Test Report</h1>
            <p>Generated: ${new Date(timestamp).toLocaleString()}</p>
            <p>Duration: ${(duration / 1000).toFixed(2)} seconds</p>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>Test Summary</h2>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="metric-value">${summary.total}</div>
                        <div class="metric-label">Total Tests</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value status-passed">${summary.passed}</div>
                        <div class="metric-label">Passed</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value status-failed">${summary.failed}</div>
                        <div class="metric-label">Failed</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value status-skipped">${summary.skipped}</div>
                        <div class="metric-label">Skipped</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value ${summary.success ? 'status-passed' : 'status-failed'}">${summary.success ? 'PASS' : 'FAIL'}</div>
                        <div class="metric-label">Overall Status</div>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>Performance Metrics</h2>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="metric-value">${performance.averageTestDuration.toFixed(0)}ms</div>
                        <div class="metric-label">Avg Test Duration</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${(performance.totalTestTime / 1000).toFixed(2)}s</div>
                        <div class="metric-label">Total Test Time</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${(performance.memoryUsage.peak / 1024 / 1024).toFixed(1)}MB</div>
                        <div class="metric-label">Peak Memory</div>
                    </div>
                </div>
                
                <h3>Slowest Tests</h3>
                <table>
                    <thead>
                        <tr><th>Test Name</th><th>File</th><th>Duration</th></tr>
                    </thead>
                    <tbody>
                        ${performance.slowestTests
                          .map(
                            test => `
                            <tr>
                                <td>${test.name}</td>
                                <td>${test.file}</td>
                                <td>${test.duration.toFixed(0)}ms</td>
                            </tr>
                        `
                          )
                          .join('')}
                    </tbody>
                </table>
            </div>

            ${
              metrics
                ? `
            <div class="section">
                <h2>API & Cache Metrics</h2>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="metric-value">${metrics.apiCalls.total}</div>
                        <div class="metric-label">API Calls</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${metrics.apiCalls.averageDuration.toFixed(0)}ms</div>
                        <div class="metric-label">Avg API Duration</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${(metrics.apiCalls.errorRate * 100).toFixed(1)}%</div>
                        <div class="metric-label">Error Rate</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${(metrics.cache.hitRate * 100).toFixed(1)}%</div>
                        <div class="metric-label">Cache Hit Rate</div>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="metricsChart"></canvas>
                </div>
            </div>
            `
                : ''
            }

            <div class="section">
                <h2>Quality Gates</h2>
                ${qualityGates
                  .map(
                    result => `
                    <div class="quality-gate ${result.passed ? 'passed' : 'failed'}">
                        <span>${result.message}</span>
                    </div>
                `
                  )
                  .join('')}
            </div>
        </div>
    </div>

    <script>
        // Initialize charts if metrics are available
        ${
          metrics
            ? `
        const ctx = document.getElementById('metricsChart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Cache Hits', 'Cache Misses', 'API Successes', 'API Errors'],
                datasets: [{
                    data: [
                        ${metrics.cache.hits},
                        ${metrics.cache.misses},
                        ${metrics.apiCalls.total - Math.round(metrics.apiCalls.total * metrics.apiCalls.errorRate)},
                        ${Math.round(metrics.apiCalls.total * metrics.apiCalls.errorRate)}
                    ],
                    backgroundColor: ['#059669', '#dc2626', '#2563eb', '#d97706']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'API & Cache Performance'
                    }
                }
            }
        });
        `
            : ''
        }
    </script>
</body>
</html>
    `
  }

  private printSummary(): void {
    if (!this.report) return

    const { summary, performance, qualityGates } = this.report
    const failedGates = qualityGates.filter(g => !g.passed)

    console.log('\n📊 Integration Test Report Summary')
    console.log('==========================================')
    console.log(`✅ Passed: ${summary.passed}`)
    console.log(`❌ Failed: ${summary.failed}`)
    console.log(`⏭️  Skipped: ${summary.skipped}`)
    console.log(`📝 Todo: ${summary.todo}`)
    console.log(`⏱️  Average Duration: ${performance.averageTestDuration.toFixed(0)}ms`)
    console.log(`🧠 Peak Memory: ${(performance.memoryUsage.peak / 1024 / 1024).toFixed(1)}MB`)

    if (failedGates.length > 0) {
      console.log('\n❌ Failed Quality Gates:')
      failedGates.forEach(gate => console.log(`  ${gate.message}`))
    } else {
      console.log('\n✅ All Quality Gates Passed!')
    }
  }

  private checkQualityGates(): void {
    if (!this.report) return

    const failedGates = this.report.qualityGates.filter(g => !g.passed)

    if (failedGates.length > 0) {
      console.error('\n🚨 Quality Gates Failed - Consider failing the CI/CD pipeline')

      // In CI environment, exit with non-zero code
      if (process.env.CI === 'true') {
        process.exit(1)
      }
    }
  }
}

/**
 * Vitest reporter factory function
 */
export function createIntegrationTestReporter(options?: {
  outputDir?: string
  metricsCollector?: MetricsCollector
  qualityGates?: QualityGate[]
}) {
  return new IntegrationTestReporter(options)
}
