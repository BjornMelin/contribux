'use client'

import * as React from 'react'
import { Bookmark, ExternalLink, Star } from '@/components/icons'
import { AnimatePresence, MotionDiv } from '@/components/motion'
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
import type { Opportunity } from '@/types/search'

// Animated Bookmark Button
const AnimatedBookmarkButton: React.FC<{ isSaved: boolean; onToggle: () => void }> = ({
  isSaved,
  onToggle,
}) => {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
      aria-label={isSaved ? 'Remove bookmark' : 'Save opportunity'}
    >
      <MotionDiv
        initial={{ scale: 1 }}
        animate={{ scale: isSaved ? 1.1 : 1 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        className="relative"
      >
        <Bookmark
          size={16}
          className={cn(
            'transition-all duration-200',
            isSaved ? 'fill-primary text-primary' : 'text-muted-foreground'
          )}
        />
        <AnimatePresence>
          {isSaved && (
            <MotionDiv
              className="absolute inset-0 rounded-full bg-primary/20"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 2, opacity: [0, 0.5, 0] }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          )}
        </AnimatePresence>
      </MotionDiv>
    </Button>
  )
}

// Difficulty Badge Component
const DifficultyBadge: React.FC<{ difficulty: string }> = ({ difficulty }) => {
  const difficultyConfig: Record<string, { label: string; color: string }> = {
    beginner: { label: 'Beginner', color: 'bg-green-100 text-green-800 border-green-200' },
    intermediate: {
      label: 'Intermediate',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    },
    advanced: { label: 'Advanced', color: 'bg-red-100 text-red-800 border-red-200' },
    expert: { label: 'Expert', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  }

  const config = difficultyConfig[difficulty] || difficultyConfig.intermediate

  return <Badge className={cn('border font-medium text-xs', config.color)}>{config.label}</Badge>
}

// Opportunity Type Badge Component
const OpportunityTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const typeConfig: Record<string, { label: string; color: string }> = {
    bug_fix: { label: 'Bug Fix', color: 'bg-red-50 text-red-700 border-red-200' },
    feature: { label: 'Feature', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    documentation: { label: 'Documentation', color: 'bg-gray-50 text-gray-700 border-gray-200' },
    testing: { label: 'Testing', color: 'bg-green-50 text-green-700 border-green-200' },
    refactoring: { label: 'Refactoring', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    performance: { label: 'Performance', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    security: { label: 'Security', color: 'bg-red-50 text-red-700 border-red-200' },
    accessibility: {
      label: 'Accessibility',
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    other: { label: 'Other', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  }

  const config = typeConfig[type] || typeConfig.other

  return <Badge className={cn('border font-medium text-xs', config.color)}>{config.label}</Badge>
}

// Main Opportunity Card Component
interface OpportunityCardProps {
  opportunity: Opportunity
  onSelect?: (opportunity: Opportunity) => void
  className?: string
}

export const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opportunity,
  onSelect,
  className,
}) => {
  const [isSaved, setIsSaved] = React.useState(false)

  const handleSaveToggle = () => {
    setIsSaved(!isSaved)
  }

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(opportunity)
    } else {
      window.open(opportunity.url, '_blank')
    }
  }

  return (
    <Card
      className={cn(
        'group w-full max-w-md cursor-pointer transition-all duration-300 hover:shadow-lg',
        className
      )}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle
              className="line-clamp-2 text-base leading-tight transition-colors group-hover:text-primary"
              onClick={handleCardClick}
            >
              {opportunity.title}
            </CardTitle>
            <CardDescription className="mt-2 flex items-center gap-2 text-xs">
              <span className="font-medium">{opportunity.repository.fullName}</span>
              <span className="text-muted-foreground">#{opportunity.githubIssueId}</span>
            </CardDescription>
          </div>
          <AnimatedBookmarkButton isSaved={isSaved} onToggle={handleSaveToggle} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="line-clamp-3 text-muted-foreground text-sm leading-relaxed">
          {opportunity.description}
        </p>

        <div className="flex flex-wrap gap-2">
          {opportunity.labels.map(label => (
            <Badge key={label.id} variant="outline" className="text-xs">
              <span
                className="mr-1.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: `#${label.color}` }}
              />
              {label.name}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <OpportunityTypeBadge type={opportunity.type} />
            <DifficultyBadge difficulty={opportunity.difficulty} />
          </div>
          <div className="flex items-center gap-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-1">
              <Star size={12} />
              <span>{opportunity.repository.starsCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span>{opportunity.repository.language}</span>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-4">
        <span className="text-muted-foreground text-xs">
          Created {new Date(opportunity.createdAt).toLocaleDateString()}
        </span>
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={handleCardClick}>
          <ExternalLink size={12} className="mr-1" />
          View Issue
        </Button>
      </CardFooter>
    </Card>
  )
}
