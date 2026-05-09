'use client'

import type { LucideProps } from 'lucide-react'

/**
 * Optimized Icon System - Direct Lucide Re-exports
 * Simple, type-safe, tree-shaken icon imports
 */

// Export types for consistency
export type { LucideProps as IconProps } from 'lucide-react'

export function Github({ size = 24, color = 'currentColor', ...props }: LucideProps) {
  return (
    <svg
      aria-hidden="true"
      fill={color}
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12 2C6.48 2 2 6.59 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.85.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.98c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.82 0 .27.18.59.69.49A10.15 10.15 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z" />
    </svg>
  )
}

// Direct re-exports from lucide-react with proper TypeScript types
export {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  ExternalLink,
  GitBranch,
  GitFork,
  GitPullRequest,
  HelpCircle,
  Home,
  Info,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldOff,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  Unlink2,
  User,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'

// Common icon presets for consistent sizing
export const iconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const
