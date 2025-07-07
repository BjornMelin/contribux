/**
 * Security Feature Flags for Portfolio Demonstration
 * Environment-based security feature activation following YAGNI principles
 */

export function getSecurityFeatures() {
  return {
    // Core security features (always enabled)
    basicSecurity: true,
    securityHeaders: true,

    // Showcase features (portfolio demonstration)
    webauthn: process.env.ENABLE_WEBAUTHN === 'true' || process.env.NODE_ENV === 'development',

    // Enhanced features (for technical interviews)
    advancedMonitoring: process.env.ENABLE_ADVANCED_SECURITY === 'true',
    securityDashboard: process.env.ENABLE_SECURITY_DASHBOARD === 'true',
    deviceFingerprinting: process.env.ENABLE_DEVICE_FINGERPRINTING === 'true',
    detailedAudit: process.env.ENABLE_DETAILED_AUDIT === 'true',

    // Rate limiting and protection
    rateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false', // Default on

    // Environment-specific settings
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  } as const
}

// Legacy export for backward compatibility
export const securityFeatures = getSecurityFeatures()

/**
 * Get security configuration for current environment
 */
export function getSecurityConfig() {
  const features = getSecurityFeatures()

  return {
    webauthn: {
      rpName: 'Contribux',
      rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
      origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
      timeout: 60000,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: features.isDevelopment ? 1000 : 100,
    },
    monitoring: {
      enableHealthChecks: features.advancedMonitoring,
      enableMetrics: features.securityDashboard,
    },
  }
}
