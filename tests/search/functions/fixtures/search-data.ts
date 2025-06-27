/**
 * Search Function Test Data and Fixtures
 * Centralized test data for search function testing
 */

// Search query fixtures
export const searchQueries = {
  text: {
    typescript: 'TypeScript type errors',
    aiSearch: 'AI search',
    testing: 'testing',
    unrelated: 'completely unrelated query xyz123',
    empty: '',
  },
  embeddings: {
    similar: 0.31,
    exact: 0.25,
    different: 0.1,
  },
} as const

// Repository test data
export const repositoryFixtures = {
  primary: {
    github_id: 12345,
    full_name: 'test-org/test-repo',
    name: 'test-repo',
    description: 'A test repository for testing AI-powered search functionality',
    url: 'https://github.com/test-org/test-repo',
    clone_url: 'https://github.com/test-org/test-repo.git',
    owner_login: 'test-org',
    owner_type: 'Organization',
    language: 'TypeScript',
    topics: ['testing', 'ai', 'search'],
    stars_count: 100,
    health_score: 85.5,
    activity_score: 92.0,
    community_score: 75.0,
    first_time_contributor_friendly: true,
    status: 'active',
    embedding_value: 0.1,
  },
  lowQuality: {
    github_id: 54321,
    full_name: 'test-org/low-quality',
    name: 'low-quality',
    description: 'Another AI search repository with lower metrics',
    url: 'https://github.com/test-org/low-quality',
    clone_url: 'https://github.com/test-org/low-quality.git',
    owner_login: 'test-org',
    owner_type: 'Organization',
    language: 'JavaScript',
    topics: ['ai', 'search'],
    stars_count: 5,
    health_score: 40.0,
    activity_score: 30.0,
    community_score: 35.0,
    first_time_contributor_friendly: false,
    status: 'active',
    embedding_value: 0.1,
  },
} as const

// Opportunity test data
export const opportunityFixtures = {
  bugFix: {
    github_issue_number: 1,
    title: 'Fix TypeScript type errors in search module',
    description: 'Several type errors need to be fixed in the search functionality',
    url: 'https://github.com/test-org/test-repo/issues/1',
    type: 'bug_fix',
    difficulty: 'intermediate',
    priority: 1,
    required_skills: ['TypeScript', 'debugging'],
    technologies: ['TypeScript', 'Node.js'],
    good_first_issue: false,
    help_wanted: true,
    estimated_hours: 4,
    status: 'open',
    title_embedding_value: 0.2,
    description_embedding_value: 0.2,
    view_count: 100,
    application_count: 10,
  },
  feature: {
    github_issue_number: 2,
    title: 'Add AI-powered search capabilities',
    description: 'Implement vector search using embeddings for better search results',
    url: 'https://github.com/test-org/test-repo/issues/2',
    type: 'feature',
    difficulty: 'advanced',
    priority: 2,
    required_skills: ['AI/ML', 'PostgreSQL', 'vector-search'],
    technologies: ['Python', 'PostgreSQL'],
    good_first_issue: false,
    help_wanted: false,
    estimated_hours: 16,
    status: 'open',
    title_embedding_value: 0.3,
    description_embedding_value: 0.3,
    view_count: 50,
    application_count: 5,
  },
} as const

// User test data
export const userFixtures = {
  primary: {
    github_id: 67890,
    github_username: 'testuser',
    github_name: 'Test User',
    email: 'test@example.com',
    skill_level: 'intermediate',
    preferred_languages: ['TypeScript', 'Python'],
    availability_hours: 20,
    profile_embedding_value: 0.25,
  },
  similar: {
    github_id: 11111,
    github_username: 'similaruser',
    github_name: 'Similar User',
    email: 'similar@example.com',
    skill_level: 'intermediate',
    preferred_languages: ['TypeScript', 'JavaScript'],
    availability_hours: 25,
    profile_embedding_value: 0.26,
  },
} as const

// User preferences test data
export const userPreferencesFixtures = {
  default: {
    preferred_contribution_types: ['bug_fix', 'feature'],
    max_estimated_hours: 10,
    notification_frequency: 24,
  },
  advanced: {
    preferred_contribution_types: ['feature', 'documentation'],
    max_estimated_hours: 20,
    notification_frequency: 12,
  },
} as const

// Search parameter presets
export const searchParameters = {
  textOnly: {
    text_weight: 1.0,
    vector_weight: 0.0,
    similarity_threshold: 0.01,
  },
  vectorOnly: {
    text_weight: 0.0,
    vector_weight: 1.0,
    similarity_threshold: 0.01,
  },
  hybrid: {
    text_weight: 0.3,
    vector_weight: 0.7,
    similarity_threshold: 0.01,
  },
  strict: {
    text_weight: 1.0,
    vector_weight: 0.0,
    similarity_threshold: 0.8,
  },
} as const

// Expected validation error messages
export const errorMessages = {
  zeroWeights: 'Text weight and vector weight cannot both be zero',
  invalidLimit: 'Result limit must be positive',
  userNotFound: (userId: string) => `User not found: ${userId}`,
  repositoryNotFound: (repoId: string) => `Repository not found: ${repoId}`,
} as const

// Performance thresholds and benchmarks
export const performanceThresholds = {
  maxQueryTime: 1000, // milliseconds
  minRelevanceScore: 0.1,
  maxRelevanceScore: 1.0,
  minSimilarityScore: 0.8,
} as const
