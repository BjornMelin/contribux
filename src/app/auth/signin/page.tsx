'use client'

import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import * as LucideIcons from 'lucide-react'

const { Eye, EyeOff, Github, Loader2, Mail } = LucideIcons

import { signIn } from 'next-auth/react'
import type * as React from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Aurora Button Component
interface AuroraButtonProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
}

const AuroraButton = ({ children, className, onClick, disabled }: AuroraButtonProps) => {
  const radius = 100
  const [visible, setVisible] = useState(false)

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) {
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
      className="group/button p-[2px] rounded-lg transition duration-300 relative"
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'relative flex items-center justify-center w-full rounded-[6px] px-4 py-2',
          'bg-zinc-900 text-white transition duration-200',
          'group-hover/button:bg-transparent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
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
  children: React.ReactNode
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
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(particle => (
        <motion.div
          key={particle}
          className="absolute w-1 h-1 bg-blue-500/20 rounded-full"
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
      await signIn('google', { callbackUrl: '/' })
    } catch (error) {
      console.error('Google sign-in failed:', error)
      setIsLoading(false)
      setLoadingProvider(null)
    }
  }

  const handleEmailSignIn = (_email: string, _password: string) => {
    alert('Email authentication is not currently set up. Please use GitHub or Google to sign in.')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <FloatingParticles />

      {/* Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" />
      <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-yellow-500/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob [animation-delay:2s]" />
      <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-pink-500/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob [animation-delay:4s]" />

      <ProgressiveBlur>
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20 shadow-2xl">
          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <BlurText
                text="Welcome to contribux"
                className="text-3xl font-bold text-white mb-2"
                delay={0.2}
              />
              <BlurText
                text="Discover and contribute to impactful open source projects"
                className="text-gray-300 text-sm"
                delay={0.4}
              />
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-4 mb-6">
              <AuroraButton onClick={handleGitHubSignIn} disabled={isLoading} className="h-12">
                <div className="flex items-center justify-center space-x-3">
                  {loadingProvider === 'github' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Github className="w-5 h-5" />
                  )}
                  <span>Continue with GitHub</span>
                </div>
              </AuroraButton>

              <AuroraButton onClick={handleGoogleSignIn} disabled={isLoading} className="h-12">
                <div className="flex items-center justify-center space-x-3">
                  {loadingProvider === 'google' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mail className="w-5 h-5" />
                  )}
                  <span>Continue with Google</span>
                </div>
              </AuroraButton>
            </div>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white/10 text-gray-400">Or continue with email</span>
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
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:border-blue-400"
                />
              </div>

              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:border-blue-400 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <Button
                onClick={() => handleEmailSignIn(email, password)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 transition-colors"
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
              className="mt-6 text-center text-xs text-gray-400"
            >
              By signing in, you agree to our{' '}
              <a href="/legal/terms" className="text-blue-400 hover:text-blue-300 underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/legal/privacy" className="text-blue-400 hover:text-blue-300 underline">
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
  return <OAuthSignIn />
}
