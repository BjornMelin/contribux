/**
 * Repository Pattern Interfaces
 * Provides abstractions for data access layer following Clean Architecture
 */

import type {
  Optional,
  Repository,
  RepositoryId,
  Result,
  SearchQuery,
  UserId,
} from '@/lib/types/advanced'

// Domain entities
export interface User {
  id: UserId
  email: string
  name?: string
  avatarUrl?: string
  githubId?: number
  githubLogin?: string
  createdAt: Date
  updatedAt: Date
}

export interface GitHubRepository {
  id: RepositoryId
  name: string
  fullName: string
  description?: string
  url: string
  language?: string
  stars: number
  forks: number
  issues: number
  topics: string[]
  createdAt: Date
  updatedAt: Date
  lastActivityAt: Date
  isArchived: boolean
  visibility: 'public' | 'private'
}

export interface Opportunity {
  id: string
  repositoryId: RepositoryId
  title: string
  description: string
  type: 'good-first-issue' | 'help-wanted' | 'feature-request' | 'bug' | 'enhancement'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  labels: string[]
  url: string
  estimatedHours?: number
  skills: string[]
  mentorshipAvailable: boolean
  createdAt: Date
  updatedAt: Date
}

export interface SearchCriteria {
  query?: string
  languages?: string[]
  topics?: string[]
  minStars?: number
  maxStars?: number
  hasGoodFirstIssues?: boolean
  isActivelyMaintained?: boolean
  difficulty?: Opportunity['difficulty'][]
  skills?: string[]
  limit?: number
  offset?: number
}

export interface SearchResult<T> {
  items: T[]
  total: number
  hasMore: boolean
  page: number
  pageSize: number
}

// Repository interfaces
export interface IUserRepository extends Repository<User, UserId> {
  findByEmail(email: string): Promise<Optional<User>>
  findByGitHubId(githubId: number): Promise<Optional<User>>
  findByGitHubLogin(login: string): Promise<Optional<User>>
  updateLastLogin(id: UserId): Promise<void>
  getActiveUsers(limit?: number): Promise<User[]>
  getUserStats(id: UserId): Promise<{
    totalRepositories: number
    totalOpportunities: number
    contributionsThisMonth: number
  }>
}

export interface IRepositoryRepository extends Repository<GitHubRepository, RepositoryId> {
  findByFullName(fullName: string): Promise<Optional<GitHubRepository>>
  search(criteria: SearchCriteria): Promise<SearchResult<GitHubRepository>>
  findByLanguage(language: string, limit?: number): Promise<GitHubRepository[]>
  findByTopics(topics: string[], limit?: number): Promise<GitHubRepository[]>
  findTrending(timeframe: 'day' | 'week' | 'month', limit?: number): Promise<GitHubRepository[]>
  getLanguageStats(): Promise<Array<{ language: string; count: number }>>
  updateActivity(id: RepositoryId, lastActivity: Date): Promise<void>
  markAsArchived(id: RepositoryId): Promise<void>
}

export interface IOpportunityRepository extends Repository<Opportunity, string> {
  findByRepositoryId(repositoryId: RepositoryId): Promise<Opportunity[]>
  findByType(type: Opportunity['type'], limit?: number): Promise<Opportunity[]>
  findByDifficulty(difficulty: Opportunity['difficulty'], limit?: number): Promise<Opportunity[]>
  search(criteria: SearchCriteria): Promise<SearchResult<Opportunity>>
  findBySkills(skills: string[], limit?: number): Promise<Opportunity[]>
  findRecommended(userId: UserId, limit?: number): Promise<Opportunity[]>
  getOpportunityStats(): Promise<{
    totalOpportunities: number
    byType: Record<Opportunity['type'], number>
    byDifficulty: Record<Opportunity['difficulty'], number>
    avgEstimatedHours: number
  }>
  markAsCompleted(id: string, userId: UserId): Promise<void>
}

// Vector search interfaces for semantic search
export interface VectorRepository<T> {
  findSimilar(
    embedding: number[],
    limit?: number,
    threshold?: number
  ): Promise<Array<T & { similarity: number }>>

  upsertWithEmbedding(entity: T, embedding: number[]): Promise<void>

  deleteByEmbedding(embedding: number[]): Promise<boolean>

  reindex(): Promise<void>
}

export interface IRepositoryVectorRepository extends VectorRepository<GitHubRepository> {
  findSimilarRepositories(
    description: string,
    limit?: number
  ): Promise<Array<GitHubRepository & { similarity: number }>>
}

export interface IOpportunityVectorRepository extends VectorRepository<Opportunity> {
  findSimilarOpportunities(
    description: string,
    skills: string[],
    limit?: number
  ): Promise<Array<Opportunity & { similarity: number }>>
}

// Cache interfaces
export interface ICacheRepository<K, V> {
  get(key: K): Promise<Optional<V>>
  set(key: K, value: V, ttlSeconds?: number): Promise<void>
  delete(key: K): Promise<boolean>
  exists(key: K): Promise<boolean>
  clear(pattern?: string): Promise<number>
  getMultiple(keys: K[]): Promise<Map<K, V>>
  setMultiple(entries: Map<K, V>, ttlSeconds?: number): Promise<void>
}

// Search history and analytics
export interface ISearchHistoryRepository extends Repository<SearchHistory, string> {
  findByUserId(userId: UserId, limit?: number): Promise<SearchHistory[]>
  getPopularQueries(limit?: number): Promise<Array<{ query: string; count: number }>>
  getTrendingQueries(
    timeframe: 'hour' | 'day' | 'week'
  ): Promise<Array<{ query: string; count: number }>>
  recordSearch(userId: UserId, query: SearchQuery, resultsCount: number): Promise<void>
}

export interface SearchHistory {
  id: string
  userId: UserId
  query: SearchQuery
  filters: SearchCriteria
  resultsCount: number
  clickedResults: string[]
  createdAt: Date
}

// Analytics and metrics
export interface IAnalyticsRepository {
  recordEvent(event: AnalyticsEvent): Promise<void>
  getEventStats(eventType: string, timeframe: 'hour' | 'day' | 'week' | 'month'): Promise<number>
  getUserEngagement(userId: UserId): Promise<UserEngagement>
  getRepositoryPopularity(repositoryId: RepositoryId): Promise<RepositoryPopularity>
  getDashboardMetrics(): Promise<DashboardMetrics>
}

export interface AnalyticsEvent {
  id: string
  type:
    | 'page_view'
    | 'search'
    | 'repository_click'
    | 'opportunity_click'
    | 'user_signup'
    | 'user_login'
  userId?: UserId
  sessionId: string
  properties: Record<string, any>
  timestamp: Date
}

export interface UserEngagement {
  totalPageViews: number
  totalSearches: number
  totalClicks: number
  avgSessionDuration: number
  lastActivity: Date
  favoriteLanguages: string[]
  favoriteTopics: string[]
}

export interface RepositoryPopularity {
  totalViews: number
  totalClicks: number
  uniqueUsers: number
  avgRating?: number
  lastViewed: Date
}

export interface DashboardMetrics {
  totalUsers: number
  totalRepositories: number
  totalOpportunities: number
  activeUsers24h: number
  searchesLast24h: number
  topLanguages: Array<{ language: string; count: number }>
  topRepositories: Array<{ name: string; clicks: number }>
}

// Health check and monitoring
export interface IHealthRepository {
  checkDatabaseHealth(): Promise<Result<{ latency: number; status: string }, Error>>
  checkVectorSearchHealth(): Promise<Result<{ indexSize: number; status: string }, Error>>
  checkCacheHealth(): Promise<Result<{ hitRate: number; status: string }, Error>>
  getSystemMetrics(): Promise<{
    uptime: number
    memoryUsage: number
    diskUsage: number
    activeConnections: number
  }>
}

// Backup and data export
export interface IBackupRepository {
  exportUserData(userId: UserId): Promise<string> // Returns JSON string
  exportRepositoryData(repositoryId: RepositoryId): Promise<string>
  importData(data: string): Promise<Result<void, Error>>
  createSnapshot(): Promise<string> // Returns snapshot ID
  restoreSnapshot(snapshotId: string): Promise<Result<void, Error>>
}

// Batch operations for performance
export interface IBatchRepository {
  batchCreateRepositories(repositories: Omit<GitHubRepository, 'id'>[]): Promise<GitHubRepository[]>
  batchCreateOpportunities(opportunities: Omit<Opportunity, 'id'>[]): Promise<Opportunity[]>
  batchUpdateRepositories(
    updates: Array<{ id: RepositoryId; updates: Partial<GitHubRepository> }>
  ): Promise<void>
  batchDeleteRepositories(ids: RepositoryId[]): Promise<void>
}

// Transaction support
export interface ITransactionRepository {
  executeInTransaction<T>(fn: (trx: any) => Promise<T>): Promise<Result<T, Error>>
  rollback(): Promise<void>
  commit(): Promise<void>
}

// Repository factory interface
export interface IRepositoryFactory {
  createUserRepository(): IUserRepository
  createRepositoryRepository(): IRepositoryRepository
  createOpportunityRepository(): IOpportunityRepository
  createRepositoryVectorRepository(): IRepositoryVectorRepository
  createOpportunityVectorRepository(): IOpportunityVectorRepository
  createCacheRepository<K, V>(): ICacheRepository<K, V>
  createSearchHistoryRepository(): ISearchHistoryRepository
  createAnalyticsRepository(): IAnalyticsRepository
  createHealthRepository(): IHealthRepository
  createBackupRepository(): IBackupRepository
  createBatchRepository(): IBatchRepository
  createTransactionRepository(): ITransactionRepository
}
