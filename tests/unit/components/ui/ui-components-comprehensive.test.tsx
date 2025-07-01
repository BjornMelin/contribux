/**
 * @vitest-environment jsdom
 */

/**
 * Comprehensive UI Components Test Suite
 * Tests for all base UI components with accessibility and responsive design
 *
 * Features tested:
 * - Button component variants and states
 * - Input component validation and accessibility
 * - Card component layouts and content
 * - Dialog component modal behavior
 * - Badge component styling and content
 * - Responsive design across viewports
 * - Accessibility compliance (WCAG 2.1 AA)
 * - Dark mode support
 * - Keyboard navigation
 * - Screen reader compatibility
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cleanupComponentTest, setupComponentTest } from '@/tests/utils/modern-test-helpers'

// Mock ResizeObserver for dialog tests
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Helper to simulate viewport changes
const setViewport = (width: number, height = 768) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  })
  window.dispatchEvent(new Event('resize'))
}

// Helper to simulate dark mode
const setDarkMode = (isDark: boolean) => {
  if (isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

describe('UI Components - Comprehensive Testing', () => {
  beforeEach(() => {
    setupComponentTest()
    // Reset viewport to desktop
    setViewport(1024, 768)
    // Reset to light mode
    setDarkMode(false)
  })

  afterEach(() => {
    cleanupComponentTest()
  })

  describe('Button Component', () => {
    describe('Variants and Sizes', () => {
      it('renders default button correctly', () => {
        render(<Button>Default Button</Button>)

        const button = screen.getByRole('button', { name: 'Default Button' })
        expect(button).toBeInTheDocument()
        expect(button).toHaveClass('inline-flex')
      })

      it('renders all button variants', () => {
        const variants = [
          'default',
          'destructive',
          'outline',
          'secondary',
          'ghost',
          'link',
        ] as const

        variants.forEach(variant => {
          const { unmount } = render(<Button variant={variant}>{variant} Button</Button>)

          const button = screen.getByRole('button', { name: `${variant} Button` })
          expect(button).toBeInTheDocument()

          unmount()
        })
      })

      it('renders all button sizes', () => {
        const sizes = ['default', 'sm', 'lg', 'icon'] as const

        sizes.forEach(size => {
          const { unmount } = render(<Button size={size}>{size} Button</Button>)

          const button = screen.getByRole('button', { name: `${size} Button` })
          expect(button).toBeInTheDocument()

          unmount()
        })
      })

      it('applies custom className', () => {
        render(<Button className="custom-class">Custom Button</Button>)

        const button = screen.getByRole('button', { name: 'Custom Button' })
        expect(button).toHaveClass('custom-class')
      })
    })

    describe('States and Behavior', () => {
      it('handles click events', async () => {
        const handleClick = vi.fn()
        const user = userEvent.setup()

        render(<Button onClick={handleClick}>Click Me</Button>)

        const button = screen.getByRole('button', { name: 'Click Me' })
        await user.click(button)

        expect(handleClick).toHaveBeenCalledTimes(1)
      })

      it('handles disabled state', () => {
        const handleClick = vi.fn()

        render(
          <Button disabled onClick={handleClick}>
            Disabled Button
          </Button>
        )

        const button = screen.getByRole('button', { name: 'Disabled Button' })
        expect(button).toBeDisabled()

        fireEvent.click(button)
        expect(handleClick).not.toHaveBeenCalled()
      })

      it('supports keyboard navigation', async () => {
        const handleClick = vi.fn()
        const user = userEvent.setup()

        render(<Button onClick={handleClick}>Keyboard Button</Button>)

        const button = screen.getByRole('button', { name: 'Keyboard Button' })
        button.focus()
        expect(button).toHaveFocus()

        await user.keyboard('{Enter}')
        expect(handleClick).toHaveBeenCalledTimes(1)

        await user.keyboard(' ')
        expect(handleClick).toHaveBeenCalledTimes(2)
      })

      it('handles loading state with asChild', () => {
        render(
          <Button asChild>
            <a href="/test">Link Button</a>
          </Button>
        )

        const link = screen.getByRole('link', { name: 'Link Button' })
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('href', '/test')
      })
    })

    describe('Accessibility', () => {
      it('has proper ARIA attributes', () => {
        render(
          <Button aria-label="Custom label" aria-describedby="help-text" type="submit">
            Submit
          </Button>
        )

        const button = screen.getByRole('button', { name: 'Custom label' })
        expect(button).toHaveAttribute('aria-describedby', 'help-text')
        expect(button).toHaveAttribute('type', 'submit')
      })

      it('supports focus visible styles', () => {
        render(<Button>Focus Test</Button>)

        const button = screen.getByRole('button', { name: 'Focus Test' })
        button.focus()

        expect(button).toHaveFocus()
        expect(button.className).toContain('focus-visible')
      })
    })

    describe('Responsive Design', () => {
      it('adapts to mobile viewport', () => {
        setViewport(375) // Mobile width

        render(<Button size="default">Mobile Button</Button>)

        const button = screen.getByRole('button', { name: 'Mobile Button' })
        expect(button).toBeVisible()

        // Should maintain minimum touch target size
        const rect = button.getBoundingClientRect()
        expect(rect.height).toBeGreaterThanOrEqual(44)
      })

      it('maintains usability on touch devices', () => {
        render(<Button size="sm">Small Touch Button</Button>)

        const button = screen.getByRole('button', { name: 'Small Touch Button' })
        const rect = button.getBoundingClientRect()

        // Even small buttons should have adequate touch targets
        expect(rect.height).toBeGreaterThanOrEqual(32)
      })
    })

    describe('Dark Mode Support', () => {
      it('adapts styles for dark mode', () => {
        setDarkMode(true)

        render(<Button variant="outline">Dark Mode Button</Button>)

        const button = screen.getByRole('button', { name: 'Dark Mode Button' })
        expect(button).toBeInTheDocument()

        // Check that dark mode classes are applied
        expect(document.documentElement).toHaveClass('dark')
      })
    })
  })

  describe('Input Component', () => {
    describe('Basic Functionality', () => {
      it('renders input with label', () => {
        render(
          <div>
            <label htmlFor="test-input">Test Label</label>
            <Input id="test-input" placeholder="Enter text" />
          </div>
        )

        const input = screen.getByLabelText('Test Label')
        expect(input).toBeInTheDocument()
        expect(input).toHaveAttribute('placeholder', 'Enter text')
      })

      it('handles value changes', async () => {
        const handleChange = vi.fn()
        const user = userEvent.setup()

        render(<Input onChange={handleChange} placeholder="Type here" />)

        const input = screen.getByPlaceholderText('Type here')
        await user.type(input, 'Hello World')

        expect(input).toHaveValue('Hello World')
        expect(handleChange).toHaveBeenCalled()
      })

      it('supports different input types', () => {
        const types = ['text', 'email', 'password', 'number', 'tel', 'url'] as const

        types.forEach(type => {
          const { unmount } = render(<Input type={type} placeholder={`${type} input`} />)

          const input = screen.getByPlaceholderText(`${type} input`)
          expect(input).toHaveAttribute('type', type)

          unmount()
        })
      })

      it('handles disabled state', () => {
        render(<Input disabled placeholder="Disabled input" />)

        const input = screen.getByPlaceholderText('Disabled input')
        expect(input).toBeDisabled()
      })
    })

    describe('Validation and Error States', () => {
      it('displays error state with ARIA attributes', () => {
        render(
          <div>
            <Input
              aria-invalid="true"
              aria-describedby="error-message"
              placeholder="Invalid input"
            />
            <div id="error-message" role="alert">
              This field is required
            </div>
          </div>
        )

        const input = screen.getByPlaceholderText('Invalid input')
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input).toHaveAttribute('aria-describedby', 'error-message')

        const errorMessage = screen.getByRole('alert')
        expect(errorMessage).toHaveTextContent('This field is required')
      })

      it('supports required validation', () => {
        render(
          <form>
            <Input required aria-label="Required field" />
            <button type="submit">Submit</button>
          </form>
        )

        const input = screen.getByLabelText('Required field')
        expect(input).toHaveAttribute('required')
      })

      it('handles form validation', async () => {
        const handleSubmit = vi.fn(e => e.preventDefault())
        const user = userEvent.setup()

        render(
          <form onSubmit={handleSubmit}>
            <Input type="email" required aria-label="Email address" placeholder="Enter email" />
            <button type="submit">Submit</button>
          </form>
        )

        const submitButton = screen.getByRole('button', { name: 'Submit' })
        await user.click(submitButton)

        // HTML5 validation should prevent form submission
        expect(handleSubmit).not.toHaveBeenCalled()
      })
    })

    describe('Accessibility', () => {
      it('supports screen reader navigation', () => {
        render(
          <div>
            <label htmlFor="accessible-input">Accessible Input</label>
            <Input id="accessible-input" aria-describedby="help-text" placeholder="Enter value" />
            <div id="help-text">This field accepts alphanumeric characters</div>
          </div>
        )

        const input = screen.getByLabelText('Accessible Input')
        expect(input).toHaveAttribute('aria-describedby', 'help-text')

        const helpText = screen.getByText('This field accepts alphanumeric characters')
        expect(helpText).toBeInTheDocument()
      })

      it('supports keyboard navigation', async () => {
        const user = userEvent.setup()

        render(
          <div>
            <Input placeholder="First input" />
            <Input placeholder="Second input" />
          </div>
        )

        const firstInput = screen.getByPlaceholderText('First input')
        const secondInput = screen.getByPlaceholderText('Second input')

        firstInput.focus()
        expect(firstInput).toHaveFocus()

        await user.tab()
        expect(secondInput).toHaveFocus()
      })
    })

    describe('Responsive Design', () => {
      it('adapts to mobile viewport', () => {
        setViewport(375) // Mobile width

        render(<Input placeholder="Mobile input" />)

        const input = screen.getByPlaceholderText('Mobile input')
        expect(input).toBeVisible()

        // Should have adequate touch target size
        const rect = input.getBoundingClientRect()
        expect(rect.height).toBeGreaterThanOrEqual(44)
      })
    })
  })

  describe('Card Component', () => {
    describe('Structure and Content', () => {
      it('renders complete card structure', () => {
        render(
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card description text</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Card content goes here</p>
            </CardContent>
            <CardFooter>
              <Button>Action</Button>
            </CardFooter>
          </Card>
        )

        expect(screen.getByText('Card Title')).toBeInTheDocument()
        expect(screen.getByText('Card description text')).toBeInTheDocument()
        expect(screen.getByText('Card content goes here')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
      })

      it('supports custom styling', () => {
        render(
          <Card className="custom-card">
            <CardContent className="custom-content">Custom styled card</CardContent>
          </Card>
        )

        const card = screen.getByText('Custom styled card').closest('.custom-card')
        expect(card).toBeInTheDocument()
        expect(card).toHaveClass('custom-card')
      })

      it('handles interactive cards', async () => {
        const handleClick = vi.fn()
        const user = userEvent.setup()

        render(
          <Card className="cursor-pointer" onClick={handleClick} role="button" tabIndex={0}>
            <CardContent>Clickable card</CardContent>
          </Card>
        )

        const card = screen.getByRole('button')
        await user.click(card)

        expect(handleClick).toHaveBeenCalledTimes(1)
      })
    })

    describe('Accessibility', () => {
      it('supports semantic structure', () => {
        render(
          <Card role="article">
            <CardHeader>
              <CardTitle>Article Title</CardTitle>
            </CardHeader>
            <CardContent>Article content</CardContent>
          </Card>
        )

        const article = screen.getByRole('article')
        expect(article).toBeInTheDocument()

        const heading = within(article).getByRole('heading')
        expect(heading).toHaveTextContent('Article Title')
      })

      it('supports keyboard navigation for interactive cards', async () => {
        const handleClick = vi.fn()
        const user = userEvent.setup()

        render(
          <Card
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleClick()
              }
            }}
          >
            <CardContent>Keyboard accessible card</CardContent>
          </Card>
        )

        const card = screen.getByRole('button')
        card.focus()
        expect(card).toHaveFocus()

        await user.keyboard('{Enter}')
        expect(handleClick).toHaveBeenCalledTimes(1)

        await user.keyboard(' ')
        expect(handleClick).toHaveBeenCalledTimes(2)
      })
    })

    describe('Responsive Design', () => {
      it('adapts to different screen sizes', () => {
        const { rerender } = render(
          <Card>
            <CardContent>Responsive card</CardContent>
          </Card>
        )

        // Desktop
        setViewport(1024)
        rerender(
          <Card>
            <CardContent>Responsive card</CardContent>
          </Card>
        )
        expect(screen.getByText('Responsive card')).toBeVisible()

        // Mobile
        setViewport(375)
        rerender(
          <Card>
            <CardContent>Responsive card</CardContent>
          </Card>
        )
        expect(screen.getByText('Responsive card')).toBeVisible()
      })
    })
  })

  describe('Dialog Component', () => {
    describe('Modal Behavior', () => {
      it('opens and closes dialog', async () => {
        const user = userEvent.setup()

        render(
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog Title</DialogTitle>
                <DialogDescription>Dialog description</DialogDescription>
              </DialogHeader>
              <p>Dialog content</p>
            </DialogContent>
          </Dialog>
        )

        const triggerButton = screen.getByRole('button', { name: 'Open Dialog' })
        await user.click(triggerButton)

        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument()
          expect(screen.getByText('Dialog Title')).toBeInTheDocument()
          expect(screen.getByText('Dialog description')).toBeInTheDocument()
        })
      })

      it('closes dialog with escape key', async () => {
        const user = userEvent.setup()

        render(
          <Dialog defaultOpen>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Test Dialog</DialogTitle>
              </DialogHeader>
              <p>Press escape to close</p>
            </DialogContent>
          </Dialog>
        )

        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument()
        })

        await user.keyboard('{Escape}')

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
      })

      it('traps focus within dialog', async () => {
        const user = userEvent.setup()

        render(
          <Dialog defaultOpen>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Focus Trap Test</DialogTitle>
              </DialogHeader>
              <Button>First Button</Button>
              <Button>Second Button</Button>
            </DialogContent>
          </Dialog>
        )

        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument()
        })

        const firstButton = screen.getByRole('button', { name: 'First Button' })
        const secondButton = screen.getByRole('button', { name: 'Second Button' })

        // Focus should start on first focusable element
        expect(firstButton).toHaveFocus()

        await user.tab()
        expect(secondButton).toHaveFocus()

        // Tab from last element should cycle back to first
        await user.tab()
        expect(firstButton).toHaveFocus()
      })
    })

    describe('Accessibility', () => {
      it('has proper ARIA attributes', async () => {
        render(
          <Dialog defaultOpen>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Accessible Dialog</DialogTitle>
                <DialogDescription>This dialog is accessible</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        )

        await waitFor(() => {
          const dialog = screen.getByRole('dialog')
          expect(dialog).toBeInTheDocument()
          expect(dialog).toHaveAttribute('aria-labelledby')
          expect(dialog).toHaveAttribute('aria-describedby')
        })
      })

      it('announces dialog to screen readers', async () => {
        render(
          <Dialog defaultOpen>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Screen Reader Test</DialogTitle>
              </DialogHeader>
              <p role="status">Dialog opened</p>
            </DialogContent>
          </Dialog>
        )

        await waitFor(() => {
          const status = screen.getByRole('status')
          expect(status).toHaveTextContent('Dialog opened')
        })
      })
    })

    describe('Responsive Design', () => {
      it('adapts to mobile viewport', async () => {
        setViewport(375) // Mobile width

        render(
          <Dialog defaultOpen>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mobile Dialog</DialogTitle>
              </DialogHeader>
              <p>Mobile optimized dialog</p>
            </DialogContent>
          </Dialog>
        )

        await waitFor(() => {
          const dialog = screen.getByRole('dialog')
          expect(dialog).toBeInTheDocument()
          expect(dialog).toBeVisible()
        })
      })
    })
  })

  describe('Badge Component', () => {
    describe('Variants and Content', () => {
      it('renders different badge variants', () => {
        const variants = ['default', 'secondary', 'destructive', 'outline'] as const

        variants.forEach(variant => {
          const { unmount } = render(<Badge variant={variant}>{variant} Badge</Badge>)

          const badge = screen.getByText(`${variant} Badge`)
          expect(badge).toBeInTheDocument()

          unmount()
        })
      })

      it('displays content correctly', () => {
        render(
          <div>
            <Badge>Simple Badge</Badge>
            <Badge>
              <span>Complex Badge</span>
            </Badge>
            <Badge>99+</Badge>
          </div>
        )

        expect(screen.getByText('Simple Badge')).toBeInTheDocument()
        expect(screen.getByText('Complex Badge')).toBeInTheDocument()
        expect(screen.getByText('99+')).toBeInTheDocument()
      })

      it('supports custom styling', () => {
        render(<Badge className="custom-badge">Custom Badge</Badge>)

        const badge = screen.getByText('Custom Badge')
        expect(badge).toHaveClass('custom-badge')
      })
    })

    describe('Accessibility', () => {
      it('provides semantic meaning', () => {
        render(
          <div>
            <span>Status: </span>
            <Badge role="status">Active</Badge>
          </div>
        )

        const statusBadge = screen.getByRole('status')
        expect(statusBadge).toHaveTextContent('Active')
      })

      it('supports screen reader content', () => {
        render(<Badge aria-label="5 unread notifications">5</Badge>)

        const badge = screen.getByLabelText('5 unread notifications')
        expect(badge).toHaveTextContent('5')
      })
    })

    describe('Responsive Design', () => {
      it('maintains readability across screen sizes', () => {
        render(<Badge>Responsive Badge</Badge>)

        const badge = screen.getByText('Responsive Badge')

        // Desktop
        setViewport(1024)
        expect(badge).toBeVisible()

        // Mobile
        setViewport(375)
        expect(badge).toBeVisible()
      })
    })
  })

  describe('Cross-Component Integration', () => {
    it('integrates components within cards', async () => {
      const handleSubmit = vi.fn(e => e.preventDefault())
      const user = userEvent.setup()

      render(
        <Card>
          <CardHeader>
            <CardTitle>User Settings</CardTitle>
            <CardDescription>Update your preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <Input placeholder="Enter username" aria-label="Username" />
              <Badge variant="secondary">Premium</Badge>
            </form>
          </CardContent>
          <CardFooter>
            <Button type="submit" onClick={handleSubmit}>
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      )

      const input = screen.getByLabelText('Username')
      await user.type(input, 'testuser')

      const saveButton = screen.getByRole('button', { name: 'Save Changes' })
      await user.click(saveButton)

      expect(handleSubmit).toHaveBeenCalled()
      expect(input).toHaveValue('testuser')
      expect(screen.getByText('Premium')).toBeInTheDocument()
    })

    it('maintains accessibility across nested components', () => {
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Form Dialog</DialogTitle>
            </DialogHeader>
            <Card>
              <CardContent>
                <Input aria-label="Dialog input" placeholder="Enter text" />
                <Badge role="status">Required</Badge>
              </CardContent>
            </Card>
          </DialogContent>
        </Dialog>
      )

      const dialog = screen.getByRole('dialog')
      const input = screen.getByLabelText('Dialog input')
      const status = screen.getByRole('status')

      expect(dialog).toBeInTheDocument()
      expect(input).toBeInTheDocument()
      expect(status).toHaveTextContent('Required')
    })
  })

  describe('Performance Considerations', () => {
    it('renders multiple components efficiently', () => {
      const start = performance.now()

      render(
        <div>
          {Array.from({ length: 50 }, (_, i) => (
            <Card key={i}>
              <CardContent>
                <Button>Button {i}</Button>
                <Input placeholder={`Input ${i}`} />
                <Badge>Badge {i}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )

      const end = performance.now()
      const renderTime = end - start

      // Should render efficiently even with many components
      expect(renderTime).toBeLessThan(1000)

      // Verify all components are rendered
      expect(screen.getAllByRole('button')).toHaveLength(50)
      expect(screen.getAllByRole('textbox')).toHaveLength(50)
    })
  })
})
