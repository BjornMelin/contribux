'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { LinkedAccounts } from '@/components/auth/LinkedAccounts'

export default function AccountSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

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
  }, [searchParams, router])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Account Settings</h1>
            <p className="text-muted-foreground mt-2">
              Manage your authentication providers and account preferences
            </p>
          </div>

          {/* Success Message */}
          <AnimatePresence>
            {showSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="mb-6 bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5" />
                  <p className="text-sm font-medium">Account successfully linked!</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSuccessMessage(false)}
                  className="text-green-700 dark:text-green-400 hover:opacity-70 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <LinkedAccounts userId={session.user.id} />
        </div>
      </div>
    </div>
  )
}
