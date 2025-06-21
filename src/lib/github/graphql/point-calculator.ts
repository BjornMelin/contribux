import { GRAPHQL_DEFAULTS } from '../constants'
import { ErrorMessages } from '../errors'
import { validateQueryAnalysis } from '../schemas'

export interface QueryAnalysis {
  points: number
  nodeCount: number
  depth: number
  suggestions: string[]
}

export function calculateGraphQLPoints(query: string): number {
  // Simple heuristic-based point calculation
  // In production, this would use the GitHub GraphQL schema to accurately calculate points

  let points = 1 // Base cost

  // Find all first/last parameters
  const connectionMatches = query.matchAll(/(?:first|last):\s*(\d+)/gi)
  const depths: number[] = []
  let currentDepth = 0

  for (const char of query) {
    if (char === '{') currentDepth++
    if (char === '}') currentDepth--
    depths.push(currentDepth)
  }

  // Calculate points based on connection sizes and nesting
  const connections = Array.from(connectionMatches)
  connections.forEach((match, index) => {
    const size = Number.parseInt(match[1] || '0', 10)
    const matchIndex = match.index || 0
    const depth = depths[matchIndex] || 1

    // Points multiply at each level of nesting
    let multiplier = 1
    for (let i = 0; i < connections.length; i++) {
      if (i < index) {
        const prevMatch = connections[i]
        if (!prevMatch) continue

        const prevIndex = prevMatch.index || 0
        const prevDepth = depths[prevIndex] || 1

        if (prevDepth < depth) {
          multiplier *= Number.parseInt(prevMatch[1] || '0', 10)
        }
      }
    }

    points += size * multiplier
  })

  return points
}

export function analyzeGraphQLQuery(query: string): QueryAnalysis {
  const points = calculateGraphQLPoints(query)
  const suggestions: string[] = []

  // Extract connection sizes
  const connectionSizes = Array.from(query.matchAll(/(?:first|last):\s*(\d+)/gi)).map(m =>
    Number.parseInt(m[1] || '0', 10)
  )

  // Calculate max depth
  let maxDepth = 0
  let currentDepth = 0
  for (const char of query) {
    if (char === '{') {
      currentDepth++
      maxDepth = Math.max(maxDepth, currentDepth)
    }
    if (char === '}') currentDepth--
  }

  // Generate optimization suggestions
  if (points > GRAPHQL_DEFAULTS.MAX_QUERY_COST) {
    suggestions.push(
      `Query exceeds maximum point limit of ${GRAPHQL_DEFAULTS.MAX_QUERY_COST.toLocaleString()}`
    )
  }

  // Check for high connection sizes
  const CONNECTION_SIZE_THRESHOLD = 50
  const highConnections = Array.from(query.matchAll(/first:\s*(\d+)/gi)).filter(
    m => Number.parseInt(m[1] || '0', 10) > CONNECTION_SIZE_THRESHOLD
  )

  highConnections.forEach(match => {
    suggestions.push(`first: ${match[1]}`)
  })

  connectionSizes.forEach(size => {
    if (size > CONNECTION_SIZE_THRESHOLD) {
      suggestions.push(
        `Consider reducing connection size from ${size} to ${CONNECTION_SIZE_THRESHOLD} or less`
      )
    }
  })

  const DEPTH_WARNING_THRESHOLD = 4
  if (maxDepth > DEPTH_WARNING_THRESHOLD) {
    suggestions.push(
      `Query depth of ${maxDepth} is high. Consider flattening or using separate queries`
    )
  }

  const PAGINATION_SUGGESTION_THRESHOLD = 10000
  if (
    points > PAGINATION_SUGGESTION_THRESHOLD ||
    connectionSizes.some(size => size > CONNECTION_SIZE_THRESHOLD)
  ) {
    suggestions.push('pagination')
  }

  // Check for nested connections
  const nestedConnections = query.match(/\{[^}]*(?:first|last):[^}]*\{[^}]*(?:first|last):/g)
  if (nestedConnections) {
    suggestions.push('Nested connections detected. Each level multiplies the point cost')
  }

  const analysis = {
    points: points || 0,
    nodeCount: points || 0, // Simplified: in reality, nodes != points
    depth: maxDepth || 0,
    suggestions: suggestions || [],
  }

  // Validate the analysis using Zod schema
  return validateQueryAnalysis(analysis)
}

// Removed in favor of query-optimizer.ts implementation

export function validateGraphQLPointLimit(query: string): void {
  const points = calculateGraphQLPoints(query)
  if (points > GRAPHQL_DEFAULTS.MAX_QUERY_COST) {
    throw new Error(
      ErrorMessages.RATE_LIMIT_GRAPHQL_EXCEEDED(points, GRAPHQL_DEFAULTS.MAX_QUERY_COST)
    )
  }
}

// Removed in favor of query-optimizer.ts implementations

export function addRateLimitToQuery(query: string): string {
  // Check if rateLimit is already in the query
  if (query.includes('rateLimit')) {
    return query
  }

  // Add rateLimit field to the query
  const insertIndex = query.lastIndexOf('}')
  if (insertIndex === -1) {
    return query
  }

  const rateLimitFragment = `
  rateLimit {
    limit
    cost
    remaining
    resetAt
    nodeCount
  }`

  return `${query.slice(0, insertIndex) + rateLimitFragment}\n${query.slice(insertIndex)}`
}
