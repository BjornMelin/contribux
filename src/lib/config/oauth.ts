/**
 * OAuth Configuration
 * Extracted from main config to resolve import issues
 */

export const oauthConfig = {
  stateExpiry: 10 * 60 * 1000, // 10 minutes
  allowedProviders: ['github'],
  tokenRefreshBuffer: 5 * 60 * 1000, // 5 minutes before expiry
} as const
