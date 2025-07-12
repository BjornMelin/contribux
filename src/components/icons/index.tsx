'use client'

/**
 * Optimized Icon System - Direct Lucide Re-exports
 * Simple, type-safe, tree-shaken icon imports
 */

// Export types for consistency
export type { LucideProps as IconProps } from 'lucide-react'
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
  Github,
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
