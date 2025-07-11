/**
 * Type declarations for Google Analytics gtag
 * Provides type definitions for Google Analytics tracking
 */

declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'exception' | 'page_view' | 'timing_complete',
      targetId: string,
      config?: {
        page_title?: string
        page_location?: string
        custom_map?: Record<string, string>
        send_page_view?: boolean
        [key: string]: any
      }
    ) => void
  }
}

export {}
