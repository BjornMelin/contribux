// CRITICAL: Prevent environment validation during build process
// This must be set before ANY modules are imported
if (process.env.NODE_ENV !== 'development' && !process.env.SKIP_ENV_VALIDATION) {
  process.env.SKIP_ENV_VALIDATION = 'true'
}

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offlineCache',
        expiration: {
          maxEntries: 200,
        },
      },
    },
  ],
})

// Webpack bundle analyzer support
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],

  // Memory optimization settings
  experimental: {
    // Reduce memory usage in development
    webpackMemoryOptimizations: true,
    // Enable test proxy for Playwright testing
    testProxy: true,
    // Temporarily disabled - requires critters package
    // optimizeCss: true,
  },

  // Server external packages (moved from experimental)
  serverExternalPackages: ['@neondatabase/serverless', 'ioredis', 'pg'],

  // Turbopack configuration for development builds
  turbopack: {
    // Resolve aliases for better module resolution
    resolveAlias: {
      // Example: Add aliases if needed in the future
    },
    // Custom file extensions if needed
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    // Rules for webpack loaders (if any custom loaders are needed)
    rules: {
      // Future: Add custom loader rules here if needed
    },
  },

  // Optimize bundle size by excluding server-only packages from client
  // Note: This webpack config will only apply to production builds
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve server-only modules on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        path: false,
        os: false,
      }
    }

    // Enable tree shaking of unused exports
    config.optimization = {
      ...config.optimization,
      usedExports: true,
      sideEffects: false,
    }

    return config
  },

  // Optimize images
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Reduce build output size
  compress: true,

  // Production optimizations
  poweredByHeader: false,
  generateEtags: true,

  // Custom headers for API routes to prevent connection issues
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Connection',
            value: 'close',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },

  // Module optimization for barrel files (icon libraries, etc)
  modularizeImports: {
    // Remove lucide-react transform - modern versions use barrel exports
    '@heroicons/react': {
      transform: '@heroicons/react/24/outline/{{member}}',
    },
  },
}

module.exports = withBundleAnalyzer(withPWA(nextConfig))
