// Contribux Application Configuration
// Simplified configuration patterns

import { env } from './env'

export const appConfig = {
  database: {
    url: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production',
    poolSize: 10, // Simplified from complex pooling
  },

  auth: {
    jwtSecret: env.JWT_SECRET,
    sessionMaxAge: 15 * 60, // 15 minutes
  },

  github: {
    token: env.GITHUB_TOKEN,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    userAgent: 'contribux/1.0.0',
  },

  // Optimized Vector Search Configuration (Phase 3)
  vectorSearch: {
    efSearch: env.HNSW_EF_SEARCH, // 40 (optimized from 400)
    efConstruction: 200, // Build-time optimization
    maxConnections: 16, // Balanced connectivity
    similarityThreshold: env.VECTOR_SIMILARITY_THRESHOLD, // 0.8 (stricter)

    // Simplified hybrid search
    searchMode: 'hybrid' as const,
    textWeight: env.HYBRID_SEARCH_TEXT_WEIGHT, // 0.4 (balanced)
    vectorWeight: env.HYBRID_SEARCH_VECTOR_WEIGHT, // 0.6 (balanced)
  },

  // Cache Configuration (3-Level Strategy)
  cache: {
    edge: {
      ttl: 60, // 60 seconds
      maxSize: 10 * 1024 * 1024, // 10MB
    },
    redis: {
      ttl: 5 * 60, // 5 minutes
      maxSize: 100 * 1024 * 1024, // 100MB
    },
    database: {
      connectionTimeout: 10000, // 10 seconds
      queryTimeout: 30000, // 30 seconds
    },
  },

  features: {
    enterprise: env.DEMO_ENTERPRISE,
  },

  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    enableAnalytics: env.NODE_ENV === 'production',
  },

  // WebAuthn Configuration
  webauthn: {
    rpId:
      env.NODE_ENV === 'production'
        ? env.NEXTAUTH_URL?.replace(/^https?:\/\//, '') || 'localhost'
        : 'localhost',
    timeout: 60000, // 60 seconds
    supportedAlgorithms: [-7, -257], // ES256, RS256
  },

  // Performance Targets (Phase 3)
  performance: {
    queryTimeout: 100, // <100ms target
    vectorSearchTimeout: 100, // <100ms target
    cacheHitRateTarget: 0.9, // >90% target
    maxMemoryUsage: 128 * 1024 * 1024, // 128MB limit
  },
} as const

export type AppConfig = typeof appConfig
