/**
 * Enhanced Error Boundary Component
 * Integrates with error classification, recovery workflows, and monitoring
 */

'use client'

import React, { Component, type PropsWithChildren, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ErrorClassifier, ErrorSeverity, type ErrorClassification } from '@/lib/errors/error-classification'
import { ErrorRecoveryManager, type RecoveryAction, type RecoveryWorkflow } from '@/lib/errors/error-recovery'
import { errorMonitor } from '@/lib/errors/error-monitoring'
import { AlertCircle, RefreshCw, Home, HelpCircle, WifiOff, ShieldOff, Clock } from 'lucide-react'

// Enhanced error boundary props
interface EnhancedErrorBoundaryProps extends PropsWithChildren {
  fallback?: React.ComponentType<EnhancedErrorFallbackProps>
  onError?: (error: Error, classification: ErrorClassification) => void
  resetOnPropsChange?: boolean
  resetKeys?: Array<string | number>
  isolate?: boolean
  context?: {
    userId?: string
    sessionId?: string
    feature?: string
    retryAction?: () => Promise<void>
    fallbackAction?: () => void
    customActions?: RecoveryAction[]
  }
}

// Enhanced error fallback props
interface EnhancedErrorFallbackProps {
  error: Error
  classification: ErrorClassification
  workflow: RecoveryWorkflow
  retry: () => void
  reset: () => void
  canRetry: boolean
  retryCount: number
}

// Enhanced error boundary state
interface EnhancedErrorBoundaryState {
  hasError: boolean
  error?: Error
  classification?: ErrorClassification
  workflow?: RecoveryWorkflow
  autoRetryScheduled?: boolean
}

export class EnhancedErrorBoundary extends Component<EnhancedErrorBoundaryProps, EnhancedErrorBoundaryState> {
  private retryCount = 0
  private readonly maxRetries = 3
  private prevResetKeys: Array<string | number> = []
  private autoRetryTimer?: NodeJS.Timeout

  constructor(props: EnhancedErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
    this.prevResetKeys = props.resetKeys || []
  }

  static getDerivedStateFromError(error: Error): Partial<EnhancedErrorBoundaryState> {
    // Classify the error
    const classification = ErrorClassifier.classify(error)
    
    return {
      hasError: true,
      error,
      classification,
    }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Classify error
    const classification = ErrorClassifier.classify(error)
    
    // Generate recovery workflow
    const workflow = ErrorRecoveryManager.getRecoveryWorkflow(error, {
      retryAction: this.props.context?.retryAction || (() => this.retry()),
      fallbackAction: this.props.context?.fallbackAction,
      customActions: this.props.context?.customActions,
    })
    
    // Track error
    errorMonitor.track(error, classification, {
      userId: this.props.context?.userId,
      sessionId: this.props.context?.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      metadata: {
        feature: this.props.context?.feature,
        componentStack: errorInfo.componentStack,
        retryCount: this.retryCount,
      },
    })
    
    this.setState({
      error,
      classification,
      workflow,
    })
    
    // Call onError prop
    this.props.onError?.(error, classification)
    
    // Schedule automatic retry if applicable
    this.scheduleAutoRetry(classification, workflow)
  }

  override componentDidUpdate(prevProps: EnhancedErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props
    const { hasError } = this.state

    // Reset on prop changes if enabled
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetBoundary()
    }

    // Reset on resetKeys change
    if (hasError && resetKeys) {
      const hasResetKeyChanged = resetKeys.some((key, idx) => this.prevResetKeys[idx] !== key)

      if (hasResetKeyChanged) {
        this.prevResetKeys = resetKeys
        this.resetBoundary()
      }
    }
  }

  override componentWillUnmount() {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer)
    }
  }

  private scheduleAutoRetry(classification: ErrorClassification, workflow: RecoveryWorkflow) {
    // Find automatic retry action
    const autoRetryAction = workflow.actions.find(action => action.automatic && action.delay)
    
    if (autoRetryAction && ErrorClassifier.shouldRetry(classification) && this.retryCount < this.maxRetries) {
      this.setState({ autoRetryScheduled: true })
      
      this.autoRetryTimer = setTimeout(() => {
        if (autoRetryAction.action) {
          autoRetryAction.action()
        } else {
          this.retry()
        }
      }, autoRetryAction.delay)
    }
  }

  private resetBoundary = () => {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer)
    }
    
    this.setState({ 
      hasError: false,
      error: undefined,
      classification: undefined,
      workflow: undefined,
      autoRetryScheduled: false,
    })
    this.retryCount = 0
  }

  private retry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++
      this.resetBoundary()
    }
  }

  override render() {
    if (this.state.hasError && this.state.error && this.state.classification && this.state.workflow) {
      const FallbackComponent = this.props.fallback || EnhancedErrorFallback

      return (
        <FallbackComponent
          error={this.state.error}
          classification={this.state.classification}
          workflow={this.state.workflow}
          retry={this.retry}
          reset={this.resetBoundary}
          canRetry={this.retryCount < this.maxRetries && ErrorClassifier.shouldRetry(this.state.classification)}
          retryCount={this.retryCount}
        />
      )
    }

    return this.props.children
  }
}

// Enhanced error fallback component
function EnhancedErrorFallback({ 
  error, 
  classification, 
  workflow, 
  retry, 
  reset, 
  canRetry,
  retryCount 
}: EnhancedErrorFallbackProps) {
  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'text-red-600 border-red-200 bg-red-50'
      case ErrorSeverity.HIGH:
        return 'text-orange-600 border-orange-200 bg-orange-50'
      case ErrorSeverity.MEDIUM:
        return 'text-yellow-600 border-yellow-200 bg-yellow-50'
      case ErrorSeverity.LOW:
        return 'text-blue-600 border-blue-200 bg-blue-50'
    }
  }

  const getIcon = () => {
    if (workflow.title.includes('Connection') || workflow.title.includes('Network')) {
      return <WifiOff className="h-8 w-8" />
    }
    if (workflow.title.includes('Authentication') || workflow.title.includes('Access')) {
      return <ShieldOff className="h-8 w-8" />
    }
    if (workflow.title.includes('Timeout') || workflow.title.includes('Rate')) {
      return <Clock className="h-8 w-8" />
    }
    return <AlertCircle className="h-8 w-8" />
  }

  return (
    <Card className={`m-4 p-6 ${getSeverityColor(classification.severity)}`}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">{getIcon()}</div>
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">{workflow.title}</h2>
              <Badge variant="outline" className="text-xs">
                {classification.severity}
              </Badge>
            </div>
            <p className="text-sm opacity-90">{workflow.description}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {workflow.actions.map((action, index) => {
            switch (action.type) {
              case 'button':
                return (
                  <Button
                    key={index}
                    onClick={action.action}
                    variant={index === 0 ? 'default' : 'outline'}
                    size="sm"
                    disabled={action.label === 'Retry' && !canRetry}
                  >
                    {action.label === 'Retry' && <RefreshCw className="mr-2 h-4 w-4" />}
                    {action.label}
                    {action.label === 'Retry' && retryCount > 0 && ` (${retryCount}/${3})`}
                  </Button>
                )
              
              case 'link':
                return (
                  <Button
                    key={index}
                    onClick={() => action.href && (window.location.href = action.href)}
                    variant="outline"
                    size="sm"
                  >
                    {action.label === 'Get Help' && <HelpCircle className="mr-2 h-4 w-4" />}
                    {action.label === 'Go to Home' && <Home className="mr-2 h-4 w-4" />}
                    {action.label}
                  </Button>
                )
              
              case 'info':
                return action.description ? (
                  <Alert key={index} className="mt-2">
                    <AlertTitle className="text-sm">{action.label}</AlertTitle>
                    <AlertDescription className="text-xs">{action.description}</AlertDescription>
                  </Alert>
                ) : null
              
              case 'automatic':
                return action.automatic && action.delay ? (
                  <Alert key={index} className="mt-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <AlertDescription className="text-xs">
                      {action.description}
                    </AlertDescription>
                  </Alert>
                ) : null
              
              default:
                return null
            }
          })}
        </div>

        {/* Technical details in development */}
        {process.env.NODE_ENV === 'development' && workflow.showTechnicalDetails && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm opacity-70">
              Technical Details (Development)
            </summary>
            <div className="mt-2 space-y-2 text-xs">
              <div className="rounded bg-black/5 p-2">
                <strong>Category:</strong> {classification.category}
              </div>
              <div className="rounded bg-black/5 p-2">
                <strong>Transient:</strong> {classification.isTransient ? 'Yes' : 'No'}
              </div>
              <div className="rounded bg-black/5 p-2">
                <strong>Recovery Strategies:</strong> {classification.recoveryStrategies.join(', ')}
              </div>
              <pre className="overflow-auto rounded bg-black/5 p-2">
                {error.stack}
              </pre>
            </div>
          </details>
        )}
      </div>
    </Card>
  )
}

// Specialized error boundaries for different contexts

export function PageErrorBoundary({ children, ...props }: EnhancedErrorBoundaryProps) {
  return (
    <EnhancedErrorBoundary
      context={{
        feature: 'page',
        fallbackAction: () => window.location.href = '/',
        ...props.context,
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

export function FeatureErrorBoundary({ 
  feature, 
  children, 
  ...props 
}: EnhancedErrorBoundaryProps & { feature: string }) {
  return (
    <EnhancedErrorBoundary
      context={{
        feature,
        ...props.context,
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

export function DataFetchErrorBoundary({ 
  children, 
  onRefetch,
  ...props 
}: EnhancedErrorBoundaryProps & { onRefetch?: () => Promise<void> }) {
  return (
    <EnhancedErrorBoundary
      context={{
        feature: 'data-fetch',
        retryAction: onRefetch,
        ...props.context,
      }}
      {...props}
    >
      {children}
    </EnhancedErrorBoundary>
  )
}

// Error boundary HOC with enhanced features
export function withEnhancedErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    feature?: string
    fallback?: React.ComponentType<EnhancedErrorFallbackProps>
    onError?: (error: Error, classification: ErrorClassification) => void
  }
) {
  const WrappedComponent = (props: P) => (
    <EnhancedErrorBoundary
      fallback={options?.fallback}
      onError={options?.onError}
      context={{ feature: options?.feature }}
    >
      <Component {...props} />
    </EnhancedErrorBoundary>
  )

  WrappedComponent.displayName = `withEnhancedErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}

// Hook for triggering error boundaries programmatically
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null)

  const resetError = React.useCallback(() => {
    setError(null)
  }, [])

  const captureError = React.useCallback((error: Error | string) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error
    setError(errorObj)
  }, [])

  // Re-throw error to trigger error boundary
  React.useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return { captureError, resetError }
}