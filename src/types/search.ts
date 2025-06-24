import { z } from 'zod'

// Zod schemas for runtime validation
export const SearchFiltersSchema = z.object({
  query: z.string(),
  difficulty: z.enum(['', 'beginner', 'intermediate', 'advanced', 'expert']),
  type: z.enum(['', 'bug_fix', 'feature', 'documentation', 'testing', 'refactoring', 'other']),
  languages: z.array(z.string()),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  min_score: z.number().min(0).max(1),
})

export const OpportunitySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  difficulty: z.string(),
  required_skills: z.array(z.string()),
  technologies: z.array(z.string()),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  estimated_hours: z.number().nullable(),
  relevance_score: z.number(),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
    language: z.string().nullable(),
    stars_count: z.number(),
  }),
})

// TypeScript types derived from schemas
export type SearchFilters = z.infer<typeof SearchFiltersSchema>
export type Opportunity = z.infer<typeof OpportunitySchema>

// Component prop types
export interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
  defaultValue?: string
  loading?: boolean
  className?: string
}

export interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  loading?: boolean
}

export interface OpportunityCardProps {
  opportunity: Opportunity
  onSelect: (opportunity: Opportunity) => void
  className?: string
}

export interface OpportunityListProps {
  opportunities: Opportunity[]
  loading?: boolean
  error?: string | null
  onOpportunitySelect: (opportunity: Opportunity) => void
  emptyMessage?: string
}
