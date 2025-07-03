/**
 * Repository Mock Implementations for Testing
 */

// Simple mock function implementation
const mockFn = () => () => Promise.resolve()

export function createMockRepository(type: string) {
  const baseMock = {
    findById: mockFn(),
    findAll: mockFn(),
    create: mockFn(),
    update: mockFn(),
    delete: mockFn(),
    count: mockFn(),
  }

  switch (type) {
    case 'user':
      return {
        ...baseMock,
        findByGithubId: mockFn(),
        findByEmail: mockFn(),
        createOrUpdate: mockFn(),
      }

    case 'repository':
      return {
        ...baseMock,
        searchByLanguage: mockFn(),
        getPopularRepositories: mockFn(),
        getByOwnerAndName: mockFn(),
      }

    case 'opportunity':
      return {
        ...baseMock,
        findByDifficulty: mockFn(),
        findBySkills: mockFn(),
        findByRepository: mockFn(),
        getGoodFirstIssues: mockFn(),
      }

    case 'cache':
      return {
        get: mockFn(),
        set: mockFn(),
        delete: mockFn(),
        clear: mockFn(),
        exists: mockFn(),
        getMetrics: mockFn(),
      }

    default:
      return baseMock
  }
}
