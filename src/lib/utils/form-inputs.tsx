/**
 * Form Input Utilities
 * Pure functions and renderers for different input types
 */

import type React from 'react'
import type { ReactElement } from 'react'
import type { FilterOption, RangeValue } from './search-filters'

// Form value types
export type FormValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[]
  | RangeValue
  | undefined
  | null

export interface InputRendererProps {
  value: FormValue
  onChange: (value: FormValue) => void
  disabled?: boolean
  className?: string
}

export interface SelectRendererProps extends InputRendererProps {
  options: FilterOption[]
  placeholder?: string
}

export interface RangeRendererProps extends InputRendererProps {
  min?: number
  max?: number
  placeholder?: { min?: string; max?: string }
}

export interface ToggleRendererProps extends InputRendererProps {
  label: string
}

/**
 * Render select dropdown options
 */
export function renderSelectOptions(
  options: FilterOption[],
  includeEmpty = true,
  emptyLabel = 'All'
): ReactElement[] {
  const elements: ReactElement[] = []

  if (includeEmpty) {
    elements.push(
      <option key="" value="">
        {emptyLabel}
      </option>
    )
  }

  elements.push(
    ...options.map(option => (
      <option key={String(option.value)} value={String(option.value)}>
        {option.label}
      </option>
    ))
  )

  return elements
}

/**
 * Handle select change events
 */
export function handleSelectChange(
  event: React.ChangeEvent<HTMLSelectElement>,
  onChange: (value: string) => void
): void {
  onChange(event.target.value)
}

/**
 * Handle multiselect checkbox changes
 */
export function handleMultiselectChange(
  optionValue: string | number | boolean,
  checked: boolean,
  currentValue: FormValue,
  onChange: (value: Array<string | number | boolean>) => void
): void {
  const values = Array.isArray(currentValue) ? currentValue : []
  const newValues = checked
    ? [...values, optionValue]
    : values.filter((v: string | number | boolean) => v !== optionValue)
  onChange(newValues)
}

/**
 * Handle range input changes
 */
export function handleRangeChange(
  field: 'min' | 'max',
  event: React.ChangeEvent<HTMLInputElement>,
  currentValue: FormValue,
  onChange: (value: RangeValue) => void
): void {
  const numValue = Number(event.target.value)
  const value = Number.isNaN(numValue) ? undefined : numValue

  const rangeValue =
    currentValue && typeof currentValue === 'object' && 'min' in currentValue
      ? (currentValue as RangeValue)
      : { min: undefined, max: undefined }

  onChange({
    ...rangeValue,
    [field]: value,
  })
}

/**
 * Handle toggle/checkbox changes
 */
export function handleToggleChange(
  event: React.ChangeEvent<HTMLInputElement>,
  onChange: (value: boolean) => void
): void {
  onChange(event.target.checked)
}

/**
 * Get input value for controlled components
 */
export function getInputValue(value: FormValue, type: 'text' | 'number'): string {
  if (value === undefined || value === null) {
    return ''
  }

  if (type === 'number') {
    return Number.isNaN(Number(value)) ? '' : String(value)
  }

  return String(value)
}

/**
 * Get checked state for checkboxes
 */
export function getCheckedState(
  value: FormValue,
  optionValue?: string | number | boolean,
  defaultChecked = false
): boolean {
  if (optionValue !== undefined) {
    // For multiselect checkboxes
    return Array.isArray(value) ? (value as any[]).includes(optionValue) : false
  }

  // For toggle checkboxes
  return typeof value === 'boolean' ? value : defaultChecked
}

/**
 * Validate input constraints
 */
export function validateInput(
  value: FormValue,
  constraints: {
    required?: boolean
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    pattern?: RegExp
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (constraints.required && (value === undefined || value === null || value === '')) {
    errors.push('This field is required')
  }

  if (value !== undefined && value !== null && value !== '') {
    if (constraints.min !== undefined && Number(value) < constraints.min) {
      errors.push(`Value must be at least ${constraints.min}`)
    }

    if (constraints.max !== undefined && Number(value) > constraints.max) {
      errors.push(`Value must be at most ${constraints.max}`)
    }

    const stringValue = String(value)

    if (constraints.minLength !== undefined && stringValue.length < constraints.minLength) {
      errors.push(`Must be at least ${constraints.minLength} characters`)
    }

    if (constraints.maxLength !== undefined && stringValue.length > constraints.maxLength) {
      errors.push(`Must be at most ${constraints.maxLength} characters`)
    }

    if (constraints.pattern && !constraints.pattern.test(stringValue)) {
      errors.push('Invalid format')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Create input event handlers object
 */
export function createInputHandlers<T extends Record<string, FormValue>>(
  onChange: (key: keyof T, value: FormValue) => void,
  getCurrentValue: (key: keyof T) => FormValue
) {
  return {
    text: (key: keyof T) => (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(key, event.target.value)
    },

    number: (key: keyof T) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value)
      onChange(key, Number.isNaN(value) ? undefined : value)
    },

    select: (key: keyof T) => (event: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(key, event.target.value)
    },

    checkbox: (key: keyof T) => (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(key, event.target.checked)
    },

    multiselect:
      (key: keyof T, optionValue: string | number | boolean) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const currentValue = getCurrentValue(key)
        handleMultiselectChange(optionValue, event.target.checked, currentValue, value => {
          onChange(key, value as FormValue)
        })
      },

    range: (key: keyof T, field: 'min' | 'max') => (event: React.ChangeEvent<HTMLInputElement>) => {
      const currentValue = getCurrentValue(key)
      handleRangeChange(field, event, currentValue, value => {
        onChange(key, value)
      })
    },
  }
}

/**
 * Debounce input changes
 */
export function createDebouncedHandler<T extends readonly unknown[]>(
  handler: (...args: T) => void,
  delay = 300
): (...args: T) => void {
  let timeoutId: NodeJS.Timeout

  return (...args: T) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => handler(...args), delay)
  }
}
