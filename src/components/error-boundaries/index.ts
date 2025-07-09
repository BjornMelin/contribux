/**
 * Error Boundaries Export
 * Central export point for all error boundary components and utilities
 */

// Enhanced error boundaries
export {
  DataFetchErrorBoundary,
  EnhancedErrorBoundary,
  FeatureErrorBoundary,
  PageErrorBoundary,
  useErrorBoundary,
  withEnhancedErrorBoundary,
} from './enhanced-error-boundary'
// Legacy error boundaries (for backward compatibility)
export {
  ApiErrorBoundary,
  AppErrorBoundaries,
  AsyncErrorBoundary,
  AuthErrorBoundary,
  ErrorBoundary,
  ErrorReporter,
  errorBoundaryUtils,
  SearchErrorBoundary,
  setupGlobalErrorHandling,
  useErrorHandler,
  withErrorBoundary,
} from './error-boundary-system'
// UI-specific error boundaries
export {
  AISuggestionsErrorBoundary,
  BookmarksErrorBoundary,
  ContributionOpportunitiesErrorBoundary,
  DashboardStatsErrorBoundary,
  LayoutWithErrorBoundaries,
  MinimalErrorBoundary,
  RepositoryCardErrorBoundary,
  SearchResultsErrorBoundary,
} from './ui-error-boundaries'
