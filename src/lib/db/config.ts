import { neon } from '@neondatabase/serverless'
import { env } from '../validation/env'

// Create Neon client with serverless pooling using validated environment
export const sql = neon(env.DATABASE_URL)

// Branch-specific connections for different environments with type safety
export const getDatabaseUrl = (branch: 'main' | 'dev' | 'test' = 'main'): string => {
  switch (branch) {
    case 'dev':
      return env.DATABASE_URL_DEV || env.DATABASE_URL
    case 'test':
      return env.DATABASE_URL_TEST || env.DATABASE_URL
    default:
      return env.DATABASE_URL
  }
}

// Vector search configuration with validated values
export const vectorConfig = {
  efSearch: env.HNSW_EF_SEARCH,
  similarityThreshold: env.VECTOR_SIMILARITY_THRESHOLD,
  textWeight: env.HYBRID_SEARCH_TEXT_WEIGHT,
  vectorWeight: env.HYBRID_SEARCH_VECTOR_WEIGHT,
} as const

// Database branches configuration with validated values
export const dbBranches = {
  main: env.DB_MAIN_BRANCH,
  dev: env.DB_DEV_BRANCH,
  test: env.DB_TEST_BRANCH,
} as const

// Database configuration with validated values
export const dbConfig = {
  projectId: env.DB_PROJECT_ID,
  poolMin: env.DB_POOL_MIN,
  poolMax: env.DB_POOL_MAX,
  poolIdleTimeout: env.DB_POOL_IDLE_TIMEOUT,
} as const
