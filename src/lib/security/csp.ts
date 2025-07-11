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
  'prefetch-src'?: string[]
  'report-uri'?: string[]
  'report-to'?: string[]
  'upgrade-insecure-requests'?: string[]
  'block-all-mixed-content'?: string[]
  // Modern CSP Level 3 directives
  'trusted-types'?: string[]
  'require-trusted-types-for'?: string[]
  'fenced-frame-src'?: string[]
  'navigate-to'?: string[]
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
    const directiveValue = buildDirectiveValue(directive, sources, nonce)
    if (directiveValue) {
      csp.push(directiveValue)
    }
  }

  return `${csp.join('; ')};`
}

/**
 * Build individual directive value
 */
function buildDirectiveValue(directive: string, sources: string[] | undefined, nonce?: string): string | null {
  if (!sources || sources.length === 0) {
    return handleEmptySourcesDirective(directive)
  }

  const processedSources = processSourcesWithNonce(directive, sources, nonce)
  return formatDirective(directive, processedSources)
}

/**
 * Handle directives that don't require sources
 */
function handleEmptySourcesDirective(directive: string): string | null {
  const standaloneDirectives = [
    'upgrade-insecure-requests',
    'block-all-mixed-content',
    'require-trusted-types-for'
  ]
  
  return standaloneDirectives.includes(directive) ? directive : null
}

/**
 * Process sources and add nonce if applicable
 */
function processSourcesWithNonce(directive: string, sources: string[], nonce?: string): string[] {
  const processedSources = [...sources]
  
  if (nonce && isNonceableDirective(directive)) {
    processedSources.push(`'nonce-${nonce}'`)
  }
  
  return processedSources
}

/**
 * Check if directive supports nonce
 */
function isNonceableDirective(directive: string): boolean {
  return directive === 'script-src' || directive === 'style-src'
}

/**
 * Format directive based on its type
 */
function formatDirective(directive: string, sources: string[]): string {
  const specialFormatDirectives: Record<string, string> = {
    'report-uri': `report-uri ${sources.join(' ')}`,
    'report-to': `report-to ${sources.join(' ')}`,
    'require-trusted-types-for': `require-trusted-types-for ${sources.join(' ')}`,
    'trusted-types': `trusted-types ${sources.join(' ')}`
  }
  
  return specialFormatDirectives[directive] || `${directive} ${sources.join(' ')}`
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
    'script-src': [
      "'self'",
      "'strict-dynamic'",
      // Allow wasm in production for better performance
      ...(isProduction ? ["'wasm-unsafe-eval'"] : []),
    ],
    'style-src': [
      "'self'",
      'https://fonts.googleapis.com',
      // TODO: Remove this SHA once all inline styles are migrated to nonce-based
      "'sha256-tQjf8gvb2ROOMapIxFvFAYBeUJ0v1HCbOcSmDNXGtDo='",
    ],
    'font-src': [
      "'self'",
      'https://fonts.gstatic.com',
      // Modern font loading with data URLs
      'data:',
    ],
    'img-src': [
      "'self'",
      'data:',
      'https:',
      'blob:',
      // Modern image formats and optimizations
      'https://avatars.githubusercontent.com',
      'https://github.com',
      'https://raw.githubusercontent.com',
    ],
    'connect-src': [
      "'self'",
      'https://api.github.com',
      // GitHub GraphQL API
      'https://api.github.com/graphql',
    ],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'child-src': ["'self'"],
    'manifest-src': ["'self'"],
    'media-src': ["'self'", 'blob:', 'data:'],
    'prefetch-src': ["'self'"],
    'frame-src': ["'none'"],
    'upgrade-insecure-requests': [],
    'block-all-mixed-content': [],

    // Modern CSP Level 3 directives for enhanced security
    'fenced-frame-src': ["'none'"],
    'navigate-to': ["'self'", 'https://github.com', 'https://api.github.com'],
  }

  // Production-specific CSP directives
  if (isProduction) {
    // Add AI/ML APIs for production features
    baseDirectives['connect-src']?.push('https://api.openai.com', 'https://*.openai.com')

    // Add Neon database connections with wildcards for edge locations
    baseDirectives['connect-src']?.push('https://*.neon.tech', 'https://*.neon.build')

    // Add Vercel deployment domains
    baseDirectives['connect-src']?.push('https://contribux.vercel.app', 'https://*.vercel.app')

    // Enhanced reporting for CSP violations
    baseDirectives['report-uri'] = ['/api/security/csp-report']
    baseDirectives['report-to'] = ['csp-violations']

    // Enable Trusted Types for DOM XSS prevention in production
    baseDirectives['trusted-types'] = ['default', 'nextjs-inline-script', 'react-render']
    baseDirectives['require-trusted-types-for'] = ['script']

    // Strict navigation control in production
    baseDirectives['navigate-to']?.push('https://contribux.vercel.app', 'https://*.github.com')
  } else {
    // Development/preview-specific sources
    baseDirectives['script-src']?.push(
      'https://vercel.live',
      "'unsafe-eval'", // Allow eval in development for hot reloading
      "'unsafe-inline'" // Temporary for development debugging
    )

    baseDirectives['style-src']?.push(
      "'unsafe-inline'" // Allow inline styles in development
    )

    baseDirectives['connect-src']?.push(
      'https://vercel.live',
      'http://localhost:*',
      'ws://localhost:*',
      'wss://localhost:*',
      // Hot reloading and development servers
      'http://127.0.0.1:*',
      'ws://127.0.0.1:*'
    )

    // More permissive img-src for development
    baseDirectives['img-src']?.push('http://localhost:*', 'http://127.0.0.1:*')

    // Allow more navigation in development
    baseDirectives['navigate-to']?.push('http://localhost:*', 'http://127.0.0.1:*')

    // Relaxed trusted types for development
    baseDirectives['trusted-types'] = [
      'default',
      'nextjs-inline-script',
      'react-render',
      'webpack-dev-server',
    ]
  }

  return baseDirectives
}

/**
 * Default CSP directives for the contribux project
 * @deprecated Use getCSPDirectives() for environment-aware configuration
 */
export const defaultCSPDirectives: CSPDirectives = getCSPDirectives()
