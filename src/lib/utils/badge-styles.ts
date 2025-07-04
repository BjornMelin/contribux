/**
 * Badge Style Utilities
 * Pure functions for generating consistent badge styles
 */

export function getDifficultyBadgeStyle(difficulty?: string): string {
  switch (difficulty) {
    case 'beginner':
      return 'bg-chart-2/10 text-chart-2'
    case 'intermediate':
      return 'bg-chart-4/10 text-chart-4'
    case 'advanced':
      return 'bg-destructive/10 text-destructive'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function getCircuitBreakerStyle(state: string): string {
  switch (state) {
    case 'closed':
      return 'bg-chart-2/10 text-chart-2'
    case 'open':
      return 'bg-destructive/10 text-destructive'
    default:
      return 'bg-chart-4/10 text-chart-4'
  }
}
