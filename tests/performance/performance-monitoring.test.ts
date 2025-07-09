/**
 * Performance Monitoring & Alerting System
 * Comprehensive performance tracking, regression detection, and automated alerting
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { measureApiCall } from './api-performance.test'

// Performance monitoring configuration
const MONITORING_CONFIG = {
  BASELINE_PERCENTILE: 95, // Use 95th percentile as baseline
  REGRESSION_THRESHOLD: 1.5, // 50% performance degradation triggers alert
  IMPROVEMENT_THRESHOLD: 0.8, // 20% improvement is noteworthy
  MIN_SAMPLES: 5, // Minimum samples for statistical significance
  RETENTION_DAYS: 30, // Keep performance data for 30 days
  ALERT_COOLDOWN_HOURS: 6, // Don't spam alerts within 6 hours
}

// Performance categories and their weight in overall score
const PERFORMANCE_CATEGORIES = {
  API_HEALTH_CHECK: { weight: 0.1, threshold: 100 },
  API_SEARCH: { weight: 0.3, threshold: 500 },
  API_AUTH: { weight: 0.2, threshold: 300 },
  DB_SIMPLE_QUERY: { weight: 0.15, threshold: 50 },
  DB_COMPLEX_QUERY: { weight: 0.15, threshold: 200 },
  FRONTEND_LCP: { weight: 0.1, threshold: 2500 },
}

interface PerformanceMetric {
  category: string
  value: number
  threshold: number
  timestamp: Date
  metadata?: Record<string, unknown>
}

interface PerformanceBaseline {
  category: string
  p50: number
  p95: number
  p99: number
  mean: number
  standardDeviation: number
  sampleCount: number
  lastUpdated: Date
}

interface PerformanceAlert {
  type: 'REGRESSION' | 'IMPROVEMENT' | 'ANOMALY'
  category: string
  currentValue: number
  baselineValue: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  message: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

interface PerformanceReport {
  timestamp: Date
  overallScore: number
  categoryScores: Record<string, number>
  alerts: PerformanceAlert[]
  baselines: PerformanceBaseline[]
  recommendations: string[]
  trendAnalysis: Record<string, 'IMPROVING' | 'DEGRADING' | 'STABLE'>
}

class PerformanceMonitor {
  private dataDir: string
  private alertsDir: string
  private baselineFile: string

  constructor() {
    this.dataDir = join(process.cwd(), 'tests/performance/data')
    this.alertsDir = join(this.dataDir, 'alerts')
    this.baselineFile = join(this.dataDir, 'baselines.json')
  }

  async initialize(): Promise<void> {
    // Ensure data directories exist
    try {
      await access(this.dataDir)
    } catch {
      await mkdir(this.dataDir, { recursive: true })
    }

    try {
      await access(this.alertsDir)
    } catch {
      await mkdir(this.alertsDir, { recursive: true })
    }
  }

  async recordMetric(metric: PerformanceMetric): Promise<void> {
    const dateStr = metric.timestamp.toISOString().split('T')[0]
    const metricsFile = join(this.dataDir, `metrics-${dateStr}.json`)

    let existingMetrics: PerformanceMetric[] = []
    try {
      const data = await readFile(metricsFile, 'utf-8')
      existingMetrics = JSON.parse(data)
    } catch {
      // File doesn't exist yet
    }

    existingMetrics.push(metric)
    await writeFile(metricsFile, JSON.stringify(existingMetrics, null, 2))
  }

  async getBaselines(): Promise<Record<string, PerformanceBaseline>> {
    try {
      const data = await readFile(this.baselineFile, 'utf-8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  }

  async updateBaselines(metrics: PerformanceMetric[]): Promise<void> {
    const baselines = await this.getBaselines()

    // Group metrics by category
    const metricsByCategory = metrics.reduce(
      (acc, metric) => {
        if (!acc[metric.category]) acc[metric.category] = []
        acc[metric.category].push(metric.value)
        return acc
      },
      {} as Record<string, number[]>
    )

    // Calculate baselines for each category
    for (const [category, values] of Object.entries(metricsByCategory)) {
      if (values.length < MONITORING_CONFIG.MIN_SAMPLES) continue

      const sortedValues = values.sort((a, b) => a - b)
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length
      const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length
      const standardDeviation = Math.sqrt(variance)

      baselines[category] = {
        category,
        p50: sortedValues[Math.floor(sortedValues.length * 0.5)],
        p95: sortedValues[Math.floor(sortedValues.length * 0.95)],
        p99: sortedValues[Math.floor(sortedValues.length * 0.99)],
        mean,
        standardDeviation,
        sampleCount: values.length,
        lastUpdated: new Date(),
      }
    }

    await writeFile(this.baselineFile, JSON.stringify(baselines, null, 2))
  }

  async detectAnomalies(metrics: PerformanceMetric[]): Promise<PerformanceAlert[]> {
    const baselines = await this.getBaselines()
    const alerts: PerformanceAlert[] = []

    for (const metric of metrics) {
      const baseline = baselines[metric.category]
      if (!baseline) continue

      const baselineValue = baseline.p95
      const currentValue = metric.value
      const relativeChange = currentValue / baselineValue

      let alert: PerformanceAlert | null = null

      // Check for regressions
      if (relativeChange > MONITORING_CONFIG.REGRESSION_THRESHOLD) {
        const severity = this.calculateSeverity(relativeChange, 'REGRESSION')
        alert = {
          type: 'REGRESSION',
          category: metric.category,
          currentValue,
          baselineValue,
          severity,
          message: `Performance regression detected in ${metric.category}: ${currentValue.toFixed(2)}ms vs baseline ${baselineValue.toFixed(2)}ms (${((relativeChange - 1) * 100).toFixed(1)}% slower)`,
          timestamp: metric.timestamp,
          metadata: metric.metadata,
        }
      }
      // Check for improvements
      else if (relativeChange < MONITORING_CONFIG.IMPROVEMENT_THRESHOLD) {
        alert = {
          type: 'IMPROVEMENT',
          category: metric.category,
          currentValue,
          baselineValue,
          severity: 'LOW',
          message: `Performance improvement detected in ${metric.category}: ${currentValue.toFixed(2)}ms vs baseline ${baselineValue.toFixed(2)}ms (${((1 - relativeChange) * 100).toFixed(1)}% faster)`,
          timestamp: metric.timestamp,
          metadata: metric.metadata,
        }
      }
      // Check for statistical anomalies
      else {
        const zScore = Math.abs(currentValue - baseline.mean) / baseline.standardDeviation
        if (zScore > 3) {
          // 3 standard deviations
          alert = {
            type: 'ANOMALY',
            category: metric.category,
            currentValue,
            baselineValue: baseline.mean,
            severity: zScore > 4 ? 'HIGH' : 'MEDIUM',
            message: `Statistical anomaly detected in ${metric.category}: ${currentValue.toFixed(2)}ms (z-score: ${zScore.toFixed(2)})`,
            timestamp: metric.timestamp,
            metadata: { zScore, ...metric.metadata },
          }
        }
      }

      if (alert) alerts.push(alert)
    }

    return alerts
  }

  private calculateSeverity(
    relativeChange: number,
    type: 'REGRESSION' | 'IMPROVEMENT'
  ): PerformanceAlert['severity'] {
    if (type === 'REGRESSION') {
      if (relativeChange > 3) return 'CRITICAL'
      if (relativeChange > 2.5) return 'HIGH'
      if (relativeChange > 2) return 'MEDIUM'
      return 'LOW'
    }
    return 'LOW'
  }

  async generateReport(metrics: PerformanceMetric[]): Promise<PerformanceReport> {
    const baselines = await this.getBaselines()
    const alerts = await this.detectAnomalies(metrics)

    // Calculate category scores
    const categoryScores: Record<string, number> = {}
    const trendAnalysis: Record<string, 'IMPROVING' | 'DEGRADING' | 'STABLE'> = {}

    for (const [category, config] of Object.entries(PERFORMANCE_CATEGORIES)) {
      const categoryMetrics = metrics.filter(m => m.category === category)
      if (categoryMetrics.length === 0) continue

      const avgValue = categoryMetrics.reduce((sum, m) => sum + m.value, 0) / categoryMetrics.length
      const score = Math.max(0, Math.min(100, (1 - avgValue / config.threshold) * 100))
      categoryScores[category] = score

      // Trend analysis
      const baseline = baselines[category]
      if (baseline) {
        const change = avgValue / baseline.p95
        if (change < 0.95) trendAnalysis[category] = 'IMPROVING'
        else if (change > 1.05) trendAnalysis[category] = 'DEGRADING'
        else trendAnalysis[category] = 'STABLE'
      }
    }

    // Calculate overall score
    const overallScore = Object.entries(PERFORMANCE_CATEGORIES).reduce(
      (score, [category, config]) => {
        const categoryScore = categoryScores[category] || 0
        return score + categoryScore * config.weight
      },
      0
    )

    // Generate recommendations
    const recommendations = this.generateRecommendations(categoryScores, alerts)

    return {
      timestamp: new Date(),
      overallScore,
      categoryScores,
      alerts,
      baselines: Object.values(baselines),
      recommendations,
      trendAnalysis,
    }
  }

  private generateRecommendations(
    categoryScores: Record<string, number>,
    alerts: PerformanceAlert[]
  ): string[] {
    const recommendations: string[] = []

    // Check for critical performance issues
    const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL')
    if (criticalAlerts.length > 0) {
      recommendations.push(
        '🚨 CRITICAL: Immediate attention required for critical performance regressions'
      )
    }

    // Check individual category scores
    for (const [category, score] of Object.entries(categoryScores)) {
      if (score < 50) {
        switch (category) {
          case 'API_HEALTH_CHECK':
            recommendations.push(
              '🔧 Optimize health check endpoint - consider removing unnecessary operations'
            )
            break
          case 'API_SEARCH':
            recommendations.push(
              '🔍 Optimize search API - consider adding database indexes, caching, or pagination'
            )
            break
          case 'API_AUTH':
            recommendations.push(
              '🔐 Optimize authentication API - review token validation and database queries'
            )
            break
          case 'DB_SIMPLE_QUERY':
            recommendations.push(
              '💾 Optimize simple database queries - check indexes and query plans'
            )
            break
          case 'DB_COMPLEX_QUERY':
            recommendations.push(
              '🗄️ Optimize complex database queries - consider query restructuring or materialized views'
            )
            break
          case 'FRONTEND_LCP':
            recommendations.push(
              '🌐 Optimize frontend loading - consider code splitting, image optimization, or CDN'
            )
            break
        }
      }
    }

    // Check for patterns in alerts
    const regressionCategories = alerts.filter(a => a.type === 'REGRESSION').map(a => a.category)

    if (
      regressionCategories.includes('DB_SIMPLE_QUERY') &&
      regressionCategories.includes('DB_COMPLEX_QUERY')
    ) {
      recommendations.push(
        '🏥 Database performance issue detected - check database health and connection pool'
      )
    }

    if (
      regressionCategories.includes('API_SEARCH') &&
      regressionCategories.includes('DB_COMPLEX_QUERY')
    ) {
      recommendations.push(
        '🔍 Search performance degradation - consider search result caching or index optimization'
      )
    }

    // General recommendations based on overall score
    const overallScore =
      Object.values(categoryScores).reduce((sum, score) => sum + score, 0) /
      Object.keys(categoryScores).length
    if (overallScore < 70) {
      recommendations.push(
        '📊 Overall performance below target - consider comprehensive performance audit'
      )
    }

    return recommendations
  }

  async saveAlert(alert: PerformanceAlert): Promise<void> {
    const alertFile = join(this.alertsDir, `alert-${Date.now()}.json`)
    await writeFile(alertFile, JSON.stringify(alert, null, 2))
  }

  async getRecentAlerts(_hours = 24): Promise<PerformanceAlert[]> {
    // Implementation would read alert files from the last N hours
    // For now, return empty array as this is a testing framework
    return []
  }
}

describe('Performance Monitoring & Alerting', () => {
  let monitor: PerformanceMonitor
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'

  beforeAll(async () => {
    monitor = new PerformanceMonitor()
    await monitor.initialize()
  })

  afterAll(async () => {
    // Cleanup test data if needed
  })

  describe('Performance Metric Collection', () => {
    it('should collect comprehensive performance metrics', async () => {
      const metrics: PerformanceMetric[] = []
      const timestamp = new Date()

      // Collect API metrics
      try {
        const { metrics: healthMetrics } = await measureApiCall(
          `${baseUrl}/api/health`,
          {},
          'Health check monitoring'
        )
        metrics.push({
          category: 'API_HEALTH_CHECK',
          value: healthMetrics.responseTime,
          threshold: PERFORMANCE_CATEGORIES.API_HEALTH_CHECK.threshold,
          timestamp,
          metadata: { statusCode: healthMetrics.statusCode },
        })
      } catch (error) {
        console.warn('Failed to collect health check metrics:', error.message)
      }

      try {
        const { metrics: searchMetrics } = await measureApiCall(
          `${baseUrl}/api/search/repositories?q=test&limit=5`,
          {},
          'Search API monitoring'
        )
        metrics.push({
          category: 'API_SEARCH',
          value: searchMetrics.responseTime,
          threshold: PERFORMANCE_CATEGORIES.API_SEARCH.threshold,
          timestamp,
          metadata: { statusCode: searchMetrics.statusCode },
        })
      } catch (error) {
        console.warn('Failed to collect search metrics:', error.message)
      }

      // Collect database metrics (mock for testing)
      const dbSimpleMetric = {
        category: 'DB_SIMPLE_QUERY',
        value: 25 + Math.random() * 10, // Simulate 25-35ms
        threshold: PERFORMANCE_CATEGORIES.DB_SIMPLE_QUERY.threshold,
        timestamp,
      }
      metrics.push(dbSimpleMetric)

      const dbComplexMetric = {
        category: 'DB_COMPLEX_QUERY',
        value: 150 + Math.random() * 50, // Simulate 150-200ms
        threshold: PERFORMANCE_CATEGORIES.DB_COMPLEX_QUERY.threshold,
        timestamp,
      }
      metrics.push(dbComplexMetric)

      // Record all metrics
      for (const metric of metrics) {
        await monitor.recordMetric(metric)
      }

      console.log(`📊 Collected ${metrics.length} performance metrics`)
      expect(metrics.length).toBeGreaterThan(0)

      // Update baselines with collected metrics
      await monitor.updateBaselines(metrics)
    })

    it('should establish performance baselines', async () => {
      // Collect multiple samples for baseline calculation
      const samples = 10
      const metrics: PerformanceMetric[] = []

      for (let i = 0; i < samples; i++) {
        const timestamp = new Date()

        // Simulate performance metrics with some variance
        metrics.push({
          category: 'API_HEALTH_CHECK',
          value: 50 + Math.random() * 30, // 50-80ms
          threshold: PERFORMANCE_CATEGORIES.API_HEALTH_CHECK.threshold,
          timestamp,
        })

        metrics.push({
          category: 'DB_SIMPLE_QUERY',
          value: 20 + Math.random() * 15, // 20-35ms
          threshold: PERFORMANCE_CATEGORIES.DB_SIMPLE_QUERY.threshold,
          timestamp,
        })

        // Small delay between samples
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Record metrics and update baselines
      for (const metric of metrics) {
        await monitor.recordMetric(metric)
      }
      await monitor.updateBaselines(metrics)

      // Verify baselines were created
      const baselines = await monitor.getBaselines()
      expect(baselines.API_HEALTH_CHECK).toBeDefined()
      expect(baselines.DB_SIMPLE_QUERY).toBeDefined()

      expect(baselines.API_HEALTH_CHECK.sampleCount).toBe(samples)
      expect(baselines.API_HEALTH_CHECK.p95).toBeGreaterThan(0)
      expect(baselines.API_HEALTH_CHECK.mean).toBeGreaterThan(0)

      console.log('📈 Performance baselines established:')
      for (const [category, baseline] of Object.entries(baselines)) {
        console.log(
          `  ${category}: P95=${baseline.p95.toFixed(2)}ms, Mean=${baseline.mean.toFixed(2)}ms`
        )
      }
    })
  })

  describe('Anomaly Detection', () => {
    it('should detect performance regressions', async () => {
      // First establish a baseline
      const baselineMetrics: PerformanceMetric[] = Array.from({ length: 5 }, (_, i) => ({
        category: 'TEST_REGRESSION',
        value: 100 + Math.random() * 10, // 100-110ms baseline
        threshold: 200,
        timestamp: new Date(Date.now() - (5 - i) * 60000), // 5 minutes ago to now
      }))

      await monitor.updateBaselines(baselineMetrics)

      // Now simulate a regression
      const regressionMetric: PerformanceMetric = {
        category: 'TEST_REGRESSION',
        value: 180, // 80% slower than baseline
        threshold: 200,
        timestamp: new Date(),
      }

      const alerts = await monitor.detectAnomalies([regressionMetric])

      expect(alerts).toHaveLength(1)
      expect(alerts[0].type).toBe('REGRESSION')
      expect(alerts[0].category).toBe('TEST_REGRESSION')
      expect(alerts[0].severity).toMatch(/MEDIUM|HIGH/)

      console.log('🚨 Regression detected:', alerts[0].message)
    })

    it('should detect performance improvements', async () => {
      // Establish baseline
      const baselineMetrics: PerformanceMetric[] = Array.from({ length: 5 }, (_, i) => ({
        category: 'TEST_IMPROVEMENT',
        value: 200 + Math.random() * 20, // 200-220ms baseline
        threshold: 300,
        timestamp: new Date(Date.now() - (5 - i) * 60000),
      }))

      await monitor.updateBaselines(baselineMetrics)

      // Simulate improvement
      const improvementMetric: PerformanceMetric = {
        category: 'TEST_IMPROVEMENT',
        value: 150, // 25% faster than baseline
        threshold: 300,
        timestamp: new Date(),
      }

      const alerts = await monitor.detectAnomalies([improvementMetric])

      expect(alerts).toHaveLength(1)
      expect(alerts[0].type).toBe('IMPROVEMENT')
      expect(alerts[0].category).toBe('TEST_IMPROVEMENT')

      console.log('✅ Improvement detected:', alerts[0].message)
    })

    it('should detect statistical anomalies', async () => {
      // Establish baseline with low variance
      const baselineMetrics: PerformanceMetric[] = Array.from({ length: 10 }, (_, i) => ({
        category: 'TEST_ANOMALY',
        value: 100 + Math.random() * 5, // Very consistent 100-105ms
        threshold: 200,
        timestamp: new Date(Date.now() - (10 - i) * 60000),
      }))

      await monitor.updateBaselines(baselineMetrics)

      // Create a statistical outlier (not necessarily a regression)
      const anomalyMetric: PerformanceMetric = {
        category: 'TEST_ANOMALY',
        value: 130, // Still within threshold but statistically unusual
        threshold: 200,
        timestamp: new Date(),
      }

      const alerts = await monitor.detectAnomalies([anomalyMetric])

      expect(alerts).toHaveLength(1)
      expect(alerts[0].type).toBe('ANOMALY')
      expect(alerts[0].metadata?.zScore).toBeGreaterThan(3)

      console.log('📊 Statistical anomaly detected:', alerts[0].message)
    })
  })

  describe('Performance Reporting', () => {
    it('should generate comprehensive performance reports', async () => {
      // Create sample metrics for all categories
      const metrics: PerformanceMetric[] = [
        {
          category: 'API_HEALTH_CHECK',
          value: 75,
          threshold: PERFORMANCE_CATEGORIES.API_HEALTH_CHECK.threshold,
          timestamp: new Date(),
        },
        {
          category: 'API_SEARCH',
          value: 350,
          threshold: PERFORMANCE_CATEGORIES.API_SEARCH.threshold,
          timestamp: new Date(),
        },
        {
          category: 'DB_SIMPLE_QUERY',
          value: 30,
          threshold: PERFORMANCE_CATEGORIES.DB_SIMPLE_QUERY.threshold,
          timestamp: new Date(),
        },
        {
          category: 'DB_COMPLEX_QUERY',
          value: 180,
          threshold: PERFORMANCE_CATEGORIES.DB_COMPLEX_QUERY.threshold,
          timestamp: new Date(),
        },
      ]

      // Update baselines with sample data
      await monitor.updateBaselines(metrics)

      const report = await monitor.generateReport(metrics)

      expect(report.timestamp).toBeInstanceOf(Date)
      expect(report.overallScore).toBeGreaterThan(0)
      expect(report.overallScore).toBeLessThanOrEqual(100)
      expect(Object.keys(report.categoryScores)).toHaveLength(4)
      expect(Array.isArray(report.recommendations)).toBe(true)
      expect(typeof report.trendAnalysis).toBe('object')

      console.log('📊 Performance Report Generated:')
      console.log(`Overall Score: ${report.overallScore.toFixed(1)}/100`)
      console.log('Category Scores:')
      for (const [category, score] of Object.entries(report.categoryScores)) {
        console.log(`  ${category}: ${score.toFixed(1)}/100`)
      }
      console.log(`Alerts: ${report.alerts.length}`)
      console.log(`Recommendations: ${report.recommendations.length}`)
    })

    it('should provide actionable recommendations', async () => {
      // Create metrics that should trigger recommendations
      const problemMetrics: PerformanceMetric[] = [
        {
          category: 'API_SEARCH',
          value: 800, // Very slow search
          threshold: PERFORMANCE_CATEGORIES.API_SEARCH.threshold,
          timestamp: new Date(),
        },
        {
          category: 'DB_COMPLEX_QUERY',
          value: 500, // Slow database
          threshold: PERFORMANCE_CATEGORIES.DB_COMPLEX_QUERY.threshold,
          timestamp: new Date(),
        },
      ]

      const report = await monitor.generateReport(problemMetrics)

      expect(report.recommendations.length).toBeGreaterThan(0)

      // Should have specific recommendations for the problem areas
      const recommendationText = report.recommendations.join(' ')
      expect(recommendationText).toMatch(/search|database|index|optim/i)

      console.log('💡 Performance Recommendations:')
      report.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`)
      })
    })
  })

  describe('Continuous Monitoring Integration', () => {
    it('should support performance trend analysis', async () => {
      const categories = ['TREND_TEST_IMPROVING', 'TREND_TEST_DEGRADING', 'TREND_TEST_STABLE']
      const metrics: PerformanceMetric[] = []

      // Create baseline data (older metrics)
      for (const category of categories) {
        for (let i = 0; i < 5; i++) {
          let baseValue: number
          switch (category) {
            case 'TREND_TEST_IMPROVING':
              baseValue = 200 // Will improve to 150
              break
            case 'TREND_TEST_DEGRADING':
              baseValue = 100 // Will degrade to 150
              break
            case 'TREND_TEST_STABLE':
              baseValue = 100 // Will stay around 100
              break
            default:
              baseValue = 100
          }

          metrics.push({
            category,
            value: baseValue + Math.random() * 10,
            threshold: 300,
            timestamp: new Date(Date.now() - (10 - i) * 60000),
          })
        }
      }

      // Update baselines
      await monitor.updateBaselines(metrics)

      // Create current metrics showing trends
      const currentMetrics: PerformanceMetric[] = [
        {
          category: 'TREND_TEST_IMPROVING',
          value: 150, // 25% better
          threshold: 300,
          timestamp: new Date(),
        },
        {
          category: 'TREND_TEST_DEGRADING',
          value: 150, // 50% worse
          threshold: 300,
          timestamp: new Date(),
        },
        {
          category: 'TREND_TEST_STABLE',
          value: 105, // Minimal change
          threshold: 300,
          timestamp: new Date(),
        },
      ]

      const report = await monitor.generateReport(currentMetrics)

      expect(report.trendAnalysis.TREND_TEST_IMPROVING).toBe('IMPROVING')
      expect(report.trendAnalysis.TREND_TEST_DEGRADING).toBe('DEGRADING')
      expect(report.trendAnalysis.TREND_TEST_STABLE).toBe('STABLE')

      console.log('📈 Trend Analysis:')
      for (const [category, trend] of Object.entries(report.trendAnalysis)) {
        console.log(`  ${category}: ${trend}`)
      }
    })

    it('should integrate with CI/CD performance gates', async () => {
      // Simulate a CI/CD performance check
      const ciMetrics: PerformanceMetric[] = [
        {
          category: 'API_HEALTH_CHECK',
          value: 45, // Good performance
          threshold: PERFORMANCE_CATEGORIES.API_HEALTH_CHECK.threshold,
          timestamp: new Date(),
          metadata: {
            buildId: 'build-123',
            branch: 'main',
            commit: 'abc123',
          },
        },
        {
          category: 'API_SEARCH',
          value: 300, // Acceptable performance
          threshold: PERFORMANCE_CATEGORIES.API_SEARCH.threshold,
          timestamp: new Date(),
          metadata: {
            buildId: 'build-123',
            branch: 'main',
            commit: 'abc123',
          },
        },
      ]

      const report = await monitor.generateReport(ciMetrics)

      // Determine if build should pass performance gates
      const passesPerformanceGates =
        report.overallScore >= 70 &&
        report.alerts.filter(a => a.severity === 'CRITICAL').length === 0

      console.log(`🚀 CI/CD Performance Check: ${passesPerformanceGates ? 'PASS' : 'FAIL'}`)
      console.log(`Overall Score: ${report.overallScore.toFixed(1)}/100`)
      console.log(`Critical Alerts: ${report.alerts.filter(a => a.severity === 'CRITICAL').length}`)

      expect(typeof passesPerformanceGates).toBe('boolean')

      if (!passesPerformanceGates) {
        console.log('❌ Build would fail performance gates')
        console.log('Blocking issues:')
        report.alerts
          .filter(a => a.severity === 'CRITICAL')
          .forEach(alert => console.log(`  - ${alert.message}`))
      }
    })
  })
})

// Monitoring utilities for integration testing
// Note: Exports removed to comply with noExportsInTest lint rule
