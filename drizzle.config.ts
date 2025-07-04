import { defineConfig } from 'drizzle-kit'
import { env } from './src/lib/validation/env'

export default defineConfig({
  schema: './src/lib/db/config.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
