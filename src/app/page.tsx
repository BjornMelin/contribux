'use client'

import Link from 'next/link'
import { OptimizedSearchExample } from '@/components/examples/optimized-search'
import { ArrowRight, Github, Sparkles, Zap } from '@/components/icons'
import { MotionDiv } from '@/components/motion'
import { useSession } from '@/components/providers/app-providers'
import { Button } from '@/components/ui/button'

export default function Home() {
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-muted/10 to-background">
      {/* Hero Section with Beautiful Gradient */}
      <section className="relative overflow-hidden px-4 pt-32 pb-24">
        {/* Background Effects */}
        <div className="-z-10 absolute inset-0">
          <div className="absolute top-0 left-1/4 h-96 w-96 animate-pulse rounded-full bg-purple-500/20 opacity-50 mix-blend-multiply blur-3xl filter" />
          <div className="absolute top-0 right-1/4 h-96 w-96 animate-pulse rounded-full bg-blue-500/20 opacity-50 mix-blend-multiply blur-3xl filter [animation-delay:2s]" />
          <div className="absolute bottom-0 left-1/2 h-96 w-96 animate-pulse rounded-full bg-pink-500/20 opacity-50 mix-blend-multiply blur-3xl filter [animation-delay:4s]" />
        </div>

        <div className="mx-auto max-w-6xl">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <div className="mb-8 flex items-center justify-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <span className="rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-primary text-sm">
                AI-Powered Open Source Discovery
              </span>
            </div>

            <h1 className="mb-8 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text font-bold text-5xl text-transparent tracking-tight sm:text-7xl">
              Find Your Perfect
              <br />
              <span className="bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
                Open Source Match
              </span>
            </h1>

            <p className="mx-auto mb-12 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Discover repositories that match your skills, interests, and expertise. Contribute to
              projects that matter with AI-powered recommendations.
            </p>

            <div className="mb-16 flex flex-wrap items-center justify-center gap-4">
              {!isAuthenticated ? (
                <>
                  <Link href="/auth/signin">
                    <Button size="lg" className="group">
                      <Github className="mr-2 h-5 w-5" />
                      Sign in with GitHub
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                  <Link href="#search-demo">
                    <Button size="lg" variant="outline">
                      <Zap className="mr-2 h-5 w-5" />
                      Try Demo Search
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href="#search">
                  <Button size="lg" className="group">
                    <Zap className="mr-2 h-5 w-5" />
                    Start Searching
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              )}
            </div>
          </MotionDiv>

          {/* Feature Cards */}
          <MotionDiv
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-24 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
          >
            <div className="group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:shadow-lg sm:p-6 lg:p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3">
                  <svg
                    className="h-6 w-6 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    role="img"
                    aria-label="AI-Powered Matching"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold text-lg sm:text-xl">AI-Powered Matching</h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Our intelligent algorithms analyze your skills and interests to find the perfect
                  repositories for you.
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:shadow-lg sm:p-6 lg:p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-4 inline-flex rounded-lg bg-purple-500/10 p-3">
                  <svg
                    className="h-6 w-6 text-purple-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    role="img"
                    aria-label="Community Insights"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold text-lg sm:text-xl">Community Insights</h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                  See real-time activity, maintainer responsiveness, and community health metrics at
                  a glance.
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:shadow-lg sm:p-6 lg:p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-4 inline-flex rounded-lg bg-blue-500/10 p-3">
                  <svg
                    className="h-6 w-6 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    role="img"
                    aria-label="Good First Issues"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold text-lg sm:text-xl">Good First Issues</h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Find beginner-friendly issues tailored to your experience level and grow your
                  contribution portfolio.
                </p>
              </div>
            </div>
          </MotionDiv>
        </div>
      </section>

      {/* Search Section */}
      <section id={isAuthenticated ? 'search' : 'search-demo'} className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <OptimizedSearchExample />
          </MotionDiv>
        </div>
      </section>
    </main>
  )
}
