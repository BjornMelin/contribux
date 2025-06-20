/**
 * Next.js Middleware Configuration
 * Applies authentication and security middleware to all routes
 */

import type { NextRequest } from 'next/server'
import { authMiddleware } from '@/lib/auth/middleware'

export async function middleware(request: NextRequest) {
  // Apply authentication middleware
  const response = await authMiddleware(request)

  // If middleware returns a response, use it
  if (response) {
    return response
  }

  // Otherwise, continue to route handler
  return
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
