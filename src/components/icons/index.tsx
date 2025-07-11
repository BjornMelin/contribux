'use client'

/**
 * Optimized Icon System
 * Tree-shaken icon imports for reduced bundle size
 */

import React from 'react'

// Core icons used frequently across the app
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
  WifiOff,
  X,
  Zap,
} from 'lucide-react'

// Lazy-loaded icons for less common use cases
export const LazyIcons = {
  Calendar: () => import('lucide-react').then(mod => ({ default: mod.Calendar })),
  Download: () => import('lucide-react').then(mod => ({ default: mod.Download })),
  Filter: () => import('lucide-react').then(mod => ({ default: mod.Filter })),
  Heart: () => import('lucide-react').then(mod => ({ default: mod.Heart })),
  Home: () => import('lucide-react').then(mod => ({ default: mod.Home })),
  Info: () => import('lucide-react').then(mod => ({ default: mod.Info })),
  Menu: () => import('lucide-react').then(mod => ({ default: mod.Menu })),
  Plus: () => import('lucide-react').then(mod => ({ default: mod.Plus })),
  Trash: () => import('lucide-react').then(mod => ({ default: mod.Trash })),
  Upload: () => import('lucide-react').then(mod => ({ default: mod.Upload })),
  Wifi: () => import('lucide-react').then(mod => ({ default: mod.Wifi })),
  WifiOff: () => import('lucide-react').then(mod => ({ default: mod.WifiOff })),
} as const

// Icon component type for consistency
export type IconComponent = React.ComponentType<{
  className?: string
  size?: number
}>

// Utility hook for lazy-loaded icons
export const useLazyIcon = (iconName: keyof typeof LazyIcons) => {
  const [Icon, setIcon] = React.useState<IconComponent | null>(null)

  React.useEffect(() => {
    LazyIcons[iconName]().then(module => {
      setIcon(() => module.default)
    })
  }, [iconName])

  return Icon
}

// Common icon presets for consistent sizing
export const iconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const

// Icon wrapper component for consistent styling
export interface IconProps {
  className?: string
  size?: keyof typeof iconSizes | number
  'aria-label'?: string
}

export const IconWrapper: React.FC<IconProps & { children: React.ReactNode }> = ({
  children,
  className = '',
  size = 'md',
  'aria-label': ariaLabel,
  ...props
}) => {
  const iconSize = typeof size === 'number' ? size : iconSizes[size]

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: iconSize, height: iconSize }}
      role="img"
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </span>
  )
}
