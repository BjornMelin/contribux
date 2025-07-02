// CRITICAL: Comprehensive server-side polyfill for Next.js 15 + React 19 compatibility
// Define `self` early to prevent ReferenceError during SSR and webpack runtime
if (typeof global !== 'undefined') {
  global.self = global
  if (typeof globalThis !== 'undefined') {
    globalThis.self = globalThis
  }
}

// CRITICAL: Prevent environment validation during build process  
// This must be set before ANY modules are imported
if (process.env.NODE_ENV !== 'development' && !process.env.SKIP_ENV_VALIDATION) {
  process.env.SKIP_ENV_VALIDATION = 'true'
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Removed framer-motion from transpilePackages to avoid conflict
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
    // CRITICAL: Disable fallback for webpack runtime 
    fallbackNodePolyfills: false,
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
  webpack: (config, { isServer, webpack }) => {

    // CRITICAL: Fix for Next.js 15 + React 19 server-side compatibility
    // Target the specific webpack chunk loading pattern that causes the issue
    if (isServer) {
      // Replace browser globals with server-safe alternatives
      config.plugins.push(
        new webpack.DefinePlugin({
          'self.webpackChunk_N_E': 'globalThis.webpackChunk_N_E',
          'typeof self': '"undefined"',
          'self': 'globalThis'
        })
      )

      // Ensure webpack uses globalThis for all runtime operations
      config.output = {
        ...config.output,
        globalObject: 'globalThis',
        chunkLoadingGlobal: 'webpackChunk_N_E'
      }

      // Disable problematic optimization that causes undefined access
      config.optimization = {
        ...config.optimization,
        // Disable splitChunks for server to prevent runtime issues
        splitChunks: false,
        // Ensure consistent module IDs
        moduleIds: 'deterministic'
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

    // Advanced optimization configuration - ONLY for client builds
    if (!isServer) {
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
      // Enhanced minimization - use default Next.js minimizers
      // minimizer: undefined, // Let Next.js handle minimization
      }

      // Performance optimizations
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
    // Future: Add optimizations when icon packages are installed
  },
}

export default nextConfig