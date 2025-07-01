/**
 * API Hooks Index
 * Centralized exports for all optimized API hooks
 *
 * Features:
 * - Clean import paths for components
 * - Type safety with TypeScript exports
 * - Organized by domain (repositories, opportunities, auth, etc.)
 * - Re-exports for backward compatibility
 */

// Cache layer
export {
  cached,
  cacheKeys,
  cacheLayer,
} from '../cache-layer'
// Monitoring
export {
  apiMonitoring,
  createMonitoringMiddleware,
  getAPIMonitoringSnapshot,
} from '../monitoring'
// Query client utilities
export {
  cacheUtils,
  createQueryFunction,
  deduplicatedFetch,
  enhancedFetch,
  getQueryMetrics,
  queryClient,
  queryKeys,
  setupBackgroundSync,
} from '../query-client'
// Opportunity hooks
export {
  opportunityCacheUtils,
  useApplyToOpportunity,
  useBeginnerOpportunities,
  useOpportunitiesInfinite,
  useOpportunitiesSearch,
  useOpportunityDetail,
  usePrefetchOpportunities,
  useSaveOpportunity,
  useUserOpportunities,
} from './use-opportunities'
// Repository hooks
export {
  repositoryCacheUtils,
  usePrefetchRepositories,
  useRepositoriesInfinite,
  useRepositoriesSearch,
  useRepositoryBookmark,
  useRepositoryDetail,
} from './use-repositories'
// WebSocket hooks for real-time features
export {
  useOpportunityUpdates,
  useRepositoryUpdates,
  useUserNotifications,
  useWebSocket,
} from './use-websocket'

// All hooks are exported individually above for direct import
// Example usage:
// import { useRepositoriesSearch, useOpportunitiesSearch } from '@/lib/api/hooks'
