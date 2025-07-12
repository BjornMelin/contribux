import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import './globals.css'
// Lazy load navigation for better initial bundle size
import dynamic from 'next/dynamic'

const Navigation = dynamic(
  () => import('@/components/layout/navigation').then(mod => ({ default: mod.Navigation })),
  {
    loading: () => (
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
              <div className="h-6 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      </nav>
    ),
  }
)

import { AppProviders } from '@/components/providers/app-providers'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'Contribux - AI-Powered GitHub Contribution Discovery',
    template: '%s | Contribux',
  },
  description:
    'AI-Powered GitHub Contribution Discovery Platform - Find perfect open source projects that match your skills, interests, and expertise with intelligent recommendations.',
  generator: 'Next.js',
  applicationName: 'Contribux',
  keywords: [
    'GitHub',
    'contributions',
    'open source',
    'AI',
    'developer tools',
    'machine learning',
    'repository discovery',
    'code collaboration',
    'developer community',
  ],
  authors: [{ name: 'Contribux Team', url: 'https://contribux.vercel.app' }],
  creator: 'Contribux',
  publisher: 'Contribux',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'https://contribux.vercel.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Contribux',
    title: 'Contribux - AI-Powered GitHub Contribution Discovery',
    description: 'Find perfect open source projects with AI-powered recommendations',
    url: '/',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Contribux - AI-Powered GitHub Contribution Discovery Platform',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contribux - AI-Powered GitHub Contribution Discovery',
    description: 'Find perfect open source projects with AI-powered recommendations',
    images: ['/twitter-image.png'],
    creator: '@contribux',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#000000',
}

interface RootLayoutProps {
  children: ReactNode
}

export default async function RootLayout({ children }: RootLayoutProps) {
  // Get nonce from request headers (set by middleware)
  const headersList = await headers()
  const nonce = headersList.get('x-nonce')

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={inter.className}>
        <AppProviders>
          <Navigation />
          {children}
        </AppProviders>
        {/* Example: If we need inline scripts, they must include the nonce */}
        {nonce && (
          <script
            nonce={nonce}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: CSP nonce demonstration
            dangerouslySetInnerHTML={{
              __html: `
                // Example inline script with nonce
                console.log('Contribux initialized');
              `,
            }}
          />
        )}
      </body>
    </html>
  )
}
