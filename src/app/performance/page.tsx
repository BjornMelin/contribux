/**
 * Performance Dashboard Page
 * Showcases performance optimizations and monitoring
 */

import { PerformanceDashboard } from '@/components/monitoring/performance-dashboard'

export default async function PerformancePage() {
  // Server-side data fetching for improved performance
  const performanceData = await getPerformanceMetrics()

  return (
    <div className="container mx-auto px-4 py-8">
      <PerformanceDashboard initialData={performanceData} />
    </div>
  )
}

// Server action for data fetching
async function getPerformanceMetrics() {
  try {
    // This runs on the server, reducing client-side hydration
    const response = await fetch('http://localhost:3000/api/performance', {
      cache: 'no-store', // For real-time data
      next: { revalidate: 30 }, // Revalidate every 30 seconds
    })

    if (!response.ok) {
      throw new Error('Failed to fetch performance metrics')
    }

    return await response.json()
  } catch (_error) {
    return null
  }
}

export const metadata = {
  title: 'Performance Dashboard | Contribux',
  description: 'Real-time performance metrics and optimization tracking for Contribux',
}
