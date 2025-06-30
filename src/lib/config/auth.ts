/**
 * Authentication Configuration
 * Extracted from main config to resolve import issues
 */

export const authConfig = {
  jwt: {
    accessTokenExpiry: 15 * 60, // 15 minutes
    refreshTokenExpiry: 7 * 24 * 60 * 60, // 7 days
    testSecret: 'test-secret',
    issuer: 'contribux',
    audience: ['contribux-api'],
  },
  session: {
    expiry: 7 * 24 * 60 * 60, // 7 days
    cleanupInterval: 60 * 1000, // 1 minute
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    defaultLimit: 60, // default for general endpoints
    defaultWindow: 60 * 1000, // 1 minute default window
  },
  security: {
    failedLoginThreshold: 5,
    failedLoginWindow: 10 * 60 * 1000, // 10 minutes
    accountLockDuration: 30 * 60 * 1000, // 30 minutes
    anomalyTimeWindow: 5 * 1000, // 5 seconds
    rapidSuccessionThreshold: 3,
    typicalHoursStart: 6, // 6 AM
    typicalHoursEnd: 22, // 10 PM
  },
} as const
