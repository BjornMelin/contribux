/**
 * Session API Endpoint
 * Returns the current session status for demo authentication
 */

import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('next-auth.session-token')

    if (!sessionToken) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    try {
      // Verify the JWT token
      const secret = new TextEncoder().encode(
        process.env.NEXTAUTH_SECRET || 'development-secret-key-at-least-32-characters-long'
      )
      const { payload } = await jwtVerify(sessionToken.value, secret)

      return NextResponse.json({
        user: {
          id: payload.sub,
          name: payload.name,
          email: payload.email,
          image: payload.picture,
        },
        expires: new Date((payload.exp as number) * 1000).toISOString(),
      })
    } catch (error) {
      // Invalid token
      return NextResponse.json({ user: null }, { status: 200 })
    }
  } catch (error) {
    console.error('Session check failed:', error)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}
