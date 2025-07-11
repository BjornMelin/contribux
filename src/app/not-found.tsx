/**
 * 404 Not Found page for Next.js 15 App Router
 * Enhanced with modern UI and helpful navigation
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Github, Home, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'

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
            <Link href="/" className="block">
              <Button className="flex w-full items-center gap-2" size="lg">
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </Link>

            <Link href="/search" className="block">
              <Button variant="outline" className="flex w-full items-center gap-2" size="lg">
                <Search className="h-4 w-4" />
                Search Projects
              </Button>
            </Link>
          </div>

          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
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
