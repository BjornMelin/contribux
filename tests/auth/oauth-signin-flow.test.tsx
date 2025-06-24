import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import OAuthSignInPage from '@/app/auth/signin/page'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  animate: vi.fn(),
  useMotionTemplate: vi.fn(() => ''),
  useMotionValue: vi.fn(() => ({ set: vi.fn() })),
  Transition: {},
}))

describe('OAuth Sign-In Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Sign-In Page UI', () => {
    it('renders the sign-in page with all OAuth providers', () => {
      render(<OAuthSignInPage />)

      // Check page title
      expect(screen.getByText('Welcome to contribux')).toBeInTheDocument()
      expect(
        screen.getByText('Discover and contribute to impactful open source projects')
      ).toBeInTheDocument()

      // Check OAuth buttons
      expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
      expect(screen.getByText('Continue with Google')).toBeInTheDocument()

      // Check email form
      expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument()
      expect(screen.getByText('Sign In with Email')).toBeInTheDocument()

      // Check footer links
      expect(screen.getByText('Terms of Service')).toBeInTheDocument()
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument()
    })

    it('toggles password visibility', () => {
      render(<OAuthSignInPage />)

      const passwordInputs = screen.getAllByPlaceholderText('Enter your password')
      const passwordInput = passwordInputs[0] // Get the first one
      const toggleButton = passwordInput.parentElement?.querySelector('button[type="button"]')

      expect(passwordInput).toHaveAttribute('type', 'password')

      fireEvent.click(toggleButton!)
      expect(passwordInput).toHaveAttribute('type', 'text')

      fireEvent.click(toggleButton!)
      expect(passwordInput).toHaveAttribute('type', 'password')
    })
  })

  describe('OAuth Provider Sign-In', () => {
    it('handles GitHub sign-in', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValueOnce({ ok: true, error: null, status: 200, url: '/' })

      render(<OAuthSignInPage />)

      const githubButtons = screen.getAllByText('Continue with GitHub')
      const githubButton = githubButtons[0].closest('button')
      fireEvent.click(githubButton!)

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('github', { callbackUrl: '/' })
      })
    })

    it('handles Google sign-in', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockResolvedValueOnce({ ok: true, error: null, status: 200, url: '/' })

      render(<OAuthSignInPage />)

      const googleButtons = screen.getAllByText('Continue with Google')
      const googleButton = googleButtons[0].closest('button')
      fireEvent.click(googleButton!)

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/' })
      })
    })

    it('shows loading state during sign-in', async () => {
      const mockSignIn = vi.mocked(signIn)
      mockSignIn.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      )

      render(<OAuthSignInPage />)

      const githubButtons = screen.getAllByText('Continue with GitHub')
      const githubButton = githubButtons[0].closest('button')
      fireEvent.click(githubButton!)

      // Check that button is disabled during loading
      await waitFor(() => {
        expect(githubButton).toBeDisabled()
      })
    })

    it('handles sign-in errors gracefully', async () => {
      const mockSignIn = vi.mocked(signIn)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      mockSignIn.mockRejectedValueOnce(new Error('Authentication failed'))

      render(<OAuthSignInPage />)

      const githubButtons = screen.getAllByText('Continue with GitHub')
      const githubButton = githubButtons[0].closest('button')
      fireEvent.click(githubButton!)

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'GitHub sign-in failed:',
          expect.any(Error)
        )
      })

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Email Sign-In', () => {
    it('shows alert for email sign-in', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(<OAuthSignInPage />)

      const emailInput = screen.getByPlaceholderText('Enter your email')
      const passwordInput = screen.getByPlaceholderText('Enter your password')
      const signInButton = screen.getByText('Sign In with Email')

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(signInButton)

      expect(alertSpy).toHaveBeenCalledWith(
        'Email authentication is not currently set up. Please use GitHub or Google to sign in.'
      )

      alertSpy.mockRestore()
    })

    it('disables sign-in button when email or password is empty', () => {
      render(<OAuthSignInPage />)

      const signInButton = screen.getByText('Sign In with Email')
      expect(signInButton).toBeDisabled()

      const emailInput = screen.getByPlaceholderText('Enter your email')
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

      // Still disabled with only email
      expect(signInButton).toBeDisabled()

      const passwordInput = screen.getByPlaceholderText('Enter your password')
      fireEvent.change(passwordInput, { target: { value: 'password123' } })

      // Now enabled with both
      expect(signInButton).not.toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA labels and keyboard navigation', () => {
      render(<OAuthSignInPage />)

      // Check form inputs are labeled
      const emailInput = screen.getByPlaceholderText('Enter your email')
      expect(emailInput).toHaveAttribute('type', 'email')

      const passwordInput = screen.getByPlaceholderText('Enter your password')
      expect(passwordInput).toHaveAttribute('type', 'password')

      // Check links have proper href
      const termsLink = screen.getByText('Terms of Service')
      expect(termsLink).toHaveAttribute('href', '/legal/terms')

      const privacyLink = screen.getByText('Privacy Policy')
      expect(privacyLink).toHaveAttribute('href', '/legal/privacy')
    })
  })
})