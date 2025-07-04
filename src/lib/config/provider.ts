/**
 * Configuration Provider
 * Centralized, type-safe configuration management with validation
 * Follows Singleton pattern for consistent configuration access
 */

import type { Result, ServiceFactory } from '@/lib/types/advanced'
import { Failure, Success } from '@/lib/types/advanced'
import { z } from 'zod'

// Environment schema validation
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url('Invalid database URL'),
  DATABASE_URL_DEV: z.string().url().optional(),
  DATABASE_URL_TEST: z.string().url().optional(),

  // Authentication
  NEXTAUTH_SECRET: z.string().min(32, 'NextAuth secret must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url('Invalid NextAuth URL'),

  // GitHub
  GITHUB_CLIENT_ID: z.string().min(1, 'GitHub client ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GitHub client secret is required'),
  GITHUB_TOKEN: z.string().optional(),

  // External APIs
  OPENAI_API_KEY: z.string().optional(),

  // Redis/Cache
  REDIS_URL: z.string().url().optional(),

  // Monitoring
  SENTRY_DSN: z.string().url().optional(),

  // Feature flags
  ENABLE_ANALYTICS: z
    .string()
    .transform(val => val === 'true')
    .default('false'),
  ENABLE_CACHING: z
    .string()
    .transform(val => val === 'true')
    .default('true'),
  ENABLE_RATE_LIMITING: z
    .string()
    .transform(val => val === 'true')
    .default('true'),

  // Performance
  MAX_SEARCH_RESULTS: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  API_TIMEOUT: z.string().transform(Number).pipe(z.number().positive()).default('30000'),
  CACHE_TTL: z.string().transform(Number).pipe(z.number().positive()).default('300'),

  // Security
  RATE_LIMIT_MAX: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).pipe(z.number().positive()).default('900'),
  JWT_EXPIRY: z.string().default('24h'),

  // Neon specific
  NEON_API_KEY: z.string().optional(),
  NEON_PROJECT_ID: z.string().optional(),
})

type EnvironmentConfig = z.infer<typeof environmentSchema>

// Application configuration schema
const applicationConfigSchema = z.object({
  app: z.object({
    name: z.string().default('Contribux'),
    version: z.string().default('1.0.0'),
    environment: z.enum(['development', 'production', 'test']),
    debug: z.boolean().default(false),
  }),

  database: z.object({
    url: z.string().url(),
    ssl: z.boolean().default(false),
    poolSize: z.number().min(1).max(50).default(10),
    timeout: z.number().positive().default(30000),
    retries: z.number().min(0).max(5).default(3),
  }),

  auth: z.object({
    secret: z.string().min(32),
    url: z.string().url(),
    sessionMaxAge: z.number().positive().default(86400), // 24 hours
    cookieSecure: z.boolean().default(false),
  }),

  github: z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    token: z.string().optional(),
    baseUrl: z.string().url().default('https://api.github.com'),
    timeout: z.number().positive().default(30000),
    retries: z.number().min(0).max(5).default(3),
  }),

  cache: z.object({
    enabled: z.boolean().default(true),
    url: z.string().url().optional(),
    ttl: z.number().positive().default(300),
    maxSize: z.number().positive().default(1000),
  }),

  search: z.object({
    maxResults: z.number().positive().default(100),
    timeout: z.number().positive().default(10000),
    vectorDimensions: z.number().positive().default(1536),
  }),

  monitoring: z.object({
    enabled: z.boolean().default(true),
    sentryDsn: z.string().url().optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),

  security: z.object({
    rateLimiting: z.object({
      enabled: z.boolean().default(true),
      max: z.number().positive().default(100),
      window: z.number().positive().default(900), // 15 minutes
    }),
    cors: z.object({
      enabled: z.boolean().default(true),
      origins: z.array(z.string()).default(['http://localhost:3000']),
    }),
    jwt: z.object({
      expiry: z.string().default('24h'),
      algorithm: z.enum(['HS256', 'HS384', 'HS512']).default('HS256'),
    }),
  }),

  features: z.object({
    analytics: z.boolean().default(false),
    vectorSearch: z.boolean().default(true),
    realTimeUpdates: z.boolean().default(false),
    advancedFiltering: z.boolean().default(true),
  }),
})

type ApplicationConfig = z.infer<typeof applicationConfigSchema>

// Configuration provider class
export class ConfigProvider {
  private static instance: ConfigProvider
  private environmentConfig: EnvironmentConfig | null = null
  private applicationConfig: ApplicationConfig | null = null
  private validated = false

  private constructor() {}

  static getInstance(): ConfigProvider {
    if (!ConfigProvider.instance) {
      ConfigProvider.instance = new ConfigProvider()
    }
    return ConfigProvider.instance
  }

  /**
   * Initialize configuration with validation
   */
  async initialize(): Promise<Result<void, Error>> {
    try {
      // Load environment variables
      const envResult = this.loadEnvironment()
      if (!envResult.success) {
        return envResult
      }

      // Build application config from environment
      const appResult = this.buildApplicationConfig(envResult.data)
      if (!appResult.success) {
        return appResult
      }

      this.environmentConfig = envResult.data
      this.applicationConfig = appResult.data
      this.validated = true

      return Success(void 0)
    } catch (error) {
      return Failure(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Load and validate environment variables
   */
  private loadEnvironment(): Result<EnvironmentConfig, Error> {
    try {
      const env = environmentSchema.parse(process.env)
      return Success(env)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues =
          error.issues && error.issues.length > 0
            ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')
            : 'Unknown validation error'
        return Failure(new Error(`Environment validation failed: ${issues}`))
      }
      return Failure(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Build application configuration from environment
   */
  private buildApplicationConfig(env: EnvironmentConfig): Result<ApplicationConfig, Error> {
    try {
      const config: ApplicationConfig = {
        app: {
          name: 'Contribux',
          version: process.env.npm_package_version || '1.0.0',
          environment: env.NODE_ENV,
          debug: env.NODE_ENV === 'development',
        },

        database: {
          url: env.DATABASE_URL,
          ssl: env.NODE_ENV === 'production',
          poolSize: 10,
          timeout: 30000,
          retries: 3,
        },

        auth: {
          secret: env.NEXTAUTH_SECRET,
          url: env.NEXTAUTH_URL,
          sessionMaxAge: 86400,
          cookieSecure: env.NODE_ENV === 'production',
        },

        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          token: env.GITHUB_TOKEN,
          baseUrl: 'https://api.github.com',
          timeout: env.API_TIMEOUT,
          retries: 3,
        },

        cache: {
          enabled: env.ENABLE_CACHING,
          url: env.REDIS_URL,
          ttl: env.CACHE_TTL,
          maxSize: 1000,
        },

        search: {
          maxResults: env.MAX_SEARCH_RESULTS,
          timeout: 10000,
          vectorDimensions: 1536,
        },

        monitoring: {
          enabled: true,
          sentryDsn: env.SENTRY_DSN,
          logLevel: env.NODE_ENV === 'development' ? 'debug' : 'info',
        },

        security: {
          rateLimiting: {
            enabled: env.ENABLE_RATE_LIMITING,
            max: env.RATE_LIMIT_MAX,
            window: env.RATE_LIMIT_WINDOW,
          },
          cors: {
            enabled: true,
            origins:
              env.NODE_ENV === 'production' ? ['https://contribux.app'] : ['http://localhost:3000'],
          },
          jwt: {
            expiry: env.JWT_EXPIRY,
            algorithm: 'HS256',
          },
        },

        features: {
          analytics: env.ENABLE_ANALYTICS,
          vectorSearch: true,
          realTimeUpdates: false,
          advancedFiltering: true,
        },
      }

      const validated = applicationConfigSchema.parse(config)
      return Success(validated)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues =
          error.issues && error.issues.length > 0
            ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')
            : 'Unknown validation error'
        return Failure(new Error(`Application config validation failed: ${issues}`))
      }
      return Failure(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Get the complete application configuration
   */
  getConfig(): ApplicationConfig {
    if (!this.validated || !this.applicationConfig) {
      throw new Error('Configuration not initialized. Call initialize() first.')
    }
    return this.applicationConfig
  }

  /**
   * Get a specific configuration section
   */
  getSection<K extends keyof ApplicationConfig>(section: K): ApplicationConfig[K] {
    return this.getConfig()[section]
  }

  /**
   * Get a specific configuration value with type safety
   */
  getValue<K extends keyof ApplicationConfig, T extends keyof ApplicationConfig[K]>(
    section: K,
    key: T
  ): ApplicationConfig[K][T] {
    return this.getConfig()[section][key]
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof ApplicationConfig['features']): boolean {
    return this.getSection('features')[feature]
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironment(): EnvironmentConfig['NODE_ENV'] {
    return this.getSection('app').environment
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.getEnvironment() === 'development'
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.getEnvironment() === 'production'
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.getEnvironment() === 'test'
  }

  /**
   * Validate a partial configuration update
   */
  validateUpdate<K extends keyof ApplicationConfig>(
    section: K,
    updates: Partial<ApplicationConfig[K]>
  ): Result<ApplicationConfig[K], Error> {
    try {
      const currentConfig = this.getSection(section)
      const updatedConfig = { ...currentConfig, ...updates }

      // Re-validate the section
      const sectionSchema = applicationConfigSchema.shape[section]
      const validated = sectionSchema.parse(updatedConfig) as ApplicationConfig[K]

      return Success(validated)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues =
          error.issues && error.issues.length > 0
            ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')
            : 'Unknown validation error'
        return Failure(new Error(`Config update validation failed: ${issues}`))
      }
      return Failure(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Reload configuration (useful for hot reloading in development)
   */
  async reload(): Promise<Result<void, Error>> {
    this.validated = false
    this.environmentConfig = null
    this.applicationConfig = null

    return await this.initialize()
  }

  /**
   * Export configuration for debugging
   */
  exportConfig(includeSecrets = false): Record<string, unknown> {
    const config = this.getConfig()

    if (!includeSecrets) {
      // Remove sensitive information
      const sanitized = JSON.parse(JSON.stringify(config))
      sanitized.auth.secret = undefined
      sanitized.github.clientSecret = undefined
      sanitized.github.token = undefined
      return sanitized
    }

    return config
  }
}

// Factory for creating configuration provider
export const createConfigProvider: ServiceFactory<ConfigProvider> = async () => {
  const provider = ConfigProvider.getInstance()
  const result = await provider.initialize()

  if (!result.success) {
    throw result.error
  }

  return provider
}

// React integration available in ./react-provider.tsx

// Configuration validation utilities
export const configValidators = {
  validateDatabaseUrl: (url: string): Result<void, Error> => {
    try {
      new URL(url)
      if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
        return Failure(new Error('Database URL must be a PostgreSQL connection string'))
      }
      return Success(void 0)
    } catch {
      return Failure(new Error('Invalid database URL format'))
    }
  },

  validateGitHubToken: (token: string): Result<void, Error> => {
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      return Failure(new Error('Invalid GitHub token format'))
    }
    return Success(void 0)
  },

  validateJWTSecret: (secret: string): Result<void, Error> => {
    if (secret.length < 32) {
      return Failure(new Error('JWT secret must be at least 32 characters'))
    }
    return Success(void 0)
  },
}

// Export singleton instance for easy access - lazy loaded to avoid build-time issues
let configInstance: ConfigProvider | null = null
export const config = new Proxy({} as ConfigProvider, {
  get(target, prop) {
    if (!configInstance) {
      configInstance = ConfigProvider.getInstance()
    }
    return Reflect.get(configInstance, prop)
  },
})

export type { EnvironmentConfig, ApplicationConfig }
