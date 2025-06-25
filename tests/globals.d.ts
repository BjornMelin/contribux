/**
 * Test environment global types
 */

declare global {
  var __enableMSW: (() => void) | undefined
  var __disableMSW: (() => void) | undefined
}

export {}
