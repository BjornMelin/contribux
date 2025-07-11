/**
 * CSP Header Parser Utility
 * Parses Content Security Policy headers into structured format
 */

export function parseCSPHeader(cspHeader: string): Record<string, string[]> {
  const parsed: Record<string, string[]> = {}

  // Split by semicolon and clean up
  const directives = cspHeader
    .split(';')
    .map(directive => directive.trim())
    .filter(Boolean)

  for (const directive of directives) {
    // Split by whitespace to separate directive name from sources
    const parts = directive.split(/\s+/).filter(Boolean)

    if (parts.length === 0) continue

    const directiveName = parts[0]
    const sources = parts.slice(1)

    // Handle directives that don't have sources
    if (
      directiveName === 'upgrade-insecure-requests' ||
      directiveName === 'block-all-mixed-content'
    ) {
      parsed[directiveName] = []
    } else {
      parsed[directiveName] = sources
    }
  }

  return parsed
}

export function stringifyCSPDirectives(directives: Record<string, string[]>): string {
  const parts: string[] = []

  for (const [directive, sources] of Object.entries(directives)) {
    if (sources.length === 0) {
      // Standalone directives
      parts.push(directive)
    } else {
      parts.push(`${directive} ${sources.join(' ')}`)
    }
  }

  return parts.join('; ')
}

export function validateCSPHeader(cspHeader: string): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  try {
    const directives = parseCSPHeader(cspHeader)

    // Check for required directives
    if (!directives['default-src']) {
      errors.push("Missing required 'default-src' directive")
    }

    // Check for security issues
    if (directives['script-src']?.includes('*')) {
      errors.push('Wildcard (*) in script-src is dangerous')
    }

    if (directives['script-src']?.includes("'unsafe-inline'")) {
      warnings.push("'unsafe-inline' in script-src reduces security")
    }

    if (directives['script-src']?.includes("'unsafe-eval'")) {
      warnings.push("'unsafe-eval' in script-src allows code injection")
    }

    // Check for missing recommended directives
    if (!directives['object-src']) {
      warnings.push("Consider adding 'object-src' directive")
    }

    if (!directives['base-uri']) {
      warnings.push("Consider adding 'base-uri' directive")
    }
  } catch (error) {
    errors.push(`Failed to parse CSP header: ${error}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
