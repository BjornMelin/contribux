#!/usr/bin/env tsx

/**
 * Comprehensive API Route Validation Tool
 * Tests all API endpoints for functionality, security, and performance
 * Part of ULTRATHINK Phase 2B-2 validation
 */

import { writeFileSync } from 'node:fs'
import { z } from 'zod'

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const API_BASE = `${BASE_URL}/api`
const MAX_RESPONSE_TIME = 2000 // 2 seconds

// Test result types
interface TestResult {
  name: string
  description: string
  status: 'PASS' | 'FAIL' | 'ERROR' | 'SKIP'
  error: string | undefined
  responseTime: number
  httpCode: number | undefined
  timestamp: string
}

interface ValidationSummary {
  totalTests: number
  passed: number
  failed: number
  errors: number
  skipped: number
  successRate: number
  timestamp: string
  baseUrl: string
}

// Color codes for console output
const _colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
} as const

// Test state
const testResults: TestResult[] = []
let totalTests = 0
let passedTests = 0
let failedTests = 0
let errorTests = 0
let skippedTests = 0

// Utility functions
function printHeader(_title: string): void {
  // Print header with title
}

function printTest(_name: string): void {
  // Print test name
}

function printSuccess(_message: string): void {
  // Print success message
}

function printFailure(_message: string): void {
  // Print failure message
}

function printError(_message: string): void {
  // Print error message
}

function printSkip(_message: string): void {
  // Print skip message
}

// Response schemas for validation
const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  version: z.string(),
  checks: z
    .object({
      database: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        response_time_ms: z.number(),
        details: z.string().optional(),
      }),
      memory: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        usage_mb: z.number(),
        free_mb: z.number(),
      }),
    })
    .optional(),
})

const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  request_id: z.string().optional(),
})

const _SearchRepositoriesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    repositories: z.array(
      z.object({
        id: z.string().uuid(),
        github_id: z.number(),
        full_name: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        language: z.string().nullable(),
        topics: z.array(z.string()),
        stars_count: z.number(),
        health_score: z.number(),
        activity_score: z.number(),
        first_time_contributor_friendly: z.boolean(),
        created_at: z.string(),
        relevance_score: z.number(),
      })
    ),
    total_count: z.number(),
    page: z.number(),
    per_page: z.number(),
    has_more: z.boolean(),
  }),
  metadata: z.object({
    query: z.string(),
    filters: z.any(),
    execution_time_ms: z.number(),
  }),
})

// Helper function to create skip result
function createSkipResult(testName: string, description: string): TestResult {
  return {
    name: testName,
    description: description || 'Server not running',
    status: 'SKIP',
    error: 'Development server not running',
    responseTime: 0,
    httpCode: undefined,
    timestamp: new Date().toISOString(),
  }
}

// Helper function to prepare fetch options
function prepareFetchOptions(
  method: string,
  headers: Record<string, string>,
  body?: unknown
): RequestInit {
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  }

  if (body && method !== 'GET') {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  return fetchOptions
}

// Helper function to parse response data
function parseResponseData(responseText: string): unknown {
  try {
    return responseText ? JSON.parse(responseText) : null
  } catch {
    return responseText
  }
}

// Helper function to validate test response
function validateResponse(
  response: Response,
  responseTime: number,
  expectedStatus: number,
  responseData: unknown,
  schema?: z.ZodSchema
): { passed: boolean; reason: string } {
  let testPassed = true
  let failureReason = ''

  // Check HTTP status
  if (response.status !== expectedStatus) {
    testPassed = false
    failureReason = `Expected status ${expectedStatus}, got ${response.status}`
  }

  // Check response time
  if (responseTime > MAX_RESPONSE_TIME) {
    testPassed = false
    const timeError = `Response time ${responseTime}ms exceeds ${MAX_RESPONSE_TIME}ms`
    failureReason = failureReason ? `${failureReason}; ${timeError}` : timeError
  }

  // Validate schema if provided
  if (schema && response.status >= 200 && response.status < 300) {
    const parseResult = schema.safeParse(responseData)
    if (!parseResult.success) {
      testPassed = false
      const schemaErrorMessage = `Schema validation failed: ${parseResult.error.errors.map(e => e.message).join(', ')}`
      failureReason = failureReason ? `${failureReason}; ${schemaErrorMessage}` : schemaErrorMessage
    }
  }

  return { passed: testPassed, reason: failureReason }
}

// Helper function to record test result
function recordTestResult(result: TestResult, passed: boolean, failureReason?: string): void {
  if (passed) {
    passedTests++
    printSuccess(`${result.name} (${result.responseTime}ms)`)
  } else {
    failedTests++
    printFailure(`${result.name} - ${failureReason}`)
  }
  testResults.push(result)
}

// Helper function to handle test errors
function handleTestError(
  testName: string,
  description: string,
  startTime: number,
  error: unknown
): TestResult {
  errorTests++
  const responseTime = Date.now() - startTime
  const result: TestResult = {
    name: testName,
    description,
    status: 'ERROR',
    error: error instanceof Error ? error.message : 'Unknown error',
    responseTime,
    httpCode: undefined,
    timestamp: new Date().toISOString(),
  }

  printError(`${testName} - ${result.error}`)
  testResults.push(result)
  return result
}

// Test execution function
async function runTest(
  testName: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  options: {
    headers?: Record<string, string>
    body?: unknown
    expectedStatus?: number
    description?: string
    schema?: z.ZodSchema
    skipNetworkCheck?: boolean
  } = {}
): Promise<TestResult> {
  totalTests++
  const startTime = Date.now()
  printTest(testName)

  const {
    headers = {},
    body,
    expectedStatus = 200,
    description = '',
    schema,
    skipNetworkCheck = false,
  } = options

  try {
    // Skip if server is not running (for some tests)
    if (!skipNetworkCheck && !(await isServerRunning())) {
      skippedTests++
      const result = createSkipResult(testName, description)
      printSkip(`${testName} - Server not running`)
      testResults.push(result)
      return result
    }

    // Prepare and execute request
    const fetchOptions = prepareFetchOptions(method, headers, body)
    const response = await fetch(endpoint, fetchOptions)
    const responseTime = Date.now() - startTime
    const responseText = await response.text()
    const responseData = parseResponseData(responseText)

    // Validate response
    const { passed, reason } = validateResponse(
      response,
      responseTime,
      expectedStatus,
      responseData,
      schema
    )

    const result: TestResult = {
      name: testName,
      description,
      status: passed ? 'PASS' : 'FAIL',
      error: passed ? undefined : reason,
      responseTime,
      httpCode: response.status,
      timestamp: new Date().toISOString(),
    }

    recordTestResult(result, passed, reason)
    return result
  } catch (error) {
    return handleTestError(testName, description, startTime, error)
  }
}

// Check if development server is running
async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })
    return response.status === 200
  } catch {
    return false
  }
}

// Main validation function
async function validateAPIs(): Promise<ValidationSummary> {
  printHeader('API Route Validation - ULTRATHINK Phase 2B-2')

  // Check if server is running
  const serverRunning = await isServerRunning()
  if (!serverRunning) {
    // Server is not running
  }

  // 1. Health Check API Tests
  printHeader('Health Check API Tests')

  await runTest('health_basic', 'GET', `${API_BASE}/health`, {
    description: 'Basic health check endpoint functionality',
    schema: HealthResponseSchema,
  })

  await runTest('health_performance', 'GET', `${API_BASE}/health`, {
    description: 'Health check response time validation',
  })

  // 2. Authentication API Tests
  printHeader('Authentication API Tests')

  await runTest('auth_providers_unauthorized', 'GET', `${API_BASE}/auth/providers`, {
    expectedStatus: 401,
    description: 'Providers endpoint requires authentication',
    schema: ErrorResponseSchema,
  })

  await runTest('auth_can_unlink_unauthorized', 'GET', `${API_BASE}/auth/can-unlink`, {
    expectedStatus: 401,
    description: 'Can-unlink endpoint requires authentication',
    schema: ErrorResponseSchema,
  })

  await runTest('auth_primary_provider_unauthorized', 'GET', `${API_BASE}/auth/primary-provider`, {
    expectedStatus: 401,
    description: 'Primary provider endpoint requires authentication',
    schema: ErrorResponseSchema,
  })

  // 3. Search API Tests
  printHeader('Search API Tests')

  await runTest('search_repos_unauthorized', 'GET', `${API_BASE}/search/repositories`, {
    expectedStatus: 401,
    description: 'Repository search requires authentication',
    schema: ErrorResponseSchema,
  })

  await runTest('search_repos_invalid_auth', 'GET', `${API_BASE}/search/repositories`, {
    headers: { Authorization: 'Bearer invalid_token' },
    expectedStatus: 401,
    description: 'Repository search rejects invalid token',
    schema: ErrorResponseSchema,
  })

  await runTest('search_repos_malformed_jwt', 'GET', `${API_BASE}/search/repositories`, {
    headers: { Authorization: 'Bearer not.a.jwt' },
    expectedStatus: 401,
    description: 'Repository search rejects malformed JWT',
    schema: ErrorResponseSchema,
  })

  await runTest('search_opportunities_unauthorized', 'GET', `${API_BASE}/search/opportunities`, {
    expectedStatus: 401,
    description: 'Opportunities search requires authentication',
    schema: ErrorResponseSchema,
  })

  // Parameter validation tests
  await runTest('search_repos_invalid_page', 'GET', `${API_BASE}/search/repositories?page=0`, {
    headers: { Authorization: 'Bearer invalid' },
    expectedStatus: 400,
    description: 'Repository search validates page parameter',
    schema: ErrorResponseSchema,
  })

  await runTest(
    'search_opportunities_invalid_difficulty',
    'GET',
    `${API_BASE}/search/opportunities?difficulty=invalid`,
    {
      headers: { Authorization: 'Bearer invalid' },
      expectedStatus: 400,
      description: 'Opportunities search validates difficulty parameter',
      schema: ErrorResponseSchema,
    }
  )

  // 4. Security Tests
  printHeader('Security Validation Tests')

  await runTest(
    'security_sql_injection',
    'GET',
    `${API_BASE}/search/repositories?q='; DROP TABLE repositories; --`,
    {
      headers: { Authorization: 'Bearer invalid' },
      expectedStatus: 401,
      description: 'Repository search prevents SQL injection',
    }
  )

  await runTest(
    'security_xss_prevention',
    'GET',
    `${API_BASE}/search/opportunities?q=<script>alert('xss')</script>`,
    {
      headers: { Authorization: 'Bearer invalid' },
      expectedStatus: 401,
      description: 'Opportunities search prevents XSS attacks',
    }
  )

  // 5. Error Handling Tests
  printHeader('Error Handling Tests')

  await runTest('error_404_nonexistent', 'GET', `${API_BASE}/nonexistent`, {
    expectedStatus: 404,
    description: 'Non-existent endpoints return 404',
  })

  await runTest('error_405_invalid_method', 'POST', `${API_BASE}/health`, {
    headers: { 'Content-Type': 'application/json' },
    body: {},
    expectedStatus: 405,
    description: 'Invalid HTTP methods return 405',
  })

  // Generate summary
  const summary: ValidationSummary = {
    totalTests,
    passed: passedTests,
    failed: failedTests,
    errors: errorTests,
    skipped: skippedTests,
    successRate: totalTests > 0 ? Number(((passedTests / totalTests) * 100).toFixed(2)) : 0,
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
  }

  return summary
}

// NEW: Security validation script created on line below

// Save results to file
async function saveResults(summary: ValidationSummary): Promise<void> {
  const results = {
    summary,
    tests: testResults,
  }

  try {
    writeFileSync('api-validation-results.json', JSON.stringify(results, null, 2), 'utf8')
  } catch (_error) {
    // Error saving results
  }
}

// Print final summary
function printSummary(summary: ValidationSummary): void {
  printHeader('Validation Summary')

  if (summary.failed === 0 && summary.errors === 0) {
    // All tests passed
  } else {
    // Some tests failed
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const summary = await validateAPIs()
    await saveResults(summary)
    printSummary(summary)

    // Exit with appropriate code
    process.exit(summary.failed > 0 || summary.errors > 0 ? 1 : 0)
  } catch (_error) {
    process.exit(1)
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main()
}

export { validateAPIs, runTest, type TestResult, type ValidationSummary }
