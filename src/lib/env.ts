// Contribux Environment Configuration
// Re-export from centralized validation system

// Import centralized environment validation
export {
  env,
  type Env,
  // Helper functions
  getDatabaseUrl,
  getAppUrl,
  getJwtSecret,
  getEncryptionKey,
  // Environment utilities
  isDevelopment,
  isProduction,
  isTest,
  // Configuration getters
  getRedisUrl,
  getGitHubConfig,
  getGoogleConfig,
  getDatabaseConfig,
  getVectorConfig,
  getFeatureFlags,
  getWebAuthnConfig,
  getNotificationConfig,
  getTelemetryConfig,
  getCacheConfig,
  getRateLimitConfig,
  getCorsConfig,
  getGitHubWebhookConfig,
  getAdminConfig,
  getMaintenanceConfig,
  getLogConfig,
  getCiConfig,
  getVercelConfig,
  // Validation functions
  validateProductionSecurity,
  validateEnvironmentOnStartup,
  validateBasicEnvironmentVariables,
  validateSecurityConfiguration,
  validateProductionSecuritySettings,
  getRequiredEnv,
  getOptionalEnv,
} from '@/lib/validation/env'

// Import the env object for destructuring
import { env } from '@/lib/validation/env'

// Legacy aliases for backward compatibility
export const {
  DATABASE_URL,
  DATABASE_URL_DEV,
  DATABASE_URL_TEST,
  JWT_SECRET,
  NEXTAUTH_SECRET,
  NEXTAUTH_URL,
  GITHUB_TOKEN,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIS_URL,
  ALLOWED_REDIRECT_URIS,
  OPENAI_API_KEY,
  SENTRY_DSN,
  HNSW_EF_SEARCH,
  VECTOR_SIMILARITY_THRESHOLD,
  HYBRID_SEARCH_TEXT_WEIGHT,
  HYBRID_SEARCH_VECTOR_WEIGHT,
  DEMO_ZERO_TRUST,
  DEMO_ENTERPRISE,
  NODE_ENV,
  NEXT_PUBLIC_APP_URL,
} = env
