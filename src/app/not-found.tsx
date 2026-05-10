/**
 * 404 Not Found page for Next.js 16 App Router
 * Enhanced with modern UI and helpful navigation
 */

import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Github, Home, Search } from '@/components/icons'

// Lazy load heavy components to reduce bundle size
const Button = dynamic(() => import('@/components/ui/button').then(m => ({ default: m.Button })), {
  loading: () => <div className="h-10 w-24 animate-pulse rounded bg-muted" />,
})

export const metadata: Metadata = {
  title: 'Page Not Found | Contribux',
  description: 'The page you are looking for could not be found.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-muted/10 to-background p-4">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* 404 Visual */}
        <div className="space-y-4">
          <div className="select-none font-bold text-8xl text-primary/20">404</div>
          <div className="space-y-2">
            <h1 className="font-bold text-3xl text-foreground">Page Not Found</h1>
            <p className="text-lg text-muted-foreground">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>
        </div>

        {/* Suggested Actions */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button asChild className="flex w-full items-center gap-2" size="lg">
              <Link href="/">
                <Home className="h-4 w-4" />
                Go Home
              </Link>
            </Button>

            <Button asChild variant="outline" className="flex w-full items-center gap-2" size="lg">
              <Link href="/search">
                <Search className="h-4 w-4" />
                Search Projects
              </Link>
            </Button>
          </div>

          <Button asChild variant="ghost" className="inline-flex items-center gap-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>

        {/* Popular Links */}
        <div className="border-border border-t pt-8">
          <h2 className="mb-4 font-medium text-muted-foreground text-sm">Popular destinations:</h2>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link
              href="/auth/signin"
              className="text-primary underline hover:text-primary/80 hover:no-underline"
            >
              Sign In
            </Link>
            <Link
              href="/about"
              className="text-primary underline hover:text-primary/80 hover:no-underline"
            >
              About
            </Link>
            <Link
              href="/performance"
              className="text-primary underline hover:text-primary/80 hover:no-underline"
            >
              Performance
            </Link>
            <a
              href="https://github.com/contribux/contribux"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary underline hover:text-primary/80 hover:no-underline"
            >
              <Github className="h-3 w-3" />
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
