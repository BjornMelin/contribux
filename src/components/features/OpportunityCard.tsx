'use client'

import type React from 'react'
import type { OpportunityCardProps } from '@/types/search'

export function OpportunityCard({ opportunity, onSelect, className = '' }: OpportunityCardProps) {
  const handleClick = () => {
    onSelect(opportunity)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(opportunity)
    }
  }

  return (
    <button
      type="button"
      className={`opportunity-card w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-6 text-left transition-all hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View opportunity: ${opportunity.title}`}
      data-testid={`opportunity-${opportunity.id}`}
    >
      <div className="opportunity-header mb-4">
        <h3 className="opportunity-title mb-2 font-semibold text-gray-900 text-lg">
          {opportunity.title}
        </h3>
        <div className="opportunity-meta flex gap-2">
          <span
            className={`difficulty-badge ${opportunity.difficulty} inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 font-medium text-blue-800 text-xs`}
          >
            {opportunity.difficulty}
          </span>
          <span
            className={`type-badge ${opportunity.type} inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 font-medium text-green-800 text-xs`}
          >
            {opportunity.type.replace('_', ' ')}
          </span>
        </div>
      </div>

      {opportunity.description && (
        <p className="opportunity-description mb-4 text-gray-600 text-sm leading-relaxed">
          {opportunity.description.length > 150
            ? `${opportunity.description.substring(0, 150)}...`
            : opportunity.description}
        </p>
      )}

      <div className="opportunity-details space-y-4">
        <div className="repository-info">
          <div className="mb-2 flex items-center justify-between">
            <span className="repository-name font-medium text-gray-900 text-sm">
              {opportunity.repository.fullName}
            </span>
            <div className="flex items-center gap-3 text-gray-500 text-sm">
              {opportunity.repository.language && (
                <span className="repository-language">{opportunity.repository.language}</span>
              )}
              <span className="repository-stars flex items-center">
                ⭐ {opportunity.repository.starsCount}
              </span>
            </div>
          </div>
        </div>

        <div className="opportunity-tags flex flex-wrap gap-2">
          {opportunity.goodFirstIssue && (
            <span className="tag good-first-issue inline-flex items-center rounded-md bg-purple-100 px-2 py-1 font-medium text-purple-800 text-xs">
              Good First Issue
            </span>
          )}
          {opportunity.helpWanted && (
            <span className="tag help-wanted inline-flex items-center rounded-md bg-orange-100 px-2 py-1 font-medium text-orange-800 text-xs">
              Help Wanted
            </span>
          )}
          {opportunity.estimatedHours && (
            <span className="tag estimated-time inline-flex items-center rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-800 text-xs">
              {opportunity.estimatedHours}h
            </span>
          )}
        </div>

        <div className="opportunity-skills">
          <div className="mb-2 flex flex-wrap gap-1">
            {opportunity.technologies.slice(0, 3).map(tech => (
              <span
                key={tech}
                className="skill-tag inline-flex items-center rounded bg-indigo-100 px-2 py-1 font-medium text-indigo-800 text-xs"
              >
                {tech}
              </span>
            ))}
            {opportunity.technologies.length > 3 && (
              <span className="skill-tag more inline-flex items-center rounded bg-gray-100 px-2 py-1 font-medium text-gray-600 text-xs">
                +{opportunity.technologies.length - 3} more
              </span>
            )}
          </div>
        </div>

        <div className="relevance-score flex items-center justify-between border-gray-100 border-t pt-2">
          <span className="score-label text-gray-500 text-sm">Relevance:</span>
          <span className="score-value font-medium text-gray-900 text-sm">
            {(opportunity.relevanceScore * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </button>
  )
}
