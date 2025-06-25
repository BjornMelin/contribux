/**
 * Dynamic Import Utilities
 * Provides lazy loading for heavy modules to reduce initial bundle size
 */

// Cache for loaded modules
const moduleCache = new Map<string, unknown>()

/**
 * Dynamically import the GitHub client
 */
export async function getGitHubClient() {
  if (moduleCache.has('github-client')) {
    return moduleCache.get('github-client')
  }

  const module = await import('./github/client')
  moduleCache.set('github-client', module)
  return module
}

/**
 * Dynamically import GDPR utilities
 */
export async function getGDPRUtils() {
  if (moduleCache.has('gdpr')) {
    return moduleCache.get('gdpr')
  }

  const module = await import('./auth/gdpr')
  moduleCache.set('gdpr', module)
  return module
}

/**
 * Dynamically import security scanner
 */
export async function getSecurityScanner() {
  if (moduleCache.has('security-scanner')) {
    return moduleCache.get('security-scanner')
  }

  const module = await import('./security/automated-scanner')
  moduleCache.set('security-scanner', module)
  return module
}

/**
 * Dynamically import SOAR utilities
 */
export async function getSOARUtils() {
  if (moduleCache.has('soar')) {
    return moduleCache.get('soar')
  }

  const module = await import('./security/soar')
  moduleCache.set('soar', module)
  return module
}

/**
 * Dynamically import webhook verification
 */
export async function getWebhookVerification() {
  if (moduleCache.has('webhook-verification')) {
    return moduleCache.get('webhook-verification')
  }

  const module = await import('./security/webhook-verification')
  moduleCache.set('webhook-verification', module)
  return module
}

/**
 * Dynamically import crypto utilities
 */
export async function getCryptoUtils() {
  if (moduleCache.has('crypto-utils')) {
    return moduleCache.get('crypto-utils')
  }

  const module = await import('./security/crypto')
  moduleCache.set('crypto-utils', module)
  return module
}

/**
 * Clear module cache (useful for testing or memory cleanup)
 */
export function clearModuleCache() {
  moduleCache.clear()
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: moduleCache.size,
    modules: Array.from(moduleCache.keys()),
  }
}
