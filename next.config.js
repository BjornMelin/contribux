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
    // Next.js 15 performance features
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // Temporarily disabled - requires critters package
    // optimizeCss: true,
  },

  // Server external packages (moved from experimental in Next.js 15)
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

    // Advanced optimization configuration
    config.optimization = {
      ...config.optimization,
      usedExports: true,
      sideEffects: false,
      // Enhanced chunk splitting for better caching
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          // Framework chunks (Next.js, React)
          framework: {
            name: 'framework',
            test: /[\\/]node_modules[\\/](react|react-dom|next)[\\/]/,
            priority: 40,
            enforce: true,
          },
          // Authentication libraries (optimized for jose consolidation)
          auth: {
            name: 'auth',
            test: /[\\/]node_modules[\\/](next-auth|@auth|jose|@simplewebauthn)[\\/]/,
            priority: 30,
            enforce: true,
          },
          // Database and API clients (optimized for consolidated octokit)
          database: {
            name: 'database',
            test: /[\\/]node_modules[\\/](@neondatabase|drizzle-orm|octokit|ioredis)[\\/]/,
            priority: 25,
            enforce: true,
          },
          // UI libraries
          ui: {
            name: 'ui',
            test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|framer-motion|class-variance-authority)[\\/]/,
            priority: 20,
            enforce: true,
          },
          // Vendor libraries
          vendor: {
            name: 'vendor',
            test: /[\\/]node_modules[\\/]/,
            priority: 10,
            enforce: true,
          },
        },
      },
      // Enhanced minimization
      minimizer: !isServer
        ? [
            // Keep existing minimizers and add optimization
            ...(config.optimization.minimizer || []),
          ]
        : undefined,
    }

    // Performance optimizations
    if (!isServer) {
      // Optimize bundle size by resolving only necessary polyfills
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Only include necessary polyfills
        buffer: false,
        events: false,
        util: false,
        url: false,
        querystring: false,
      }

      // Add performance hints
      config.performance = {
        ...config.performance,
        maxAssetSize: 512000, // 500kb
        maxEntrypointSize: 1024000, // 1MB
        hints: process.env.NODE_ENV === 'production' ? 'warning' : false,
      }
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
    // Optimize lucide-react imports for better tree shaking
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
      skipDefaultConversion: true,
    },
    '@heroicons/react/24/outline': {
      transform: '@heroicons/react/24/outline/{{member}}',
    },
    '@heroicons/react/24/solid': {
      transform: '@heroicons/react/24/solid/{{member}}',
    },
  },
}

module.exports = withBundleAnalyzer(withPWA(nextConfig))
