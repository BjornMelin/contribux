/**
 * Demo Sign-In API Endpoint
 * Creates a mock authentication session for development testing
 */

import { SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

// Demo user data for testing
const DEMO_USERS = {
  github: {
    id: 'demo-github-123',
    name: 'Demo GitHub User',
    email: 'demo@github.com',
    image: 'https://github.com/github.png',
    provider: 'github',
  },
  google: {
    id: 'demo-google-456',
    name: 'Demo Google User',
    email: 'demo@google.com',
    image: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
    provider: 'google',
  },
}

export async function POST(request: NextRequest) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'Demo authentication only available in development' },
        { status: 403 }
      )
    }

    const { provider } = await request.json()

    if (!provider || !DEMO_USERS[provider as keyof typeof DEMO_USERS]) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const user = DEMO_USERS[provider as keyof typeof DEMO_USERS]

    // Create a simple JWT token for the demo session
    const secret = new TextEncoder().encode(
      process.env.NEXTAUTH_SECRET || 'development-secret-key-at-least-32-characters-long'
    )

    const token = await new SignJWT({
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
      provider: user.provider,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret)

    // Set the session cookie
    const cookieStore = await cookies()
    cookieStore.set('next-auth.session-token', token, {
      httpOnly: true,
      secure: false, // false for development
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        provider: user.provider,
      },
    })
  } catch (error) {
    // Demo sign-in error handled
    return NextResponse.json({ error: 'Demo sign-in failed' }, { status: 500 })
  }
}
