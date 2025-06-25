/**
 * Test environment global types
 */

declare global {
  var __enableMSW: (() => void) | undefined
  var __disableMSW: (() => void) | undefined
  var __originalFetch: typeof fetch | undefined
  var __mockFetch: typeof fetch | undefined
  var __testCleanupRegistry: Set<() => Promise<void> | void> | undefined
  var __githubClientCache: unknown
  var __githubRateLimitState: unknown
  var __activeTimers: Set<NodeJS.Timeout> | undefined
  var __activeIntervals: Set<NodeJS.Timeout> | undefined
  var gc: (() => void) | undefined

  // Extend NodeJS global to include additional test properties
  namespace NodeJS {
    interface Global {
      __enableMSW?: () => void
      __disableMSW?: () => void
      __originalFetch?: typeof fetch
      __mockFetch?: typeof fetch
      __testCleanupRegistry?: Set<() => Promise<void> | void>
      __githubClientCache?: unknown
      __githubRateLimitState?: unknown
      __activeTimers?: Set<NodeJS.Timeout>
      __activeIntervals?: Set<NodeJS.Timeout>
      gc?: () => void
    }
  }
}

export {}
