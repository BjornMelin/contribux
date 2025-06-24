import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPrimaryProvider } from '@/lib/auth/helpers'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    // Ensure user can only access their own data
    if (!userId || userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const primaryProvider = await getPrimaryProvider(userId)
    return NextResponse.json({ primaryProvider })
  } catch (error) {
    console.error('Error fetching primary provider:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
