'use client'

import React from 'react'
import { PROVIDER_CONFIGS, ProviderButton } from '@/components/auth/ProviderButton'

interface SignInButtonProps {
  callbackUrl?: string | undefined
}

export function SignInButton({ callbackUrl }: SignInButtonProps) {
  const providers = ['github', 'google']

  return (
    <div className="space-y-3">
      {providers.map((providerId, index) => {
        const providerConfig = PROVIDER_CONFIGS[providerId]
        if (!providerConfig) return null

        return (
          <div key={providerId}>
            <ProviderButton provider={providerConfig} callbackUrl={callbackUrl} />

            {/* Add "Or" divider between providers (except after the last one) */}
            {index < providers.length - 1 && (
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-gray-50 dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
                    Or
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
