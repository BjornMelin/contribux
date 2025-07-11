import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * RUNTIME TYPE GUARDS
 * Comprehensive type guards for runtime type safety
 */

// Error type guards
export function isError(error: unknown): error is Error {
  return (
    error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error)
  )
}

export function isErrorWithStatus(error: unknown): error is Error & { status: number } {
  return isError(error) && 'status' in error && typeof (error as any).status === 'number'
}

export function isErrorWithMessage(error: unknown): error is Error & { message: string } {
  return isError(error) && typeof (error as any).message === 'string'
}

export function isGitHubApiError(error: unknown): error is {
  status: number
  message: string
  response?: any
  request?: any
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as any).status === 'number' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  )
}

export function isRateLimitError(error: unknown): boolean {
  return (
    isGitHubApiError(error) &&
    error.status === 403 &&
    (error.message?.includes('rate limit') || error.message?.includes('API rate limit'))
  )
}

export function isNotFoundError(error: unknown): boolean {
  return isGitHubApiError(error) && error.status === 404
}

export function isUnauthorizedError(error: unknown): boolean {
  return isGitHubApiError(error) && error.status === 401
}

export function isForbiddenError(error: unknown): boolean {
  return isGitHubApiError(error) && error.status === 403
}

export function isServerError(error: unknown): boolean {
  return isGitHubApiError(error) && error.status >= 500
}

// GitHub API response type guards
export function isValidGitHubRepository(data: unknown): data is {
  id: number
  name: string
  full_name: string
  owner: {
    login: string
    id: number
    avatar_url: string
    html_url: string
    type: string
    site_admin: boolean
  }
  private: boolean
  description: string | null
  fork: boolean
  html_url: string
  created_at: string
  updated_at: string
  stargazers_count: number
  forks_count: number
  default_branch: string
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as any).id === 'number' &&
    'name' in data &&
    typeof (data as any).name === 'string' &&
    'full_name' in data &&
    typeof (data as any).full_name === 'string' &&
    'owner' in data &&
    isValidGitHubOwner((data as any).owner)
  )
}

export function isValidGitHubOwner(data: unknown): data is {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type: string
  site_admin: boolean
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'login' in data &&
    typeof (data as any).login === 'string' &&
    'id' in data &&
    typeof (data as any).id === 'number' &&
    'avatar_url' in data &&
    typeof (data as any).avatar_url === 'string' &&
    'html_url' in data &&
    typeof (data as any).html_url === 'string' &&
    'type' in data &&
    typeof (data as any).type === 'string' &&
    'site_admin' in data &&
    typeof (data as any).site_admin === 'boolean'
  )
}

export function isValidGitHubUser(data: unknown): data is {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type: string
  site_admin: boolean
  name: string | null
  company: string | null
  blog: string | null
  location: string | null
  email: string | null
  bio: string | null
  public_repos: number
  followers: number
  following: number
  created_at: string
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'login' in data &&
    typeof (data as any).login === 'string' &&
    'id' in data &&
    typeof (data as any).id === 'number' &&
    'avatar_url' in data &&
    typeof (data as any).avatar_url === 'string' &&
    'html_url' in data &&
    typeof (data as any).html_url === 'string' &&
    'type' in data &&
    typeof (data as any).type === 'string' &&
    'site_admin' in data &&
    typeof (data as any).site_admin === 'boolean' &&
    'public_repos' in data &&
    typeof (data as any).public_repos === 'number' &&
    'followers' in data &&
    typeof (data as any).followers === 'number' &&
    'following' in data &&
    typeof (data as any).following === 'number' &&
    'created_at' in data &&
    typeof (data as any).created_at === 'string'
  )
}

export function isValidGitHubContributor(data: unknown): data is {
  login: string
  avatar_url: string
  contributions: number
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'login' in data &&
    typeof (data as any).login === 'string' &&
    'avatar_url' in data &&
    typeof (data as any).avatar_url === 'string' &&
    'contributions' in data &&
    typeof (data as any).contributions === 'number'
  )
}

export function isValidGitHubSearchResponse(data: unknown): data is {
  items: unknown[]
  total_count: number
  incomplete_results: boolean
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    Array.isArray((data as any).items) &&
    'total_count' in data &&
    typeof (data as any).total_count === 'number' &&
    'incomplete_results' in data &&
    typeof (data as any).incomplete_results === 'boolean'
  )
}

// Network error type guards
export function isNetworkError(error: unknown): boolean {
  return (
    isError(error) &&
    (error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('network'))
  )
}

export function isTimeoutError(error: unknown): boolean {
  return (
    isError(error) &&
    (error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT') ||
      error.name === 'TimeoutError')
  )
}

// Validation error type guards
export function isZodError(error: unknown): error is import('zod').ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as any).issues) &&
    'name' in error &&
    (error as any).name === 'ZodError'
  )
}

export function isValidationError(error: unknown): error is Error & { name: 'ValidationError' } {
  return isError(error) && error.name === 'ValidationError'
}

// API response validation helpers
export function extractErrorMessage(error: unknown): string {
  if (isGitHubApiError(error)) {
    return error.message
  }
  if (isError(error)) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error occurred'
}

export function extractErrorStatus(error: unknown): number | null {
  if (isGitHubApiError(error)) {
    return error.status
  }
  return null
}

/**
 * Safe type assertion helpers
 * Use these instead of 'as' assertions for runtime safety
 */
export function assertIsError(error: unknown): asserts error is Error {
  if (!isError(error)) {
    throw new Error('Expected error to be an Error instance')
  }
}

export function assertIsGitHubApiError(error: unknown): asserts error is {
  status: number
  message: string
  response?: any
} {
  if (!isGitHubApiError(error)) {
    throw new Error('Expected error to be a GitHub API error')
  }
}

/**
 * API VALIDATION HELPERS
 * Type-safe validation patterns for API routes
 */

// Request body validation helpers
export function isValidRequestBody(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
}

export function hasRequiredFields<T extends Record<string, unknown>>(
  obj: unknown,
  fields: (keyof T)[]
): obj is T {
  if (!isValidRequestBody(obj)) {
    return false
  }

  return fields.every(
    field =>
      typeof field === 'string' &&
      field in obj &&
      (obj as Record<string, unknown>)[field] !== undefined
  )
}

// Query parameter validation
export function parseQueryParam(param: string | string[] | undefined): string | null {
  if (typeof param === 'string') {
    return param
  }
  if (Array.isArray(param) && param.length > 0) {
    return param[0]
  }
  return null
}

export function parseIntQueryParam(param: string | string[] | undefined): number | null {
  const value = parseQueryParam(param)
  if (value === null) return null

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function parseBoolQueryParam(param: string | string[] | undefined): boolean | null {
  const value = parseQueryParam(param)
  if (value === null) return null

  return value.toLowerCase() === 'true'
}

// JSON parsing with type safety
export function safeJsonParse<T = unknown>(
  json: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(json) as T
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: isError(error) ? error.message : 'Invalid JSON format',
    }
  }
}

// Request body parsing with validation
export async function parseJsonRequestBody<T = unknown>(
  request: Request
): Promise<
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: string
    }
> {
  try {
    const text = await request.text()
    if (!text.trim()) {
      return { success: false, error: 'Request body is empty' }
    }

    return safeJsonParse<T>(text)
  } catch (error) {
    return {
      success: false,
      error: isError(error) ? error.message : 'Failed to read request body',
    }
  }
}

// HTTP status validation
export function isValidHttpStatus(status: unknown): status is number {
  return typeof status === 'number' && status >= 100 && status <= 599
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300
}

export function isClientErrorStatus(status: number): boolean {
  return status >= 400 && status < 500
}

export function isServerErrorStatus(status: number): boolean {
  return status >= 500 && status < 600
}

// Response validation helpers
export function createSuccessResponse<T>(data: T, status = 200) {
  if (!isValidHttpStatus(status) || !isSuccessStatus(status)) {
    throw new Error('Invalid success status code')
  }

  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

export function createErrorResponse(
  message: string,
  code?: string,
  status = 400,
  details?: unknown
) {
  if (!isValidHttpStatus(status)) {
    throw new Error('Invalid HTTP status code')
  }

  return {
    success: false,
    error: {
      code: code || 'GENERIC_ERROR',
      message,
      ...(details ? { details } : {}),
    },
    timestamp: new Date().toISOString(),
  }
}

// Validation error formatting
export function formatZodError(error: import('zod').ZodError): {
  field_errors: Record<string, string[]>
  general_errors: string[]
} {
  const field_errors: Record<string, string[]> = {}
  const general_errors: string[] = []

  for (const issue of error.issues) {
    if (issue.path.length > 0) {
      const fieldPath = issue.path.join('.')
      if (!field_errors[fieldPath]) {
        field_errors[fieldPath] = []
      }
      field_errors[fieldPath].push(issue.message)
    } else {
      general_errors.push(issue.message)
    }
  }

  return { field_errors, general_errors }
}

// Type-safe environment variable helpers
export function getRequiredEnvVar(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Required environment variable ${name} is missing or empty`)
  }
  return value
}

export function getOptionalEnvVar(name: string, defaultValue?: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== '' ? value : defaultValue
}

export function getBooleanEnvVar(name: string, defaultValue = false): boolean {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    return defaultValue
  }
  return value.toLowerCase() === 'true'
}

export function getNumberEnvVar(name: string, defaultValue?: number): number {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Required environment variable ${name} is missing`)
  }

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`)
  }

  return parsed
}

/**
 * API ERROR HANDLING MIDDLEWARE
 * Comprehensive error handling for API routes with type safety
 */

// API error handling wrapper with type guards
export function withTypeGuardedErrorHandling<T>(
  handler: (request: Request) => Promise<T>,
  options: {
    validateRequest?: (request: Request) => Promise<unknown>
    transformError?: (error: unknown) => Error
    includeStackTrace?: boolean
  } = {}
) {
  return async (request: Request): Promise<Response> => {
    const { validateRequest, transformError, includeStackTrace = false } = options

    try {
      // Validate request if validator provided
      if (validateRequest) {
        await validateRequest(request)
      }

      // Execute handler
      const result = await handler(request)

      // Ensure result is properly typed
      if (result instanceof Response) {
        return result
      }

      // Return successful response
      return Response.json(createSuccessResponse(result))
    } catch (error: unknown) {
      // Use type guards for error handling
      if (isZodError(error)) {
        const formatted = formatZodError(error)
        return Response.json(
          createErrorResponse('Validation failed', 'VALIDATION_ERROR', 400, formatted),
          { status: 400 }
        )
      }

      if (isGitHubApiError(error)) {
        const status = error.status || 500
        return Response.json(createErrorResponse(error.message, 'GITHUB_API_ERROR', status), {
          status,
        })
      }

      if (isNetworkError(error)) {
        return Response.json(createErrorResponse('Network error occurred', 'NETWORK_ERROR', 503), {
          status: 503,
        })
      }

      if (isTimeoutError(error)) {
        return Response.json(createErrorResponse('Request timed out', 'TIMEOUT_ERROR', 504), {
          status: 504,
        })
      }

      // Handle other errors with transformation if provided
      const finalError = transformError ? transformError(error) : error
      const errorMessage = extractErrorMessage(finalError)

      const errorResponse = createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        500,
        includeStackTrace && isError(finalError)
          ? {
              message: errorMessage,
              stack: finalError.stack,
            }
          : {
              message: errorMessage,
            }
      )

      return Response.json(errorResponse, { status: 500 })
    }
  }
}

// Request validation helpers
export async function validateJsonRequest<T>(
  request: Request,
  schema: import('zod').ZodSchema<T>
): Promise<T> {
  const bodyResult = await parseJsonRequestBody<T>(request)

  if (!bodyResult.success) {
    throw new Error(`Invalid request body: ${bodyResult.error}`)
  }

  const parseResult = schema.safeParse(bodyResult.data)

  if (!parseResult.success) {
    throw parseResult.error
  }

  return parseResult.data
}

export function validateQueryParams<T>(url: URL, schema: import('zod').ZodSchema<T>): T {
  const params = Object.fromEntries(url.searchParams)

  // Convert common query parameter types
  const processedParams = Object.entries(params).reduce(
    (acc, [key, value]) => {
      // Try to parse numbers
      if (/^\d+$/.test(value)) {
        acc[key] = Number.parseInt(value, 10)
      }
      // Try to parse booleans
      else if (value === 'true' || value === 'false') {
        acc[key] = value === 'true'
      }
      // Keep as string
      else {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, unknown>
  )

  const parseResult = schema.safeParse(processedParams)

  if (!parseResult.success) {
    throw parseResult.error
  }

  return parseResult.data
}

// API response builders with type safety
export function createApiResponse<T>(
  data: T,
  options: {
    status?: number
    headers?: Record<string, string>
    cache?: string
    requestId?: string
  } = {}
): Response {
  const { status = 200, headers = {}, cache, requestId } = options

  const response = createSuccessResponse(data, status)

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  if (cache) {
    responseHeaders['Cache-Control'] = cache
  }

  if (requestId) {
    responseHeaders['X-Request-ID'] = requestId
  }

  return Response.json(response, {
    status,
    headers: responseHeaders,
  })
}

export function createApiErrorResponse(
  error: unknown,
  options: {
    defaultStatus?: number
    requestId?: string
    includeDetails?: boolean
  } = {}
): Response {
  const { defaultStatus = 500, requestId, includeDetails = false } = options

  let status = defaultStatus
  let code = 'INTERNAL_ERROR'
  let message = 'Internal server error'
  let details: unknown

  if (isZodError(error)) {
    status = 400
    code = 'VALIDATION_ERROR'
    message = 'Validation failed'
    details = includeDetails ? formatZodError(error) : undefined
  } else if (isGitHubApiError(error)) {
    status = error.status || 500
    code = 'GITHUB_API_ERROR'
    message = error.message
  } else if (isNetworkError(error)) {
    status = 503
    code = 'NETWORK_ERROR'
    message = 'Network error occurred'
  } else if (isTimeoutError(error)) {
    status = 504
    code = 'TIMEOUT_ERROR'
    message = 'Request timed out'
  } else {
    message = extractErrorMessage(error)
    if (includeDetails && isError(error)) {
      details = {
        message: error.message,
        stack: error.stack,
      }
    }
  }

  const errorResponse = createErrorResponse(message, code, status, details)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (requestId) {
    headers['X-Request-ID'] = requestId
  }

  return Response.json(errorResponse, { status, headers })
}
