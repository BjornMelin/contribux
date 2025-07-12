/**
 * Global loading UI for Next.js 15 App Router
 * Uses React 19 Suspense improvements for better UX
 */

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-muted/10 to-background">
      <div className="space-y-4 text-center">
        <div className="relative">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <div className="absolute inset-0 mx-auto h-16 w-16 animate-spin rounded-full border-4 border-transparent border-r-primary/40 [animation-direction:reverse] [animation-duration:1.5s]" />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-foreground text-lg">Loading Contribux</h2>
          <p className="mx-auto max-w-xs text-muted-foreground text-sm">
            Preparing your AI-powered contribution discovery experience...
          </p>
        </div>
      </div>
    </div>
  )
}
