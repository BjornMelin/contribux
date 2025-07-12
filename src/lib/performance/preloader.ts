/**
 * Intelligent Component Preloader
 * Preloads components based on user interaction patterns and page context
 */

'use client'

// Preload heavy components when likely to be needed
export const preloadSearchComponents = () => {
  if (typeof window === 'undefined') return

  // Use requestIdleCallback for non-critical preloading
  const scheduler = window.requestIdleCallback || window.setTimeout

  scheduler(() => {
    // Preload search-related components
    Promise.all([
      import('@/components/examples/optimized-search'),
      import('@/components/examples/beginner-sidebar'),
      import('@/components/examples/circuit-breaker-status'),
      import('@/components/examples/performance-metrics'),
    ]).catch(() => {
      // Silent error handling - preloading is a performance enhancement
    })
  })
}

export const preloadAuthComponents = () => {
  if (typeof window === 'undefined') return

  const scheduler = window.requestIdleCallback || window.setTimeout

  scheduler(() => {
    // Preload authentication-related components
    Promise.all([
      import('@/components/providers/query-provider'),
      import('@/components/layout/navigation'),
    ]).catch(() => {
      // Silent error handling
    })
  })
}

export const preloadFeatureComponents = () => {
  if (typeof window === 'undefined') return

  const scheduler = window.requestIdleCallback || window.setTimeout

  scheduler(() => {
    // Preload feature components
    Promise.all([
      import('@/components/features/OpportunityList'),
      import('@/components/features/SearchFilters'),
    ]).catch(() => {
      // Silent error handling
    })
  })
}

// Smart preloader that observes user behavior
export class SmartPreloader {
  private preloadedComponents = new Set<string>()
  private intersectionObserver?: IntersectionObserver

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupIntersectionObserver()
      this.setupEventListeners()
    }
  }

  private setupIntersectionObserver() {
    if (!('IntersectionObserver' in window)) return

    this.intersectionObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement
            const preloadType = target.dataset.preload

            if (preloadType && !this.preloadedComponents.has(preloadType)) {
              this.preloadComponents(preloadType)
              this.preloadedComponents.add(preloadType)
            }
          }
        })
      },
      { rootMargin: '100px' } // Start preloading 100px before element comes into view
    )
  }

  private setupEventListeners() {
    // Preload on hover (for likely interactions)
    document.addEventListener('mouseover', event => {
      const target = event.target as HTMLElement
      const preloadType = target.dataset.preloadOnHover

      if (preloadType && !this.preloadedComponents.has(preloadType)) {
        this.preloadComponents(preloadType)
        this.preloadedComponents.add(preloadType)
      }
    })

    // Preload on focus (for keyboard navigation)
    document.addEventListener('focusin', event => {
      const target = event.target as HTMLElement
      const preloadType = target.dataset.preloadOnFocus

      if (preloadType && !this.preloadedComponents.has(preloadType)) {
        this.preloadComponents(preloadType)
        this.preloadedComponents.add(preloadType)
      }
    })
  }

  private preloadComponents(type: string) {
    switch (type) {
      case 'search':
        preloadSearchComponents()
        break
      case 'auth':
        preloadAuthComponents()
        break
      case 'features':
        preloadFeatureComponents()
        break
    }
  }

  public observeElement(element: HTMLElement, preloadType: string) {
    if (this.intersectionObserver) {
      element.dataset.preload = preloadType
      this.intersectionObserver.observe(element)
    }
  }

  public cleanup() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
    }
  }
}

// Global preloader instance
let globalPreloader: SmartPreloader | null = null

export const getPreloader = () => {
  if (typeof window === 'undefined') return null

  if (!globalPreloader) {
    globalPreloader = new SmartPreloader()
  }

  return globalPreloader
}

// Hook for using preloader in React components
export const usePreloader = () => {
  return getPreloader()
}
