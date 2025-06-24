'use client'

import React from 'react'
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
    <div
      className={`opportunity-card bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View opportunity: ${opportunity.title}`}
      data-testid={`opportunity-${opportunity.id}`}
    >
      <div className="opportunity-header mb-4">
        <h3 className="opportunity-title text-lg font-semibold text-gray-900 mb-2">
          {opportunity.title}
        </h3>
        <div className="opportunity-meta flex gap-2">
          <span
            className={`difficulty-badge ${opportunity.difficulty} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800`}
          >
            {opportunity.difficulty}
          </span>
          <span
            className={`type-badge ${opportunity.type} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800`}
          >
            {opportunity.type.replace('_', ' ')}
          </span>
        </div>
      </div>

      {opportunity.description && (
        <p className="opportunity-description text-gray-600 text-sm mb-4 leading-relaxed">
          {opportunity.description.length > 150
            ? `${opportunity.description.substring(0, 150)}...`
            : opportunity.description}
        </p>
      )}

      <div className="opportunity-details space-y-4">
        <div className="repository-info">
          <div className="flex items-center justify-between mb-2">
            <span className="repository-name text-sm font-medium text-gray-900">
              {opportunity.repository.full_name}
            </span>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              {opportunity.repository.language && (
                <span className="repository-language">{opportunity.repository.language}</span>
              )}
              <span className="repository-stars flex items-center">
                ⭐ {opportunity.repository.stars_count}
              </span>
            </div>
          </div>
        </div>

        <div className="opportunity-tags flex flex-wrap gap-2">
          {opportunity.good_first_issue && (
            <span className="tag good-first-issue inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800">
              Good First Issue
            </span>
          )}
          {opportunity.help_wanted && (
            <span className="tag help-wanted inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-orange-100 text-orange-800">
              Help Wanted
            </span>
          )}
          {opportunity.estimated_hours && (
            <span className="tag estimated-time inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
              {opportunity.estimated_hours}h
            </span>
          )}
        </div>

        <div className="opportunity-skills">
          <div className="flex flex-wrap gap-1 mb-2">
            {opportunity.technologies.slice(0, 3).map(tech => (
              <span
                key={tech}
                className="skill-tag inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-800"
              >
                {tech}
              </span>
            ))}
            {opportunity.technologies.length > 3 && (
              <span className="skill-tag more inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                +{opportunity.technologies.length - 3} more
              </span>
            )}
          </div>
        </div>

        <div className="relevance-score flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="score-label text-sm text-gray-500">Relevance:</span>
          <span className="score-value text-sm font-medium text-gray-900">
            {(opportunity.relevance_score * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  )
}
