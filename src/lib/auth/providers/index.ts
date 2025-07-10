/**
 * Authentication providers index
 * 
 * This module provides environment-specific provider loading with complete
 * isolation between development and production configurations.
 */

import type { AuthOptions } from 'next-auth'
type Provider = AuthOptions['providers'][number]
import { getDemoProviders } from './demo'
import { getProductionProviders, validateProductionConfig } from './production'

/**
 * Get providers based on current environment
 * - Development: Returns demo providers for local testing
 * - Production: Returns properly configured OAuth providers
 */
export function getProviders(): Provider[] {
  if (process.env.NODE_ENV === 'development') {
    return getDemoProviders()
  }
  
  // Validate production configuration
  if (!validateProductionConfig()) {
    throw new Error('Production authentication configuration is invalid')
  }
  
  return getProductionProviders()
}

/**
 * Check if authentication is properly configured for current environment
 */
export function isAuthConfigured(): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true // Demo providers are always available in development
  }
  
  return validateProductionConfig()
}

// Re-export for convenience
export { getDemoProviders } from './demo'
export { getProductionProviders, validateProductionConfig } from './production'