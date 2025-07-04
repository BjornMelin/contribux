// Contribux Environment Configuration
// Unified configuration replacing 6+ validation files

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    // Database
    DATABASE_URL: z.string().url(),
    DATABASE_URL_DEV: z.string().url().optional(),
    DATABASE_URL_TEST: z.string().url().optional(),

    // Authentication
    JWT_SECRET: z.string().min(32),
    NEXTAUTH_SECRET: z.string().min(32),
    NEXTAUTH_URL: z.string().url().optional(),

    // GitHub Integration
    GITHUB_TOKEN: z.string().min(40),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),

    // Google OAuth (for authentication)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Redis for session storage (optional)
    REDIS_URL: z.string().url().optional(),

    // OAuth redirect URIs
    ALLOWED_REDIRECT_URIS: z.string().optional(),

    // External Services
    OPENAI_API_KEY: z.string().min(20),
    SENTRY_DSN: z.string().url().optional(),

    // Vector Search Configuration (Optimized)
    HNSW_EF_SEARCH: z.coerce.number().default(40), // Optimized: was 400
    VECTOR_SIMILARITY_THRESHOLD: z.coerce.number().default(0.8), // Stricter: was 0.7
    HYBRID_SEARCH_TEXT_WEIGHT: z.coerce.number().default(0.4), // Balanced: was 0.3
    HYBRID_SEARCH_VECTOR_WEIGHT: z.coerce.number().default(0.6), // Balanced: was 0.7

    // Feature Flags (Portfolio Demo)
    DEMO_ZERO_TRUST: z.enum(['true', 'false']).default('false'),
    DEMO_ENTERPRISE: z.enum(['true', 'false']).default('false'),

    // Environment Configuration
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_DEV: process.env.DATABASE_URL_DEV,
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
    JWT_SECRET: process.env.JWT_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    REDIS_URL: process.env.REDIS_URL,
    ALLOWED_REDIRECT_URIS: process.env.ALLOWED_REDIRECT_URIS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    HNSW_EF_SEARCH: process.env.HNSW_EF_SEARCH,
    VECTOR_SIMILARITY_THRESHOLD: process.env.VECTOR_SIMILARITY_THRESHOLD,
    HYBRID_SEARCH_TEXT_WEIGHT: process.env.HYBRID_SEARCH_TEXT_WEIGHT,
    HYBRID_SEARCH_VECTOR_WEIGHT: process.env.HYBRID_SEARCH_VECTOR_WEIGHT,
    DEMO_ZERO_TRUST: process.env.DEMO_ZERO_TRUST,
    DEMO_ENTERPRISE: process.env.DEMO_ENTERPRISE,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
})
