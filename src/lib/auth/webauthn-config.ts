import { z } from 'zod'
import { env } from '@/lib/validation/env'

// WebAuthn configuration schema
const WebAuthnConfigSchema = z.object({
  rpId: z.string().min(1),
  rpName: z.string().min(1),
  origins: z.array(z.string().url()),
  isDevelopment: z.boolean(),
  isProduction: z.boolean(),
})

export type WebAuthnConfig = z.infer<typeof WebAuthnConfigSchema>

/**
 * Domain validation schema - ensures RP ID is a valid domain format
 */
const DomainSchema = z
  .string()
  .min(1)
  .refine(domain => {
    // RP ID should be a domain, not a full URL
    if (domain.includes('://')) {
      return false
    }
    // Reject IP addresses (IPv4 and IPv6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
    if (ipv4Regex.test(domain) || ipv6Regex.test(domain)) {
      return false
    }
    // Basic domain format validation
    const domainRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    return domainRegex.test(domain)
  }, 'RP ID must be a valid domain (not a URL or IP address)')

/**
 * Origin validation schema - ensures origins are valid URLs
 */
const OriginSchema = z
  .string()
  .url()
  .refine(origin => {
    const url = new URL(origin)
    // In production, origins must use HTTPS (except for localhost)
    if (
      env.NODE_ENV === 'production' &&
      url.protocol === 'http:' &&
      !url.hostname.includes('localhost')
    ) {
      return false
    }
    return true
  }, 'Production origins must use HTTPS (except localhost)')

/**
 * Parse comma-separated origins string into validated array
 */
function parseOrigins(originsString?: string): string[] {
  if (!originsString) {
    return []
  }

  const origins = originsString
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  return origins.map(origin => OriginSchema.parse(origin))
}

/**
 * Get WebAuthn configuration based on environment
 */
export function getWebAuthnConfig(): WebAuthnConfig {
  const isDevelopment = env.NODE_ENV === 'development'
  const isProduction = env.NODE_ENV === 'production'

  // Determine RP ID based on environment
  let rpId: string

  if (env.WEBAUTHN_RP_ID) {
    // Use explicit RP ID from environment
    rpId = DomainSchema.parse(env.WEBAUTHN_RP_ID)
  } else if (isDevelopment) {
    // Default to localhost for development
    rpId = 'localhost'
  } else if (env.NEXT_PUBLIC_VERCEL_URL) {
    // Use Vercel URL hostname for staging/production
    const url = new URL(`https://${env.NEXT_PUBLIC_VERCEL_URL}`)
    rpId = url.hostname
  } else if (env.VERCEL_URL) {
    // Fallback to server-side Vercel URL
    const url = new URL(`https://${env.VERCEL_URL}`)
    rpId = url.hostname
  } else {
    throw new Error(
      'WebAuthn RP ID must be configured. Set WEBAUTHN_RP_ID environment variable or ensure VERCEL_URL is available.'
    )
  }

  // Validate RP ID is not localhost in production
  if (isProduction && rpId === 'localhost') {
    throw new Error('WebAuthn RP ID cannot be localhost in production environment')
  }

  // Determine origins based on environment
  let origins: string[]

  if (env.WEBAUTHN_ORIGINS) {
    // Use explicit origins from environment
    origins = parseOrigins(env.WEBAUTHN_ORIGINS)
  } else {
    // Build default origins based on environment
    origins = []

    if (isDevelopment) {
      // Development defaults
      origins.push('http://localhost:3000')
      if (env.PORT && env.PORT !== '3000') {
        origins.push(`http://localhost:${env.PORT}`)
      }
    }

    if (env.NEXT_PUBLIC_APP_URL) {
      origins.push(env.NEXT_PUBLIC_APP_URL)
    } else if (env.NEXT_PUBLIC_VERCEL_URL) {
      origins.push(`https://${env.NEXT_PUBLIC_VERCEL_URL}`)
    } else if (env.VERCEL_URL) {
      origins.push(`https://${env.VERCEL_URL}`)
    }
  }

  // Ensure we have at least one origin
  if (origins.length === 0) {
    throw new Error('At least one WebAuthn origin must be configured')
  }

  // Validate all origins
  origins.forEach(origin => OriginSchema.parse(origin))

  // Additional production security checks
  if (isProduction) {
    const hasHttpOrigins = origins.some(origin => {
      const url = new URL(origin)
      return url.protocol === 'http:' && !url.hostname.includes('localhost')
    })

    if (hasHttpOrigins) {
      throw new Error('Production WebAuthn origins cannot use HTTP (except localhost)')
    }
  }

  const config = {
    rpId,
    rpName: env.WEBAUTHN_RP_NAME,
    origins,
    isDevelopment,
    isProduction,
  }

  return WebAuthnConfigSchema.parse(config)
}

/**
 * Validate if an origin is allowed for the current configuration
 */
export function isOriginAllowed(origin: string, config?: WebAuthnConfig): boolean {
  const webauthnConfig = config || getWebAuthnConfig()
  return webauthnConfig.origins.includes(origin)
}

/**
 * Get the primary origin for the current environment
 */
export function getPrimaryOrigin(config?: WebAuthnConfig): string {
  const webauthnConfig = config || getWebAuthnConfig()
  return webauthnConfig.origins[0]
}

/**
 * Validate WebAuthn configuration on startup
 */
export function validateWebAuthnConfig(): void {
  try {
    const config = getWebAuthnConfig()
    console.log('WebAuthn configuration validated:', {
      rpId: config.rpId,
      rpName: config.rpName,
      originCount: config.origins.length,
      environment: config.isDevelopment
        ? 'development'
        : config.isProduction
          ? 'production'
          : 'other',
    })
  } catch (error) {
    console.error('WebAuthn configuration validation failed:', error)
    throw error
  }
}
