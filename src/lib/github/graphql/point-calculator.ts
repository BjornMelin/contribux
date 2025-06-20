export const GRAPHQL_POINT_LIMIT = 500000

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
    const size = parseInt(match[1], 10)
    const matchIndex = match.index || 0
    const depth = depths[matchIndex] || 1
    
    // Points multiply at each level of nesting
    let multiplier = 1
    for (let i = 0; i < connections.length; i++) {
      if (i < index) {
        const prevMatch = connections[i]
        const prevIndex = prevMatch.index || 0
        const prevDepth = depths[prevIndex] || 1
        
        if (prevDepth < depth) {
          multiplier *= parseInt(prevMatch[1], 10)
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
  const connectionSizes = Array.from(query.matchAll(/(?:first|last):\s*(\d+)/gi))
    .map(m => parseInt(m[1], 10))
  
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
  if (points > GRAPHQL_POINT_LIMIT) {
    suggestions.push('Query exceeds maximum point limit of 500,000')
  }
  
  // Check for high connection sizes
  const highConnections = Array.from(query.matchAll(/first:\s*(\d+)/gi))
    .filter(m => parseInt(m[1], 10) > 50)
  
  highConnections.forEach(match => {
    suggestions.push(`first: ${match[1]}`)
  })
  
  connectionSizes.forEach(size => {
    if (size > 50) {
      suggestions.push(`Consider reducing connection size from ${size} to 50 or less`)
    }
  })
  
  if (maxDepth > 4) {
    suggestions.push(`Query depth of ${maxDepth} is high. Consider flattening or using separate queries`)
  }
  
  if (points > 10000 || connectionSizes.some(size => size > 50)) {
    suggestions.push('pagination')
  }
  
  // Check for nested connections
  const nestedConnections = query.match(/\{[^}]*(?:first|last):[^}]*\{[^}]*(?:first|last):/g)
  if (nestedConnections) {
    suggestions.push('Nested connections detected. Each level multiplies the point cost')
  }
  
  return {
    points,
    nodeCount: points, // Simplified: in reality, nodes != points
    depth: maxDepth,
    suggestions
  }
}

export function optimizeGraphQLQuery(query: string): string[] {
  const analysis = analyzeGraphQLQuery(query)
  return analysis.suggestions
}

export function validateGraphQLPointLimit(query: string): void {
  const points = calculateGraphQLPoints(query)
  if (points > GRAPHQL_POINT_LIMIT) {
    throw new Error(`Query exceeds maximum node count (${GRAPHQL_POINT_LIMIT.toLocaleString()} points)`)
  }
}

export function splitGraphQLQuery(query: string, variables: any = {}): Array<{ query: string; variables: any }> {
  // This is a simplified implementation
  // In production, this would parse the GraphQL AST and intelligently split queries
  
  const batches: Array<{ query: string; variables: any }> = []
  const analysis = analyzeGraphQLQuery(query)
  
  if (analysis.points <= GRAPHQL_POINT_LIMIT) {
    return [{ query, variables }]
  }
  
  // Find the largest connection and reduce it
  const connectionMatch = query.match(/(?:first|last):\s*(\d+)/i)
  if (connectionMatch) {
    const originalSize = parseInt(connectionMatch[1], 10)
    const batchSize = Math.floor(GRAPHQL_POINT_LIMIT / (analysis.points / originalSize))
    
    for (let offset = 0; offset < originalSize; offset += batchSize) {
      const batchQuery = query.replace(
        /(?:first|last):\s*\d+/i,
        `first: ${Math.min(batchSize, originalSize - offset)}`
      )
      
      batches.push({
        query: batchQuery,
        variables: { ...variables, offset }
      })
    }
  }
  
  return batches.length > 0 ? batches : [{ query, variables }]
}

export function buildBatchedQuery(queries: Array<{ alias: string; query: string }>): string {
  const batchedQuery = queries.map(({ alias, query }) => {
    return `${alias}: ${query}`
  }).join('\n  ')
  
  return `query {\n  ${batchedQuery}\n}`
}

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
  
  return query.slice(0, insertIndex) + rateLimitFragment + '\n' + query.slice(insertIndex)
}