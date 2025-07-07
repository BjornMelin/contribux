/**
 * Real-time Updates Hook
 * Handles WebSocket updates for repositories and opportunities
 * Optimized with proper cleanup and memoization
 */

import { useOpportunityUpdates, useRepositoryUpdates } from '@/lib/api/hooks/use-websocket'
import { useCallback, useEffect, useRef } from 'react'

export function useRealtimeUpdates() {
  const { repositoryUpdate } = useRepositoryUpdates()
  const { opportunityUpdate } = useOpportunityUpdates()
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController()

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Memoized notification handlers
  const handleRepositoryUpdate = useCallback(() => {
    if (repositoryUpdate && !abortControllerRef.current?.signal.aborted) {
      // Could show toast notification
    }
  }, [repositoryUpdate])

  const handleOpportunityUpdate = useCallback(() => {
    if (opportunityUpdate && !abortControllerRef.current?.signal.aborted) {
      // Could show toast notification
    }
  }, [opportunityUpdate])

  // Real-time update notifications with cleanup check
  useEffect(() => {
    handleRepositoryUpdate()
  }, [handleRepositoryUpdate])

  useEffect(() => {
    handleOpportunityUpdate()
  }, [handleOpportunityUpdate])

  return {
    repositoryUpdate,
    opportunityUpdate,
  }
}
