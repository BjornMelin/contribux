/**
 * Critical TransformStream polyfill for Node.js environments
 * Must be loaded before any Vite or MSW modules to prevent initialization errors
 */

// Ensure TransformStream is globally available before any imports
if (typeof TransformStream !== 'undefined') {
  // Node.js 22+ has built-in TransformStream
  globalThis.TransformStream = TransformStream
} else {
  // Fallback for older Node.js versions (though we're on 22.15.1)
  console.warn('TransformStream not found in Node.js, creating fallback')
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
  console.log('TransformStream polyfill loaded:', typeof globalThis.TransformStream)
}