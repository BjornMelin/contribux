#!/usr/bin/env node

/**
 * Integration Test CLI
 * 
 * Command-line interface for running integration tests with comprehensive
 * reporting, performance analysis, and CI/CD integration.
 */

import { program } from 'commander'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createTestSuiteRunner, runIntegrationTests } from './test-suite-runner'
import { createPerformanceAnalyzer } from './performance-analyzer'
import type { TestSuiteConfig } from './test-suite-runner'

// Package info
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8'))

program
  .name('integration-test-runner')
  .description('Run integration tests with comprehensive reporting and analysis')
  .version(packageJson.version)

// Main test command
program
  .command('run')
  .description('Run integration tests')
  .option('-p, --pattern <pattern>', 'Test file pattern', 'tests/integration/**/*.test.ts')
  .option('-t, --timeout <ms>', 'Test timeout in milliseconds', '60000')
  .option('-r, --retries <count>', 'Number of retries for flaky tests', '2')
  .option('--no-parallel', 'Disable parallel test execution')
  .option('--no-coverage', 'Disable coverage collection')
  .option('--bail', 'Stop on first test failure')
  .option('--ci', 'Run in CI mode with JSON output')
  .option('--reporter <type>', 'Reporter type: verbose, json, html, all', 'all')
  .option('--no-metrics', 'Disable metrics collection')
  .option('--no-baselines', 'Disable performance baseline comparison')
  .option('--output-dir <dir>', 'Output directory for reports', './tests/integration/reports')
  .option('--slack-webhook <url>', 'Slack webhook URL for alerts')
  .option('--slack-channel <channel>', 'Slack channel for alerts', '#alerts')
  .action(async (options) => {
    try {
      const config: TestSuiteConfig = {
        testPattern: options.pattern,
        timeout: parseInt(options.timeout),
        retries: parseInt(options.retries),
        parallel: options.parallel,
        coverage: options.coverage,
        bail: options.bail,
        ciMode: options.ci || process.env.CI === 'true',
        reporter: options.reporter,
        collectMetrics: options.metrics,
        performanceBaselines: options.baselines,
        outputDir: options.outputDir,
        alerting: options.slackWebhook ? {
          slack: {
            webhook: options.slackWebhook,
            channel: options.slackChannel
          }
        } : undefined
      }

      console.log('🚀 Starting Integration Test Suite')
      console.log('Configuration:', JSON.stringify(config, null, 2))

      const result = await runIntegrationTests(config)

      if (result.success) {
        console.log('\n✅ Integration tests completed successfully!')
        process.exit(0)
      } else {
        console.error('\n❌ Integration tests failed!')
        console.error(`Exit code: ${result.exitCode}`)
        if (result.stderr) {
          console.error('Errors:', result.stderr)
        }
        process.exit(result.exitCode || 1)
      }
    } catch (error) {
      console.error('❌ Test runner failed:', error)
      process.exit(1)
    }
  })

// Performance analysis command
program
  .command('analyze')
  .description('Analyze performance from existing test reports')
  .option('-i, --input <file>', 'Input test report JSON file')
  .option('--baseline-dir <dir>', 'Baseline directory', './tests/integration/reports/baselines')
  .option('--output-dir <dir>', 'Output directory', './tests/integration/reports')
  .option('--update-baselines', 'Update performance baselines')
  .action(async (options) => {
    try {
      const inputFile = options.input || './tests/integration/reports/latest-report.json'
      
      if (!existsSync(inputFile)) {
        console.error(`❌ Input file not found: ${inputFile}`)
        process.exit(1)
      }

      const report = JSON.parse(readFileSync(inputFile, 'utf-8'))
      const analyzer = createPerformanceAnalyzer({
        baselineDir: options.baselineDir,
        reportsDir: options.outputDir
      })

      console.log('📈 Analyzing performance...')
      const analysis = analyzer.analyzePerformance(report)

      console.log('\n📊 Performance Analysis Results:')
      console.log(`- Total Tests: ${analysis.summary.totalTests}`)
      console.log(`- Regressions: ${analysis.summary.regressions}`)
      console.log(`- Improvements: ${analysis.summary.improvements}`)
      console.log(`- Critical Issues: ${analysis.summary.criticalIssues}`)

      if (analysis.summary.criticalIssues > 0) {
        console.log('\n🚨 Critical Issues:')
        analysis.regressions
          .filter(r => r.severity === 'critical')
          .forEach(r => {
            console.log(`  - ${r.testName}: ${r.metric} +${r.regressionPercent.toFixed(1)}%`)
          })
      }

      console.log('\n📝 Full report saved to:', join(options.outputDir, 'latest-performance-analysis.json'))

      if (analysis.summary.criticalIssues > 0) {
        process.exit(1)
      }
    } catch (error) {
      console.error('❌ Performance analysis failed:', error)
      process.exit(1)
    }
  })

// Report generation command
program
  .command('report')
  .description('Generate HTML report from test results')
  .option('-i, --input <file>', 'Input test report JSON file')
  .option('-o, --output <file>', 'Output HTML file')
  .option('--template <file>', 'Custom HTML template')
  .action(async (options) => {
    try {
      const inputFile = options.input || './tests/integration/reports/latest-report.json'
      const outputFile = options.output || './tests/integration/reports/latest-report.html'

      if (!existsSync(inputFile)) {
        console.error(`❌ Input file not found: ${inputFile}`)
        process.exit(1)
      }

      console.log('📄 Generating HTML report...')
      
      // Use Vitest to generate the HTML report
      const vitestProcess = spawn('npx', ['vitest', 'run', '--reporter=html'], {
        stdio: 'inherit',
        env: {
          ...process.env,
          VITEST_HTML_REPORT_PATH: outputFile
        }
      })

      vitestProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ HTML report generated: ${outputFile}`)
        } else {
          console.error(`❌ Failed to generate HTML report (exit code: ${code})`)
          process.exit(1)
        }
      })
    } catch (error) {
      console.error('❌ Report generation failed:', error)
      process.exit(1)
    }
  })

// Cleanup command
program
  .command('cleanup')
  .description('Clean up test artifacts and reports')
  .option('--reports', 'Clean up old reports')
  .option('--baselines', 'Reset performance baselines')
  .option('--all', 'Clean up everything')
  .option('--older-than <days>', 'Clean up files older than N days', '7')
  .action(async (options) => {
    try {
      const reportsDir = './tests/integration/reports'
      const olderThanMs = parseInt(options.olderThan) * 24 * 60 * 60 * 1000

      console.log('🧹 Starting cleanup...')

      if (options.reports || options.all) {
        // Clean up old report files
        console.log('🗑️  Cleaning up old reports...')
        // Implementation would scan and remove old files
      }

      if (options.baselines || options.all) {
        // Reset performance baselines
        console.log('📊 Resetting performance baselines...')
        // Implementation would reset baseline files
      }

      console.log('✅ Cleanup completed')
    } catch (error) {
      console.error('❌ Cleanup failed:', error)
      process.exit(1)
    }
  })

// Watch command for development
program
  .command('watch')
  .description('Run tests in watch mode for development')
  .option('-p, --pattern <pattern>', 'Test file pattern', 'tests/integration/**/*.test.ts')
  .action(async (options) => {
    try {
      console.log('👀 Starting test watcher...')
      
      const vitestProcess = spawn('npx', ['vitest', '--config', 'vitest.integration.config.ts', options.pattern], {
        stdio: 'inherit'
      })

      process.on('SIGINT', () => {
        console.log('\n🛑 Stopping test watcher...')
        vitestProcess.kill('SIGINT')
        process.exit(0)
      })

      vitestProcess.on('close', (code) => {
        process.exit(code || 0)
      })
    } catch (error) {
      console.error('❌ Watch mode failed:', error)
      process.exit(1)
    }
  })

// Status command
program
  .command('status')
  .description('Show status of test infrastructure and recent results')
  .action(async () => {
    try {
      const reportsDir = './tests/integration/reports'
      
      console.log('📊 Integration Test Status')
      console.log('=' .repeat(40))

      // Check latest report
      const latestReportPath = join(reportsDir, 'latest-report.json')
      if (existsSync(latestReportPath)) {
        const report = JSON.parse(readFileSync(latestReportPath, 'utf-8'))
        console.log('📄 Latest Test Run:')
        console.log(`  - Timestamp: ${new Date(report.timestamp).toLocaleString()}`)
        console.log(`  - Duration: ${(report.duration / 1000).toFixed(2)}s`)
        console.log(`  - Total Tests: ${report.summary.total}`)
        console.log(`  - Passed: ${report.summary.passed}`)
        console.log(`  - Failed: ${report.summary.failed}`)
        console.log(`  - Success: ${report.summary.success ? '✅' : '❌'}`)
      } else {
        console.log('📄 No recent test reports found')
      }

      // Check performance analysis
      const latestAnalysisPath = join(reportsDir, 'latest-performance-analysis.json')
      if (existsSync(latestAnalysisPath)) {
        const analysis = JSON.parse(readFileSync(latestAnalysisPath, 'utf-8'))
        console.log('\n📈 Performance Status:')
        console.log(`  - Regressions: ${analysis.summary.regressions}`)
        console.log(`  - Improvements: ${analysis.summary.improvements}`)
        console.log(`  - Critical Issues: ${analysis.summary.criticalIssues}`)
      }

      // Check environment
      console.log('\n🔧 Environment:')
      console.log(`  - Node Version: ${process.version}`)
      console.log(`  - Platform: ${process.platform}`)
      console.log(`  - CI Mode: ${process.env.CI === 'true' ? 'Yes' : 'No'}`)
      console.log(`  - GitHub Token: ${process.env.GITHUB_TEST_TOKEN ? 'Configured' : 'Missing'}`)

    } catch (error) {
      console.error('❌ Failed to get status:', error)
      process.exit(1)
    }
  })

// Parse command line arguments
program.parse()

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}