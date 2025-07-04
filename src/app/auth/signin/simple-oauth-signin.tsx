/**
 * Simple OAuth Sign-In Component
 * Direct OAuth flow without NextAuth client dependencies
 */

'use client'

import { MotionDiv } from '@/components/motion'
import { Github, Loader2, Mail } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useSession } from '@/components/providers/app-providers'
import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'

// Aurora Button Component
interface AuroraButtonProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
}

const AuroraButton = ({ children, className, onClick, disabled }: AuroraButtonProps) => {
  const [visible, setVisible] = useState(false)

  return (
    <div
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className="group/button relative rounded-lg p-[2px] transition duration-300"
    >
      <div
        className={cn(
          'absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300',
          visible && 'opacity-100'
        )}
        style={{
          background: 'radial-gradient(circle at center, rgb(59, 130, 246), transparent 80%)',
        }}
      />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'relative flex w-full items-center justify-center rounded-[6px] px-4 py-2',
          'bg-zinc-900 text-white transition duration-200',
          'group-hover/button:bg-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        {children}
      </button>
    </div>
  )
}

// Progressive Blur Component
interface ProgressiveBlurProps {
  children: ReactNode
  className?: string
}

const ProgressiveBlur = ({ children, className }: ProgressiveBlurProps) => {
  return (
    <div className={cn('relative', className)}>
      <MotionDiv
        initial={{ filter: 'blur(10px)', opacity: 0 }}
        animate={{ filter: 'blur(0px)', opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      >
        {children}
      </MotionDiv>
    </div>
  )
}

// Blur Text Component
interface BlurTextProps {
  text: string
  className?: string
  delay?: number
}

const BlurText = ({ text, className, delay = 0 }: BlurTextProps) => {
  return (
    <span className={cn('inline-block', className)}>
      <MotionDiv
        initial={{ filter: 'blur(10px)', opacity: 0 }}
        animate={{ filter: 'blur(0px)', opacity: 1 }}
        transition={{
          duration: 1,
          ease: 'easeOut',
          delay,
        }}
        className="inline-block"
      >
        {text}
      </MotionDiv>
    </span>
  )
}

// Main Simple OAuth Sign In Component
export const SimpleOAuthSignIn = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const { signIn, status } = useSession()

  // Redirect if already authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      window.location.href = '/'
    }
  }, [status])

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    setLoadingProvider('github')
    
    try {
      await signIn('github')
      // Redirect will happen via useEffect when status changes
      window.location.href = '/'
    } catch (error) {
      console.error('GitHub sign-in failed:', error)
      setIsLoading(false)
      setLoadingProvider(null)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setLoadingProvider('google')
    
    try {
      await signIn('google')
      // Redirect will happen via useEffect when status changes
      window.location.href = '/'
    } catch (error) {
      console.error('Google sign-in failed:', error)
      setIsLoading(false)
      setLoadingProvider(null)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Background gradient orbs */}
      <div className="absolute top-1/4 left-1/4 h-72 w-72 animate-pulse rounded-full bg-purple-500/30 opacity-70 mix-blend-multiply blur-xl filter" />
      <div className="absolute top-1/3 right-1/4 h-72 w-72 animate-pulse rounded-full bg-yellow-500/30 opacity-70 mix-blend-multiply blur-xl filter [animation-delay:2s]" />
      <div className="absolute bottom-1/4 left-1/3 h-72 w-72 animate-pulse rounded-full bg-pink-500/30 opacity-70 mix-blend-multiply blur-xl filter [animation-delay:4s]" />

      <ProgressiveBlur>
        <Card className="w-full max-w-md border-white/20 bg-white/10 shadow-2xl backdrop-blur-md">
          <div className="p-8">
            {/* Header */}
            <div className="mb-8 text-center">
              <BlurText
                text="Welcome to contribux"
                className="mb-2 font-bold text-3xl text-white"
                delay={0.2}
              />
              <BlurText
                text="Discover and contribute to impactful open source projects"
                className="text-gray-300 text-sm"
                delay={0.4}
              />
            </div>

            {/* OAuth Buttons */}
            <div className="mb-6 space-y-4">
              <AuroraButton onClick={handleGitHubSignIn} disabled={isLoading} className="h-12">
                <div className="flex items-center justify-center space-x-3">
                  {loadingProvider === 'github' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Github className="h-5 w-5" />
                  )}
                  <span>Continue with GitHub</span>
                </div>
              </AuroraButton>

              <AuroraButton onClick={handleGoogleSignIn} disabled={isLoading} className="h-12">
                <div className="flex items-center justify-center space-x-3">
                  {loadingProvider === 'google' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mail className="h-5 w-5" />
                  )}
                  <span>Continue with Google</span>
                </div>
              </AuroraButton>
            </div>

            {/* Footer */}
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="mt-6 text-center text-gray-400 text-xs"
            >
              By signing in, you agree to our{' '}
              <a href="/legal/terms" className="text-blue-400 underline hover:text-blue-300">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/legal/privacy" className="text-blue-400 underline hover:text-blue-300">
                Privacy Policy
              </a>
            </MotionDiv>
          </div>
        </Card>
      </ProgressiveBlur>
    </div>
  )
}