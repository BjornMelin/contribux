/**
 * Vector Similarity Test Utilities for contribux
 * Provides comprehensive testing and validation of vector operations
 * with proper TypeScript support
 */

import { Client } from 'pg'
import type { QueryRow } from '../database/db-client'

export interface VectorTestResult {
  query: string
  executionTime: number
  resultCount: number
  topSimilarity: number
  averageSimilarity: number
  indexUsed: boolean
}

export interface VectorEmbedding {
  id: string
  embedding: number[]
  metadata?: Record<string, unknown>
}

export interface VectorQueryResult extends QueryRow {
  id: string
  distance: number
  similarity: number
}

export interface ExplainResult extends QueryRow {
  'QUERY PLAN'?: unknown
}

export interface HybridSearchResult extends QueryRow {
  id: string
  text_similarity: number
  vector_similarity: number
  combined_score: number
}

export interface DistanceResult extends QueryRow {
  id: string
  distance: number
}

export interface HNSWTestResult {
  configuration?: { m: number; ef_construction: number }
  performance?: VectorTestResult
  indexSize?: string
  error?: string
}

export class VectorTestUtils {
  private client: Client

  constructor(databaseUrl: string) {
    this.client = new Client({ connectionString: databaseUrl })
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    await this.client.end()
  }

  private async query<T extends QueryRow = QueryRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.client.query<T>(text, params)
    return result.rows
  }

  /**
   * Generate a realistic fake embedding vector
   * Simulates embeddings from OpenAI's text-embedding-ada-002 model
   */
  generateFakeEmbedding(seed?: string): number[] {
    const random = this.seededRandom(seed)
    const embedding: number[] = []

    // Generate 1536-dimensional vector with realistic distribution
    for (let i = 0; i < 1536; i++) {
      // Use Box-Muller transform for normal distribution
      const u1 = random()
      const u2 = random()
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

      // Scale to typical embedding range
      embedding.push(z0 * 0.1)
    }

    // Normalize to unit vector (common in embeddings)
    return this.normalizeVector(embedding)
  }

  /**
   * Generate embeddings that are semantically similar
   */
  generateSimilarEmbeddings(baseEmbedding: number[], count: number, similarity = 0.8): number[][] {
    const embeddings: number[][] = []

    for (let i = 0; i < count; i++) {
      const noise = this.generateFakeEmbedding(`noise_${i}`)
      const similar = baseEmbedding.map(
        (val, idx) => val * similarity + (noise[idx] ?? 0) * (1 - similarity)
      )
      embeddings.push(this.normalizeVector(similar))
    }

    return embeddings
  }

  /**
   * Format array for PostgreSQL halfvec type
   */
  private formatVectorForPostgres(vector: number[]): string {
    if (!Array.isArray(vector)) {
      throw new TypeError('Vector must be an array')
    }
    if (vector.length !== 1536) {
      throw new Error('Vector must have exactly 1536 dimensions for halfvec')
    }
    return `[${vector.map(v => v.toString()).join(',')}]`
  }

  /**
   * Test vector similarity search performance with HNSW index
   */
  async testVectorSimilaritySearch(
    table: string,
    embeddingColumn: string,
    queryEmbedding: number[],
    limit = 10
  ): Promise<VectorTestResult> {
    const startTime = performance.now()

    const query = `
      SELECT 
        id,
        ${embeddingColumn} <=> $1::halfvec as distance,
        1 - (${embeddingColumn} <=> $1::halfvec) as similarity
      FROM ${table} 
      WHERE ${embeddingColumn} IS NOT NULL
      ORDER BY ${embeddingColumn} <=> $1::halfvec
      LIMIT ${limit}
    `

    const results = await this.query<VectorQueryResult>(query, [
      this.formatVectorForPostgres(queryEmbedding),
    ])
    const endTime = performance.now()

    // Check if HNSW index was used
    const explainQuery = `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
      SELECT id FROM ${table} 
      WHERE ${embeddingColumn} IS NOT NULL
      ORDER BY ${embeddingColumn} <=> $1::halfvec
      LIMIT ${limit}
    `

    const explainResults = await this.query<ExplainResult>(explainQuery, [
      this.formatVectorForPostgres(queryEmbedding),
    ])

    // Parse JSON explain output
    let indexUsed = false
    if (explainResults[0]?.['QUERY PLAN']) {
      const plan = explainResults[0]['QUERY PLAN']
      const planText = JSON.stringify(plan)
      indexUsed = planText.includes('Index Scan') && planText.includes('hnsw')
    }

    const similarities = results.map(r => r.similarity).filter(s => !Number.isNaN(s))

    return {
      query,
      executionTime: endTime - startTime,
      resultCount: results.length,
      topSimilarity: similarities.length > 0 ? Math.max(...similarities) : 0,
      averageSimilarity:
        similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0,
      indexUsed,
    }
  }

  /**
   * Test hybrid search combining text and vector similarity
   */
  async testHybridSearch(
    table: string,
    textColumn: string,
    embeddingColumn: string,
    searchTerm: string,
    queryEmbedding: number[],
    textWeight = 0.3,
    vectorWeight = 0.7,
    limit = 10
  ): Promise<VectorTestResult> {
    const startTime = performance.now()

    const query = `
      SELECT 
        id,
        ${textColumn},
        similarity(${textColumn}, $1) as text_similarity,
        1 - (${embeddingColumn} <=> $2::halfvec) as vector_similarity,
        (
          similarity(${textColumn}, $1) * $3 + 
          (1 - (${embeddingColumn} <=> $2::halfvec)) * $4
        ) as combined_score
      FROM ${table} 
      WHERE ${embeddingColumn} IS NOT NULL
        AND ${textColumn} IS NOT NULL
      ORDER BY combined_score DESC
      LIMIT ${limit}
    `

    const results = await this.query<HybridSearchResult>(query, [
      searchTerm,
      this.formatVectorForPostgres(queryEmbedding),
      textWeight,
      vectorWeight,
    ])
    const endTime = performance.now()

    const scores = results.map(r => r.combined_score)

    return {
      query,
      executionTime: endTime - startTime,
      resultCount: results.length,
      topSimilarity: Math.max(...scores),
      averageSimilarity: scores.reduce((a: number, b: number) => a + b, 0) / scores.length,
      indexUsed: false, // Hybrid search typically doesn't use single index
    }
  }

  /**
   * Benchmark different vector distance metrics
   */
  async benchmarkDistanceMetrics(
    table: string,
    embeddingColumn: string,
    queryEmbedding: number[],
    limit = 10
  ): Promise<Record<string, VectorTestResult>> {
    const metrics = {
      cosine: '<=>',
      l2: '<->',
      inner_product: '<#>',
    }

    const results: Record<string, VectorTestResult> = {}

    for (const [metricName, operator] of Object.entries(metrics)) {
      const startTime = performance.now()

      const query = `
        SELECT 
          id,
          ${embeddingColumn} ${operator} $1::halfvec as distance
        FROM ${table} 
        WHERE ${embeddingColumn} IS NOT NULL
        ORDER BY ${embeddingColumn} ${operator} $1::halfvec
        LIMIT ${limit}
      `

      const metricResults = await this.query<DistanceResult>(query, [
        this.formatVectorForPostgres(queryEmbedding),
      ])
      const endTime = performance.now()

      const distances = metricResults.map(r => r.distance)

      results[metricName] = {
        query,
        executionTime: endTime - startTime,
        resultCount: metricResults.length,
        topSimilarity: Math.min(...distances), // For distance, smaller is better
        averageSimilarity: distances.reduce((a: number, b: number) => a + b, 0) / distances.length,
        indexUsed: false, // Would need separate EXPLAIN for each
      }
    }

    return results
  }

  /**
   * Test HNSW index configuration performance
   */
  async testHNSWIndexPerformance(
    table: string,
    embeddingColumn: string,
    configurations: Array<{ m: number; ef_construction: number }>
  ): Promise<Record<string, HNSWTestResult>> {
    const results: Record<string, HNSWTestResult> = {}
    const testEmbedding = this.generateFakeEmbedding('hnsw_test')

    for (const config of configurations) {
      const indexName = `test_hnsw_${config.m}_${config.ef_construction}`

      try {
        // Create test index with specific configuration
        await this.query(`
          CREATE INDEX ${indexName} ON ${table} 
          USING hnsw (${embeddingColumn} halfvec_cosine_ops) 
          WITH (m = ${config.m}, ef_construction = ${config.ef_construction})
        `)

        // Test query performance
        const testResult = await this.testVectorSimilaritySearch(
          table,
          embeddingColumn,
          testEmbedding,
          10
        )

        // Get index size
        const indexSize = await this.query(`
          SELECT pg_size_pretty(pg_relation_size('${indexName}')) as size
        `)

        results[`m${config.m}_ef${config.ef_construction}`] = {
          configuration: config,
          performance: testResult,
          indexSize: (indexSize[0] as { size?: string })?.size || 'unknown',
        }

        // Drop test index
        await this.query(`DROP INDEX IF EXISTS ${indexName}`)
      } catch (error) {
        results[`m${config.m}_ef${config.ef_construction}`] = {
          configuration: config,
          error: (error as Error).message,
        }
      }
    }

    return results
  }

  /**
   * Validate vector similarity results for correctness
   */
  async validateSimilarityResults(
    results: Array<{ id: string; similarity: number; embedding?: number[] }>,
    queryEmbedding: number[]
  ): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = []

    // Check if results are sorted by similarity (descending)
    for (let i = 1; i < results.length; i++) {
      const current = results[i]
      const previous = results[i - 1]
      if (current && previous && current.similarity > previous.similarity) {
        issues.push(`Results not sorted: item ${i} has higher similarity than item ${i - 1}`)
      }
    }

    // Validate similarity scores are in valid range
    for (const result of results) {
      if (result.similarity < -1 || result.similarity > 1) {
        issues.push(`Invalid similarity score for ${result.id}: ${result.similarity}`)
      }
    }

    // If embeddings are provided, validate cosine similarity calculation
    for (const result of results) {
      if (result.embedding) {
        const calculatedSimilarity = this.cosineSimilarity(queryEmbedding, result.embedding)
        const difference = Math.abs(calculatedSimilarity - result.similarity)

        if (difference > 0.001) {
          // Allow small floating point differences
          issues.push(
            `Similarity calculation mismatch for ${result.id}: calculated ${calculatedSimilarity}, got ${result.similarity}`
          )
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    }
  }

  /**
   * Generate test data with controlled similarity patterns
   */
  async generateTestVectorData(
    _table: string,
    _embeddingColumn: string,
    count: number,
    clusters = 3
  ): Promise<VectorEmbedding[]> {
    const embeddings: VectorEmbedding[] = []

    // Generate cluster centers
    const clusterCenters = Array.from({ length: clusters }, (_, i) =>
      this.generateFakeEmbedding(`cluster_${i}`)
    )

    // Generate embeddings around cluster centers
    for (let i = 0; i < count; i++) {
      const clusterIndex = i % clusters
      const center = clusterCenters[clusterIndex]

      if (!center) continue

      // Add some noise to create variation within clusters
      const noise = this.generateFakeEmbedding(`item_${i}_noise`)
      const embedding = center.map((val, idx) => val * 0.8 + (noise[idx] ?? 0) * 0.2)

      embeddings.push({
        id: `test_item_${i}`,
        embedding: this.normalizeVector(embedding),
        metadata: {
          cluster: clusterIndex,
          generated_at: new Date().toISOString(),
        },
      })
    }

    return embeddings
  }

  /**
   * Measure vector index build time and memory usage
   */
  async measureIndexBuildPerformance(
    table: string,
    embeddingColumn: string,
    indexName: string,
    m = 16,
    ef_construction = 200
  ): Promise<{ buildTime: number; indexSize: string; rowCount: number }> {
    // Get row count before building index
    const rowCountResult = await this.query(`
      SELECT COUNT(*) as count FROM ${table} WHERE ${embeddingColumn} IS NOT NULL
    `)
    const rowCount = rowCountResult[0]?.count ?? 0

    // Measure index build time
    const startTime = performance.now()

    await this.query(`
      CREATE INDEX ${indexName} ON ${table} 
      USING hnsw (${embeddingColumn} halfvec_cosine_ops) 
      WITH (m = ${m}, ef_construction = ${ef_construction})
    `)

    const endTime = performance.now()
    const buildTime = endTime - startTime

    // Get index size
    const sizeResult = await this.query(`
      SELECT pg_size_pretty(pg_relation_size('${indexName}')) as size
    `)
    const indexSize = (sizeResult[0]?.size as string) || 'unknown'

    return {
      buildTime,
      indexSize,
      rowCount: Number.parseInt(String(rowCount)),
    }
  }

  // Utility methods

  private seededRandom(seed?: string): () => number {
    let seedValue = 0
    if (seed) {
      for (let i = 0; i < seed.length; i++) {
        seedValue += seed.charCodeAt(i)
      }
    } else {
      seedValue = Math.floor(Math.random() * 1000000)
    }

    return () => {
      seedValue = (seedValue * 9301 + 49297) % 233280
      return seedValue / 233280
    }
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0
      const bVal = b[i] ?? 0
      dotProduct += aVal * bVal
      normA += aVal * aVal
      normB += bVal * bVal
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }
}

/**
 * Test helper functions for common vector operations
 */
export const vectorTestHelpers = {
  /**
   * Assert that vector similarity results are ordered correctly
   */
  assertSimilarityOrdering: (results: Array<{ similarity: number }>) => {
    for (let i = 1; i < results.length; i++) {
      const current = results[i]
      const previous = results[i - 1]
      if (current && previous && current.similarity > previous.similarity) {
        throw new Error(`Similarity results not properly ordered at position ${i}`)
      }
    }
  },

  /**
   * Assert that similarities are within expected range
   */
  assertSimilarityRange: (similarities: number[], min = -1, max = 1) => {
    for (const similarity of similarities) {
      if (similarity < min || similarity > max) {
        throw new Error(`Similarity ${similarity} is outside expected range [${min}, ${max}]`)
      }
    }
  },

  /**
   * Create a test embedding with specific characteristics
   */
  createTestEmbedding: (type: 'positive' | 'negative' | 'sparse' | 'dense'): number[] => {
    const utils = new VectorTestUtils('')
    const base = utils.generateFakeEmbedding(type)

    switch (type) {
      case 'positive':
        return base.map(val => Math.abs(val))
      case 'negative':
        return base.map(val => -Math.abs(val))
      case 'sparse':
        return base.map(val => (Math.random() > 0.9 ? val : 0))
      case 'dense':
        return base.map(val => val + (Math.random() - 0.5) * 0.1)
      default:
        return base
    }
  },

  /**
   * Generate test query vectors for different scenarios
   */
  generateTestQueries: () => {
    const utils = new VectorTestUtils('')
    return {
      typical: utils.generateFakeEmbedding('typical_query'),
      edge_case_zeros: new Array(1536).fill(0),
      edge_case_ones: new Array(1536).fill(1),
      edge_case_alternating: Array.from({ length: 1536 }, (_, i) => (i % 2 === 0 ? 1 : -1)),
      high_magnitude: utils.generateFakeEmbedding('high_mag').map(val => val * 10),
      low_magnitude: utils.generateFakeEmbedding('low_mag').map(val => val * 0.01),
    }
  },
}
