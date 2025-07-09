/**
 * CSP Builder Utility
 * Simple, secure CSP construction with nonce support
 * Following KISS principles - only what we need
 */

export type CSPDirectives = {
  'default-src'?: string[]
  'script-src'?: string[]
  'style-src'?: string[]
  'img-src'?: string[]
  'font-src'?: string[]
  'connect-src'?: string[]
  'frame-ancestors'?: string[]
  'form-action'?: string[]
  'base-uri'?: string[]
  'object-src'?: string[]
  'media-src'?: string[]
  'frame-src'?: string[]
  'worker-src'?: string[]
  'child-src'?: string[]
  'manifest-src'?: string[]
}

/**
 * Build CSP header value from directives
 * @param directives CSP directives configuration
 * @param nonce Optional nonce value for script/style sources
 */
export function buildCSP(directives: CSPDirectives, nonce?: string): string {
  const csp: string[] = []

  // Process each directive
  for (const [directive, sources] of Object.entries(directives)) {
    if (!sources || sources.length === 0) continue

    // Add nonce to script-src and style-src if provided
    const processedSources = [...sources]
    if (nonce && (directive === 'script-src' || directive === 'style-src')) {
      processedSources.push(`'nonce-${nonce}'`)
    }

    csp.push(`${directive} ${processedSources.join(' ')}`)
  }

  return `${csp.join('; ')};`
}

/**
 * Generate cryptographically secure nonce
 * 128-bit (16 bytes) for strong security
 */
export function generateNonce(): string {
  const buffer = new Uint8Array(16)
  crypto.getRandomValues(buffer)
  // Convert to base64 without using Node.js Buffer
  return btoa(String.fromCharCode.apply(null, Array.from(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Generate environment-aware CSP directives
 * Adjusts security policies based on NODE_ENV
 */
export function getCSPDirectives(): CSPDirectives {
  const isProduction = process.env.NODE_ENV === 'production'

  const baseDirectives: CSPDirectives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': [
      "'self'",
      'https://fonts.googleapis.com',
      // TODO: Remove this SHA once all inline styles are migrated to nonce-based
      "'sha256-tQjf8gvb2ROOMapIxFvFAYBeUJ0v1HCbOcSmDNXGtDo='",
    ],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'https:', 'blob:'],
    'connect-src': ["'self'", 'https://api.github.com'],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  }

  // Add development/preview-specific sources
  if (!isProduction) {
    baseDirectives['script-src']?.push('https://vercel.live')
    baseDirectives['connect-src']?.push('https://vercel.live')
  }

  return baseDirectives
}

/**
 * Default CSP directives for the contribux project
 * @deprecated Use getCSPDirectives() for environment-aware configuration
 */
export const defaultCSPDirectives: CSPDirectives = getCSPDirectives()
