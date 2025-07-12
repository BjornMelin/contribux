// CRITICAL: Comprehensive server-side polyfill for Next.js 15 + React 19 compatibility
// Define `self` early to prevent ReferenceError during SSR and webpack runtime
if (typeof global !== 'undefined') {
  global.self = global
  if (typeof globalThis !== 'undefined') {
    globalThis.self = globalThis
  }
}

// Bundle analyzer import
import withBundleAnalyzer from '@next/bundle-analyzer'

// CRITICAL: Prevent environment validation during build process
// This must be set before ANY modules are imported
if (process.env.NODE_ENV !== 'development' && !process.env.SKIP_ENV_VALIDATION) {
  process.env.SKIP_ENV_VALIDATION = 'true'
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Expose environment variables to the client side for NextAuth
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
  // Removed framer-motion from transpilePackages to avoid conflict
  transpilePackages: [],

  // Next.js 15.3.5+ optimizations and performance features
  experimental: {
    // Enhanced memory optimization for development
    webpackMemoryOptimizations: true,

    // Next.js 15.3+ performance features
    staleTimes: {
      dynamic: 30,
      static: 180,
    },

    // Enhanced CSS optimization (available in 15.3+)
    optimizeCss: {
      preload: true,
      inlineFonts: true,
    },

    // Modern bundle optimization
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-progress',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      'framer-motion',
      'recharts',
    ],

    // CRITICAL: Disable fallback for webpack runtime
    fallbackNodePolyfills: false,

    // Next.js 15.3+ App Router enhancements
    optimizeServerReact: true,
  },

  // Server external packages (moved from experimental in Next.js 15)
  // Include telemetry packages to prevent them from being bundled on client-side
  serverExternalPackages: [
    '@neondatabase/serverless',
    'ioredis',
    'pg',
    'pino',
    'pino-http',
    'pino-pretty',
    'prom-client',
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
  ],

  // Enhanced Turbopack configuration for Next.js 15.3+
  turbopack: {
    // Optimized resolve aliases for better module resolution
    resolveAlias: {
      '@': './src',
      // Optimize common library imports
      'react-query': '@tanstack/react-query',
    },

    // Enhanced file extensions with optimized ordering
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },

  // Webpack optimization configuration
  // FIXES: Resolved conflicts with 'optimization.usedExports' and 'optimization.cacheUnaffected.usedExports'
  // - Server builds: Explicitly disable usedExports and splitChunks to prevent runtime issues
  // - Client builds: Conditionally set usedExports only if not already configured by Next.js
  // - Enhanced chunk splitting without overriding Next.js core optimization settings
  webpack: (config, { isServer, webpack }) => {
    // CRITICAL: Fix for Next.js 15 + React 19 server-side compatibility
    // Target the specific webpack chunk loading pattern that causes the issue
    if (isServer) {
      // Replace browser globals with server-safe alternatives
      config.plugins.push(
        new webpack.DefinePlugin({
          'self.webpackChunk_N_E': 'globalThis.webpackChunk_N_E',
          'typeof self': '"undefined"',
          self: 'globalThis',
        })
      )

      // Ensure webpack uses globalThis for all runtime operations
      config.output = {
        ...config.output,
        globalObject: 'globalThis',
        chunkLoadingGlobal: 'webpackChunk_N_E',
      }

      // Server-specific optimizations - merge instead of replace to avoid conflicts
      config.optimization = {
        ...config.optimization,
        // Disable splitChunks for server to prevent runtime issues
        splitChunks: false,
        // Ensure consistent module IDs
        moduleIds: 'deterministic',
        // Preserve Next.js defaults for other optimization settings
        usedExports: false, // Disable for server-side builds
        sideEffects: false,
      }
    }

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

    // Removed webpack polyfill injection - React 19 + Next.js 15 handle this properly
    // Issues were resolved by fixing client-side-only code in query-client.ts

    // Client-side optimization configuration - avoid conflicts with Next.js defaults
    if (!isServer) {
      // Only set specific optimization properties to avoid conflicts
      // Let Next.js handle most optimization settings by default

      // Enhanced splitChunks configuration with conservative splitting to reduce chunk count
      if (config.optimization.splitChunks) {
        // Configure for fewer, larger chunks instead of many micro-chunks
        config.optimization.splitChunks = {
          ...config.optimization.splitChunks,
          maxAsyncRequests: 10, // Reduce from default to prevent too many chunks
          maxInitialRequests: 6, // Reduce initial requests
          minSize: 20000, // Increase minimum size to prevent micro-chunks
          enforceSizeThreshold: 50000, // Enforce size threshold to reduce chunking
          cacheGroups: {
            // Keep Next.js default chunks but consolidate others
            default: false,
            vendors: false,

            // React framework chunk (React + React-DOM only)
            react: {
              name: 'react-framework',
              test: /[/]node_modules[/](react|react-dom)[/]/,
              priority: 60,
              enforce: true,
              chunks: 'all',
              reuseExistingChunk: true,
            },

            // Next.js framework chunk (Next.js internals only)
            nextjs: {
              name: 'nextjs-framework',
              test: /[/]node_modules[/]next[/]/,
              priority: 55,
              enforce: true,
              chunks: 'all',
              reuseExistingChunk: true,
            },

            // All UI libraries consolidated into single chunk
            ui: {
              name: 'ui-libs',
              test: /[/]node_modules[/](lucide-react|@radix-ui|framer-motion|class-variance-authority|next-themes)[/]/,
              priority: 40,
              enforce: true,
              chunks: 'all',
              reuseExistingChunk: true,
            },

            // Auth and security libraries
            auth: {
              name: 'auth',
              test: /[/]node_modules[/](next-auth|@auth|jose|@simplewebauthn|jsonwebtoken)[/]/,
              priority: 35,
              enforce: true,
              chunks: 'all',
              reuseExistingChunk: true,
            },

            // Data and API libraries
            data: {
              name: 'data',
              test: /[/]node_modules[/](@tanstack\/react-query|@neondatabase|drizzle-orm|octokit|ioredis|@redis|recharts)[/]/,
              priority: 30,
              enforce: true,
              chunks: 'all',
              reuseExistingChunk: true,
            },

            // All other vendor libraries
            vendor: {
              name: 'vendor',
              test: /[/]node_modules[/]/,
              priority: 10,
              enforce: true,
              chunks: 'all',
              reuseExistingChunk: true,
              minSize: 30000, // Larger minimum size for vendor chunks
            },
          },
        }
      }

      // Only set tree-shaking if not already configured to avoid conflicts
      if (config.optimization.usedExports === undefined) {
        config.optimization.usedExports = true
      }

      // Performance optimizations for client builds only
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

      // Enhanced performance hints for client bundles - temporarily relaxed during optimization
      config.performance = {
        ...config.performance,
        maxAssetSize: 500000, // 500kb - relaxed during optimization
        maxEntrypointSize: 1200000, // 1.2MB - relaxed during optimization
        hints: process.env.NODE_ENV === 'production' ? 'warning' : false, // Use warnings instead of errors during optimization
      }

      // Enhanced module concatenation for smaller bundles
      config.optimization.concatenateModules = true

      // Enable advanced optimizations for smaller bundles
      config.optimization.innerGraph = true
      config.optimization.mangleWasmImports = true
      config.optimization.removeAvailableModules = true
      config.optimization.removeEmptyChunks = true
      config.optimization.mergeDuplicateChunks = true

      // Enhanced tree shaking for better dead code elimination
      config.optimization.providedExports = true
      config.optimization.sideEffects = false

      // Better module ID generation for long-term caching
      config.optimization.moduleIds = 'deterministic'
      config.optimization.chunkIds = 'deterministic'

      // Let Next.js handle minimization and other optimization settings
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

  // Enhanced module optimization for barrel files and large libraries
  modularizeImports: {
    // Skip lucide-react optimization - handled by our custom icon barrel exports
    // Our selective export strategy in src/components/icons/index.tsx already optimizes tree-shaking

    // Optimize @radix-ui imports
    '@radix-ui/react-**': {
      transform: '@radix-ui/react-{{member}}/dist/index.js',
    },
    // Optimize recharts imports
    recharts: {
      transform: 'recharts/es6/{{member}}',
      preventFullImport: true,
    },
    // Don't override internal imports for these libraries - let Next.js handle them
  },
}

// Bundle analyzer configuration
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

export default bundleAnalyzer(nextConfig)
