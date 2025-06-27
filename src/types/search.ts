import { z } from 'zod'
import type {
  ApiResponse,
  BaseEntity,
  GitHubUsername,
  PaginationMetadata,
  Result,
  UUID,
} from './base'
import {
  BaseEntitySchema,
  GitHubUsernameSchema,
  PaginationMetadataSchema,
  UUIDSchema,
} from './base'

// ==================== CORE ENUMS ====================

/**
 * Opportunity types for GitHub issues and contributions
 */
export const OpportunityType = {
  BUG_FIX: 'bug_fix',
  FEATURE: 'feature',
  DOCUMENTATION: 'documentation',
  TESTING: 'testing',
  REFACTORING: 'refactoring',
  PERFORMANCE: 'performance',
  SECURITY: 'security',
  ACCESSIBILITY: 'accessibility',
  OTHER: 'other',
} as const

export type OpportunityType = (typeof OpportunityType)[keyof typeof OpportunityType]

export const OpportunityTypeSchema = z.nativeEnum(OpportunityType)

/**
 * Difficulty levels for contributions
 */
export const DifficultyLevel = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
} as const

export type DifficultyLevel = (typeof DifficultyLevel)[keyof typeof DifficultyLevel]

export const DifficultyLevelSchema = z.nativeEnum(DifficultyLevel)

/**
 * Search result sorting options
 */
export const SearchSortBy = {
  RELEVANCE: 'relevance',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  STARS: 'stars',
  SCORE: 'score',
  DIFFICULTY: 'difficulty',
} as const

export type SearchSortBy = (typeof SearchSortBy)[keyof typeof SearchSortBy]

export const SearchSortBySchema = z.nativeEnum(SearchSortBy)

/**
 * Search result ordering
 */
export const SearchOrder = {
  ASC: 'asc',
  DESC: 'desc',
} as const

export type SearchOrder = (typeof SearchOrder)[keyof typeof SearchOrder]

export const SearchOrderSchema = z.nativeEnum(SearchOrder)

/**
 * Repository health status levels
 */
export const RepositoryHealthStatus = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
} as const

export type RepositoryHealthStatus =
  (typeof RepositoryHealthStatus)[keyof typeof RepositoryHealthStatus]

export const RepositoryHealthStatusSchema = z.nativeEnum(RepositoryHealthStatus)

// ==================== SEARCH FILTERS ====================

/**
 * Comprehensive search filters with validation
 */
export interface SearchFilters {
  // Basic search
  readonly query: string
  readonly languages: readonly string[]
  readonly difficulty: DifficultyLevel | undefined
  readonly type: OpportunityType | undefined

  // GitHub-specific filters
  readonly goodFirstIssue: boolean
  readonly helpWanted: boolean
  readonly hasAssignee: boolean | undefined

  // Score-based filters
  readonly minScore: number
  readonly maxScore: number
  readonly minStars: number | undefined
  readonly maxStars: number | undefined

  // Time-based filters
  readonly createdAfter: Date | undefined
  readonly createdBefore: Date | undefined
  readonly updatedAfter: Date | undefined
  readonly updatedBefore: Date | undefined

  // Advanced filters
  readonly repositoryHealthMin: number | undefined
  readonly estimatedHoursMin: number | undefined
  readonly estimatedHoursMax: number | undefined
  readonly requiresMaintainerResponse: boolean | undefined
  readonly hasLinkedPR: boolean | undefined

  // Pagination
  readonly page: number
  readonly limit: number
  readonly sortBy: SearchSortBy
  readonly order: SearchOrder
}

/**
 * Zod schema for search filters validation
 */
export const SearchFiltersSchema = z.object({
  query: z.string().min(0).max(1000),
  languages: z.array(z.string().min(1).max(50)),
  difficulty: DifficultyLevelSchema.optional(),
  type: OpportunityTypeSchema.optional(),

  goodFirstIssue: z.boolean(),
  helpWanted: z.boolean(),
  hasAssignee: z.boolean().optional(),

  minScore: z.number().min(0).max(1),
  maxScore: z.number().min(0).max(1),
  minStars: z.number().int().min(0).optional(),
  maxStars: z.number().int().min(0).optional(),

  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  updatedAfter: z.date().optional(),
  updatedBefore: z.date().optional(),

  repositoryHealthMin: z.number().min(0).max(1).optional(),
  estimatedHoursMin: z.number().min(0).optional(),
  estimatedHoursMax: z.number().min(0).optional(),
  requiresMaintainerResponse: z.boolean().optional(),
  hasLinkedPR: z.boolean().optional(),

  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: SearchSortBySchema.default('relevance'),
  order: SearchOrderSchema.default('desc'),
})

// ==================== REPOSITORY TYPES ====================

/**
 * Repository health metrics
 */
export interface RepositoryHealth {
  readonly score: number // 0-1
  readonly status: RepositoryHealthStatus
  readonly metrics: {
    readonly commitFrequency: number
    readonly issueResponseTime: number // hours
    readonly prMergeTime: number // hours
    readonly maintainerActivity: number // 0-1
    readonly communityEngagement: number // 0-1
    readonly documentationQuality: number // 0-1
    readonly codeQuality: number // 0-1
    readonly testCoverage: number | undefined // 0-1
  }
  readonly lastUpdated: Date
}

/**
 * Zod schema for repository health validation
 */
export const RepositoryHealthSchema = z.object({
  score: z.number().min(0).max(1),
  status: RepositoryHealthStatusSchema,
  metrics: z.object({
    commitFrequency: z.number().min(0),
    issueResponseTime: z.number().min(0),
    prMergeTime: z.number().min(0),
    maintainerActivity: z.number().min(0).max(1),
    communityEngagement: z.number().min(0).max(1),
    documentationQuality: z.number().min(0).max(1),
    codeQuality: z.number().min(0).max(1),
    testCoverage: z.number().min(0).max(1).optional(),
  }),
  lastUpdated: z.date(),
})

/**
 * Enhanced repository information
 */
export interface Repository extends BaseEntity {
  readonly githubId: number
  readonly name: string
  readonly fullName: string
  readonly description: string | undefined
  readonly language: string | undefined
  readonly topics: readonly string[]
  readonly starsCount: number
  readonly forksCount: number
  readonly issuesCount: number
  readonly url: string
  readonly defaultBranch: string
  readonly lastPushedAt: Date | undefined
  readonly health: RepositoryHealth
  readonly isArchived: boolean
  readonly isFork: boolean
  readonly hasIssues: boolean
  readonly hasProjects: boolean
  readonly hasWiki: boolean
}

/**
 * Zod schema for repository validation
 */
export const RepositorySchema = BaseEntitySchema.extend({
  githubId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  fullName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  language: z.string().optional(),
  topics: z.array(z.string().min(1).max(50)),
  starsCount: z.number().int().min(0),
  forksCount: z.number().int().min(0),
  issuesCount: z.number().int().min(0),
  url: z.string().url(),
  defaultBranch: z.string().min(1),
  lastPushedAt: z.date().optional(),
  health: RepositoryHealthSchema,
  isArchived: z.boolean(),
  isFork: z.boolean(),
  hasIssues: z.boolean(),
  hasProjects: z.boolean(),
  hasWiki: z.boolean(),
})

// ==================== OPPORTUNITY TYPES ====================

/**
 * AI analysis for opportunities
 */
export interface OpportunityAnalysis {
  readonly complexityScore: number // 0-1
  readonly impactScore: number // 0-1
  readonly confidenceScore: number // 0-1
  readonly learningPotential: number // 0-1
  readonly businessImpact: number // 0-1
  readonly requiredSkills: readonly string[]
  readonly suggestedApproach: string | undefined
  readonly potentialChallenges: readonly string[]
  readonly successProbability: number // 0-1
  readonly estimatedEffort: {
    readonly hours: number | undefined
    readonly difficulty: DifficultyLevel
    readonly confidence: number // 0-1
  }
}

/**
 * Zod schema for opportunity analysis validation
 */
export const OpportunityAnalysisSchema = z.object({
  complexityScore: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(1),
  confidenceScore: z.number().min(0).max(1),
  learningPotential: z.number().min(0).max(1),
  businessImpact: z.number().min(0).max(1),
  requiredSkills: z.array(z.string().min(1).max(50)),
  suggestedApproach: z.string().max(2000).optional(),
  potentialChallenges: z.array(z.string().min(1).max(200)),
  successProbability: z.number().min(0).max(1),
  estimatedEffort: z.object({
    hours: z.number().min(0).optional(),
    difficulty: DifficultyLevelSchema,
    confidence: z.number().min(0).max(1),
  }),
})

/**
 * GitHub issue labels
 */
export interface GitHubLabel {
  readonly id: number
  readonly name: string
  readonly color: string
  readonly description: string | undefined
}

/**
 * Zod schema for GitHub label validation
 */
export const GitHubLabelSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(50),
  color: z.string().regex(/^[0-9a-fA-F]{6}$/),
  description: z.string().max(200).optional(),
})

/**
 * Main opportunity interface
 */
export interface Opportunity extends BaseEntity {
  readonly repositoryId: UUID
  readonly githubIssueId: number
  readonly title: string
  readonly description: string | undefined
  readonly type: OpportunityType
  readonly difficulty: DifficultyLevel
  readonly labels: readonly GitHubLabel[]
  readonly technologies: readonly string[]
  readonly requiredSkills: readonly string[]
  readonly goodFirstIssue: boolean
  readonly helpWanted: boolean
  readonly hasAssignee: boolean
  readonly assigneeUsername: GitHubUsername | undefined
  readonly estimatedHours: number | undefined
  readonly relevanceScore: number // 0-1
  readonly aiAnalysis: OpportunityAnalysis
  readonly repository: Repository
  readonly url: string
  readonly lastActivityAt: Date
  readonly isActive: boolean
}

/**
 * Zod schema for opportunity validation
 */
export const OpportunitySchema = BaseEntitySchema.extend({
  repositoryId: UUIDSchema,
  githubIssueId: z.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  type: OpportunityTypeSchema,
  difficulty: DifficultyLevelSchema,
  labels: z.array(GitHubLabelSchema),
  technologies: z.array(z.string().min(1).max(50)),
  requiredSkills: z.array(z.string().min(1).max(50)),
  goodFirstIssue: z.boolean(),
  helpWanted: z.boolean(),
  hasAssignee: z.boolean(),
  assigneeUsername: GitHubUsernameSchema.optional(),
  estimatedHours: z.number().min(0).optional(),
  relevanceScore: z.number().min(0).max(1),
  aiAnalysis: OpportunityAnalysisSchema,
  repository: RepositorySchema,
  url: z.string().url(),
  lastActivityAt: z.date(),
  isActive: z.boolean(),
})

// ==================== SEARCH RESULTS ====================

/**
 * Search facets for filtering
 */
export interface SearchFacets {
  readonly languages: ReadonlyArray<{
    readonly name: string
    readonly count: number
  }>
  readonly types: ReadonlyArray<{
    readonly type: OpportunityType
    readonly count: number
  }>
  readonly difficulties: ReadonlyArray<{
    readonly difficulty: DifficultyLevel
    readonly count: number
  }>
  readonly repositories: ReadonlyArray<{
    readonly fullName: string
    readonly count: number
  }>
}

/**
 * Zod schema for search facets validation
 */
export const SearchFacetsSchema = z.object({
  languages: z.array(
    z.object({
      name: z.string().min(1),
      count: z.number().int().min(0),
    })
  ),
  types: z.array(
    z.object({
      type: OpportunityTypeSchema,
      count: z.number().int().min(0),
    })
  ),
  difficulties: z.array(
    z.object({
      difficulty: DifficultyLevelSchema,
      count: z.number().int().min(0),
    })
  ),
  repositories: z.array(
    z.object({
      fullName: z.string().min(1),
      count: z.number().int().min(0),
    })
  ),
})

/**
 * Search result metadata
 */
export interface SearchMetadata {
  readonly executionTime: number // milliseconds
  readonly vectorSearchUsed: boolean
  readonly totalMatches: number
  readonly topRelevanceScore: number
  readonly avgRelevanceScore: number
  readonly searchId: UUID
  readonly cacheHit: boolean
}

/**
 * Zod schema for search metadata validation
 */
export const SearchMetadataSchema = z.object({
  executionTime: z.number().min(0),
  vectorSearchUsed: z.boolean(),
  totalMatches: z.number().int().min(0),
  topRelevanceScore: z.number().min(0).max(1),
  avgRelevanceScore: z.number().min(0).max(1),
  searchId: UUIDSchema,
  cacheHit: z.boolean(),
})

/**
 * Complete search results
 */
export interface SearchResults {
  readonly opportunities: readonly Opportunity[]
  readonly pagination: PaginationMetadata
  readonly facets: SearchFacets
  readonly metadata: SearchMetadata
  readonly suggestions: readonly string[]
}

/**
 * Zod schema for search results validation
 */
export const SearchResultsSchema = z.object({
  opportunities: z.array(OpportunitySchema),
  pagination: PaginationMetadataSchema,
  facets: SearchFacetsSchema,
  metadata: SearchMetadataSchema,
  suggestions: z.array(z.string().min(1).max(100)),
})

// ==================== SEMANTIC SEARCH ====================

/**
 * Vector search parameters
 */
export interface VectorSearchParams {
  readonly query: string
  readonly embedding: readonly number[] | undefined
  readonly threshold: number // 0-1
  readonly limit: number
  readonly includeMetadata: boolean
}

/**
 * Zod schema for vector search parameters validation
 */
export const VectorSearchParamsSchema = z.object({
  query: z.string().min(1).max(1000),
  embedding: z.array(z.number()).length(1536).optional(),
  threshold: z.number().min(0).max(1).default(0.7),
  limit: z.number().int().min(1).max(100).default(20),
  includeMetadata: z.boolean().default(true),
})

/**
 * Semantic search result
 */
export interface SemanticSearchResult {
  readonly opportunity: Opportunity
  readonly similarity: number // 0-1
  readonly explanation: string | undefined
}

/**
 * Zod schema for semantic search result validation
 */
export const SemanticSearchResultSchema = z.object({
  opportunity: OpportunitySchema,
  similarity: z.number().min(0).max(1),
  explanation: z.string().max(500).optional(),
})

// ==================== SAVED SEARCHES ====================

/**
 * Saved search configuration
 */
export interface SavedSearch extends BaseEntity {
  readonly userId: UUID
  readonly name: string
  readonly description: string | undefined
  readonly filters: SearchFilters
  readonly isActive: boolean
  readonly notificationsEnabled: boolean
  readonly lastExecuted: Date | undefined
  readonly resultCount: number
}

/**
 * Zod schema for saved search validation
 */
export const SavedSearchSchema = BaseEntitySchema.extend({
  userId: UUIDSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  filters: SearchFiltersSchema,
  isActive: z.boolean(),
  notificationsEnabled: z.boolean(),
  lastExecuted: z.date().optional(),
  resultCount: z.number().int().min(0),
})

// ==================== SEARCH ANALYTICS ====================

/**
 * Search analytics data
 */
export interface SearchAnalytics {
  readonly searchId: UUID
  readonly userId: UUID | undefined
  readonly query: string
  readonly filters: SearchFilters
  readonly resultCount: number
  readonly executionTime: number
  readonly clickedResults: readonly UUID[]
  readonly sessionId: string | undefined
  readonly timestamp: Date
}

/**
 * Zod schema for search analytics validation
 */
export const SearchAnalyticsSchema = z.object({
  searchId: UUIDSchema,
  userId: UUIDSchema.optional(),
  query: z.string().min(0).max(1000),
  filters: SearchFiltersSchema,
  resultCount: z.number().int().min(0),
  executionTime: z.number().min(0),
  clickedResults: z.array(UUIDSchema),
  sessionId: z.string().optional(),
  timestamp: z.date(),
})

// ==================== COMPONENT PROP TYPES ====================

/**
 * Search bar component props
 */
export interface SearchBarProps {
  readonly onSearch: (query: string) => void
  readonly placeholder?: string
  readonly defaultValue?: string
  readonly loading?: boolean
  readonly className?: string
  readonly autoFocus?: boolean
  readonly showSuggestions?: boolean
  readonly suggestions?: readonly string[]
}

/**
 * Search filters component props
 */
export interface SearchFiltersProps {
  readonly filters: SearchFilters
  readonly onFiltersChange: (filters: SearchFilters) => void
  readonly facets?: SearchFacets
  readonly loading?: boolean
  readonly disabled?: boolean
  readonly className?: string
}

/**
 * Opportunity card component props
 */
export interface OpportunityCardProps {
  readonly opportunity: Opportunity
  readonly onSelect: (opportunity: Opportunity) => void
  readonly onBookmark?: (opportunity: Opportunity) => void
  readonly isBookmarked?: boolean
  readonly showRepository?: boolean
  readonly showAnalysis?: boolean
  readonly className?: string
}

/**
 * Opportunity list component props
 */
export interface OpportunityListProps {
  readonly opportunities: readonly Opportunity[]
  readonly loading?: boolean
  readonly error?: string | undefined
  readonly onOpportunitySelect: (opportunity: Opportunity) => void
  readonly onLoadMore?: () => void
  readonly hasMore?: boolean
  readonly emptyMessage?: string
  readonly className?: string
}

/**
 * Search results component props
 */
export interface SearchResultsProps {
  readonly results: SearchResults | undefined
  readonly loading?: boolean
  readonly error?: string | undefined
  readonly onOpportunitySelect: (opportunity: Opportunity) => void
  readonly onFiltersChange: (filters: SearchFilters) => void
  readonly onPageChange: (page: number) => void
  readonly className?: string
}

/**
 * Faceted search component props
 */
export interface FacetedSearchProps {
  readonly filters: SearchFilters
  readonly facets: SearchFacets
  readonly onFiltersChange: (filters: SearchFilters) => void
  readonly loading?: boolean
  readonly className?: string
}

// ==================== API RESPONSE TYPES ====================

/**
 * Search API response types
 */
export type SearchApiResponse<T> = ApiResponse<T>
export type SearchResult<T> = Result<T, string>

/**
 * Specific API response types
 */
export type OpportunitySearchResponse = SearchApiResponse<SearchResults>
export type SavedSearchResponse = SearchApiResponse<SavedSearch>
export type SearchSuggestionsResponse = SearchApiResponse<readonly string[]>
export type SearchAnalyticsResponse = SearchApiResponse<SearchAnalytics>
