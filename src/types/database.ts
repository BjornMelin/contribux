/**
 * Database type definitions for PostgreSQL columns and query results
 */

export interface DatabaseColumn {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
  udt_name: string
}

export interface DatabaseTable {
  table_name: string
  table_schema?: string
  table_type?: string
}

export interface QueryResult {
  rows: unknown[]
  rowCount: number
}

export interface SQLFunction {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryResult | unknown[]>
  client?: {
    connect(): Promise<void>
    query(query: string, values?: unknown[]): Promise<QueryResult>
    end(): Promise<void>
  }
  mockImplementation?: (
    fn: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  ) => void
  mockResolvedValueOnce?: (value: unknown[]) => SQLFunction
}

export interface ThrottleRequestOptions {
  request: {
    retryCount: number
  }
}

export interface GitHubThrottleOptions {
  onRateLimit?: (retryAfter: number, options: ThrottleRequestOptions) => boolean
  onSecondaryRateLimit?: (retryAfter: number, options: ThrottleRequestOptions) => boolean
}

export interface GitHubRetryOptions {
  retries?: number
  doNotRetry?: string[]
}

export interface GitHubCacheOptions {
  maxAge?: number
  maxSize?: number
}
