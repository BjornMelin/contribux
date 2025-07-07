'use client'

import { MotionDiv } from '@/components/motion'
import { useSession } from '@/components/providers/app-providers'
import { Button } from '@/components/ui/button'
import { ThemeToggle, ThemeToggleCompact } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { Github, Home, LogOut, Menu, Settings, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/settings/accounts', label: 'Settings', icon: Settings, requiresAuth: true },
]

export function Navigation() {
  const { data: session, status, signOut } = useSession()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isAuthenticated = status === 'authenticated'

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/'
  }

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Desktop Nav */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <MotionDiv
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="rounded-full bg-gradient-to-r from-primary to-purple-600 p-2"
              >
                <Sparkles className="h-5 w-5 text-white" />
              </MotionDiv>
              <span className="font-bold text-xl">contribux</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="ml-10 hidden items-center space-x-4 md:flex">
              {navItems.map(item => {
                if (item.requiresAuth && !isAuthenticated) return null
                const Icon = item.icon
                const isActive = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center space-x-1 rounded-md px-3 py-2 font-medium text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden items-center space-x-4 md:flex">
            <ThemeToggle />
            {status === 'loading' ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {session?.user?.image && (
                    <img
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      className="h-8 w-8 rounded-full border border-border"
                    />
                  )}
                  <span className="font-medium text-sm">{session?.user?.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Link href="/auth/signin">
                <Button size="sm" className="group">
                  <Github className="mr-2 h-4 w-4" />
                  Sign in
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <MotionDiv
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="border-t bg-background md:hidden"
        >
          <div className="space-y-1 px-2 pt-2 pb-3">
            {navItems.map(item => {
              if (item.requiresAuth && !isAuthenticated) return null
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center space-x-2 rounded-md px-3 py-2 font-medium text-base',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}

            {/* Mobile Auth Section */}
            <div className="border-t pt-4">
              {/* Theme Toggle for Mobile */}
              <div className="flex items-center justify-between px-3 py-2">
                <span className="font-medium text-sm">Theme</span>
                <ThemeToggleCompact />
              </div>

              {isAuthenticated ? (
                <>
                  <div className="mb-3 flex items-center space-x-3 px-3">
                    {session?.user?.image && (
                      <img
                        src={session.user.image}
                        alt={session.user.name || 'User'}
                        className="h-10 w-10 rounded-full border border-border"
                      />
                    )}
                    <div>
                      <p className="font-medium text-sm">{session?.user?.name}</p>
                      <p className="text-muted-foreground text-xs">{session?.user?.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center space-x-2 rounded-md px-3 py-2 font-medium text-base text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Sign out</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/auth/signin"
                  className="flex items-center space-x-2 rounded-md px-3 py-2 font-medium text-base text-primary hover:bg-primary/10"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Github className="h-5 w-5" />
                  <span>Sign in with GitHub</span>
                </Link>
              )}
            </div>
          </div>
        </MotionDiv>
      )}
    </nav>
  )
}
