// Filter value types
export type FilterValue = string | number | boolean | string[] | number[] | RangeValue

export interface FilterOption {
  label: string
  value: string | number | boolean
}

export interface RangeValue {
  min?: number
  max?: number
}

export type FilterType = 'select' | 'multiselect' | 'range' | 'toggle'

export interface FilterConfig {
  type: FilterType
  options?: FilterOption[]
  min?: number
  max?: number
}

/**
 * Check if filter value is considered active/non-empty
 */
export function isActiveFilterValue(value: FilterValue | undefined | null): boolean {
  if (value === undefined || value === null || value === '') {
    return false
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(v => v !== undefined && v !== '')
  }

  return true
}

/**
 * Get active filters from filters object
 */
export function getActiveFilters(filters: Record<string, FilterValue>): Array<{
  key: string
  value: FilterValue
  displayValue: string
}> {
  return Object.entries(filters)
    .filter(([_, value]) => isActiveFilterValue(value))
    .map(([key, value]) => ({
      key,
      value,
      displayValue: formatFilterValue(value),
    }))
}

/**
 * Format range value for display
 */
function formatRangeValue(range: RangeValue): string {
  if (range.min !== undefined && range.max !== undefined) {
    return `${range.min} - ${range.max}`
  }
  if (range.min !== undefined) {
    return `≥ ${range.min}`
  }
  if (range.max !== undefined) {
    return `≤ ${range.max}`
  }
  return ''
}

/**
 * Format object value for display
 */
function formatObjectValue(value: object): string {
  if ('min' in value || 'max' in value) {
    return formatRangeValue(value as RangeValue)
  }
  return JSON.stringify(value)
}

/**
 * Format filter value for display
 */
export function formatFilterValue(value: FilterValue): string {
  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (typeof value === 'object' && value !== null) {
    return formatObjectValue(value)
  }

  return String(value)
}

/**
 * Type guard to check if value is a valid multiselect array
 */
function isMultiselectArray(value: unknown): value is Array<string | number | boolean> {
  return (
    Array.isArray(value) &&
    value.every(
      item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    )
  )
}

/**
 * Handle multiselect filter value changes
 */
export function updateMultiselectValue(
  currentValue: FilterValue | undefined,
  optionValue: string | number | boolean,
  checked: boolean
): Array<string | number | boolean> {
  const values = isMultiselectArray(currentValue)
    ? currentValue
    : ([] as Array<string | number | boolean>)

  if (checked) {
    return values.includes(optionValue) ? values : [...values, optionValue]
  }
  return values.filter(v => v !== optionValue)
}

/**
 * Handle range filter value changes
 */
export function updateRangeValue(
  currentValue: FilterValue | undefined,
  field: 'min' | 'max',
  newValue: number | undefined
): RangeValue {
  const rangeValue =
    currentValue && typeof currentValue === 'object' && 'min' in currentValue
      ? (currentValue as RangeValue)
      : { min: undefined, max: undefined }

  return {
    ...rangeValue,
    [field]: newValue,
  }
}

/**
 * Validate range values
 */
export function validateRange(
  range: RangeValue,
  min?: number,
  max?: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (range.min !== undefined && min !== undefined && range.min < min) {
    errors.push(`Minimum value cannot be less than ${min}`)
  }

  if (range.max !== undefined && max !== undefined && range.max > max) {
    errors.push(`Maximum value cannot be greater than ${max}`)
  }

  if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
    errors.push('Minimum value cannot be greater than maximum value')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Create filter options from enum or array
 */
export function createFilterOptions<T extends string | number>(
  values: T[] | Record<T, string>
): FilterOption[] {
  if (Array.isArray(values)) {
    return values.map(value => ({
      label: String(value),
      value,
    }))
  }

  return Object.entries(values).map(([value, label]) => ({
    label: String(label),
    value,
  }))
}

/**
 * Reset specific filter to its default value
 */
export function resetFilter(type: FilterType): FilterValue {
  switch (type) {
    case 'select':
      return ''
    case 'multiselect':
      return []
    case 'range':
      return { min: undefined, max: undefined }
    case 'toggle':
      return false
    default:
      return ''
  }
}

/**
 * Merge filter updates with existing filters
 */
export function mergeFilters<T extends Record<string, FilterValue>>(
  currentFilters: T,
  updates: Partial<T>
): T {
  const merged = { ...currentFilters }

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete merged[key as keyof T]
    } else {
      merged[key as keyof T] = value
    }
  }

  return merged
}

/**
 * Convert filters to URL search params
 */
export function filtersToSearchParams(filters: Record<string, FilterValue>): URLSearchParams {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (isActiveFilterValue(value)) {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, String(v)))
      } else if (typeof value === 'object' && value !== null) {
        params.set(key, JSON.stringify(value))
      } else {
        params.set(key, String(value))
      }
    }
  })

  return params
}

/**
 * Parse filters from URL search params
 */
export function parseFiltersFromSearchParams(
  params: URLSearchParams,
  filterConfigs: Record<string, FilterConfig>
): Record<string, FilterValue> {
  const filters: Record<string, FilterValue> = {}

  Object.entries(filterConfigs).forEach(([key, config]) => {
    const values = params.getAll(key)

    if (values.length === 0) return

    switch (config.type) {
      case 'multiselect':
        filters[key] = values
        break
      case 'range':
        try {
          filters[key] = JSON.parse(values[0])
        } catch {
          // Invalid JSON, skip
        }
        break
      case 'toggle':
        filters[key] = values[0] === 'true'
        break
      default:
        filters[key] = values[0]
    }
  })

  return filters
}
