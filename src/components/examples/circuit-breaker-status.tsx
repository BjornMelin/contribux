/**
 * Circuit Breaker Status Component
 * Displays circuit breaker monitoring information
 */

'use client'

import { getCircuitBreakerStyle } from '@/lib/utils/badge-styles'
import { memo } from 'react'

interface CircuitBreakerState {
  endpoint: string
  state: string
  failures: number
}

interface CircuitBreakerStatusProps {
  circuitBreakerStates: CircuitBreakerState[]
}

export const CircuitBreakerStatus = memo<CircuitBreakerStatusProps>(function CircuitBreakerStatus({
  circuitBreakerStates,
}) {
  if (circuitBreakerStates.length === 0) return null

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="border-b p-4">
        <h3 className="font-semibold text-card-foreground text-lg">Circuit Breaker Status</h3>
      </div>
      <div className="space-y-2 p-4">
        {circuitBreakerStates.map((cb: CircuitBreakerState) => (
          <div key={cb.endpoint} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{cb.endpoint}</span>
            <span
              className={`rounded-full px-2 py-1 font-medium text-xs ${getCircuitBreakerStyle(cb.state)}`}
            >
              {cb.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})
