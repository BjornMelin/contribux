import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canUnlinkProvider } from '@/lib/auth/helpers'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const provider = searchParams.get('provider')

    // Ensure user can only access their own data
    if (!userId || userId !== session.user.id || !provider) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const canUnlink = await canUnlinkProvider(userId, provider)
    return NextResponse.json({ canUnlink })
  } catch (error) {
    console.error('Error checking unlink capability:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
