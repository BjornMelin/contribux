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

    // Create local variable to avoid modifying parameter
    let processedQuery = query

    // Extract language operator
    const languageMatch = processedQuery.match(/language:(\w+)/)
    if (languageMatch) {
      result.language = languageMatch[1]
      processedQuery = processedQuery.replace(/language:\w+/g, '').trim()
    }

    // Extract stars operator
    const starsMatch = processedQuery.match(/stars:>(\d+)/)
    if (starsMatch) {
      result.minStars = Number.parseInt(starsMatch[1], 10)
      processedQuery = processedQuery.replace(/stars:>\d+/g, '').trim()
    }

    // Extract user operator
    const userMatch = processedQuery.match(/user:(\w+)/)
    if (userMatch) {
      result.user = userMatch[1]
      processedQuery = processedQuery.replace(/user:\w+/g, '').trim()
    }

    result.baseQuery = processedQuery
    return result
  }

  parseQuery(query: string): ParsedQuery {
    const result: ParsedQuery = {
      baseQuery: query,
      terms: [],
      requiredTerms: [],
      excludedTerms: [],
    }

    // Create local variable to avoid modifying parameter
    let processedQuery = query

    // Extract quoted phrases (required terms)
    const quotedMatches = processedQuery.match(/"([^"]+)"/g)
    if (quotedMatches) {
      result.requiredTerms = quotedMatches.map(match => match.slice(1, -1))
      processedQuery = processedQuery.replace(/"[^"]+"/g, '').trim()
    }

    // Extract excluded terms (starting with -)
    const excludedMatches = processedQuery.match(/-(\w+)/g)
    if (excludedMatches) {
      result.excludedTerms = excludedMatches.map(match => match.slice(1))
      processedQuery = processedQuery.replace(/-\w+/g, '').trim()
    }

    // Remaining terms
    result.terms = processedQuery.split(/\s+/).filter(term => term.length > 0)
    result.baseQuery = processedQuery

    return result
  }
}
