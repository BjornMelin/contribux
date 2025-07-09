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
 * Type guard for multiselect array values
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
 * Get checked state for checkboxes
 */
export function getCheckedState(
  value: FormValue,
  optionValue?: string | number | boolean,
  defaultChecked = false
): boolean {
  if (optionValue !== undefined) {
    // For multiselect checkboxes
    return isMultiselectArray(value)
      ? (value as Array<string | number | boolean>).includes(optionValue)
      : false
  }

  // For toggle checkboxes
  return typeof value === 'boolean' ? value : defaultChecked
}

/**
 * Check if value is empty/null/undefined
 */
function isEmpty(value: FormValue): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Validate required field constraint
 */
function validateRequired(value: FormValue, required?: boolean): string[] {
  if (required && isEmpty(value)) {
    return ['This field is required']
  }
  return []
}

/**
 * Validate numeric min/max constraints
 */
function validateNumericRange(value: FormValue, min?: number, max?: number): string[] {
  const errors: string[] = []
  const numValue = Number(value)

  if (min !== undefined && numValue < min) {
    errors.push(`Value must be at least ${min}`)
  }

  if (max !== undefined && numValue > max) {
    errors.push(`Value must be at most ${max}`)
  }

  return errors
}

/**
 * Validate string length constraints
 */
function validateStringLength(value: FormValue, minLength?: number, maxLength?: number): string[] {
  const errors: string[] = []
  const stringValue = String(value)

  if (minLength !== undefined && stringValue.length < minLength) {
    errors.push(`Must be at least ${minLength} characters`)
  }

  if (maxLength !== undefined && stringValue.length > maxLength) {
    errors.push(`Must be at most ${maxLength} characters`)
  }

  return errors
}

/**
 * Validate pattern matching constraint
 */
function validatePattern(value: FormValue, pattern?: RegExp): string[] {
  if (pattern && !pattern.test(String(value))) {
    return ['Invalid format']
  }
  return []
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

  // Check required constraint
  errors.push(...validateRequired(value, constraints.required))

  // Skip other validations if value is empty (but not required)
  if (isEmpty(value)) {
    return { valid: errors.length === 0, errors }
  }

  // Validate numeric constraints
  errors.push(...validateNumericRange(value, constraints.min, constraints.max))

  // Validate string length constraints
  errors.push(...validateStringLength(value, constraints.minLength, constraints.maxLength))

  // Validate pattern constraint
  errors.push(...validatePattern(value, constraints.pattern))

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
