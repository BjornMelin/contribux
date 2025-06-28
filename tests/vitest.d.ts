/// <reference types="vitest" />

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

// Extend Vitest types for jest-dom matchers (Vitest 3.2+ approach)
declare module 'vitest' {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<T, void> {}
}
