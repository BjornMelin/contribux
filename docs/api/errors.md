# Error Handling

The Contribux API uses conventional HTTP response codes to indicate the success or failure of API requests and provides detailed error information to help you handle issues gracefully.

## HTTP Status Codes

### Success Codes (2xx)

| Code | Status     | Description                             |
| ---- | ---------- | --------------------------------------- |
| 200  | OK         | Request successful                      |
| 201  | Created    | Resource created successfully           |
| 202  | Accepted   | Request accepted for processing         |
| 204  | No Content | Request successful, no content returned |

### Client Error Codes (4xx)

| Code | Status               | Description                                 |
| ---- | -------------------- | ------------------------------------------- |
| 400  | Bad Request          | Invalid request syntax or parameters        |
| 401  | Unauthorized         | Authentication required or invalid          |
| 403  | Forbidden            | Request forbidden, insufficient permissions |
| 404  | Not Found            | Resource not found                          |
| 409  | Conflict             | Request conflicts with current state        |
| 422  | Unprocessable Entity | Valid syntax but semantic errors            |
| 429  | Too Many Requests    | Rate limit exceeded                         |

### Server Error Codes (5xx)

| Code | Status                | Description                           |
| ---- | --------------------- | ------------------------------------- |
| 500  | Internal Server Error | Unexpected server error               |
| 502  | Bad Gateway           | Invalid response from upstream server |
| 503  | Service Unavailable   | Service temporarily unavailable       |
| 504  | Gateway Timeout       | Upstream server timeout               |

## Error Response Format

All error responses follow a consistent JSON structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": {
      "field": "Additional context",
      "suggestion": "How to fix this error"
    },
    "request_id": "req_1234567890abcdef",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Error Object Fields

- **code**: Machine-readable error identifier
- **message**: Human-readable error description
- **details**: Additional context and suggestions (optional)
- **request_id**: Unique identifier for debugging
- **timestamp**: When the error occurred

## Error Codes Reference

### Authentication Errors (AUTH\_\*)

#### AUTH_REQUIRED

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication is required for this endpoint",
    "details": {
      "supported_methods": ["Bearer Token", "API Key"],
      "documentation": "https://docs.contribux.ai/api/authentication"
    }
  }
}
```

#### TOKEN_EXPIRED

```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "The access token has expired",
    "details": {
      "expired_at": "2024-01-15T10:00:00Z",
      "refresh_endpoint": "/api/v1/auth/refresh"
    }
  }
}
```

#### TOKEN_INVALID

```json
{
  "error": {
    "code": "TOKEN_INVALID",
    "message": "The provided token is invalid or malformed",
    "details": {
      "suggestion": "Ensure the token is properly formatted and hasn't been tampered with"
    }
  }
}
```

#### SCOPE_INSUFFICIENT

```json
{
  "error": {
    "code": "SCOPE_INSUFFICIENT",
    "message": "Token lacks required permissions for this operation",
    "details": {
      "required_scopes": ["read:repositories"],
      "current_scopes": ["read:user"],
      "upgrade_url": "https://contribux.ai/dashboard/api-keys"
    }
  }
}
```

### Validation Errors (VALIDATION\_\*)

#### VALIDATION_FAILED

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": {
      "field_errors": {
        "email": "Invalid email format",
        "languages": "Must be a non-empty array"
      }
    }
  }
}
```

#### MISSING_PARAMETER

```json
{
  "error": {
    "code": "MISSING_PARAMETER",
    "message": "Required parameter is missing",
    "details": {
      "parameter": "repository_id",
      "type": "string",
      "description": "Unique identifier for the repository"
    }
  }
}
```

#### INVALID_PARAMETER

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Parameter value is invalid",
    "details": {
      "parameter": "difficulty_level",
      "provided": "expert",
      "accepted_values": ["beginner", "intermediate", "advanced"]
    }
  }
}
```

### Resource Errors (RESOURCE\_\*)

#### RESOURCE_NOT_FOUND

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found",
    "details": {
      "resource_type": "repository",
      "resource_id": "repo_123",
      "suggestion": "Verify the ID is correct and you have access to this resource"
    }
  }
}
```

#### RESOURCE_CONFLICT

```json
{
  "error": {
    "code": "RESOURCE_CONFLICT",
    "message": "Resource already exists or conflicts with current state",
    "details": {
      "conflict_field": "github_username",
      "existing_value": "existing_user",
      "suggestion": "Use a different username or update the existing resource"
    }
  }
}
```

### Rate Limiting Errors (RATE\_\*)

#### RATE_LIMIT_EXCEEDED

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API rate limit exceeded",
    "details": {
      "limit": 1000,
      "remaining": 0,
      "reset_at": "2024-01-15T11:00:00Z",
      "retry_after": 3600,
      "upgrade_url": "https://contribux.ai/pricing"
    }
  }
}
```

### Service Errors (SERVICE\_\*)

#### SERVICE_UNAVAILABLE

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service is temporarily unavailable",
    "details": {
      "maintenance": false,
      "estimated_restoration": "2024-01-15T11:30:00Z",
      "status_page": "https://status.contribux.ai"
    }
  }
}
```

#### EXTERNAL_SERVICE_ERROR

```json
{
  "error": {
    "code": "EXTERNAL_SERVICE_ERROR",
    "message": "External service integration failed",
    "details": {
      "service": "github_api",
      "error_type": "rate_limited",
      "retry_after": 300
    }
  }
}
```

## Error Handling Best Practices

### 1. Comprehensive Error Handling

```javascript
class ContribuxError extends Error {
  constructor(response, body) {
    const error = body.error || {};
    super(error.message || "Unknown API error");

    this.name = "ContribuxError";
    this.code = error.code;
    this.status = response.status;
    this.details = error.details;
    this.requestId = error.request_id;
    this.timestamp = error.timestamp;
  }
}

class ContribuxClient {
  async request(endpoint, options = {}) {
    const response = await fetch(`https://contribux.ai/api/v1${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const body = await response.json();

    if (!response.ok) {
      throw new ContribuxError(response, body);
    }

    return body;
  }
}
```

### 2. Specific Error Type Handling

```javascript
async function handleApiCall(apiCall) {
  try {
    return await apiCall();
  } catch (error) {
    if (error instanceof ContribuxError) {
      switch (error.code) {
        case "TOKEN_EXPIRED":
          // Attempt token refresh
          await refreshToken();
          return apiCall(); // Retry with new token

        case "RATE_LIMIT_EXCEEDED":
          // Wait and retry
          const retryAfter = error.details?.retry_after || 60;
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000)
          );
          return apiCall();

        case "RESOURCE_NOT_FOUND":
          // Handle missing resource gracefully
          console.warn(`Resource not found: ${error.details?.resource_id}`);
          return null;

        case "VALIDATION_FAILED":
          // Log validation errors for debugging
          console.error("Validation errors:", error.details?.field_errors);
          throw new Error("Invalid request data");

        case "SCOPE_INSUFFICIENT":
          // Redirect to upgrade flow
          window.location.href = error.details?.upgrade_url;
          return;

        default:
          // Handle unexpected errors
          console.error("Unexpected API error:", error);
          throw error;
      }
    }

    // Handle non-API errors
    throw error;
  }
}
```

### 3. Retry Logic with Exponential Backoff

```javascript
async function retryWithBackoff(apiCall, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (error instanceof ContribuxError) {
        // Don't retry client errors (4xx) except rate limits
        if (
          error.status >= 400 &&
          error.status < 500 &&
          error.code !== "RATE_LIMIT_EXCEEDED"
        ) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries - 1) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay =
          error.code === "RATE_LIMIT_EXCEEDED"
            ? (error.details?.retry_after || 60) * 1000
            : baseDelay * Math.pow(2, attempt);

        console.log(
          `Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

### 4. User-Friendly Error Messages

```javascript
function getErrorMessage(error) {
  if (!(error instanceof ContribuxError)) {
    return "An unexpected error occurred. Please try again.";
  }

  const userFriendlyMessages = {
    AUTH_REQUIRED: "Please sign in to continue.",
    TOKEN_EXPIRED: "Your session has expired. Please sign in again.",
    SCOPE_INSUFFICIENT: "You don't have permission to perform this action.",
    RESOURCE_NOT_FOUND: "The requested item could not be found.",
    VALIDATION_FAILED: "Please check your input and try again.",
    RATE_LIMIT_EXCEEDED:
      "Too many requests. Please wait a moment and try again.",
    SERVICE_UNAVAILABLE:
      "Service is temporarily unavailable. Please try again later.",
    EXTERNAL_SERVICE_ERROR:
      "External service is experiencing issues. Please try again later.",
  };

  return (
    userFriendlyMessages[error.code] || error.message || "An error occurred."
  );
}

// Usage in React component
function MyComponent() {
  const [error, setError] = useState(null);

  const handleAction = async () => {
    try {
      setError(null);
      await apiCall();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <button onClick={handleAction}>Perform Action</button>
    </div>
  );
}
```

### 5. Logging and Monitoring

```javascript
class ErrorReporter {
  static report(error, context = {}) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context,
      ...(error instanceof ContribuxError && {
        api_error: {
          code: error.code,
          status: error.status,
          request_id: error.requestId,
          details: error.details,
        },
      }),
    };

    // Send to monitoring service
    if (process.env.NODE_ENV === "production") {
      // Example: Sentry, LogRocket, etc.
      console.error("API Error:", errorData);
    } else {
      console.error("API Error:", errorData);
    }
  }
}

// Usage
try {
  await client.getRepositories();
} catch (error) {
  ErrorReporter.report(error, {
    user_id: currentUser?.id,
    endpoint: "/repositories",
    action: "fetch_repositories",
  });

  setError(getErrorMessage(error));
}
```

## Debugging Errors

### Using Request IDs

Every error response includes a `request_id` that can be used for debugging:

```javascript
// Include request ID in error reports
if (error instanceof ContribuxError) {
  console.log(
    `Error occurred (Request ID: ${error.requestId}):`,
    error.message
  );
}
```

When contacting support, include the request ID for faster resolution.

### Debug Mode

Enable debug mode to see additional error information:

```javascript
const client = new ContribuxClient(token, {
  debug: process.env.NODE_ENV === "development",
});

// Debug mode will log:
// - Request/response headers
// - Full error responses
// - Timing information
```

### Webhook Error Handling

For webhook endpoints, return appropriate status codes:

```javascript
app.post("/webhooks/contribux", (req, res) => {
  try {
    // Verify webhook signature
    if (!verifySignature(req.body, req.headers["x-signature"])) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Process webhook
    processWebhook(req.body);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);

    // Return 5xx for temporary failures (will retry)
    // Return 4xx for permanent failures (won't retry)
    const status = error.temporary ? 503 : 400;
    res.status(status).json({
      error: "Webhook processing failed",
      temporary: error.temporary,
    });
  }
});
```

## Common Scenarios

### Network Connectivity Issues

```javascript
async function handleNetworkError(apiCall) {
  try {
    return await apiCall();
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      // Network error
      throw new Error(
        "Network connection failed. Please check your internet connection."
      );
    }

    if (error.name === "AbortError") {
      // Request timeout
      throw new Error("Request timed out. Please try again.");
    }

    throw error;
  }
}
```

### Concurrent Request Limits

```javascript
class ConcurrencyLimiter {
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async execute(apiCall) {
    return new Promise((resolve, reject) => {
      this.queue.push({ apiCall, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { apiCall, resolve, reject } = this.queue.shift();

    try {
      const result = await apiCall();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}
```

### Graceful Degradation

```javascript
async function getRepositoriesWithFallback(criteria) {
  try {
    // Try AI-powered recommendations
    return await client.getAIRecommendations(criteria);
  } catch (error) {
    if (error.code === "SERVICE_UNAVAILABLE") {
      console.warn("AI service unavailable, falling back to basic search");
      // Fallback to basic search
      return await client.searchRepositories(criteria);
    }
    throw error;
  }
}
```

## Error Prevention

### Request Validation

```javascript
function validateSearchCriteria(criteria) {
  const errors = {};

  if (!criteria.languages || criteria.languages.length === 0) {
    errors.languages = "At least one programming language is required";
  }

  if (
    criteria.difficulty &&
    !["beginner", "intermediate", "advanced"].includes(criteria.difficulty)
  ) {
    errors.difficulty = "Invalid difficulty level";
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Invalid search criteria", errors);
  }
}
```

### Input Sanitization

```javascript
function sanitizeInput(input) {
  if (typeof input === "string") {
    // Remove potentially harmful characters
    return input.replace(/[<>\"'&]/g, "");
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }

  if (typeof input === "object" && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}
```

## Support and Troubleshooting

When you encounter errors:

1. **Check Status Page**: [https://status.contribux.ai](https://status.contribux.ai)
2. **Review Documentation**: This error guide and endpoint documentation
3. **Check Request ID**: Include in support requests
4. **Contact Support**: [api-support@contribux.ai](mailto:api-support@contribux.ai)

### Support Request Template

```text
Subject: API Error - [ERROR_CODE] - Request ID: [REQUEST_ID]

Environment: [Production/Staging/Development]
Endpoint: [API endpoint]
Request ID: [From error response]
Timestamp: [When error occurred]
User Agent: [Your application identifier]

Error Details:
[Complete error response]

Expected Behavior:
[What should have happened]

Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Additional Context:
[Any relevant information]
```

## Framework-Specific Error Handling

### React/Next.js Error Boundaries

```javascript
class ApiErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to monitoring service
    ErrorReporter.report(error, {
      component_stack: errorInfo.componentStack,
      error_boundary: true,
    });
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state;

      if (error instanceof ContribuxError && error.code === "AUTH_REQUIRED") {
        return <RedirectToLogin />;
      }

      return (
        <div className="error-fallback">
          <h2>Something went wrong</h2>
          <p>{getErrorMessage(error)}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage with React Query
function useRepositories(filters) {
  return useQuery({
    queryKey: ["repositories", filters],
    queryFn: () => client.getRepositories(filters),
    retry: (failureCount, error) => {
      // Don't retry auth errors
      if (error instanceof ContribuxError && error.code.startsWith("AUTH_")) {
        return false;
      }

      // Retry up to 3 times for server errors
      return failureCount < 3 && error.status >= 500;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
```

### Vue.js Error Handling

```javascript
// Global error handler
const app = createApp(App);

app.config.errorHandler = (error, instance, info) => {
  if (error instanceof ContribuxError) {
    // Handle API errors gracefully
    if (error.code === "TOKEN_EXPIRED") {
      store.dispatch("auth/refreshToken");
      return;
    }

    if (error.code === "RATE_LIMIT_EXCEEDED") {
      store.commit("ui/showRateLimitWarning", error.details);
      return;
    }
  }

  ErrorReporter.report(error, { vue_info: info });
};

// Composable for error handling
export function useApiErrorHandler() {
  const { notify } = useNotifications();
  const router = useRouter();

  const handleError = (error) => {
    if (!(error instanceof ContribuxError)) {
      notify("An unexpected error occurred", "error");
      return;
    }

    switch (error.code) {
      case "AUTH_REQUIRED":
        router.push("/login");
        break;
      case "SCOPE_INSUFFICIENT":
        notify("You need additional permissions for this action", "warning");
        break;
      default:
        notify(getErrorMessage(error), "error");
    }
  };

  return { handleError };
}
```

### Express.js Middleware

```javascript
// Error handling middleware
function apiErrorHandler(err, req, res, next) {
  // Log error with request context
  console.error("API Error:", {
    error: err.message,
    code: err.code,
    status: err.status,
    url: req.url,
    method: req.method,
    user_id: req.user?.id,
    request_id: req.id,
  });

  if (err instanceof ContribuxError) {
    // Return structured error response
    return res.status(err.status || 500).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        request_id: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle non-API errors
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An internal error occurred",
      request_id: req.id,
      timestamp: new Date().toISOString(),
    },
  });
}

// Async route wrapper
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage
app.get(
  "/api/repositories",
  asyncHandler(async (req, res) => {
    try {
      const repositories = await client.getRepositories(req.query);
      res.json(repositories);
    } catch (error) {
      throw error; // Will be caught by error handler
    }
  })
);

app.use(apiErrorHandler);
```

## Advanced Error Scenarios

### Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 10000;

    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.recentRequests = [];
  }

  async call(fn) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime < this.resetTimeout) {
        throw new Error("Circuit breaker is OPEN");
      }

      // Try to reset
      this.state = "HALF_OPEN";
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }
}

// Usage
const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000,
});

async function resilientApiCall(fn) {
  try {
    return await apiCircuitBreaker.call(fn);
  } catch (error) {
    if (error.message === "Circuit breaker is OPEN") {
      // Use cached data or show friendly message
      return getCachedData() || { error: "Service temporarily unavailable" };
    }
    throw error;
  }
}
```

### Bulk Operation Error Handling

```javascript
class BulkOperationHandler {
  constructor(batchSize = 10, maxConcurrency = 3) {
    this.batchSize = batchSize;
    this.limiter = new ConcurrencyLimiter(maxConcurrency);
  }

  async processAll(items, processor) {
    const batches = this.createBatches(items);
    const results = [];
    const errors = [];

    for (const batch of batches) {
      const batchPromises = batch.map((item) =>
        this.limiter.execute(async () => {
          try {
            return await processor(item);
          } catch (error) {
            return { error, item };
          }
        })
      );

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result.error) {
          errors.push(result);
        } else {
          results.push(result);
        }
      }
    }

    return { results, errors, successCount: results.length };
  }

  createBatches(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }
}

// Usage
const bulkHandler = new BulkOperationHandler();

async function syncRepositories(repositoryIds) {
  const { results, errors } = await bulkHandler.processAll(
    repositoryIds,
    async (id) => await client.syncRepository(id)
  );

  if (errors.length > 0) {
    console.warn(`${errors.length} repositories failed to sync:`);
    errors.forEach(({ error, item }) => {
      console.warn(`Repository ${item}: ${error.message}`);
    });
  }

  return results;
}
```

## Error Metrics and Monitoring

### Custom Metrics Collection

```javascript
class ApiMetrics {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      errorsByCode: {},
      responseTimeTotal: 0,
      slowRequests: 0,
    };
  }

  recordRequest(duration, error = null) {
    this.metrics.requests++;
    this.metrics.responseTimeTotal += duration;

    if (duration > 5000) {
      this.metrics.slowRequests++;
    }

    if (error) {
      this.metrics.errors++;
      const code = error.code || "UNKNOWN";
      this.metrics.errorsByCode[code] =
        (this.metrics.errorsByCode[code] || 0) + 1;
    }
  }

  getStats() {
    const { requests, errors, responseTimeTotal } = this.metrics;

    return {
      ...this.metrics,
      errorRate: requests > 0 ? errors / requests : 0,
      averageResponseTime: requests > 0 ? responseTimeTotal / requests : 0,
      successRate: requests > 0 ? (requests - errors) / requests : 1,
    };
  }

  reset() {
    this.metrics = {
      requests: 0,
      errors: 0,
      errorsByCode: {},
      responseTimeTotal: 0,
      slowRequests: 0,
    };
  }
}

// Enhanced client with metrics
class MonitoredContribuxClient extends ContribuxClient {
  constructor(token, options = {}) {
    super(token, options);
    this.metrics = new ApiMetrics();
  }

  async request(endpoint, options = {}) {
    const startTime = Date.now();

    try {
      const result = await super.request(endpoint, options);
      this.metrics.recordRequest(Date.now() - startTime);
      return result;
    } catch (error) {
      this.metrics.recordRequest(Date.now() - startTime, error);
      throw error;
    }
  }

  getMetrics() {
    return this.metrics.getStats();
  }
}
```

### Health Check Endpoint

```javascript
class ApiHealthChecker {
  constructor(client) {
    this.client = client;
    this.lastCheck = null;
    this.checkInterval = 60000; // 1 minute
  }

  async checkHealth() {
    const startTime = Date.now();
    const checks = {
      api_reachable: false,
      authentication: false,
      database: false,
      external_services: false,
      response_time: null,
    };

    try {
      // Basic connectivity
      await this.client.request("/health");
      checks.api_reachable = true;

      // Authentication check
      await this.client.getProfile();
      checks.authentication = true;

      // Database check (implicit in profile call)
      checks.database = true;

      // External services (try a simple repository search)
      await this.client.searchRepositories({
        languages: ["JavaScript"],
        limit: 1,
      });
      checks.external_services = true;
    } catch (error) {
      console.warn("Health check failed:", error.message);
    }

    checks.response_time = Date.now() - startTime;
    this.lastCheck = { timestamp: new Date(), checks };

    return this.lastCheck;
  }

  startMonitoring() {
    this.checkHealth(); // Initial check
    this.interval = setInterval(() => this.checkHealth(), this.checkInterval);
  }

  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}
```

## Testing Error Scenarios

### Error Simulation for Testing

```javascript
class MockContribuxClient {
  constructor(scenarioConfig = {}) {
    this.scenarios = scenarioConfig;
    this.callCount = 0;
  }

  async request(endpoint, options = {}) {
    this.callCount++;

    // Check for configured scenarios
    const scenario = this.scenarios[endpoint];
    if (scenario) {
      if (
        typeof scenario.failAfter === "number" &&
        this.callCount >= scenario.failAfter
      ) {
        throw new ContribuxError(
          { status: scenario.status || 500 },
          {
            error: {
              code: scenario.code || "TEST_ERROR",
              message: scenario.message || "Test error",
            },
          }
        );
      }

      if (scenario.alwaysFail) {
        throw new ContribuxError(
          { status: scenario.status || 500 },
          {
            error: {
              code: scenario.code || "TEST_ERROR",
              message: scenario.message || "Test error",
            },
          }
        );
      }

      if (scenario.delay) {
        await new Promise((resolve) => setTimeout(resolve, scenario.delay));
      }
    }

    // Return mock response
    return { success: true, endpoint, callCount: this.callCount };
  }
}

// Test scenarios
describe("Error Handling", () => {
  test("handles rate limiting with retry", async () => {
    const mockClient = new MockContribuxClient({
      "/repositories": {
        failAfter: 1,
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Rate limit exceeded",
      },
    });

    const result = await retryWithBackoff(
      () => mockClient.request("/repositories"),
      3,
      100
    );

    expect(result.callCount).toBeGreaterThan(1);
  });

  test("handles token expiration", async () => {
    const mockClient = new MockContribuxClient({
      "/user/profile": {
        alwaysFail: true,
        status: 401,
        code: "TOKEN_EXPIRED",
        message: "Token has expired",
      },
    });

    let refreshCalled = false;
    const mockRefreshToken = () => {
      refreshCalled = true;
    };

    try {
      await handleApiCall(() => mockClient.request("/user/profile"));
    } catch (error) {
      // Should attempt refresh and retry
    }

    expect(refreshCalled).toBe(true);
  });
});
```

### Integration Test Helpers

```javascript
class ErrorTestHelper {
  static createNetworkError() {
    const error = new TypeError("Failed to fetch");
    error.name = "TypeError";
    return error;
  }

  static createTimeoutError() {
    const error = new Error("Request timeout");
    error.name = "AbortError";
    return error;
  }

  static createValidationError(fieldErrors) {
    return new ContribuxError(
      { status: 422 },
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Validation failed",
          details: { field_errors: fieldErrors },
        },
      }
    );
  }

  static createRateLimitError(retryAfter = 60) {
    return new ContribuxError(
      { status: 429 },
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Rate limit exceeded",
          details: { retry_after: retryAfter },
        },
      }
    );
  }
}

// Usage in tests
test("error boundary catches API errors", () => {
  const ThrowError = () => {
    throw ErrorTestHelper.createValidationError({ email: "Invalid format" });
  };

  render(
    <ApiErrorBoundary>
      <ThrowError />
    </ApiErrorBoundary>
  );

  expect(screen.getByText(/check your input/i)).toBeInTheDocument();
});
```

## Error Recovery Strategies

### Offline Mode Support

```javascript
class OfflineAwareClient extends ContribuxClient {
  constructor(token, options = {}) {
    super(token, options);
    this.cache = new Map();
    this.pendingRequests = [];
    this.isOnline = navigator.onLine;

    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());
  }

  async request(endpoint, options = {}) {
    if (!this.isOnline && options.method === "GET") {
      // Return cached data when offline
      const cacheKey = `${endpoint}:${JSON.stringify(options)}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      throw new Error("No cached data available while offline");
    }

    if (!this.isOnline && options.method !== "GET") {
      // Queue non-GET requests for when back online
      return new Promise((resolve, reject) => {
        this.pendingRequests.push({ endpoint, options, resolve, reject });
      });
    }

    try {
      const result = await super.request(endpoint, options);

      // Cache GET responses
      if (options.method === "GET" || !options.method) {
        const cacheKey = `${endpoint}:${JSON.stringify(options)}`;
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        // Network error - might be offline
        this.handleOffline();
      }
      throw error;
    }
  }

  handleOnline() {
    this.isOnline = true;
    console.log("Back online, processing pending requests...");

    // Process pending requests
    const pending = [...this.pendingRequests];
    this.pendingRequests = [];

    pending.forEach(async ({ endpoint, options, resolve, reject }) => {
      try {
        const result = await super.request(endpoint, options);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  handleOffline() {
    this.isOnline = false;
    console.log("Gone offline, switching to cached mode...");
  }
}
```

### Progressive Error Recovery

```javascript
class ProgressiveRecoveryClient extends ContribuxClient {
  constructor(token, options = {}) {
    super(token, options);
    this.degradationLevel = 0; // 0 = full features, 3 = minimal features
  }

  async request(endpoint, options = {}) {
    try {
      const result = await super.request(endpoint, options);
      this.improveService();
      return result;
    } catch (error) {
      if (this.shouldDegrade(error)) {
        this.degradeService();
        return this.getAlternativeResponse(endpoint, options, error);
      }
      throw error;
    }
  }

  shouldDegrade(error) {
    return (
      error.status >= 500 ||
      error.code === "SERVICE_UNAVAILABLE" ||
      error.code === "EXTERNAL_SERVICE_ERROR"
    );
  }

  degradeService() {
    if (this.degradationLevel < 3) {
      this.degradationLevel++;
      console.warn(`Service degraded to level ${this.degradationLevel}`);
    }
  }

  improveService() {
    if (this.degradationLevel > 0) {
      this.degradationLevel--;
      console.info(`Service improved to level ${this.degradationLevel}`);
    }
  }

  getAlternativeResponse(endpoint, options, error) {
    switch (this.degradationLevel) {
      case 1:
        // Reduce data complexity
        if (endpoint.includes("/recommendations")) {
          return this.getBasicRecommendations(options);
        }
        break;

      case 2:
        // Use cached or simplified data
        if (endpoint.includes("/search")) {
          return this.getCachedSearchResults(options);
        }
        break;

      case 3:
        // Minimal functionality only
        return {
          error: "Service temporarily degraded",
          message: "Please try again later",
          degradation_level: this.degradationLevel,
        };
    }

    throw error;
  }
}
```

Following these comprehensive error handling patterns will help you build highly resilient applications that gracefully handle various failure scenarios while providing excellent user experiences even when things go wrong.
