/**
 * Badge Style Utilities
 * Pure functions for generating consistent badge styles
 */

export function getDifficultyBadgeStyle(difficulty?: string): string {
  switch (difficulty) {
    case 'beginner':
      return 'bg-green-100 text-green-800'
    case 'intermediate':
      return 'bg-yellow-100 text-yellow-800'
    case 'advanced':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function getCircuitBreakerStyle(state: string): string {
  switch (state) {
    case 'closed':
      return 'bg-green-100 text-green-800'
    case 'open':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-yellow-100 text-yellow-800'
  }
}
