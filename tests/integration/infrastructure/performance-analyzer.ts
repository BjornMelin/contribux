/**
 * Performance Analyzer for Integration Tests
 *
 * Provides deep performance analysis, trend tracking, and automated
 * performance regression detection for integration tests.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestReport } from './reporter'

export interface PerformanceBaseline {
  timestamp: string
  testName: string
  averageDuration: number
  memoryUsage: number
  apiCallCount: number
  cacheHitRate: number
  errorRate: number
}

export interface PerformanceTrend {
  testName: string
  baseline: PerformanceBaseline
  current: PerformanceBaseline
  regression: boolean
  improvement: boolean
  changePercent: number
  analysis: string
}

export interface PerformanceRegression {
  testName: string
  metric: string
  baseline: number
  current: number
  regressionPercent: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  recommendation: string
}

export interface PerformanceAnalysis {
  summary: {
    totalTests: number
    regressions: number
    improvements: number
    stable: number
    criticalIssues: number
  }
  trends: PerformanceTrend[]
  regressions: PerformanceRegression[]
  recommendations: string[]
  alerting: AlertConfig[]
}

export interface AlertConfig {
  type: 'slack' | 'email' | 'webhook'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  data: Record<string, unknown>
}

export interface PerformanceThresholds {
  maxDurationIncrease: number // Percentage
  maxMemoryIncrease: number // Percentage
  minCacheHitRate: number // Absolute value (0-1)
  maxErrorRateIncrease: number // Percentage
  criticalDurationThreshold: number // Milliseconds
  criticalMemoryThreshold: number // Bytes
}

export class PerformanceAnalyzer {
  private baselineDir: string
  private reportsDir: string
  private thresholds: PerformanceThresholds

  constructor(
    options: {
      baselineDir?: string
      reportsDir?: string
      thresholds?: Partial<PerformanceThresholds>
    } = {}
  ) {
    this.baselineDir = options.baselineDir || './tests/integration/reports/baselines'
    this.reportsDir = options.reportsDir || './tests/integration/reports'
    this.thresholds = {
      maxDurationIncrease: 20, // 20% increase is concerning
      maxMemoryIncrease: 30, // 30% memory increase is concerning
      minCacheHitRate: 0.8, // Below 80% cache hit rate is concerning
      maxErrorRateIncrease: 5, // 5% error rate increase is concerning
      criticalDurationThreshold: 10000, // 10 seconds is critical
      criticalMemoryThreshold: 500 * 1024 * 1024, // 500MB is critical
      ...options.thresholds,
    }

    // Ensure directories exist
    if (!existsSync(this.baselineDir)) {
      mkdirSync(this.baselineDir, { recursive: true })
    }
    if (!existsSync(this.reportsDir)) {
      mkdirSync(this.reportsDir, { recursive: true })
    }
  }

  /**
   * Analyze performance against baseline
   */
  analyzePerformance(report: TestReport): PerformanceAnalysis {
    const baselines = this.loadBaselines()
    const currentBaselines = this.extractBaselines(report)
    const trends = this.calculateTrends(baselines, currentBaselines)
    const regressions = this.detectRegressions(trends)
    const recommendations = this.generateRecommendations(trends, regressions)
    const alerting = this.generateAlerts(regressions)

    const summary = {
      totalTests: trends.length,
      regressions: trends.filter(t => t.regression).length,
      improvements: trends.filter(t => t.improvement).length,
      stable: trends.filter(t => !t.regression && !t.improvement).length,
      criticalIssues: regressions.filter(r => r.severity === 'critical').length,
    }

    const analysis: PerformanceAnalysis = {
      summary,
      trends,
      regressions,
      recommendations,
      alerting,
    }

    // Save analysis
    this.saveAnalysis(analysis)

    // Update baselines if this is a stable run
    if (summary.criticalIssues === 0 && summary.regressions <= summary.totalTests * 0.1) {
      this.updateBaselines(currentBaselines)
    }

    return analysis
  }

  /**
   * Extract performance baselines from test report
   */
  private extractBaselines(report: TestReport): PerformanceBaseline[] {
    const baselines: PerformanceBaseline[] = []

    // Overall test suite baseline
    baselines.push({
      timestamp: report.timestamp,
      testName: '__overall__',
      averageDuration: report.performance.averageTestDuration,
      memoryUsage: report.performance.memoryUsage.peak,
      apiCallCount: report.metrics?.apiCalls.total || 0,
      cacheHitRate: report.metrics?.cache.hitRate || 0,
      errorRate: report.metrics?.apiCalls.errorRate || 0,
    })

    // Individual test baselines
    report.suites.forEach(suite => {
      suite.tests.forEach(test => {
        if (test.status === 'passed') {
          baselines.push({
            timestamp: report.timestamp,
            testName: `${suite.name}::${test.name}`,
            averageDuration: test.duration,
            memoryUsage: 0, // Individual test memory tracking would need implementation
            apiCallCount: 0, // Would need test-specific API tracking
            cacheHitRate: 0, // Would need test-specific cache tracking
            errorRate: 0, // Individual test error tracking
          })
        }
      })
    })

    return baselines
  }

  /**
   * Load existing baselines from disk
   */
  private loadBaselines(): Map<string, PerformanceBaseline> {
    const baselinePath = join(this.baselineDir, 'performance-baselines.json')
    const baselines = new Map<string, PerformanceBaseline>()

    if (existsSync(baselinePath)) {
      try {
        const data = JSON.parse(readFileSync(baselinePath, 'utf-8'))
        Object.entries(data).forEach(([key, value]) => {
          baselines.set(key, value as PerformanceBaseline)
        })
      } catch (error) {
        console.warn('Failed to load performance baselines:', error)
      }
    }

    return baselines
  }

  /**
   * Calculate performance trends
   */
  private calculateTrends(
    baselines: Map<string, PerformanceBaseline>,
    current: PerformanceBaseline[]
  ): PerformanceTrend[] {
    const trends: PerformanceTrend[] = []

    current.forEach(currentBaseline => {
      const baseline = baselines.get(currentBaseline.testName)

      if (!baseline) {
        // New test - no trend available
        return
      }

      const durationChange = this.calculatePercentChange(
        baseline.averageDuration,
        currentBaseline.averageDuration
      )

      const regression = this.isRegression(baseline, currentBaseline)
      const improvement = this.isImprovement(baseline, currentBaseline)

      const analysis = this.generateTrendAnalysis(baseline, currentBaseline, durationChange)

      trends.push({
        testName: currentBaseline.testName,
        baseline,
        current: currentBaseline,
        regression,
        improvement,
        changePercent: durationChange,
        analysis,
      })
    })

    return trends
  }

  /**
   * Detect performance regressions
   */
  private detectRegressions(trends: PerformanceTrend[]): PerformanceRegression[] {
    const regressions: PerformanceRegression[] = []

    trends
      .filter(t => t.regression)
      .forEach(trend => {
        const { baseline, current, testName } = trend

        // Duration regression
        if (current.averageDuration > baseline.averageDuration) {
          const regressionPercent = this.calculatePercentChange(
            baseline.averageDuration,
            current.averageDuration
          )

          regressions.push({
            testName,
            metric: 'duration',
            baseline: baseline.averageDuration,
            current: current.averageDuration,
            regressionPercent,
            severity: this.calculateSeverity(
              'duration',
              regressionPercent,
              current.averageDuration
            ),
            recommendation: this.getRecommendation('duration', regressionPercent),
          })
        }

        // Memory regression
        if (current.memoryUsage > baseline.memoryUsage) {
          const regressionPercent = this.calculatePercentChange(
            baseline.memoryUsage,
            current.memoryUsage
          )

          regressions.push({
            testName,
            metric: 'memory',
            baseline: baseline.memoryUsage,
            current: current.memoryUsage,
            regressionPercent,
            severity: this.calculateSeverity('memory', regressionPercent, current.memoryUsage),
            recommendation: this.getRecommendation('memory', regressionPercent),
          })
        }

        // Cache hit rate regression
        if (current.cacheHitRate < baseline.cacheHitRate) {
          const regressionPercent = this.calculatePercentChange(
            baseline.cacheHitRate,
            current.cacheHitRate
          )

          regressions.push({
            testName,
            metric: 'cacheHitRate',
            baseline: baseline.cacheHitRate,
            current: current.cacheHitRate,
            regressionPercent: Math.abs(regressionPercent),
            severity: this.calculateSeverity(
              'cacheHitRate',
              Math.abs(regressionPercent),
              current.cacheHitRate
            ),
            recommendation: this.getRecommendation('cacheHitRate', Math.abs(regressionPercent)),
          })
        }

        // Error rate regression
        if (current.errorRate > baseline.errorRate) {
          const regressionPercent = this.calculatePercentChange(
            baseline.errorRate,
            current.errorRate
          )

          regressions.push({
            testName,
            metric: 'errorRate',
            baseline: baseline.errorRate,
            current: current.errorRate,
            regressionPercent,
            severity: this.calculateSeverity('errorRate', regressionPercent, current.errorRate),
            recommendation: this.getRecommendation('errorRate', regressionPercent),
          })
        }
      })

    return regressions
  }

  /**
   * Check if performance is regressed
   */
  private isRegression(baseline: PerformanceBaseline, current: PerformanceBaseline): boolean {
    const durationIncrease = this.calculatePercentChange(
      baseline.averageDuration,
      current.averageDuration
    )
    const memoryIncrease = this.calculatePercentChange(baseline.memoryUsage, current.memoryUsage)
    const _cacheHitDecrease = baseline.cacheHitRate - current.cacheHitRate
    const errorRateIncrease = this.calculatePercentChange(baseline.errorRate, current.errorRate)

    return (
      durationIncrease > this.thresholds.maxDurationIncrease ||
      memoryIncrease > this.thresholds.maxMemoryIncrease ||
      current.cacheHitRate < this.thresholds.minCacheHitRate ||
      errorRateIncrease > this.thresholds.maxErrorRateIncrease ||
      current.averageDuration > this.thresholds.criticalDurationThreshold ||
      current.memoryUsage > this.thresholds.criticalMemoryThreshold
    )
  }

  /**
   * Check if performance is improved
   */
  private isImprovement(baseline: PerformanceBaseline, current: PerformanceBaseline): boolean {
    const durationDecrease = this.calculatePercentChange(
      baseline.averageDuration,
      current.averageDuration
    )
    const memoryDecrease = this.calculatePercentChange(baseline.memoryUsage, current.memoryUsage)
    const cacheHitIncrease = current.cacheHitRate - baseline.cacheHitRate
    const errorRateDecrease = this.calculatePercentChange(baseline.errorRate, current.errorRate)

    return (
      durationDecrease < -10 || // 10% improvement in duration
      memoryDecrease < -10 || // 10% improvement in memory
      cacheHitIncrease > 0.05 || // 5% improvement in cache hit rate
      errorRateDecrease < -10 // 10% improvement in error rate
    )
  }

  /**
   * Calculate percentage change
   */
  private calculatePercentChange(baseline: number, current: number): number {
    if (baseline === 0) return current === 0 ? 0 : 100
    return ((current - baseline) / baseline) * 100
  }

  /**
   * Calculate severity of regression
   */
  private calculateSeverity(
    metric: string,
    regressionPercent: number,
    absoluteValue: number
  ): PerformanceRegression['severity'] {
    switch (metric) {
      case 'duration':
        if (absoluteValue > this.thresholds.criticalDurationThreshold) return 'critical'
        if (regressionPercent > 50) return 'high'
        if (regressionPercent > 30) return 'medium'
        return 'low'

      case 'memory':
        if (absoluteValue > this.thresholds.criticalMemoryThreshold) return 'critical'
        if (regressionPercent > 100) return 'high'
        if (regressionPercent > 50) return 'medium'
        return 'low'

      case 'cacheHitRate':
        if (absoluteValue < 0.5) return 'critical'
        if (regressionPercent > 30) return 'high'
        if (regressionPercent > 15) return 'medium'
        return 'low'

      case 'errorRate':
        if (absoluteValue > 0.1) return 'critical'
        if (regressionPercent > 50) return 'high'
        if (regressionPercent > 20) return 'medium'
        return 'low'

      default:
        return 'low'
    }
  }

  /**
   * Get recommendation for regression
   */
  private getRecommendation(metric: string, _regressionPercent: number): string {
    const recommendations: Record<string, string> = {
      duration:
        'Consider profiling the test to identify slow operations. Check for inefficient database queries, API calls, or synchronous operations.',
      memory:
        'Look for memory leaks, large object allocations, or inefficient data structures. Consider implementing object pooling or lazy loading.',
      cacheHitRate:
        'Review cache configuration, TTL settings, and cache key strategies. Consider cache warming or optimization of cache usage patterns.',
      errorRate:
        'Investigate error logs, API rate limits, network connectivity, or service reliability issues. Consider implementing circuit breakers or retry mechanisms.',
    }

    return recommendations[metric] || 'Review the specific metric for optimization opportunities.'
  }

  /**
   * Generate trend analysis
   */
  private generateTrendAnalysis(
    _baseline: PerformanceBaseline,
    _current: PerformanceBaseline,
    changePercent: number
  ): string {
    if (Math.abs(changePercent) < 5) {
      return 'Performance is stable with minimal variance from baseline.'
    }

    if (changePercent > 0) {
      return `Performance degraded by ${changePercent.toFixed(1)}% compared to baseline. Consider investigation.`
    }

    return `Performance improved by ${Math.abs(changePercent).toFixed(1)}% compared to baseline.`
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    trends: PerformanceTrend[],
    regressions: PerformanceRegression[]
  ): string[] {
    const recommendations: string[] = []

    // General recommendations based on trends
    const regressedTests = trends.filter(t => t.regression).length
    const totalTests = trends.length

    if (regressedTests > totalTests * 0.3) {
      recommendations.push(
        'High number of performance regressions detected. Consider reviewing recent code changes or infrastructure updates.'
      )
    }

    // Specific metric recommendations
    const durationRegressions = regressions.filter(r => r.metric === 'duration')
    if (durationRegressions.length > 0) {
      recommendations.push(
        'Test execution times have increased. Consider optimizing database queries, reducing API calls, or improving test setup efficiency.'
      )
    }

    const memoryRegressions = regressions.filter(r => r.metric === 'memory')
    if (memoryRegressions.length > 0) {
      recommendations.push(
        'Memory usage has increased. Check for memory leaks, optimize data structures, or implement better cleanup procedures.'
      )
    }

    const cacheRegressions = regressions.filter(r => r.metric === 'cacheHitRate')
    if (cacheRegressions.length > 0) {
      recommendations.push(
        'Cache performance has degraded. Review cache configuration, key strategies, and TTL settings.'
      )
    }

    const criticalRegressions = regressions.filter(r => r.severity === 'critical')
    if (criticalRegressions.length > 0) {
      recommendations.push(
        '🚨 Critical performance issues detected. Immediate investigation and remediation required.'
      )
    }

    return recommendations
  }

  /**
   * Generate alerts for regressions
   */
  private generateAlerts(regressions: PerformanceRegression[]): AlertConfig[] {
    const alerts: AlertConfig[] = []

    regressions.forEach(regression => {
      if (regression.severity === 'critical' || regression.severity === 'high') {
        alerts.push({
          type: 'slack',
          severity: regression.severity,
          message: `Performance regression detected in ${regression.testName}: ${regression.metric} increased by ${regression.regressionPercent.toFixed(1)}%`,
          data: {
            testName: regression.testName,
            metric: regression.metric,
            baseline: regression.baseline,
            current: regression.current,
            regressionPercent: regression.regressionPercent,
            recommendation: regression.recommendation,
          },
        })
      }
    })

    return alerts
  }

  /**
   * Update baselines with current performance
   */
  private updateBaselines(baselines: PerformanceBaseline[]): void {
    const baselinePath = join(this.baselineDir, 'performance-baselines.json')
    const baselineMap: Record<string, PerformanceBaseline> = {}

    baselines.forEach(baseline => {
      baselineMap[baseline.testName] = baseline
    })

    try {
      writeFileSync(baselinePath, JSON.stringify(baselineMap, null, 2))
      console.log(`📊 Updated performance baselines: ${baselines.length} tests`)
    } catch (error) {
      console.error('Failed to update performance baselines:', error)
    }
  }

  /**
   * Save analysis results
   */
  private saveAnalysis(analysis: PerformanceAnalysis): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const analysisPath = join(this.reportsDir, `performance-analysis-${timestamp}.json`)

    try {
      writeFileSync(analysisPath, JSON.stringify(analysis, null, 2))

      // Also save as latest
      const latestPath = join(this.reportsDir, 'latest-performance-analysis.json')
      writeFileSync(latestPath, JSON.stringify(analysis, null, 2))

      console.log(`📈 Performance analysis saved: ${analysisPath}`)
    } catch (error) {
      console.error('Failed to save performance analysis:', error)
    }
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(analysis: PerformanceAnalysis): string {
    const { summary, trends, regressions, recommendations } = analysis

    return `
Performance Analysis Report
==========================

Summary:
- Total Tests: ${summary.totalTests}
- Regressions: ${summary.regressions}
- Improvements: ${summary.improvements}
- Stable: ${summary.stable}
- Critical Issues: ${summary.criticalIssues}

${summary.criticalIssues > 0 ? '🚨 CRITICAL ISSUES DETECTED 🚨' : ''}

Top Regressions:
${regressions
  .sort((a, b) => b.regressionPercent - a.regressionPercent)
  .slice(0, 5)
  .map(r => `- ${r.testName} (${r.metric}): +${r.regressionPercent.toFixed(1)}% [${r.severity}]`)
  .join('\n')}

Top Improvements:
${trends
  .filter(t => t.improvement)
  .sort((a, b) => a.changePercent - b.changePercent)
  .slice(0, 5)
  .map(t => `- ${t.testName}: ${t.changePercent.toFixed(1)}%`)
  .join('\n')}

Recommendations:
${recommendations.map(r => `- ${r}`).join('\n')}
`
  }
}

/**
 * Performance analyzer factory function
 */
export function createPerformanceAnalyzer(options?: {
  baselineDir?: string
  reportsDir?: string
  thresholds?: Partial<PerformanceThresholds>
}) {
  return new PerformanceAnalyzer(options)
}
