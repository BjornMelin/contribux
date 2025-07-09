import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import './globals.css'
import { Navigation } from '@/components/layout/navigation'
import { AppProviders } from '@/components/providers/app-providers'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Contribux',
  description: 'AI-Powered GitHub Contribution Discovery Platform',
  generator: 'Next.js',
  applicationName: 'Contribux',
  keywords: ['GitHub', 'contributions', 'open source', 'AI', 'developer tools'],
  authors: [{ name: 'Contribux Team' }],
  creator: 'Contribux',
  publisher: 'Contribux',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
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
