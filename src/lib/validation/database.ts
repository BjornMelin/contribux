import { z } from 'zod'

// Connection metrics schema
export const connectionMetricsSchema = z.object({
  active: z.number().int().min(0),
  idle: z.number().int().min(0),
})

// Slow query schema
export const slowQuerySchema = z.object({
  query: z.string(),
  calls: z.coerce.number().int().min(0),
  total_exec_time: z.coerce.number().min(0),
  mean_exec_time: z.coerce.number().min(0),
  rows: z.coerce.number().int().min(0),
})

// Index statistics schema
export const indexStatSchema = z.object({
  schemaname: z.string(),
  tablename: z.string(),
  indexname: z.string(),
  scans_count: z.coerce.number().int().min(0),
  tuples_read: z.coerce.number().int().min(0),
  tuples_fetched: z.coerce.number().int().min(0),
})

// Vector index metrics schema
export const vectorIndexMetricSchema = z.object({
  schemaname: z.string(),
  tablename: z.string(),
  indexname: z.string(),
  index_size: z.string(),
  scans_count: z.coerce.number().int().min(0),
})

// Table size schema
export const tableSizeSchema = z.object({
  schemaname: z.string(),
  tablename: z.string(),
  total_size: z.string(),
  table_size: z.string(),
  index_size: z.string(),
})

// Database extension schema
export const extensionSchema = z.object({
  extname: z.string(),
})

// Health check schema
export const healthCheckSchema = z.object({
  name: z.string(),
  status: z.boolean(),
  message: z.string(),
})

// Database health status schema
export const databaseHealthSchema = z.object({
  status: z.enum(['healthy', 'warning', 'critical']),
  checks: z.array(healthCheckSchema),
})

// Complete database metrics schema
export const databaseMetricsSchema = z.object({
  connectionCount: z.number().int().min(0),
  queryPerformance: z.object({
    slowQueries: z.array(slowQuerySchema),
    avgExecutionTime: z.number().min(0),
  }),
  indexUsage: z.array(
    z.object({
      indexName: z.string(),
      tableName: z.string(),
      scansCount: z.number().int().min(0),
      tuplesRead: z.number().int().min(0),
    })
  ),
  vectorSearchMetrics: z.object({
    hnsWIndexSize: z.number().min(0),
    searchLatency: z.number().min(0),
  }),
})

// Raw database query result schemas for type safety
export const connectionRowSchema = z.object({
  state: z.string(),
  count: z.string(),
})

// Performance report validation schema
export const performanceReportSchema = z.object({
  generatedAt: z.string().datetime(),
  healthStatus: z.enum(['healthy', 'warning', 'critical']),
  connectionMetrics: connectionMetricsSchema,
  slowQueries: z.array(slowQuerySchema),
  vectorMetrics: z.array(vectorIndexMetricSchema),
  tableSizes: z.array(tableSizeSchema),
  indexStats: z.array(indexStatSchema),
  healthChecks: z.array(healthCheckSchema),
})

// Type exports for use throughout the application
export type ConnectionMetrics = z.infer<typeof connectionMetricsSchema>
export type SlowQuery = z.infer<typeof slowQuerySchema>
export type IndexStat = z.infer<typeof indexStatSchema>
export type VectorIndexMetric = z.infer<typeof vectorIndexMetricSchema>
export type TableSize = z.infer<typeof tableSizeSchema>
export type Extension = z.infer<typeof extensionSchema>
export type HealthCheck = z.infer<typeof healthCheckSchema>
export type DatabaseHealth = z.infer<typeof databaseHealthSchema>
export type DatabaseMetrics = z.infer<typeof databaseMetricsSchema>
export type ConnectionRow = z.infer<typeof connectionRowSchema>
export type PerformanceReport = z.infer<typeof performanceReportSchema>
