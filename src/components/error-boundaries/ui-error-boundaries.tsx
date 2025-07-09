/**
 * UI-Specific Error Boundaries
 * Specialized error handling for critical UI components
 */

'use client'

import {
  AlertTriangle,
  Archive,
  BarChart3,
  Bookmark,
  GitPullRequest,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import type React from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorCategory, type ErrorClassification } from '@/lib/errors/error-classification'
import type { RecoveryWorkflow } from '@/lib/errors/error-recovery'
import { EnhancedErrorBoundary } from './enhanced-error-boundary'

// Repository Card Error Boundary
interface RepositoryCardErrorFallbackProps {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
  repositoryName?: string
}

function RepositoryCardErrorFallback({
  error: _error,
  classification,
  retry,
  canRetry,
  repositoryName,
}: RepositoryCardErrorFallbackProps) {
  const isGitHubError = classification.category === ErrorCategory.GITHUB_API_ERROR

  return (
    <Card className="h-full border-2 border-muted-foreground/20 border-dashed bg-muted/20 p-6">
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center space-y-4 text-center">
        <Archive className="h-8 w-8 text-muted-foreground/50" />
        <div className="space-y-2">
          <h3 className="font-medium text-sm">
            {isGitHubError ? 'GitHub Unavailable' : 'Failed to Load Repository'}
          </h3>
          {repositoryName && <p className="text-muted-foreground text-xs">{repositoryName}</p>}
          <p className="max-w-[200px] text-muted-foreground text-xs">
            {isGitHubError
              ? 'GitHub is temporarily unavailable. Data may be cached.'
              : 'Unable to load repository information.'}
          </p>
        </div>
        {canRetry && (
          <Button onClick={retry} variant="outline" size="sm" className="h-8">
            <RefreshCw className="mr-2 h-3 w-3" />
            Retry
          </Button>
        )}
      </div>
    </Card>
  )
}

export function RepositoryCardErrorBoundary({
  children,
  repositoryName,
  ...props
}: React.PropsWithChildren<{ repositoryName?: string }>) {
  return (
    <EnhancedErrorBoundary
      fallback={fallbackProps => (
        <RepositoryCardErrorFallback {...fallbackProps} repositoryName={repositoryName} />
      )}
      context={{
        feature: 'repository-card',
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// Search Results Error Boundary
function SearchResultsErrorFallback({
  error: _error,
  classification,
  retry,
  reset,
  canRetry,
}: {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
}) {
  const isRateLimit = classification.category === ErrorCategory.RATE_LIMIT_EXCEEDED
  const isNetwork = classification.category === ErrorCategory.NETWORK_UNAVAILABLE

  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-8">
      <div className="rounded-full bg-muted p-4">
        <Search className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="max-w-md space-y-2 text-center">
        <h3 className="font-semibold text-lg">
          {isRateLimit
            ? 'Search Limit Reached'
            : isNetwork
              ? 'Connection Issue'
              : 'Search Unavailable'}
        </h3>
        <p className="text-muted-foreground text-sm">
          {isRateLimit
            ? "You've reached the search limit. Please wait a moment before searching again."
            : isNetwork
              ? 'Unable to connect to search service. Please check your connection.'
              : 'Search is temporarily unavailable. Please try again.'}
        </p>
      </div>
      <div className="flex gap-2">
        {canRetry && (
          <Button onClick={retry} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        )}
        <Button onClick={reset} variant="ghost" size="sm">
          Clear Search
        </Button>
      </div>
    </div>
  )
}

export function SearchResultsErrorBoundary({
  children,
  onClearSearch,
  ...props
}: React.PropsWithChildren<{ onClearSearch?: () => void }>) {
  return (
    <EnhancedErrorBoundary
      fallback={SearchResultsErrorFallback}
      context={{
        feature: 'search-results',
        fallbackAction: onClearSearch,
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// Contribution Opportunities Error Boundary
function ContributionOpportunitiesErrorFallback({
  workflow,
  retry,
  canRetry,
}: {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <GitPullRequest className="h-8 w-8 text-muted-foreground/50" />
        <div className="space-y-2">
          <h3 className="font-medium">Unable to Load Opportunities</h3>
          <p className="max-w-sm text-muted-foreground text-sm">{workflow.description}</p>
        </div>
        {canRetry && (
          <Button onClick={retry} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </div>
    </Card>
  )
}

export function ContributionOpportunitiesErrorBoundary({
  children,
  ...props
}: React.PropsWithChildren) {
  return (
    <EnhancedErrorBoundary
      fallback={ContributionOpportunitiesErrorFallback}
      context={{
        feature: 'contribution-opportunities',
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// Dashboard Stats Error Boundary
function DashboardStatsErrorFallback({
  retry,
  canRetry,
}: {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
}) {
  return (
    <Card className="bg-muted/50 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium text-sm">Statistics Unavailable</h3>
            <p className="text-muted-foreground text-xs">Unable to load dashboard data</p>
          </div>
        </div>
        {canRetry && (
          <Button onClick={retry} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  )
}

export function DashboardStatsErrorBoundary({ children, ...props }: React.PropsWithChildren) {
  return (
    <EnhancedErrorBoundary
      fallback={DashboardStatsErrorFallback}
      context={{
        feature: 'dashboard-stats',
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// Bookmarks Error Boundary
function BookmarksErrorFallback({
  classification,
  retry,
  canRetry,
}: {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
}) {
  const isAuthError =
    classification.category === ErrorCategory.AUTH_EXPIRED ||
    classification.category === ErrorCategory.AUTH_INVALID

  return (
    <Alert className="border-dashed">
      <Bookmark className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm">
          {isAuthError ? 'Sign in to view your bookmarks' : 'Unable to load bookmarks'}
        </span>
        {canRetry && !isAuthError && (
          <Button onClick={retry} variant="ghost" size="sm" className="h-7">
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function BookmarksErrorBoundary({ children, ...props }: React.PropsWithChildren) {
  return (
    <EnhancedErrorBoundary
      fallback={BookmarksErrorFallback}
      context={{
        feature: 'bookmarks',
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// AI Suggestions Error Boundary
function AISuggestionsErrorFallback({
  workflow,
  retry,
  reset,
  canRetry,
}: {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
}) {
  return (
    <Card className="border-dashed p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div className="flex-1 space-y-2">
          <h4 className="font-medium text-sm">AI Suggestions Unavailable</h4>
          <p className="text-muted-foreground text-xs">{workflow.description}</p>
          <div className="flex gap-2">
            {canRetry && (
              <Button onClick={retry} variant="outline" size="sm" className="h-7 text-xs">
                Try Again
              </Button>
            )}
            <Button onClick={reset} variant="ghost" size="sm" className="h-7 text-xs">
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function AISuggestionsErrorBoundary({ children, ...props }: React.PropsWithChildren) {
  return (
    <EnhancedErrorBoundary
      fallback={AISuggestionsErrorFallback}
      context={{
        feature: 'ai-suggestions',
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// Generic Feature Error Boundary with minimal UI
function MinimalErrorFallback({
  workflow,
  retry,
  canRetry,
}: {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
}) {
  return (
    <div className="flex items-center gap-2 p-2 text-muted-foreground text-sm">
      <AlertTriangle className="h-4 w-4" />
      <span>{workflow.description}</span>
      {canRetry && (
        <Button onClick={retry} variant="ghost" size="sm" className="h-6 px-2 text-xs">
          Retry
        </Button>
      )}
    </div>
  )
}

export function MinimalErrorBoundary({
  children,
  feature,
  ...props
}: React.PropsWithChildren<{ feature: string }>) {
  return (
    <EnhancedErrorBoundary
      fallback={MinimalErrorFallback}
      context={{
        feature,
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// Helper function to handle fallback navigation
function handleRootLayoutFallback() {
  window.location.href = '/'
}

// Layout wrapper with nested error boundaries
export function LayoutWithErrorBoundaries({ children }: { children: React.ReactNode }) {
  return (
    <EnhancedErrorBoundary
      context={{
        feature: 'root-layout',
        fallbackAction: handleRootLayoutFallback,
      }}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}
