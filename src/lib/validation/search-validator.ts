/**
 * Search Validator - Validates and sanitizes search queries
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface ParsedQuery {
  baseQuery: string
  terms: string[]
  requiredTerms: string[]
  excludedTerms: string[]
  language?: string
  minStars?: number
  user?: string
}

export class SearchValidator {
  sanitizeQuery(query: string): string {
    // Remove script tags and other dangerous HTML
    return query
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim()
  }

  validateQuery(query: string): ValidationResult {
    if (query.length > 256) {
      return {
        valid: false,
        error: 'Query too long (maximum 256 characters)',
      }
    }

    if (query.length < 1) {
      return {
        valid: false,
        error: 'Query cannot be empty',
      }
    }

    return { valid: true }
  }

  parseSearchOperators(query: string): ParsedQuery {
    const result: ParsedQuery = {
      baseQuery: '',
      terms: [],
      requiredTerms: [],
      excludedTerms: [],
    }

    // Extract language operator
    const languageMatch = query.match(/language:(\w+)/)
    if (languageMatch) {
      result.language = languageMatch[1]
      query = query.replace(/language:\w+/g, '').trim()
    }

    // Extract stars operator
    const starsMatch = query.match(/stars:>(\d+)/)
    if (starsMatch) {
      result.minStars = Number.parseInt(starsMatch[1], 10)
      query = query.replace(/stars:>\d+/g, '').trim()
    }

    // Extract user operator
    const userMatch = query.match(/user:(\w+)/)
    if (userMatch) {
      result.user = userMatch[1]
      query = query.replace(/user:\w+/g, '').trim()
    }

    result.baseQuery = query
    return result
  }

  parseQuery(query: string): ParsedQuery {
    const result: ParsedQuery = {
      baseQuery: query,
      terms: [],
      requiredTerms: [],
      excludedTerms: [],
    }

    // Extract quoted phrases (required terms)
    const quotedMatches = query.match(/"([^"]+)"/g)
    if (quotedMatches) {
      result.requiredTerms = quotedMatches.map(match => match.slice(1, -1))
      query = query.replace(/"[^"]+"/g, '').trim()
    }

    // Extract excluded terms (starting with -)
    const excludedMatches = query.match(/-(\w+)/g)
    if (excludedMatches) {
      result.excludedTerms = excludedMatches.map(match => match.slice(1))
      query = query.replace(/-\w+/g, '').trim()
    }

    // Remaining terms
    result.terms = query.split(/\s+/).filter(term => term.length > 0)
    result.baseQuery = query

    return result
  }
}
