import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setPrimaryProvider } from '@/lib/auth/helpers'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, provider } = await request.json()

    // Ensure user can only modify their own data
    if (!userId || userId !== session.user.id || !provider) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    await setPrimaryProvider(userId, provider)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error setting primary provider:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
