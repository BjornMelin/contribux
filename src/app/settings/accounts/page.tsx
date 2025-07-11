'use client'

// Force dynamic rendering for authentication-dependent page
export const dynamic = 'force-dynamic'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LinkedAccounts } from '@/components/auth/LinkedAccounts'
import { Check, X } from '@/components/icons'
import { MotionDiv, OptimizedAnimatePresence } from '@/components/motion'
import { useSession } from '@/components/providers/app-providers'

export default function AccountSettingsPage() {
  const sessionResult = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  // Safe destructuring with defaults
  const session = sessionResult?.data || null
  const status = sessionResult?.status || 'loading'

  // Check for successful linking
  useEffect(() => {
    if (searchParams.get('linked') === 'true') {
      setShowSuccessMessage(true)
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowSuccessMessage(false)
        // Clean up URL
        router.replace('/settings/accounts')
      }, 5000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [searchParams, router])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="font-bold text-3xl text-foreground">Account Settings</h1>
            <p className="mt-2 text-muted-foreground">
              Manage your authentication providers and account preferences
            </p>
          </div>

          {/* Success Message */}
          <OptimizedAnimatePresence>
            {showSuccessMessage && (
              <MotionDiv
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="mb-6 flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-green-700 dark:text-green-400"
              >
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5" />
                  <p className="font-medium text-sm">Account successfully linked!</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSuccessMessage(false)}
                  className="text-green-700 transition-opacity hover:opacity-70 dark:text-green-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </MotionDiv>
            )}
          </OptimizedAnimatePresence>

          <LinkedAccounts userId={session.user.id} />
        </div>
      </div>
    </div>
  )
}
