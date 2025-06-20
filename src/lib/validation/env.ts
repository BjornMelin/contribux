import { z } from 'zod'

// Environment variable schema for runtime validation
export const envSchema = z.object({
  // Database configuration
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DEV: z.string().url().optional(),
  DATABASE_URL_TEST: z.string().url().optional(),

  // Neon project configuration
  DB_PROJECT_ID: z.string().default('soft-dew-27794389'),
  DB_MAIN_BRANCH: z.string().default('br-summer-art-a864udht'),
  DB_DEV_BRANCH: z.string().default('br-cold-scene-a86p5ixr'),
  DB_TEST_BRANCH: z.string().default('br-fancy-pine-a8imumhr'),

  // Connection pool settings
  DB_POOL_MIN: z.string().pipe(z.coerce.number().int().min(1)).default('2'),
  DB_POOL_MAX: z.string().pipe(z.coerce.number().int().min(1)).default('20'),
  DB_POOL_IDLE_TIMEOUT: z.string().pipe(z.coerce.number().int().min(1000)).default('10000'),

  // Vector search configuration
  HNSW_EF_SEARCH: z.string().pipe(z.coerce.number().int().min(1)).default('200'),
  VECTOR_SIMILARITY_THRESHOLD: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.7'),
  HYBRID_SEARCH_TEXT_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.3'),
  HYBRID_SEARCH_VECTOR_WEIGHT: z.string().pipe(z.coerce.number().min(0).max(1)).default('0.7'),

  // Application environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Next.js configuration
  NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  PORT: z.string().pipe(z.coerce.number().int().min(1).max(65535)).default('3000'),
})

// Runtime validation of environment variables
export const env = envSchema.parse(process.env)

// Type inference for TypeScript
export type Env = z.infer<typeof envSchema>
