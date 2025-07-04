'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Repository } from '@/types/search'
import { motion } from 'framer-motion'
import { Bookmark, Circle, ExternalLink, GitFork, Star, TrendingUp } from 'lucide-react'

interface RepositoryCardProps {
  repository: Repository
  onBookmark?: (id: string) => void
  isBookmarked?: boolean
  className?: string
  showHealthScore?: boolean
}

// Language colors from GitHub
const languageColors: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#3776ab',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#FA7343',
  Kotlin: '#A97BFF',
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`
  }
  return num.toString()
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  }

  for (const [unit, seconds] of Object.entries(intervals)) {
    const interval = Math.floor(diffInSeconds / seconds)
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`
    }
  }

  return 'just now'
}

export function RepositoryCard({
  repository,
  onBookmark,
  isBookmarked = false,
  className,
  showHealthScore = true,
}: RepositoryCardProps) {
  const languageColor = repository.language
    ? languageColors[repository.language] || '#888888'
    : '#888888'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
    >
      <Card
        className={cn(
          'group relative w-full overflow-hidden transition-all duration-200 hover:shadow-lg',
          className
        )}
      >
        {/* Subtle gradient on hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <CardHeader className="relative pb-3">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="font-semibold text-lg text-primary transition-colors hover:text-primary/80">
                <a
                  href={repository.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 group-hover:underline"
                >
                  {repository.fullName}
                  <ExternalLink className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </CardTitle>
              <div className="mt-1 flex items-center gap-2">
                {repository.isArchived && (
                  <Badge variant="secondary" className="text-xs">
                    Archived
                  </Badge>
                )}
                {repository.isFork && (
                  <Badge variant="outline" className="text-xs">
                    Fork
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">
                  Updated{' '}
                  {repository.lastPushedAt
                    ? getRelativeTime(new Date(repository.lastPushedAt))
                    : 'recently'}
                </span>
              </div>
            </div>
            {onBookmark && (
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 w-8 p-0', isBookmarked && 'text-primary')}
                onClick={() => onBookmark(repository.id)}
              >
                <Bookmark className={cn('h-4 w-4', isBookmarked && 'fill-current')} />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pb-4">
          <CardDescription className="mb-4 line-clamp-2 text-muted-foreground text-sm leading-relaxed">
            {repository.description || 'No description provided'}
          </CardDescription>

          {repository.topics && repository.topics.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1">
              {repository.topics.slice(0, 5).map(topic => (
                <Badge
                  key={topic}
                  variant="outline"
                  className="bg-secondary px-2 py-0.5 text-secondary-foreground text-xs hover:bg-secondary/80"
                >
                  {topic}
                </Badge>
              ))}
              {repository.topics.length > 5 && (
                <Badge variant="outline" className="px-2 py-0.5 text-xs">
                  +{repository.topics.length - 5}
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-muted-foreground text-sm">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="font-medium text-foreground">
                  {formatNumber(repository.starsCount)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <GitFork className="h-4 w-4" />
                <span>{formatNumber(repository.forksCount)}</span>
              </div>
              {repository.issuesCount > 0 && (
                <div className="flex items-center gap-1">
                  <Circle className="h-3 w-3 fill-green-500 text-green-500" />
                  <span>{repository.issuesCount} issues</span>
                </div>
              )}
            </div>
          </div>

          {/* Health Score */}
          {showHealthScore && repository.health && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  Repository Health
                </span>
                <span
                  className={cn(
                    'font-medium',
                    repository.health.status === 'excellent' && 'text-green-600',
                    repository.health.status === 'good' && 'text-green-600',
                    repository.health.status === 'fair' && 'text-yellow-600',
                    repository.health.status === 'poor' && 'text-red-600'
                  )}
                >
                  {Math.round(repository.health.score * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${repository.health.score * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={cn(
                    'h-full rounded-full',
                    (repository.health.status === 'excellent' ||
                      repository.health.status === 'good') &&
                      'bg-green-500',
                    repository.health.status === 'fair' && 'bg-yellow-500',
                    repository.health.status === 'poor' && 'bg-red-500'
                  )}
                />
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-0">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: languageColor }} />
              <span className="text-muted-foreground text-sm">
                {repository.language || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {repository.hasIssues && (
                <Badge variant="default" className="bg-primary text-xs hover:bg-primary/80">
                  Good First Issues
                </Badge>
              )}
              <Button variant="outline" size="sm" asChild>
                <a href={repository.url} target="_blank" rel="noopener noreferrer">
                  View Repository
                </a>
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
