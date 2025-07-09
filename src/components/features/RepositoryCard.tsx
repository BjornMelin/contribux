'use client'

import { motion } from 'framer-motion'
import { Bookmark, Circle, ExternalLink, GitFork, Star, TrendingUp } from 'lucide-react'
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

// Helper function to get health status color
function getHealthStatusColor(status: string): string {
  switch (status) {
    case 'excellent':
    case 'good':
      return 'text-green-600'
    case 'fair':
      return 'text-yellow-600'
    case 'poor':
      return 'text-red-600'
    default:
      return 'text-muted-foreground'
  }
}

// Helper function to get health bar color
function getHealthBarColor(status: string): string {
  switch (status) {
    case 'excellent':
    case 'good':
      return 'bg-green-500'
    case 'fair':
      return 'bg-yellow-500'
    case 'poor':
      return 'bg-red-500'
    default:
      return 'bg-muted'
  }
}

// Repository header component
function RepositoryHeader({
  repository,
  onBookmark,
  isBookmarked,
}: {
  repository: Repository
  onBookmark?: (id: string) => void
  isBookmarked: boolean
}) {
  return (
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
          <RepositoryBadges repository={repository} />
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
  )
}

// Repository badges component
function RepositoryBadges({ repository }: { repository: Repository }) {
  return (
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
        {repository.lastPushedAt ? getRelativeTime(new Date(repository.lastPushedAt)) : 'recently'}
      </span>
    </div>
  )
}

// Repository topics component
function RepositoryTopics({ topics }: { topics?: string[] }) {
  if (!topics || topics.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap gap-1">
      {topics.slice(0, 5).map(topic => (
        <Badge
          key={topic}
          variant="outline"
          className="bg-secondary px-2 py-0.5 text-secondary-foreground text-xs hover:bg-secondary/80"
        >
          {topic}
        </Badge>
      ))}
      {topics.length > 5 && (
        <Badge variant="outline" className="px-2 py-0.5 text-xs">
          +{topics.length - 5}
        </Badge>
      )}
    </div>
  )
}

// Repository stats component
function RepositoryStats({ repository }: { repository: Repository }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4 text-muted-foreground text-sm">
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 text-yellow-500" />
          <span className="font-medium text-foreground">{formatNumber(repository.starsCount)}</span>
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
  )
}

// Repository health component
function RepositoryHealth({ health }: { health?: Repository['health'] }) {
  if (!health) return null

  return (
    <div className="mt-4 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          Repository Health
        </span>
        <span className={cn('font-medium', getHealthStatusColor(health.status))}>
          {Math.round(health.score * 100)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${health.score * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={cn('h-full rounded-full', getHealthBarColor(health.status))}
        />
      </div>
    </div>
  )
}

// Repository footer component
function RepositoryFooter({
  repository,
  languageColor,
}: {
  repository: Repository
  languageColor: string
}) {
  return (
    <CardFooter className="pt-0">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: languageColor }} />
          <span className="text-muted-foreground text-sm">{repository.language || 'Unknown'}</span>
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
  )
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

        <RepositoryHeader
          repository={repository}
          onBookmark={onBookmark}
          isBookmarked={isBookmarked}
        />

        <CardContent className="pb-4">
          <CardDescription className="mb-4 line-clamp-2 text-muted-foreground text-sm leading-relaxed">
            {repository.description || 'No description provided'}
          </CardDescription>

          <RepositoryTopics topics={[...repository.topics] as string[]} />
          <RepositoryStats repository={repository} />
          {showHealthScore && <RepositoryHealth health={repository.health} />}
        </CardContent>

        <RepositoryFooter repository={repository} languageColor={languageColor} />
      </Card>
    </motion.div>
  )
}
