/**
 * Critical TransformStream polyfill for Node.js environments
 * Must be loaded before any Vite or MSW modules to prevent initialization errors
 */

// Ensure TransformStream is globally available before any imports
if (typeof TransformStream !== 'undefined') {
  // Node.js 22+ has built-in TransformStream
  globalThis.TransformStream = TransformStream
} else {
  globalThis.TransformStream = class TransformStream {
    constructor() {
      throw new Error('TransformStream not available in this environment')
    }
  }
}

// Also ensure it's available on global for compatibility
if (typeof global !== 'undefined') {
  global.TransformStream = globalThis.TransformStream
}

// Debug logging to confirm polyfill was loaded
if (process.env.DEBUG_TESTS) {
}
