/**
 * TypeScript 5.8+ Advanced Features Validation
 *
 * This file demonstrates and validates all the advanced TypeScript features
 * implemented in the project, ensuring they work correctly with the enhanced
 * compiler configuration.
 */

import type {
  AppError,
  DeepPropertyAccess,
  Email,
  MetricKey,
  PerformanceMetrics,
  Result,
  TypedEventEmitter,
  UserId,
} from '@/types/advanced'

// =============================================================================
// Branded Types Validation
// =============================================================================

function validateBrandedTypes(): void {
  // Create branded types
  const userId = 'user-123' as UserId
  const _email = 'test@example.com' as Email

  // This should work - same branded type
  const _anotherUserId: UserId = userId
}

// =============================================================================
// Deep Property Access Validation
// =============================================================================

interface TestObject {
  user: {
    profile: {
      settings: {
        theme: 'light' | 'dark'
        notifications: boolean
      }
    }
  }
  config: {
    api: {
      version: string
      timeout: number
    }
  }
}

function validateDeepPropertyAccess(): void {
  const testObj: TestObject = {
    user: {
      profile: {
        settings: {
          theme: 'dark',
          notifications: true,
        },
      },
    },
    config: {
      api: {
        version: 'v1',
        timeout: 5000,
      },
    },
  }

  // These types should be inferred correctly
  type ThemeType = DeepPropertyAccess<TestObject, 'user.profile.settings.theme'> // 'light' | 'dark'
  type VersionType = DeepPropertyAccess<TestObject, 'config.api.version'> // string

  const _theme: ThemeType = testObj.user.profile.settings.theme
  const _version: VersionType = testObj.config.api.version
}

// =============================================================================
// Result Type Validation
// =============================================================================

function validateResultTypes(): void {
  // Success case
  const successResult: Result<string> = {
    success: true,
    data: 'Operation completed successfully',
  }

  // Error case
  const errorResult: Result<string, AppError> = {
    success: false,
    error: {
      type: 'ValidationError',
      field: 'email',
      message: 'Invalid email format',
    },
  }

  // Handle results with proper type narrowing
  if (successResult.success) {
    // Type narrowed: successResult.data is available
    void successResult.data
  }

  if (!errorResult.success) {
    // Type narrowed: errorResult.error is available
    void errorResult.error
  }
}

// =============================================================================
// Advanced Error Handling Validation
// =============================================================================

function validateAdvancedErrorHandling(): Result<number, AppError> {
  try {
    const value = Math.random()

    if (value < 0.5) {
      throw new Error('Random failure')
    }

    return {
      success: true,
      data: Math.floor(value * 100),
    }
  } catch (_error) {
    return {
      success: false,
      error: {
        type: 'NetworkError',
        url: '/api/random',
        status: 500,
      },
    }
  }
}

// =============================================================================
// Event System Validation
// =============================================================================

class TestEventEmitter implements TypedEventEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  on<K extends keyof import('@/types/advanced').EventMap>(
    event: K,
    listener: import('@/types/advanced').EventListener<K>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)?.add(listener as (...args: unknown[]) => void)
  }

  emit<K extends keyof import('@/types/advanced').EventMap>(
    event: K,
    payload: import('@/types/advanced').EventMap[K]
  ): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      for (const listener of eventListeners) {
        listener(payload)
      }
    }
  }

  off<K extends keyof import('@/types/advanced').EventMap>(
    event: K,
    listener: import('@/types/advanced').EventListener<K>
  ): void {
    const eventListeners = this.listeners.get(event)
    eventListeners?.delete(listener as (...args: unknown[]) => void)
  }
}

function validateEventSystem(): void {
  const emitter = new TestEventEmitter()

  // Type-safe event listening
  emitter.on('user:created', _payload => void 0)

  emitter.on('auth:login', _payload => void 0)

  // Type-safe event emission
  emitter.emit('user:created', {
    userId: 'user-123' as UserId,
    email: 'test@example.com' as Email,
  })

  emitter.emit('auth:login', {
    userId: 'user-123' as UserId,
    sessionToken: 'session-token-456' as import('@/types/advanced').SessionToken,
  })
}

// =============================================================================
// Performance Metrics Validation
// =============================================================================

function validatePerformanceMetrics(): void {
  const metrics: PerformanceMetrics = {
    'api.response.time': {
      value: 150,
      timestamp: new Date(),
      unit: 'ms',
    },
    'database.query.duration': {
      value: 25,
      timestamp: new Date(),
      unit: 'ms',
    },
    'memory.heap.used': {
      value: 1024 * 1024 * 50, // 50MB
      timestamp: new Date(),
      unit: 'bytes',
    },
  }

  // Type-safe metric key usage
  const _metricKeys: MetricKey[] = Object.keys(metrics) as MetricKey[]
}

// =============================================================================
// Template Literal Types Validation
// =============================================================================

type HttpEndpoint = import('@/types/advanced').ApiEndpoint<'GET', 'v1', 'users'>
type PostEndpoint = import('@/types/advanced').ApiEndpoint<'POST', 'v2', 'repositories'>

function validateTemplateLiteralTypes(): void {
  const _getEndpoint: HttpEndpoint = 'GET /api/v1/users'
  const _postEndpoint: PostEndpoint = 'POST /api/v2/repositories'
}

// =============================================================================
// Conditional Types Validation
// =============================================================================

type TestUnion = 'admin' | 'user' | 'guest'
type AdminOnly = import('@/types/advanced').StrictExtract<TestUnion, 'admin'>

function validateConditionalTypes(): void {
  const _adminRole: AdminOnly = 'admin'
}

// =============================================================================
// Mapped Types Validation
// =============================================================================

interface UserSettings {
  theme: 'light' | 'dark'
  notifications: boolean
  autoSave: boolean
}

type PartialUserSettings = import('@/types/advanced').PartialBy<UserSettings, 'autoSave'>

function validateMappedTypes(): void {
  const _settings: PartialUserSettings = {
    theme: 'dark',
    notifications: true,
    // autoSave is optional due to PartialBy
  }
}

// =============================================================================
// Main Validation Function
// =============================================================================

/**
 * Execute all TypeScript feature validations
 * This function demonstrates that all advanced TypeScript features
 * are working correctly with our enhanced configuration
 */
export function validateAllTypeScriptFeatures(): void {
  validateBrandedTypes()
  validateDeepPropertyAccess()
  validateResultTypes()

  const _result = validateAdvancedErrorHandling()

  validateEventSystem()
  validatePerformanceMetrics()
  validateTemplateLiteralTypes()
  validateConditionalTypes()
  validateMappedTypes()
}

// =============================================================================
// Export Type Utilities for Testing
// =============================================================================

export type {
  TestObject,
  HttpEndpoint,
  PostEndpoint,
  TestUnion,
  AdminOnly,
  UserSettings,
  PartialUserSettings,
}

export { TestEventEmitter }
