/// <reference types="vitest" />

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

// Extend Vitest types for jest-dom matchers (Vitest 4.1+ approach)
declare module 'vitest' {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<T, void> {}
}
