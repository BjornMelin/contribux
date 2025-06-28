'use client'

import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { Eye, EyeOff, Github, Loader2, Mail } from 'lucide-react'

import { signIn } from 'next-auth/react'
import type { MouseEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NoSSR } from '@/components/ui/no-ssr'
import { cn } from '@/lib/utils'

// Aurora Button Component
interface AuroraButtonProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
}

const AuroraButton = ({ children, className, onClick, disabled }: AuroraButtonProps) => {
  const radius = 100
  const [visible, setVisible] = useState(false)

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  return (
    <motion.div
      style={{
        background: useMotionTemplate`
          radial-gradient(
            ${visible ? `${radius}px` : '0px'} circle at ${mouseX}px ${mouseY}px,
            var(--blue-500),
            transparent 80%
          )
        `,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className="group/button relative rounded-lg p-[2px] transition duration-300"
    >
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
    </motion.div>
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
      <motion.div
        initial={{ filter: 'blur(10px)', opacity: 0 }}
        animate={{ filter: 'blur(0px)', opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
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
    <motion.span
      initial={{ filter: 'blur(10px)', opacity: 0 }}
      animate={{ filter: 'blur(0px)', opacity: 1 }}
      transition={{
        duration: 1,
        ease: 'easeOut',
        delay,
      }}
      className={className}
    >
      {text}
    </motion.span>
  )
}

// Floating Particles Component
const FloatingParticles = () => {
  const particles = Array.from({ length: 50 }, (_, i) => i)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 })

  useEffect(() => {
    // Set dimensions only on client side
    if (typeof window !== 'undefined') {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })

      const handleResize = () => {
        setDimensions({ width: window.innerWidth, height: window.innerHeight })
      }

      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
    return undefined
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map(particle => (
        <motion.div
          key={particle}
          className="absolute h-1 w-1 rounded-full bg-blue-500/20"
          initial={{
            x: Math.random() * dimensions.width,
            y: Math.random() * dimensions.height,
          }}
          animate={{
            x: Math.random() * dimensions.width,
            y: Math.random() * dimensions.height,
          }}
          transition={{
            duration: Math.random() * 10 + 20,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  )
}

// Main OAuth Sign In Component
const OAuthSignIn = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    setLoadingProvider('github')
    try {
      await signIn('github', { callbackUrl: '/' })
    } catch (_error) {
      setIsLoading(false)
      setLoadingProvider(null)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setLoadingProvider('google')
    try {
      await signIn('google', { callbackUrl: '/' })
    } catch (_error) {
      setIsLoading(false)
      setLoadingProvider(null)
    }
  }

  const handleEmailSignIn = (_email: string, _password: string) => {
    alert('Email authentication is not currently set up. Please use GitHub or Google to sign in.')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Background Effects */}
      <FloatingParticles />

      {/* Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 h-72 w-72 animate-blob rounded-full bg-purple-500/30 opacity-70 mix-blend-multiply blur-xl filter" />
      <div className="absolute top-1/3 right-1/4 h-72 w-72 animate-blob rounded-full bg-yellow-500/30 opacity-70 mix-blend-multiply blur-xl filter [animation-delay:2s]" />
      <div className="absolute bottom-1/4 left-1/3 h-72 w-72 animate-blob rounded-full bg-pink-500/30 opacity-70 mix-blend-multiply blur-xl filter [animation-delay:4s]" />

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

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-gray-600 border-t" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white/10 px-2 text-gray-400">Or continue with email</span>
              </div>
            </div>

            {/* Email Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="space-y-4"
            >
              <div>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="border-white/20 bg-white/10 text-white placeholder:text-gray-400 focus:border-blue-400"
                />
              </div>

              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="border-white/20 bg-white/10 pr-12 text-white placeholder:text-gray-400 focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="-translate-y-1/2 absolute top-1/2 right-3 transform text-gray-400 transition-colors hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <Button
                onClick={() => handleEmailSignIn(email, password)}
                className="w-full bg-blue-600 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
                disabled={!email || !password}
              >
                Sign In with Email
              </Button>
            </motion.div>

            {/* Footer */}
            <motion.div
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
            </motion.div>
          </div>
        </Card>
      </ProgressiveBlur>
    </div>
  )
}

export default function OAuthSignInPage() {
  return (
    <NoSSR
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="w-full max-w-md rounded-lg border border-white/20 bg-white/10 p-8 backdrop-blur-md">
            <div className="text-center">
              <div className="mb-2 font-bold text-3xl text-white">Welcome to contribux</div>
              <div className="text-gray-300 text-sm">Loading sign in options...</div>
            </div>
          </div>
        </div>
      }
    >
      <OAuthSignIn />
    </NoSSR>
  )
}
