/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// jest-dom matchers are available through main setup
import { SignInButton } from '@/app/auth/signin/signin-button'
import { PROVIDER_CONFIGS, ProviderButton } from '@/components/auth/ProviderButton'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Github: ({
    className,
    'aria-hidden': ariaHidden,
  }: {
    className?: string
    'aria-hidden'?: boolean
  }) => (
    <div data-testid="github-icon" className={className} aria-hidden={ariaHidden}>
      GitHub
    </div>
  ),
  Mail: ({
    className,
    'aria-hidden': ariaHidden,
  }: {
    className?: string
    'aria-hidden'?: boolean
  }) => (
    <div data-testid="mail-icon" className={className} aria-hidden={ariaHidden}>
      Mail
    </div>
  ),
  Loader2: ({
    className,
    'aria-hidden': ariaHidden,
  }: {
    className?: string
    'aria-hidden'?: boolean
  }) => (
    <div data-testid="loader-icon" className={className} aria-hidden={ariaHidden}>
      Loading
    </div>
  ),
}))

describe('Multi-Provider Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  describe('ProviderButton', () => {
    it('renders GitHub provider button correctly', () => {
      const githubConfig = PROVIDER_CONFIGS.github
      if (!githubConfig) throw new Error('GitHub config not found')

      render(<ProviderButton provider={githubConfig} callbackUrl="/dashboard" />)

      expect(screen.getByLabelText('Sign in with GitHub')).toBeInTheDocument()
      expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
      expect(screen.getByTestId('github-icon')).toBeInTheDocument()
    })

    it('renders Google provider button correctly', () => {
      const googleConfig = PROVIDER_CONFIGS.google
      if (!googleConfig) throw new Error('Google config not found')

      render(<ProviderButton provider={googleConfig} callbackUrl="/dashboard" />)

      expect(screen.getByLabelText('Sign in with Google')).toBeInTheDocument()
      expect(screen.getByText('Continue with Google')).toBeInTheDocument()
      expect(screen.getByTestId('mail-icon')).toBeInTheDocument()
    })

    it('shows loading state when clicked', async () => {
      const { signIn } = await import('next-auth/react')
      const githubConfig = PROVIDER_CONFIGS.github
      if (!githubConfig) throw new Error('GitHub config not found')

      render(<ProviderButton provider={githubConfig} callbackUrl="/dashboard" />)

      const button = screen.getByLabelText('Sign in with GitHub')
      fireEvent.click(button)

      // Verify signIn was called
      expect(signIn).toHaveBeenCalledWith('github', {
        callbackUrl: '/dashboard',
        redirect: true,
      })
    })

    it('handles disabled state correctly', () => {
      const githubConfig = PROVIDER_CONFIGS.github
      if (!githubConfig) throw new Error('GitHub config not found')

      render(<ProviderButton provider={githubConfig} disabled={true} />)

      const button = screen.getByLabelText('Sign in with GitHub')
      expect(button).toBeDisabled()
    })
  })

  describe('SignInButton (Multi-Provider)', () => {
    it('renders both GitHub and Google providers', () => {
      render(<SignInButton callbackUrl="/dashboard" />)

      // Should show both provider buttons
      expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
      expect(screen.getByText('Continue with Google')).toBeInTheDocument()

      // Should show "Or" divider between providers
      expect(screen.getByText('Or')).toBeInTheDocument()
    })

    it('provides correct callback URLs to provider buttons', async () => {
      const { signIn } = await import('next-auth/react')

      render(<SignInButton callbackUrl="/custom-callback" />)

      // Click GitHub button
      const githubButton = screen.getByLabelText('Sign in with GitHub')
      fireEvent.click(githubButton)

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith('github', {
          callbackUrl: '/custom-callback',
          redirect: true,
        })
      })
    })

    it('provides correct callback URLs to Google provider button', async () => {
      const { signIn } = await import('next-auth/react')

      render(<SignInButton callbackUrl="/custom-callback" />)

      // Click Google button
      const googleButton = screen.getByLabelText('Sign in with Google')
      fireEvent.click(googleButton)

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith('google', {
          callbackUrl: '/custom-callback',
          redirect: true,
        })
      })
    })

    it('uses default callback URL when none provided', async () => {
      const { signIn } = await import('next-auth/react')

      render(<SignInButton />)

      const githubButton = screen.getByLabelText('Sign in with GitHub')
      fireEvent.click(githubButton)

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith('github', {
          callbackUrl: '/dashboard',
          redirect: true,
        })
      })
    })
  })

  describe('Provider Configurations', () => {
    it('has correct GitHub provider configuration', () => {
      const github = PROVIDER_CONFIGS.github
      if (!github) throw new Error('GitHub config not found')

      expect(github.id).toBe('github')
      expect(github.name).toBe('GitHub')
      expect(github.bgColor).toContain('bg-gray-900')
      expect(github.textColor).toContain('text-white')
    })

    it('has correct Google provider configuration', () => {
      const google = PROVIDER_CONFIGS.google
      if (!google) throw new Error('Google config not found')

      expect(google.id).toBe('google')
      expect(google.name).toBe('Google')
      expect(google.bgColor).toContain('bg-white')
      expect(google.textColor).toContain('text-gray-900')
    })

    it('includes dark mode support in provider configurations', () => {
      const github = PROVIDER_CONFIGS.github
      const google = PROVIDER_CONFIGS.google
      if (!github) throw new Error('GitHub config not found')
      if (!google) throw new Error('Google config not found')

      expect(github.bgColor).toContain('dark:')
      expect(github.hoverColor).toContain('dark:')
      expect(google.bgColor).toContain('dark:')
      expect(google.hoverColor).toContain('dark:')
      expect(google.textColor).toContain('dark:')
    })
  })

  describe('Responsive Design', () => {
    it('applies mobile-specific styling', () => {
      const githubConfig = PROVIDER_CONFIGS.github
      if (!githubConfig) throw new Error('GitHub config not found')

      render(<ProviderButton provider={githubConfig} />)

      const button = screen.getByLabelText('Sign in with GitHub')

      // Check for responsive classes
      expect(button.className).toContain('py-3')
      expect(button.className).toContain('sm:py-2.5')
      expect(button.className).toContain('min-h-[44px]')
      expect(button.className).toContain('sm:min-h-[40px]')
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      const githubConfig = PROVIDER_CONFIGS.github
      if (!githubConfig) throw new Error('GitHub config not found')

      render(<ProviderButton provider={githubConfig} />)

      expect(screen.getByLabelText('Sign in with GitHub')).toBeInTheDocument()
    })

    it('has proper focus management', () => {
      const githubConfig = PROVIDER_CONFIGS.github
      if (!githubConfig) throw new Error('GitHub config not found')

      render(<ProviderButton provider={githubConfig} />)

      const button = screen.getByLabelText('Sign in with GitHub')
      expect(button.className).toContain('focus-visible:outline')
    })

    it('marks icons as hidden from screen readers', () => {
      const githubConfig = PROVIDER_CONFIGS.github
      if (!githubConfig) throw new Error('GitHub config not found')

      render(<ProviderButton provider={githubConfig} />)

      const icon = screen.getByTestId('github-icon')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
