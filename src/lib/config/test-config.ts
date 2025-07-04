/**
 * Configuration System Test - verifies all configuration values are accessible
 * This can be run to validate the configuration system
 */

import {
  auditConfig,
  authConfig,
  cryptoConfig,
  databaseConfig,
  oauthConfig,
  validateConfig,
  webauthnConfig,
} from './index'

export function testConfigurationSystem(): boolean {
  try {
    // Test configuration validation
    if (!validateConfig()) {
      return false
    }

    // Test configuration access
    const tests = [
      // Auth config tests
      () => authConfig.jwt.accessTokenExpiry > 0,
      () => authConfig.jwt.refreshTokenExpiry > 0,
      () => authConfig.rateLimit.max > 0,
      () => authConfig.security.failedLoginThreshold > 0,

      // WebAuthn config tests
      () => webauthnConfig.timeout > 0,
      () => webauthnConfig.challengeExpiry > 0,
      () => webauthnConfig.supportedAlgorithms.length > 0,

      // OAuth config tests
      () => oauthConfig.stateExpiry > 0,
      () => oauthConfig.allowedProviders.length > 0,

      // Audit config tests
      () => auditConfig.retention.standardLogs > 0,
      () => auditConfig.gdpr.inactiveUserRetention > 0,

      // Crypto config tests
      () => cryptoConfig.keyLength > 0,
      () => cryptoConfig.algorithm === 'AES-GCM',

      // Database config tests
      () => databaseConfig.connectionTimeout > 0,
      () => databaseConfig.slowQueryThreshold > 0,
    ]

    const results = tests.map((test, _index) => {
      try {
        const result = test()
        if (!result) {
          // Test failed but continue with others
        }
        return result
      } catch (_error) {
        return false
      }
    })

    const allPassed = results.every(Boolean)

    if (allPassed) {
      // All configuration tests passed
    } else {
      // Some configuration tests failed - continuing execution
    }

    return allPassed
  } catch (_error) {
    return false
  }
}

// Run test if called directly
if (require.main === module) {
  const success = testConfigurationSystem()
  process.exit(success ? 0 : 1)
}
