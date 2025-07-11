/**
 * Type declarations for Next.js Request extensions
 * Provides additional properties for NextRequest
 */

import { NextRequest as OriginalNextRequest } from 'next/server'

declare module 'next/server' {
  interface NextRequest extends OriginalNextRequest {
    ip?: string
  }
}
