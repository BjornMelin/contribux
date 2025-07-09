/**
 * Error Boundaries Export
 * Central export point for all error boundary components and utilities
 */

// Enhanced error boundaries
export {
  EnhancedErrorBoundary,
  PageErrorBoundary,
  FeatureErrorBoundary,
  DataFetchErrorBoundary,
  withEnhancedErrorBoundary,
  useErrorBoundary,
} from './enhanced-error-boundary'

// UI-specific error boundaries
export {
  RepositoryCardErrorBoundary,
  SearchResultsErrorBoundary,
  ContributionOpportunitiesErrorBoundary,
  DashboardStatsErrorBoundary,
  BookmarksErrorBoundary,
  AISuggestionsErrorBoundary,
  MinimalErrorBoundary,
  LayoutWithErrorBoundaries,
} from './ui-error-boundaries'

// Legacy error boundaries (for backward compatibility)
export {
  ErrorBoundary,
  AuthErrorBoundary,
  ApiErrorBoundary,
  SearchErrorBoundary,
  AsyncErrorBoundary,
  AppErrorBoundaries,
  withErrorBoundary,
  useErrorHandler,
  setupGlobalErrorHandling,
  ErrorReporter,
  errorBoundaryUtils,
} from './error-boundary-system'
