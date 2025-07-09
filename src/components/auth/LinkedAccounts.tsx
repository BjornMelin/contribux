'use client'

import { AlertTriangle, Check, Github, Link2, Mail, Shield, Star, Unlink2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { MotionDiv } from '@/components/motion'
import { useSession } from '@/components/providers/app-providers'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
// Client-side helper functions for OAuth management
import { cn } from '@/lib/utils'

interface OAuthProvider {
  id: string
  name: string
  icon: ReactNode
  color: string
  gradientFrom: string
  gradientTo: string
  isLinked: boolean
  isPrimary?: boolean
  email?: string | undefined
  connectedAt?: string | undefined
}

interface LinkedAccountsProps {
  userId: string
  className?: string
}

const PROVIDER_CONFIGS = {
  github: {
    name: 'GitHub',
    icon: <Github className="h-5 w-5" />,
    color: '#24292e',
    gradientFrom: '#24292e',
    gradientTo: '#586069',
  },
  google: {
    name: 'Google',
    icon: <Mail className="h-5 w-5" />,
    color: '#4285f4',
    gradientFrom: '#4285f4',
    gradientTo: '#34a853',
  },
}

export function LinkedAccounts({ userId: _userId, className }: LinkedAccountsProps) {
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    type: 'unlink' | 'setPrimary'
    provider?: OAuthProvider
  }>({ isOpen: false, type: 'unlink' })
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { signIn } = useSession()

  const loadProviders = useCallback(async () => {
    try {
      // For demo purposes, simulate linked providers based on session data
      // In a real implementation, this would fetch from the API endpoints
      const mockLinkedProviders = ['github'] // Simulate GitHub as connected
      const mockPrimaryProvider = 'github'

      const allProviders: OAuthProvider[] = Object.entries(PROVIDER_CONFIGS).map(([id, config]) => {
        const isLinked = mockLinkedProviders.includes(id)
        return {
          id,
          ...config,
          isLinked,
          isPrimary: mockPrimaryProvider === id,
          email: isLinked ? `Connected via ${config.name}` : undefined,
          connectedAt: isLinked ? 'Recently' : undefined,
        }
      })

      setProviders(allProviders)
    } catch (_err) {
      setError('Failed to load connected accounts')
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const _formatDate = (date: Date | string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 30) return `${diffDays} days ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  }

  const handleUnlink = async (provider: OAuthProvider) => {
    // Check if this is the only provider
    const linkedProviders = providers.filter(p => p.isLinked)
    if (linkedProviders.length <= 1) {
      setError('Cannot unlink your only authentication method')
      return
    }

    setConfirmDialog({
      isOpen: true,
      type: 'unlink',
      provider,
    })
  }

  const handleLink = async (provider: OAuthProvider) => {
    setIsLoading(provider.id)
    try {
      await signIn(provider.id)
      // After successful sign-in, redirect to show success message
      window.location.href = '/settings/accounts?linked=true'
    } catch (_error) {
      setError(`Failed to connect ${provider.name}`)
    } finally {
      setIsLoading(null)
    }
  }

  const handleSetPrimary = async (provider: OAuthProvider) => {
    setConfirmDialog({
      isOpen: true,
      type: 'setPrimary',
      provider,
    })
  }

  const confirmAction = async () => {
    if (!confirmDialog.provider) return

    setIsLoading(confirmDialog.provider.id)
    setError(null)

    try {
      // Simulate the action with a delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (confirmDialog.type === 'unlink') {
        // Update local state to simulate unlinking
        setProviders(prev =>
          prev.map(p =>
            p.id === confirmDialog.provider?.id
              ? {
                  ...p,
                  isLinked: false,
                  isPrimary: false,
                  email: undefined,
                  connectedAt: undefined,
                }
              : p
          )
        )
      } else if (confirmDialog.type === 'setPrimary') {
        // Update local state to simulate setting primary
        setProviders(prev =>
          prev.map(p => ({
            ...p,
            isPrimary: p.id === confirmDialog.provider?.id,
          }))
        )
      }
    } catch (_error) {
      setError(`Failed to ${confirmDialog.type === 'unlink' ? 'unlink' : 'update'} provider`)
    } finally {
      setIsLoading(null)
      setConfirmDialog({ isOpen: false, type: 'unlink' })
    }
  }

  const linkedProviders = providers.filter(p => p.isLinked)
  const unlinkedProviders = providers.filter(p => !p.isLinked)

  return (
    <div className={cn('mx-auto w-full max-w-2xl space-y-6', className)}>
      {/* Header */}
      <div className="space-y-2 text-center">
        <h2 className="font-semibold text-2xl text-foreground">Connected Accounts</h2>
        <p className="text-muted-foreground">Manage your OAuth provider connections</p>
      </div>

      {/* Error Message */}
      {error && (
        <MotionDiv
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive"
        >
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm">{error}</p>
        </MotionDiv>
      )}

      {/* Linked Providers */}
      {linkedProviders.length > 0 && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-medium text-foreground text-lg">
            <Shield className="h-5 w-5 text-green-500" />
            Connected Providers
          </h3>
          <div className="grid gap-4">
            {linkedProviders.map(provider => (
              <MotionDiv
                key={provider.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                whileHover={{ y: -2, scale: 1.02 }}
                className="group relative"
              >
                {/* Glass morphism card */}
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border border-border/20',
                    'bg-background/80 shadow-xl backdrop-blur-xl',
                    'transition-all duration-300 hover:shadow-2xl',
                    'before:absolute before:inset-0 before:bg-gradient-to-br before:opacity-5',
                    'hover:border-border/40'
                  )}
                  style={{
                    background: `linear-gradient(135deg, ${provider.gradientFrom}08, ${provider.gradientTo}05)`,
                  }}
                >
                  {/* Glow effect */}
                  <div
                    className="absolute inset-0 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-20"
                    style={{
                      background: `radial-gradient(circle at 50% 50%, ${provider.color}40, transparent 70%)`,
                    }}
                  />

                  <div className="relative p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Provider icon with glow */}
                        <MotionDiv
                          className={cn(
                            'relative rounded-xl border border-border/20 p-3',
                            'bg-background/60 shadow-lg backdrop-blur-sm'
                          )}
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          style={{ color: provider.color }}
                        >
                          {provider.icon}
                          <div
                            className="absolute inset-0 rounded-xl opacity-20 blur-md"
                            style={{ backgroundColor: provider.color }}
                          />
                        </MotionDiv>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-foreground">{provider.name}</h4>
                            {provider.isPrimary && (
                              <Badge
                                variant="secondary"
                                className="border-primary/20 bg-primary/10 text-primary text-xs"
                              >
                                <Star className="mr-1 h-3 w-3 fill-current" />
                                Primary
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground text-sm">{provider.email}</p>
                          <p className="text-muted-foreground text-xs">
                            Connected {provider.connectedAt}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!provider.isPrimary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetPrimary(provider)}
                            disabled={isLoading === provider.id}
                            className="text-xs hover:bg-primary/10 hover:text-primary"
                          >
                            <Star className="mr-1 h-3 w-3" />
                            Set Primary
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnlink(provider)}
                          disabled={
                            isLoading === provider.id ||
                            (provider.isPrimary && linkedProviders.length === 1)
                          }
                          className="text-xs hover:bg-destructive/10 hover:text-destructive"
                        >
                          {isLoading === provider.id ? (
                            <MotionDiv
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Number.POSITIVE_INFINITY,
                                ease: 'linear',
                              }}
                              className="h-3 w-3 rounded-full border border-current border-t-transparent"
                            >
                              <span className="sr-only">Loading</span>
                            </MotionDiv>
                          ) : (
                            <Unlink2 className="mr-1 h-3 w-3" />
                          )}
                          Unlink
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </MotionDiv>
            ))}
          </div>
        </div>
      )}

      {/* Available Providers */}
      {unlinkedProviders.length > 0 && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-medium text-foreground text-lg">
            <Link2 className="h-5 w-5 text-blue-500" />
            Available Providers
          </h3>
          <div className="grid gap-4">
            {unlinkedProviders.map(provider => (
              <MotionDiv
                key={provider.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileHover={{ y: -2, scale: 1.02 }}
                className="group relative"
              >
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border border-border/20',
                    'bg-background/60 shadow-lg backdrop-blur-xl',
                    'transition-all duration-300 hover:shadow-xl',
                    'hover:border-border/40'
                  )}
                >
                  <div className="relative p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'rounded-xl border border-border/20 p-3',
                            'bg-background/40 backdrop-blur-sm'
                          )}
                          style={{ color: provider.color }}
                        >
                          {provider.icon}
                        </div>

                        <div>
                          <h4 className="font-semibold text-foreground">{provider.name}</h4>
                          <p className="text-muted-foreground text-sm">Not connected</p>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleLink(provider)}
                        disabled={isLoading === provider.id}
                        className="bg-primary hover:bg-primary/90"
                        size="sm"
                      >
                        {isLoading === provider.id ? (
                          <MotionDiv
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Number.POSITIVE_INFINITY,
                              ease: 'linear',
                            }}
                            className="mr-2 h-3 w-3 rounded-full border border-current border-t-transparent"
                          >
                            <span className="sr-only">Loading</span>
                          </MotionDiv>
                        ) : (
                          <Link2 className="mr-2 h-3 w-3" />
                        )}
                        Connect
                      </Button>
                    </div>
                  </div>
                </div>
              </MotionDiv>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.isOpen}
        onOpenChange={open => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog.type === 'unlink' ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Unlink Provider
                </>
              ) : (
                <>
                  <Star className="h-5 w-5 text-primary" />
                  Set Primary Provider
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.type === 'unlink'
                ? `Are you sure you want to unlink your ${confirmDialog.provider?.name} account? You'll lose access to sign in with this provider.`
                : `Set ${confirmDialog.provider?.name} as your primary authentication provider? This will be used as your main login method.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.type === 'unlink' ? 'destructive' : 'default'}
              onClick={confirmAction}
              disabled={isLoading === confirmDialog.provider?.id}
            >
              {isLoading === confirmDialog.provider?.id ? (
                <MotionDiv
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'linear',
                  }}
                  className="mr-2 h-4 w-4 rounded-full border border-current border-t-transparent"
                >
                  <span className="sr-only">Loading</span>
                </MotionDiv>
              ) : confirmDialog.type === 'unlink' ? (
                <Unlink2 className="mr-2 h-4 w-4" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {confirmDialog.type === 'unlink' ? 'Unlink' : 'Set Primary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
