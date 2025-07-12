/**
 * Type declarations for web-vitals library
 * Provides type definitions for Core Web Vitals metrics
 */

declare module 'web-vitals' {
  export interface Metric {
    name: string
    value: number
    id: string
    rating: 'good' | 'needs-improvement' | 'poor'
    delta: number
    entries: PerformanceEntry[]
  }

  export interface CLSMetric extends Metric {
    name: 'CLS'
  }

  export interface FCPMetric extends Metric {
    name: 'FCP'
  }

  export interface FIDMetric extends Metric {
    name: 'FID'
  }

  export interface LCPMetric extends Metric {
    name: 'LCP'
  }

  export interface TTFBMetric extends Metric {
    name: 'TTFB'
  }

  export interface INPMetric extends Metric {
    name: 'INP'
  }

  export type ReportCallback<T extends Metric = Metric> = (metric: T) => void

  export function onCLS(
    onReport: ReportCallback<CLSMetric>,
    options?: { reportAllChanges?: boolean }
  ): void
  export function onFCP(onReport: ReportCallback<FCPMetric>): void
  export function onINP(onReport: ReportCallback<INPMetric>): void
  export function onLCP(
    onReport: ReportCallback<LCPMetric>,
    options?: { reportAllChanges?: boolean }
  ): void
  export function onTTFB(onReport: ReportCallback<TTFBMetric>): void

  // Thresholds for Web Vitals metrics
  export const CLSThresholds: [number, number]
  export const FCPThresholds: [number, number]
  export const INPThresholds: [number, number]
  export const LCPThresholds: [number, number]
  export const TTFBThresholds: [number, number]
}
