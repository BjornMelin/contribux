/**
 * Service Mock Implementations for Testing
 */

// Simple mock function implementation
const mockFn = () => () => Promise.resolve()

export function createMockService(type: string) {
  const baseMock = {
    initialize: mockFn(),
    shutdown: mockFn(),
    getStatus: mockFn(),
  }

  switch (type) {
    case 'search':
      return {
        ...baseMock,
        searchRepositories: mockFn(),
        searchOpportunities: mockFn(),
        hybridSearch: mockFn(),
        vectorSearch: mockFn(),
      }

    case 'recommendation':
      return {
        ...baseMock,
        getPersonalizedRecommendations: mockFn(),
        getSimilarRepositories: mockFn(),
        getMatchingOpportunities: mockFn(),
      }

    case 'analytics':
      return {
        ...baseMock,
        trackEvent: mockFn(),
        getMetrics: mockFn(),
        generateReport: mockFn(),
      }

    default:
      return baseMock
  }
}
