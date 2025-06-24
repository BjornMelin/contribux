'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Github, Link2, Mail, Shield, Star, Unlink2, X } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
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
  icon: React.ReactNode
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
    icon: <Github className="w-5 h-5" />,
    color: '#24292e',
    gradientFrom: '#24292e',
    gradientTo: '#586069',
  },
  google: {
    name: 'Google',
    icon: <Mail className="w-5 h-5" />,
    color: '#4285f4',
    gradientFrom: '#4285f4',
    gradientTo: '#34a853',
  },
}

export function LinkedAccounts({ userId, className }: LinkedAccountsProps) {
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    type: 'unlink' | 'setPrimary'
    provider?: OAuthProvider
  }>({ isOpen: false, type: 'unlink' })
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadProviders()
  }, [userId])

  const loadProviders = async () => {
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
    } catch (err) {
      console.error('Failed to load providers:', err)
      setError('Failed to load connected accounts')
    }
  }

  const formatDate = (date: Date | string) => {
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
      await signIn(provider.id, {
        callbackUrl: '/settings/accounts?linked=true',
      })
    } catch (error) {
      console.error('Failed to link provider:', error)
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
    } catch (error) {
      console.error('Failed to perform action:', error)
      setError(`Failed to ${confirmDialog.type === 'unlink' ? 'unlink' : 'update'} provider`)
    } finally {
      setIsLoading(null)
      setConfirmDialog({ isOpen: false, type: 'unlink' })
    }
  }

  const linkedProviders = providers.filter(p => p.isLinked)
  const unlinkedProviders = providers.filter(p => !p.isLinked)

  return (
    <div className={cn('w-full max-w-2xl mx-auto space-y-6', className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Connected Accounts</h2>
        <p className="text-muted-foreground">Manage your OAuth provider connections</p>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg p-4 flex items-center gap-2"
        >
          <AlertTriangle className="w-5 h-5" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      {/* Linked Providers */}
      {linkedProviders.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            Connected Providers
          </h3>
          <div className="grid gap-4">
            {linkedProviders.map(provider => (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                whileHover={{ y: -2, scale: 1.02 }}
                className="relative group"
              >
                {/* Glass morphism card */}
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border border-border/20',
                    'bg-background/80 backdrop-blur-xl shadow-xl',
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
                    className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-xl"
                    style={{
                      background: `radial-gradient(circle at 50% 50%, ${provider.color}40, transparent 70%)`,
                    }}
                  />

                  <div className="relative p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Provider icon with glow */}
                        <motion.div
                          className={cn(
                            'relative p-3 rounded-xl border border-border/20',
                            'bg-background/60 backdrop-blur-sm shadow-lg'
                          )}
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          style={{ color: provider.color }}
                        >
                          {provider.icon}
                          <div
                            className="absolute inset-0 rounded-xl opacity-20 blur-md"
                            style={{ backgroundColor: provider.color }}
                          />
                        </motion.div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-foreground">{provider.name}</h4>
                            {provider.isPrimary && (
                              <Badge
                                variant="secondary"
                                className="text-xs bg-primary/10 text-primary border-primary/20"
                              >
                                <Star className="w-3 h-3 mr-1 fill-current" />
                                Primary
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{provider.email}</p>
                          <p className="text-xs text-muted-foreground">
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
                            <Star className="w-3 h-3 mr-1" />
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
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Number.POSITIVE_INFINITY,
                                ease: 'linear',
                              }}
                              className="w-3 h-3 border border-current border-t-transparent rounded-full"
                            />
                          ) : (
                            <Unlink2 className="w-3 h-3 mr-1" />
                          )}
                          Unlink
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Available Providers */}
      {unlinkedProviders.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-500" />
            Available Providers
          </h3>
          <div className="grid gap-4">
            {unlinkedProviders.map(provider => (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileHover={{ y: -2, scale: 1.02 }}
                className="relative group"
              >
                <div
                  className={cn(
                    'relative overflow-hidden rounded-2xl border border-border/20',
                    'bg-background/60 backdrop-blur-xl shadow-lg',
                    'transition-all duration-300 hover:shadow-xl',
                    'hover:border-border/40'
                  )}
                >
                  <div className="relative p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'p-3 rounded-xl border border-border/20',
                            'bg-background/40 backdrop-blur-sm'
                          )}
                          style={{ color: provider.color }}
                        >
                          {provider.icon}
                        </div>

                        <div>
                          <h4 className="font-semibold text-foreground">{provider.name}</h4>
                          <p className="text-sm text-muted-foreground">Not connected</p>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleLink(provider)}
                        disabled={isLoading === provider.id}
                        className="bg-primary hover:bg-primary/90"
                        size="sm"
                      >
                        {isLoading === provider.id ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Number.POSITIVE_INFINITY,
                              ease: 'linear',
                            }}
                            className="w-3 h-3 border border-current border-t-transparent rounded-full mr-2"
                          />
                        ) : (
                          <Link2 className="w-3 h-3 mr-2" />
                        )}
                        Connect
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
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
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Unlink Provider
                </>
              ) : (
                <>
                  <Star className="w-5 h-5 text-primary" />
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
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                  className="w-4 h-4 border border-current border-t-transparent rounded-full mr-2"
                />
              ) : confirmDialog.type === 'unlink' ? (
                <Unlink2 className="w-4 h-4 mr-2" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {confirmDialog.type === 'unlink' ? 'Unlink' : 'Set Primary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
