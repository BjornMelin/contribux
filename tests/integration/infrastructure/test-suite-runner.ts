/**
 * Test Suite Runner with Integrated Reporting
 *
 * Orchestrates test execution with comprehensive metrics collection,
 * performance analysis, and automated reporting for CI/CD integration.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MetricsCollector } from './metrics-collector'
import {
  createPerformanceAnalyzer,
  type PerformanceAnalysis,
  type PerformanceAnalyzer,
} from './performance-analyzer'
import {
  createIntegrationTestReporter,
  type IntegrationTestReporter,
  type QualityGate,
  type TestReport,
} from './reporter'
import type { IntegrationTestEnv } from './test-config'
import { loadIntegrationTestEnv } from './test-config'

export interface TestSuiteConfig {
  testPattern?: string | undefined
  outputDir?: string | undefined
  timeout?: number | undefined
  retries?: number | undefined
  parallel?: boolean | undefined
  coverage?: boolean | undefined
  bail?: boolean | undefined
  qualityGates?: QualityGate[] | undefined
  performanceBaselines?: boolean | undefined
  ciMode?: boolean | undefined
  reporter?: 'verbose' | 'json' | 'html' | 'all' | undefined
  collectMetrics?: boolean | undefined
  alerting?:
    | {
        slack?:
          | {
              webhook: string
              channel?: string | undefined
            }
          | undefined
        email?:
          | {
              recipients: string[]
              smtp: {
                host: string
                port: number
                secure: boolean
                auth: {
                  user: string
                  pass: string
                }
              }
            }
          | undefined
      }
    | undefined
}

export interface TestSuiteResult {
  success: boolean
  report: TestReport
  analysis?: PerformanceAnalysis | undefined
  executionTime: number
  exitCode: number
  stdout: string
  stderr: string
  artifacts: {
    reportPath: string
    analysisPath?: string | undefined
    metricsPath?: string | undefined
    coveragePath?: string | undefined
  }
}

export class TestSuiteRunner {
  private config: TestSuiteConfig
  private env: IntegrationTestEnv
  private metricsCollector: MetricsCollector
  private reporter: IntegrationTestReporter
  private analyzer: PerformanceAnalyzer
  private outputDir: string

  constructor(config: TestSuiteConfig = {}) {
    this.config = {
      testPattern: 'tests/integration/**/*.test.ts',
      outputDir: './tests/integration/reports',
      timeout: 60000,
      retries: 0,
      parallel: false,
      coverage: true,
      bail: false,
      ciMode: process.env.CI === 'true',
      reporter: 'all',
      collectMetrics: true,
      performanceBaselines: true,
      ...config,
    }

    this.env = loadIntegrationTestEnv()
    this.outputDir = this.config.outputDir ?? './integration-test-output'

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true })
    }

    // Initialize components
    this.metricsCollector = new MetricsCollector()
    this.reporter = createIntegrationTestReporter({
      outputDir: this.outputDir,
      metricsCollector: this.metricsCollector,
      qualityGates: this.config.qualityGates || [],
    })
    this.analyzer = createPerformanceAnalyzer({
      baselineDir: join(this.outputDir, 'baselines'),
      reportsDir: this.outputDir,
    })
  }

  /**
   * Run the complete test suite with reporting and analysis
   */
  async runTestSuite(): Promise<TestSuiteResult> {
    console.log('🚀 Starting Integration Test Suite')
    console.log('='.repeat(50))

    const startTime = Date.now()

    try {
      // Pre-test setup
      await this.preTestSetup()

      // Run tests with Vitest
      const vitestResult = await this.runVitest()

      // Post-test analysis
      const report = await this.generateReport(vitestResult)
      const analysis = this.config.performanceBaselines
        ? this.analyzer.analyzePerformance(report)
        : undefined

      // Generate artifacts
      const artifacts = await this.generateArtifacts(report, analysis)

      // Send alerts if needed
      if (this.config.alerting && (!report.summary.success || analysis?.summary.criticalIssues)) {
        await this.sendAlerts(report, analysis)
      }

      const executionTime = Date.now() - startTime

      console.log(`✅ Test suite completed in ${(executionTime / 1000).toFixed(2)}s`)

      return {
        success: report.summary.success && (!analysis || analysis.summary.criticalIssues === 0),
        report,
        analysis,
        executionTime,
        exitCode: vitestResult.exitCode,
        stdout: vitestResult.stdout,
        stderr: vitestResult.stderr,
        artifacts,
      }
    } catch (error) {
      console.error('❌ Test suite failed:', error)

      const executionTime = Date.now() - startTime

      // Generate minimal error report
      const errorReport = this.generateErrorReport(error, executionTime)
      const artifacts = await this.generateArtifacts(errorReport)

      return {
        success: false,
        report: errorReport,
        executionTime,
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        artifacts,
      }
    }
  }

  /**
   * Pre-test setup and environment validation
   */
  private async preTestSetup(): Promise<void> {
    console.log('🔧 Setting up test environment...')

    // Validate environment variables
    if (!this.env.GITHUB_TEST_TOKEN) {
      throw new Error('GITHUB_TEST_TOKEN is required for integration tests')
    }

    // Reset metrics collector
    this.metricsCollector.reset()

    // Clean up any existing test artifacts
    await this.cleanupPreviousRuns()

    console.log('✅ Test environment ready')
  }

  /**
   * Run Vitest with custom configuration
   */
  private async runVitest(): Promise<{
    exitCode: number
    stdout: string
    stderr: string
  }> {
    return new Promise((resolve, reject) => {
      const vitestArgs = this.buildVitestArgs()

      console.log(`🧪 Running Vitest: vitest ${vitestArgs.join(' ')}`)

      const vitest = spawn('npx', ['vitest', ...vitestArgs], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          // Pass metrics collector reference (simplified)
          INTEGRATION_TEST_METRICS: 'true',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      vitest.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        stdout += output
        if (!this.config.ciMode) {
          process.stdout.write(output)
        }
      })

      vitest.stderr?.on('data', (data: Buffer) => {
        const output = data.toString()
        stderr += output
        if (!this.config.ciMode) {
          process.stderr.write(output)
        }
      })

      vitest.on('close', code => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
        })
      })

      vitest.on('error', error => {
        reject(new Error(`Failed to run Vitest: ${error.message}`))
      })

      // Handle timeout
      const timeout = setTimeout(() => {
        vitest.kill('SIGTERM')
        reject(new Error(`Test execution timed out after ${this.config.timeout}ms`))
      }, this.config.timeout)

      vitest.on('close', () => {
        clearTimeout(timeout)
      })
    })
  }

  /**
   * Build Vitest command line arguments
   */
  private buildVitestArgs(): string[] {
    const args: string[] = []

    // Test pattern
    if (this.config.testPattern) {
      args.push(this.config.testPattern)
    }

    // Run mode
    args.push('run')

    // Coverage
    if (this.config.coverage) {
      args.push('--coverage')
    }

    // Parallel execution
    if (!this.config.parallel) {
      args.push('--no-file-parallelism')
    }

    // Bail on first failure
    if (this.config.bail) {
      args.push('--bail')
    }

    // Retries
    if (this.config.retries && this.config.retries > 0) {
      args.push('--retry', this.config.retries.toString())
    }

    // Reporter
    if (this.config.reporter === 'json') {
      args.push('--reporter=json')
    } else if (this.config.reporter === 'verbose') {
      args.push('--reporter=verbose')
    }

    // CI mode
    if (this.config.ciMode) {
      args.push('--run')
    }

    return args
  }

  /**
   * Generate comprehensive test report
   */
  private async generateReport(vitestResult: {
    exitCode: number
    stdout: string
    stderr: string
  }): Promise<TestReport> {
    // Parse Vitest output or load report file
    // This is a simplified implementation - in practice, you'd parse Vitest's JSON output
    const mockReport: TestReport = {
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        todo: 0,
        success: vitestResult.exitCode === 0,
      },
      suites: [],
      metrics: this.config.collectMetrics ? this.metricsCollector.getMetrics() : null,
      performance: {
        slowestTests: [],
        averageTestDuration: 0,
        totalTestTime: 0,
        setupTime: 0,
        teardownTime: 0,
        memoryUsage: {
          peak: process.memoryUsage().heapUsed,
          average: process.memoryUsage().heapUsed,
          atEnd: process.memoryUsage().heapUsed,
        },
      },
      qualityGates: [],
      timestamp: new Date().toISOString(),
      duration: 0,
      environment: 'test',
    }

    // Try to load actual Vitest report if available
    const reportPath = join(this.outputDir, 'latest-report.json')
    if (existsSync(reportPath)) {
      try {
        const reportData = JSON.parse(readFileSync(reportPath, 'utf-8'))
        Object.assign(mockReport, reportData)
      } catch (_error) {
        console.warn('Failed to load Vitest report, using mock data')
      }
    }

    return mockReport
  }

  /**
   * Generate error report for failed test runs
   */
  private generateErrorReport(error: unknown, executionTime: number): TestReport {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      summary: {
        total: 0,
        passed: 0,
        failed: 1,
        skipped: 0,
        todo: 0,
        success: false,
      },
      suites: [
        {
          name: 'Test Suite Execution',
          file: 'runner',
          duration: executionTime,
          tests: [
            {
              name: 'Test Suite Setup',
              status: 'failed',
              duration: executionTime,
              error: {
                message: errorMessage,
                type: 'SetupError',
              },
              retries: 0,
            },
          ],
          status: 'failed',
          errors: [
            {
              message: errorMessage,
              type: 'SetupError',
            },
          ],
        },
      ],
      metrics: null,
      performance: {
        slowestTests: [],
        averageTestDuration: 0,
        totalTestTime: executionTime,
        setupTime: 0,
        teardownTime: 0,
        memoryUsage: {
          peak: process.memoryUsage().heapUsed,
          average: process.memoryUsage().heapUsed,
          atEnd: process.memoryUsage().heapUsed,
        },
      },
      qualityGates: [],
      timestamp: new Date().toISOString(),
      duration: executionTime,
      environment: 'test',
    }
  }

  /**
   * Generate test artifacts
   */
  private async generateArtifacts(
    report: TestReport,
    analysis?: PerformanceAnalysis
  ): Promise<TestSuiteResult['artifacts']> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    const artifacts: TestSuiteResult['artifacts'] = {
      reportPath: join(this.outputDir, `test-report-${timestamp}.json`),
    }

    // Save main report
    writeFileSync(artifacts.reportPath, JSON.stringify(report, null, 2))

    // Save analysis if available
    if (analysis) {
      artifacts.analysisPath = join(this.outputDir, `performance-analysis-${timestamp}.json`)
      writeFileSync(artifacts.analysisPath, JSON.stringify(analysis, null, 2))
    }

    // Save metrics if available
    if (report.metrics) {
      artifacts.metricsPath = join(this.outputDir, `metrics-${timestamp}.json`)
      writeFileSync(artifacts.metricsPath, JSON.stringify(report.metrics, null, 2))
    }

    // Save coverage if available
    const coveragePath = join(process.cwd(), 'coverage', 'coverage-final.json')
    if (existsSync(coveragePath)) {
      const targetPath = join(this.outputDir, `coverage-${timestamp}.json`)
      const coverage = readFileSync(coveragePath, 'utf-8')
      writeFileSync(targetPath, coverage)
      artifacts.coveragePath = targetPath
    }

    console.log('📦 Artifacts generated:')
    Object.entries(artifacts).forEach(([key, path]) => {
      if (path) console.log(`  - ${key}: ${path}`)
    })

    return artifacts
  }

  /**
   * Send alerts for test failures or performance regressions
   */
  private async sendAlerts(report: TestReport, analysis?: PerformanceAnalysis): Promise<void> {
    if (!this.config.alerting) return

    const alerts = []

    // Test failure alerts
    if (!report.summary.success) {
      alerts.push({
        type: 'test_failure',
        message: `Integration tests failed: ${report.summary.failed} of ${report.summary.total} tests failed`,
        severity: 'high',
        data: report.summary,
      })
    }

    // Performance regression alerts
    if (analysis?.summary.criticalIssues) {
      alerts.push({
        type: 'performance_regression',
        message: `Critical performance regressions detected: ${analysis.summary.criticalIssues} issues`,
        severity: 'critical',
        data: analysis.summary,
      })
    }

    // Send to configured channels
    for (const alert of alerts) {
      if (this.config.alerting.slack) {
        await this.sendSlackAlert(alert, this.config.alerting.slack)
      }

      if (this.config.alerting.email) {
        await this.sendEmailAlert(alert, this.config.alerting.email)
      }
    }
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(
    alert: Record<string, unknown>,
    config: NonNullable<TestSuiteConfig['alerting']>['slack']
  ): Promise<void> {
    try {
      if (!config?.webhook) {
        throw new Error('Slack webhook URL is required')
      }

      const payload = {
        channel: config.channel || '#alerts',
        text: alert.message,
        attachments: [
          {
            color: alert.severity === 'critical' ? 'danger' : 'warning',
            fields: [
              {
                title: 'Type',
                value: alert.type,
                short: true,
              },
              {
                title: 'Severity',
                value: alert.severity,
                short: true,
              },
            ],
          },
        ],
      }

      const response = await fetch(config.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`)
      }

      console.log('📱 Slack alert sent successfully')
    } catch (error) {
      console.error('Failed to send Slack alert:', error)
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(
    _alert: Record<string, unknown>,
    config: NonNullable<TestSuiteConfig['alerting']>['email']
  ): Promise<void> {
    // Email implementation would go here
    // For now, just log that we would send an email
    if (config?.recipients) {
      console.log('📧 Email alert would be sent to:', config.recipients.join(', '))
    }
  }

  /**
   * Clean up previous test runs
   */
  private async cleanupPreviousRuns(): Promise<void> {
    // Implementation for cleaning up test artifacts, temporary files, etc.
    console.log('🧹 Cleaning up previous test artifacts...')
  }
}

/**
 * CLI interface for running test suites
 */
export async function runIntegrationTests(config?: TestSuiteConfig): Promise<TestSuiteResult> {
  const runner = new TestSuiteRunner(config)
  return runner.runTestSuite()
}

/**
 * Factory function for creating test suite runners
 */
export function createTestSuiteRunner(config?: TestSuiteConfig): TestSuiteRunner {
  return new TestSuiteRunner(config)
}
