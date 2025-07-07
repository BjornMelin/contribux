/**
 * OAuth Configuration
 * Extracted from main config to resolve import issues
 */

export const oauthConfig = {
  stateExpiry: 10 * 60 * 1000, // 10 minutes
  allowedProviders: ['github'],
  tokenRefreshBuffer: 5 * 60 * 1000, // 5 minutes before expiry

  // Enhanced PKCE Configuration
  pkce: {
    codeVerifierLength: 128, // RFC 7636 recommended length
    challengeMethod: 'S256',
    enforceRequirement: true, // Always require PKCE
  },

  // Enhanced Security Controls
  security: {
    // Rate limiting for OAuth flows
    rateLimits: {
      authorizationRequests: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // Max authorization attempts per IP
      },
      tokenExchange: {
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 5, // Max token exchanges per IP
      },
      callbackRequests: {
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 20, // Max callback attempts per IP
      },
    },

    // Timing attack protection
    timingAttackProtection: {
      enabled: true,
      minResponseTime: 100, // Minimum response time in ms
      maxJitter: 50, // Random jitter to add
    },

    // Session binding
    sessionBinding: {
      enabled: true,
      bindToUserAgent: true,
      bindToIP: false, // Set to true for enhanced security (may break mobile)
    },

    // OAuth attack detection
    attackDetection: {
      enabled: true,
      maxFailedAttempts: 5,
      lockoutDuration: 30 * 60 * 1000, // 30 minutes
      suspiciousPatterns: [
        'rapid_succession_attempts',
        'invalid_state_patterns',
        'csrf_indicators',
        'authorization_code_replay',
      ],
    },
  },

  // Enhanced Redirect URI Validation
  redirectUriValidation: {
    strictMode: true,
    allowedDomains: ['localhost', '127.0.0.1', 'contribux.vercel.app', 'contribux.app'],
    allowedPorts: [3000, 3001, 8080], // Development ports
    allowedProtocols: ['http', 'https'],
    enforceHttpsInProduction: true,
    maxRedirectChain: 3, // Prevent redirect loops
  },

  // Token Security Controls
  tokenSecurity: {
    rotation: {
      enabled: true,
      rotateOnRefresh: true,
      maxTokenAge: 24 * 60 * 60 * 1000, // 24 hours
    },

    revocation: {
      enabled: true,
      revokeOnSignOut: true,
      revokeOnSuspiciousActivity: true,
    },

    storage: {
      encryptTokens: true,
      saltLength: 32,
      algorithm: 'aes-256-gcm',
    },
  },
} as const
