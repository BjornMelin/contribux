/**
 * Mock for config provider to fix "config is not defined" errors
 */

export const config = {
  getSection: (section: string) => {
    switch (section) {
      case 'github':
        return {
          timeout: 30000,
          retryAttempts: 3,
          retryDelay: 1000,
        }
      case 'database':
        return {
          url: 'postgresql://test:test@localhost/test',
          poolSize: 5,
        }
      default:
        return {}
    }
  },
  get: (key: string) => {
    const defaults: Record<string, unknown> = {
      'github.timeout': 30000,
      'database.url': 'postgresql://test:test@localhost/test',
    }
    return defaults[key]
  },
}