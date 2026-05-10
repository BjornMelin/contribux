import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbExecute = vi.hoisted(() => vi.fn())
const warn = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db/config', () => ({
  db: {
    execute: dbExecute,
  },
}))

vi.mock('@/lib/logging/pino-config', () => ({
  createErrorLogger: () => ({
    warn,
  }),
}))

import { AdvancedDatabaseMonitor } from '@/lib/monitoring/advanced-database-monitor'

describe('AdvancedDatabaseMonitor', () => {
  beforeEach(() => {
    dbExecute.mockReset()
    warn.mockReset()
  })

  it('returns safe fallback metrics when database metric queries fail', async () => {
    dbExecute.mockRejectedValueOnce(new Error('database unavailable'))

    const metrics = await new AdvancedDatabaseMonitor().getPerformanceMetrics()

    expect(metrics).toEqual({
      queryPerformance: {
        averageLatency: -1,
        totalQueries: 0,
      },
      connectionPool: {
        active: 0,
        idle: 0,
        waiting: 0,
        totalConnections: 0,
        averageCheckoutTime: -1,
      },
      indexUsage: {
        efficiency: 0,
        totalIndexes: 0,
        scannedIndexes: 0,
      },
      vectorSearch: {
        averageQueryTime: -1,
        totalVectorQueries: 0,
      },
    })
    expect(warn).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      'Failed to collect database performance metrics'
    )
  })

  it('alerts when metric collection returns unavailable latency', async () => {
    await expect(
      new AdvancedDatabaseMonitor().checkAlerts({
        queryPerformance: {
          averageLatency: -1,
          totalQueries: 0,
        },
        connectionPool: {
          active: 0,
          idle: 0,
          waiting: 0,
          totalConnections: 0,
          averageCheckoutTime: -1,
        },
        indexUsage: {
          efficiency: 0,
          totalIndexes: 0,
          scannedIndexes: 0,
        },
        vectorSearch: {
          averageQueryTime: -1,
          totalVectorQueries: 0,
        },
      })
    ).rejects.toThrow('Database metrics collection alert')
  })

  it('does not treat unavailable metrics as real optimization signals', async () => {
    const monitor = new AdvancedDatabaseMonitor()
    const metrics = await monitor.getPerformanceMetrics()

    const suggestions = await monitor.optimizeDatabase(metrics)
    const report = await monitor.generateAdvancedReport(metrics)

    expect(suggestions).toEqual([
      'Database metrics are unavailable; inspect database connectivity before optimization.',
    ])
    expect(report).toContain('Database metrics unavailable')
    expect(report).not.toContain('-1ms')
  })
})
