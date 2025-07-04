/**
 * Search Filter Components
 * Optimized with React.memo and useMemo for performance
 */

'use client'

import type React from 'react'
import { memo, useCallback, useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import type { PropsWithClassName } from '@/lib/types/advanced'

import { useSearch } from './search-context'

// Helper types for filter renderers
export interface FilterOption {
  label: string
  value: string | number
}

export interface RangeValue {
  min?: number
  max?: number
}

// Filter component
interface SearchFilterProps extends PropsWithClassName {
  label: string
  filterKey: string
  type?: 'select' | 'multiselect' | 'range' | 'toggle'
  options?: FilterOption[]
  min?: number
  max?: number
}

export const SearchFilter = memo<SearchFilterProps>(function SearchFilter({
  label,
  filterKey,
  type = 'select',
  options = [],
  min,
  max,
  className,
}) {
  const { filters, onFilterChange } = useSearch()
  const currentValue = filters[filterKey]

  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFilterChange(filterKey, e.target.value)
    },
    [filterKey, onFilterChange]
  )

  const handleCheckboxChange = useCallback(
    (option: FilterOption, checked: boolean) => {
      const values = Array.isArray(currentValue) ? currentValue : []
      const newValues = checked
        ? [...values, option.value]
        : values.filter((v: string | number) => v !== option.value)
      onFilterChange(filterKey, newValues)
    },
    [filterKey, onFilterChange, currentValue]
  )

  const handleRangeChange = useCallback(
    (field: 'min' | 'max', value: string) => {
      const rangeValue =
        currentValue && typeof currentValue === 'object' && 'min' in currentValue
          ? (currentValue as { min?: number; max?: number })
          : { min: undefined, max: undefined }

      onFilterChange(filterKey, {
        ...rangeValue,
        [field]: Number(value) || undefined,
      })
    },
    [filterKey, onFilterChange, currentValue]
  )

  const handleToggleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange(filterKey, e.target.checked)
    },
    [filterKey, onFilterChange]
  )

  const inputId = `filter-${filterKey}`

  const renderFilter = useMemo(() => {
    switch (type) {
      case 'select':
        return (
          <select
            id={inputId}
            value={typeof currentValue === 'string' ? currentValue : ''}
            onChange={handleSelectChange}
            className="rounded border px-2 py-1"
          >
            <option value="">All</option>
            {options.map(option => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        )

      case 'multiselect':
        return (
          <div className="space-y-1">
            {options.map(option => (
              <label key={String(option.value)} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={
                    Array.isArray(currentValue) ? currentValue.includes(option.value) : false
                  }
                  onChange={e => handleCheckboxChange(option, e.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        )

      case 'range': {
        const rangeValue =
          currentValue && typeof currentValue === 'object' && 'min' in currentValue
            ? (currentValue as { min?: number; max?: number })
            : { min: undefined, max: undefined }
        return (
          <div className="flex items-center space-x-2">
            <input
              type="number"
              placeholder="Min"
              min={min}
              max={max}
              value={rangeValue.min || ''}
              onChange={e => handleRangeChange('min', e.target.value)}
              className="w-20 rounded border px-2 py-1"
            />
            <span>-</span>
            <input
              type="number"
              placeholder="Max"
              min={min}
              max={max}
              value={rangeValue.max || ''}
              onChange={e => handleRangeChange('max', e.target.value)}
              className="w-20 rounded border px-2 py-1"
            />
          </div>
        )
      }

      case 'toggle':
        return (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={typeof currentValue === 'boolean' ? currentValue : false}
              onChange={handleToggleChange}
            />
            <span>{label}</span>
          </label>
        )

      default:
        return null
    }
  }, [
    type,
    currentValue,
    options,
    min,
    max,
    label,
    handleSelectChange,
    handleCheckboxChange,
    handleRangeChange,
    handleToggleChange,
    inputId,
  ])

  return (
    <div className={`search-filter ${className || ''}`}>
      {type !== 'toggle' && (
        <label htmlFor={inputId} className="mb-1 block font-medium text-sm">
          {label}
        </label>
      )}
      {renderFilter}
    </div>
  )
})

// Active filters display
export const SearchActiveFilters = memo<PropsWithClassName>(function SearchActiveFilters({
  className,
}) {
  const { filters, onFilterChange } = useSearch()

  const activeFilters = useMemo(() => {
    return Object.entries(filters).filter(([_, value]) => {
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(v => v !== undefined && v !== '')
      }
      return value !== undefined && value !== '' && value !== null
    })
  }, [filters])

  const handleRemoveFilter = useCallback(
    (key: string) => {
      onFilterChange(key, undefined)
    },
    [onFilterChange]
  )

  if (activeFilters.length === 0) return null

  return (
    <div className={`search-active-filters ${className || ''}`}>
      <span className="font-medium text-sm">Active filters:</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {activeFilters.map(([key, value]) => (
          <Badge
            key={key}
            variant="secondary"
            className="cursor-pointer"
            onClick={() => handleRemoveFilter(key)}
          >
            {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
            <span className="ml-1">&times;</span>
          </Badge>
        ))}
      </div>
    </div>
  )
})
