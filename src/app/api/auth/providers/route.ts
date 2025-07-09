import { auth } from '@/lib/auth'
import { getUserProviders } from '@/lib/auth/helpers'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // In development mode with demo providers, auth might not be fully functional
    let session: any = null
    let authError: any = null

    try {
      if (typeof auth === 'function') {
        session = await auth()
      }
    } catch (error) {
      authError = error
      console.warn('Auth function not available, running in demo mode:', error)
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    // In development mode, allow demo access
    if (process.env.NODE_ENV === 'development') {
      // If no valid session but we have a userId parameter, simulate demo session
      if (!session?.user?.id && userId) {
        // Return demo providers for development testing
        const providers = ['github', 'google']
        return NextResponse.json({ providers })
      }
    }

    // Require authentication for production
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ensure user can only access their own data
    if (!userId || userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let providers: string[] = []

    // In development mode, return demo providers based on session
    if (process.env.NODE_ENV === 'development') {
      // Return demo provider based on the session provider
      if (session.provider) {
        providers = [session.provider]
      } else {
        // Default demo providers available
        providers = ['github', 'google']
      }
    } else {
      // In production, use the database-backed helper
      providers = await getUserProviders(userId)
    }

    return NextResponse.json({ providers })
  } catch (error) {
    console.error('Providers endpoint error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
