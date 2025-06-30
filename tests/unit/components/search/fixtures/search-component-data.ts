/**
 * Search Component Test Data and Fixtures
 * Centralized test data for search component testing
 */

import type { Opportunity, SearchFilters } from '../../../../src/types/search'
import { asUUID, createMockRepository } from '../utils/search-test-helpers'

// Shared mock opportunity for all tests
export const sharedMockOpportunity: Opportunity = {
  // BaseEntity fields
  id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),

  // Opportunity fields
  repositoryId: asUUID('550e8400-e29b-41d4-a716-446655440002'),
  githubIssueId: 123,
  title: 'Fix TypeScript type errors in search module',
  description:
    'Several type errors need to be fixed in the search functionality to improve type safety',
  type: 'bug_fix',
  difficulty: 'intermediate',
  labels: [],
  technologies: ['TypeScript', 'Node.js', 'Jest', 'ESLint'],
  requiredSkills: ['TypeScript', 'debugging'],
  goodFirstIssue: false,
  helpWanted: true,
  hasAssignee: false,
  assigneeUsername: undefined,
  estimatedHours: 4,
  relevanceScore: 0.95,
  url: 'https://github.com/company/search-engine/issues/123',
  lastActivityAt: new Date('2024-01-01T00:00:00Z'),
  isActive: true,
  aiAnalysis: {
    complexityScore: 0.7,
    impactScore: 0.8,
    confidenceScore: 0.9,
    learningPotential: 0.6,
    businessImpact: 0.7,
    requiredSkills: ['TypeScript', 'debugging'],
    suggestedApproach: 'Fix type definitions',
    potentialChallenges: ['Complex types'],
    successProbability: 0.85,
    estimatedEffort: {
      hours: 4,
      difficulty: 'intermediate',
      confidence: 0.8,
    },
  },
  repository: createMockRepository({
    name: 'search-engine',
    fullName: 'company/search-engine',
    language: 'TypeScript',
    starsCount: 1250,
  }),
}

// Multiple opportunities for list testing
export const mockOpportunities: Opportunity[] = [
  {
    ...sharedMockOpportunity,
    id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
    title: 'Fix TypeScript errors',
    description: 'Fix type errors in search module',
    type: 'bug_fix',
    difficulty: 'intermediate',
    requiredSkills: ['TypeScript'],
    technologies: ['TypeScript'],
    goodFirstIssue: false,
    helpWanted: true,
    estimatedHours: 4,
    relevanceScore: 0.95,
    repository: createMockRepository({
      name: 'search-engine',
      fullName: 'company/search-engine',
      language: 'TypeScript',
      starsCount: 1250,
    }),
  },
  {
    ...sharedMockOpportunity,
    id: asUUID('550e8400-e29b-41d4-a716-446655440002'),
    title: 'Add new feature',
    description: 'Implement new search capability',
    type: 'feature',
    difficulty: 'advanced',
    requiredSkills: ['Python'],
    technologies: ['Python'],
    goodFirstIssue: false,
    helpWanted: false,
    estimatedHours: 8,
    relevanceScore: 0.78,
    repository: createMockRepository({
      name: 'ml-platform',
      fullName: 'company/ml-platform',
      language: 'Python',
      starsCount: 890,
    }),
  },
]

// Test opportunity variations
export const longDescriptionOpportunity: Opportunity = {
  ...sharedMockOpportunity,
  description:
    'This is a very long description that should be truncated when it exceeds the character limit set for the opportunity card display to ensure proper layout',
}

export const goodFirstIssueOpportunity: Opportunity = {
  ...sharedMockOpportunity,
  goodFirstIssue: true,
}

export const minimalOpportunity: Opportunity = {
  ...sharedMockOpportunity,
  description: undefined,
  estimatedHours: undefined,
  repository: {
    ...sharedMockOpportunity.repository,
    language: undefined,
  },
}

// Search filter test data
export const defaultFilters: SearchFilters = {
  query: '',
  difficulty: undefined,
  type: undefined,
  languages: [],
  goodFirstIssue: false,
  helpWanted: false,
  hasAssignee: undefined,
  minScore: 0,
  maxScore: 1,
  minStars: undefined,
  maxStars: undefined,
  createdAfter: undefined,
  createdBefore: undefined,
  updatedAfter: undefined,
  updatedBefore: undefined,
  repositoryHealthMin: undefined,
  estimatedHoursMin: undefined,
  estimatedHoursMax: undefined,
  requiresMaintainerResponse: undefined,
  hasLinkedPR: undefined,
  page: 1,
  limit: 20,
  sortBy: 'relevance',
  order: 'desc',
}

export const filtersWithValues: SearchFilters = {
  ...defaultFilters,
  query: 'test',
  difficulty: 'advanced',
  type: 'feature',
  languages: ['TypeScript'],
  goodFirstIssue: true,
  helpWanted: true,
  minScore: 0.8,
}

export const filtersWithLanguages: SearchFilters = {
  ...defaultFilters,
  difficulty: 'intermediate',
  type: 'bug_fix',
  languages: ['TypeScript', 'Python'],
  goodFirstIssue: true,
  minScore: 0.5,
}

// Validation test data
export const validOpportunity: Opportunity = {
  ...sharedMockOpportunity,
  id: asUUID('550e8400-e29b-41d4-a716-446655440001'),
  title: 'Test Opportunity',
  description: 'Test description',
  type: 'bug_fix',
  difficulty: 'intermediate',
  requiredSkills: ['TypeScript'],
  technologies: ['TypeScript', 'React'],
  goodFirstIssue: true,
  helpWanted: false,
  estimatedHours: 5,
  relevanceScore: 0.85,
  repository: createMockRepository({
    name: 'test-repo',
    fullName: 'org/test-repo',
    language: 'TypeScript',
    starsCount: 100,
  }),
}

export const validFilters: SearchFilters = {
  query: 'TypeScript',
  difficulty: 'intermediate',
  type: 'bug_fix',
  languages: ['TypeScript', 'Python'],
  goodFirstIssue: true,
  helpWanted: false,
  hasAssignee: undefined,
  minScore: 0.5,
  maxScore: 1.0,
  minStars: undefined,
  maxStars: undefined,
  createdAfter: undefined,
  createdBefore: undefined,
  updatedAfter: undefined,
  updatedBefore: undefined,
  repositoryHealthMin: undefined,
  estimatedHoursMin: undefined,
  estimatedHoursMax: undefined,
  requiresMaintainerResponse: undefined,
  hasLinkedPR: undefined,
  page: 1,
  limit: 20,
  sortBy: 'relevance',
  order: 'desc',
}
