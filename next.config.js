import withBundleAnalyzer from '@next/bundle-analyzer'

const otelPackages = [
  '@opentelemetry/api',
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/exporter-jaeger',
  '@opentelemetry/exporter-metrics-otlp-http',
  '@opentelemetry/exporter-prometheus',
  '@opentelemetry/exporter-trace-otlp-grpc',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/instrumentation',
  '@opentelemetry/instrumentation-express',
  '@opentelemetry/instrumentation-fs',
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/resources',
  '@opentelemetry/sdk-metrics',
  '@opentelemetry/sdk-node',
  '@opentelemetry/sdk-trace-base',
  '@opentelemetry/semantic-conventions',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  generateEtags: true,

  serverExternalPackages: [
    '@neondatabase/serverless',
    'ioredis',
    'pg',
    'pino',
    'pino-http',
    'pino-pretty',
    'prom-client',
    ...otelPackages,
  ],

  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      '@': './src',
      'react-query': '@tanstack/react-query',
    },
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig)
