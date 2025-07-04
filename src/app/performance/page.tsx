/**
 * Performance Dashboard Page
 * Showcases performance optimizations and monitoring
 */

import { PerformanceDashboard } from '@/components/monitoring/performance-dashboard'

export default function PerformancePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <PerformanceDashboard />
    </div>
  )
}

export const metadata = {
  title: 'Performance Dashboard | Contribux',
  description: 'Real-time performance metrics and optimization tracking for Contribux',
}
