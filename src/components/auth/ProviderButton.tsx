'use client'

import * as LucideIcons from 'lucide-react'

const { Github, Loader2, Mail } = LucideIcons

import { signIn } from 'next-auth/react'
import type React from 'react'
import { useState } from 'react'

export interface ProviderConfig {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  bgColor: string
  hoverColor: string
  textColor: string
}

interface ProviderButtonProps {
  provider: ProviderConfig
  callbackUrl?: string | undefined
  disabled?: boolean
}

export function ProviderButton({ provider, callbackUrl, disabled }: ProviderButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSignIn = async () => {
    try {
      setIsLoading(true)
      await signIn(provider.id, {
        callbackUrl: callbackUrl || '/dashboard',
        redirect: true,
      })
    } catch (error) {
      console.error(`Sign in with ${provider.name} failed:`, error)
      setIsLoading(false)
    }
  }

  const IconComponent = provider.icon

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={disabled || isLoading}
      className={`
        group relative flex w-full justify-center items-center rounded-md px-3 py-3 sm:py-2.5 text-sm font-semibold
        transition-all duration-200 ease-in-out
        ${provider.bgColor} ${provider.hoverColor} ${provider.textColor}
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900
        disabled:opacity-50 disabled:cursor-not-allowed
        shadow-sm hover:shadow-md active:scale-[0.98]
        min-h-[44px] sm:min-h-[40px]
      `}
      aria-label={`Sign in with ${provider.name}`}
    >
      <span className="absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-3">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <IconComponent className="h-5 w-5 sm:h-5 sm:w-5" aria-hidden="true" />
        )}
      </span>

      <span className="flex items-center text-sm sm:text-sm">
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="hidden sm:inline">Redirecting...</span>
            <span className="sm:hidden">Redirecting</span>
          </span>
        ) : (
          <span className="flex items-center">
            <span className="hidden sm:inline">Continue with {provider.name}</span>
            <span className="sm:hidden">{provider.name}</span>
          </span>
        )}
      </span>
    </button>
  )
}

// Predefined provider configurations with dark mode support
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  github: {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    bgColor: 'bg-gray-900 dark:bg-gray-800',
    hoverColor: 'hover:bg-gray-800 dark:hover:bg-gray-700',
    textColor: 'text-white',
  },
  google: {
    id: 'google',
    name: 'Google',
    icon: Mail,
    bgColor: 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600',
    hoverColor: 'hover:bg-gray-50 dark:hover:bg-gray-800',
    textColor: 'text-gray-900 dark:text-white',
  },
}
