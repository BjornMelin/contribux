# Component Testing Best Practices Guide

## Contribux Component Testing Framework
**Next.js 15 + React 19 + TypeScript 5.8 + Vitest 3.2 + NextAuth.js v5 + Drizzle ORM**

---

## 🎯 Testing Philosophy

### Core Principles
- **User-Centric Testing**: Test components from the user's perspective, not implementation details
- **Accessibility First**: Every test validates WCAG 2.1 AA compliance
- **Real-World Scenarios**: Use realistic data, error conditions, and user interactions
- **Performance Awareness**: Monitor render times, memory usage, and responsiveness
- **Integration Focus**: Test component interactions with APIs, state, and authentication

### Testing Pyramid for Components
```
┌─────────────────────────────────────┐
│        E2E Tests (5%)               │  Browser automation, full workflows
├─────────────────────────────────────┤
│     Integration Tests (25%)         │  Component-API, state management
├─────────────────────────────────────┤
│       Unit Tests (70%)              │  Component rendering, user interactions
└─────────────────────────────────────┘
```

---

## 🏗️ Architecture Overview

### Test Organization Structure
```
tests/
├── unit/components/           # Individual component tests
│   ├── auth/                 # Authentication components
│   ├── search/               # Search & discovery components
│   └── ui/                   # Reusable UI components
├── integration/components/    # Component integration tests
├── utils/                    # Testing utilities & helpers
├── fixtures/                 # Test data and mock objects
└── mocks/                    # API mocks and service workers
```

### Key Technologies & Tools
- **Vitest 3.2+**: Fast, modern test runner with native ESM support
- **React Testing Library**: User-centric component testing
- **MSW (Mock Service Worker)**: API mocking for integration tests
- **@testing-library/jest-dom**: Enhanced DOM assertions
- **@testing-library/user-event**: Realistic user interactions
- **@tanstack/react-query**: Data fetching and caching

---

## 🔧 Setup and Configuration

### Essential Test Utilities Import
```typescript
// Standard imports for component tests
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
```

### Universal Test Wrapper
```typescript
// Use this wrapper for all component tests
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={mockSession}>
        {children}
      </SessionProvider>
    </QueryClientProvider>
  )
}
```

### Performance Monitoring
```typescript
// Include in performance-critical component tests
const measureRenderTime = async (componentCount: number = 1) => {
  const start = performance.now()
  // Render components
  const end = performance.now()
  expect(end - start).toBeLessThan(1000) // < 1s for 100 components
}
```

---

## 🧪 Testing Patterns by Component Type

### 1. Authentication Components

#### Session-Aware Components
```typescript
describe('SessionAwareComponent', () => {
  it('renders authenticated content when user is logged in', () => {
    render(
      <TestWrapper>
        <ProfileMenu />
      </TestWrapper>
    )
    
    expect(screen.getByRole('button', { name: /profile menu/i })).toBeInTheDocument()
    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('renders sign-in prompt when user is not authenticated', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider session={null}>
          <ProfileMenu />
        </SessionProvider>
      </QueryClientProvider>
    )
    
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })
})
```

#### Permission-Based Rendering
```typescript
it('shows admin controls only for admin users', () => {
  const adminSession = {
    ...mockSession,
    user: { ...mockSession.user, role: 'admin' }
  }

  render(
    <SessionProvider session={adminSession}>
      <AdminPanel />
    </SessionProvider>
  )

  expect(screen.getByRole('button', { name: /delete user/i })).toBeInTheDocument()
})
```

### 2. Search & Discovery Components

#### Search Interface Testing
```typescript
describe('SearchBar', () => {
  it('performs search with debounced input', async () => {
    const user = userEvent.setup()
    const mockSearch = vi.fn()

    render(<SearchBar onSearch={mockSearch} />)

    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'typescript')

    // Should debounce search calls
    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledTimes(1)
      expect(mockSearch).toHaveBeenCalledWith('typescript')
    }, { timeout: 1000 })
  })

  it('handles empty search gracefully', async () => {
    const user = userEvent.setup()
    
    render(<SearchBar onSearch={vi.fn()} />)
    
    const searchButton = screen.getByRole('button', { name: /search/i })
    expect(searchButton).toBeDisabled()
    
    await user.type(screen.getByRole('searchbox'), '   ')
    expect(searchButton).toBeDisabled() // Should still be disabled for whitespace
  })
})
```

#### Filter Components
```typescript
describe('RepositoryFilters', () => {
  it('applies multiple filters correctly', async () => {
    const user = userEvent.setup()
    const mockOnFilter = vi.fn()

    render(<RepositoryFilters onFilter={mockOnFilter} />)

    // Apply language filter
    const languageSelect = screen.getByLabelText(/programming language/i)
    await user.selectOptions(languageSelect, 'typescript')

    // Apply difficulty filter  
    const difficultyRadio = screen.getByRole('radio', { name: /intermediate/i })
    await user.click(difficultyRadio)

    await waitFor(() => {
      expect(mockOnFilter).toHaveBeenCalledWith({
        language: 'typescript',
        difficulty: 'intermediate'
      })
    })
  })
})
```

### 3. UI Components

#### Interactive Components
```typescript
describe('BookmarkButton', () => {
  it('toggles bookmark state with optimistic updates', async () => {
    const user = userEvent.setup()
    const mockToggle = vi.fn()

    render(
      <BookmarkButton 
        isBookmarked={false} 
        onToggle={mockToggle} 
        repositoryName="test-repo"
      />
    )

    const button = screen.getByRole('button', { name: /add bookmark for test-repo/i })
    await user.click(button)

    // Should immediately show optimistic state
    expect(screen.getByRole('button', { name: /remove bookmark for test-repo/i }))
      .toBeInTheDocument()
    expect(mockToggle).toHaveBeenCalledWith(true)
  })
})
```

#### Responsive Components
```typescript
describe('ResponsiveNavigation', () => {
  it('shows mobile menu on small screens', () => {
    // Mock viewport
    Object.defineProperty(window, 'innerWidth', { value: 768 })
    
    render(<Navigation />)
    
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('shows full navigation on desktop', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024 })
    
    render(<Navigation />)
    
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /menu/i })).not.toBeInTheDocument()
  })
})
```

---

## 🔌 Integration Testing Patterns

### Component-API Integration
```typescript
describe('RepositoryCard Integration', () => {
  beforeEach(() => {
    server.use(
      http.post('/api/bookmarks', async ({ request }) => {
        const { repository_id } = await request.json()
        return HttpResponse.json({ 
          success: true, 
          data: { bookmarked: true, repository_id } 
        })
      })
    )
  })

  it('integrates bookmark functionality with API', async () => {
    const user = userEvent.setup()
    
    render(
      <TestWrapper>
        <RepositoryCard repository={mockRepository} />
      </TestWrapper>
    )

    await user.click(screen.getByRole('button', { name: /bookmark/i }))

    await waitFor(() => {
      expect(screen.getByText(/bookmarked/i)).toBeInTheDocument()
    })
  })
})
```

### State Management Integration
```typescript
describe('SearchResults with State', () => {
  it('persists search state across navigation', async () => {
    const { rerender } = render(
      <TestWrapper>
        <SearchResults query="typescript" />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByText(/typescript repositories/i)).toBeInTheDocument()
    })

    // Simulate navigation
    rerender(
      <TestWrapper>
        <SearchResults query="typescript" />
      </TestWrapper>
    )

    // State should be preserved
    expect(screen.getByText(/typescript repositories/i)).toBeInTheDocument()
  })
})
```

---

## ♿ Accessibility Testing Standards

### WCAG 2.1 AA Compliance Checklist
```typescript
describe('Accessibility Compliance', () => {
  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    
    render(<RepositoryFilters />)

    // Tab through interactive elements
    await user.tab()
    expect(screen.getByLabelText(/programming language/i)).toHaveFocus()
    
    await user.tab()
    expect(screen.getByRole('radio', { name: /beginner/i })).toHaveFocus()
  })

  it('provides proper ARIA labels and descriptions', () => {
    render(<SearchBar />)
    
    const searchInput = screen.getByRole('searchbox')
    expect(searchInput).toHaveAttribute('aria-label', 'Search repositories')
    expect(searchInput).toHaveAttribute('aria-describedby')
  })

  it('maintains sufficient color contrast', () => {
    render(<Button variant="primary">Click me</Button>)
    
    const button = screen.getByRole('button')
    const styles = window.getComputedStyle(button)
    
    // Verify contrast meets WCAG AA standards (4.5:1)
    expect(calculateContrast(styles.color, styles.backgroundColor))
      .toBeGreaterThanOrEqual(4.5)
  })
})
```

### Screen Reader Testing
```typescript
it('provides meaningful content to screen readers', () => {
  render(<RepositoryCard repository={mockRepository} />)
  
  const article = screen.getByRole('article')
  expect(article).toHaveAttribute('aria-label', expect.stringContaining(mockRepository.name))
  
  const description = screen.getByText(mockRepository.description)
  expect(description).toBeInTheDocument()
})
```

---

## 🚀 Performance Testing Guidelines

### Render Performance
```typescript
describe('Performance', () => {
  it('renders large lists efficiently', async () => {
    const repositories = Array.from({ length: 100 }, (_, i) => createMockRepository(i))
    
    const start = performance.now()
    render(
      <TestWrapper>
        <RepositoryList repositories={repositories} />
      </TestWrapper>
    )
    const renderTime = performance.now() - start

    expect(screen.getAllByRole('article')).toHaveLength(100)
    expect(renderTime).toBeLessThan(1000) // < 1 second for 100 items
  })

  it('manages memory efficiently during component lifecycle', () => {
    const initialMemory = performance.memory?.usedJSHeapSize || 0
    
    const { unmount } = render(<MemoryIntensiveComponent />)
    const afterRender = performance.memory?.usedJSHeapSize || 0
    
    unmount()
    if (global.gc) global.gc() // Force garbage collection
    
    const afterUnmount = performance.memory?.usedJSHeapSize || 0
    const memoryRecovered = afterRender - afterUnmount
    
    expect(memoryRecovered).toBeGreaterThan(0)
  })
})
```

### Virtual Scrolling Performance
```typescript
it('handles virtual scrolling for large datasets', async () => {
  const largeDataset = Array.from({ length: 10000 }, (_, i) => createMockItem(i))
  
  render(<VirtualizedList items={largeDataset} />)
  
  // Should only render visible items
  const visibleItems = screen.getAllByRole('listitem')
  expect(visibleItems.length).toBeLessThan(50) // Only render viewport items
  
  // Scroll performance
  const scrollContainer = screen.getByRole('list')
  const start = performance.now()
  fireEvent.scroll(scrollContainer, { target: { scrollTop: 5000 } })
  const scrollTime = performance.now() - start
  
  expect(scrollTime).toBeLessThan(100) // Smooth scrolling
})
```

---

## 🛠️ Testing Utilities & Helpers

### Custom Render Function
```typescript
// tests/utils/custom-render.tsx
export const renderWithProviders = (
  ui: React.ReactElement,
  options: {
    session?: Session | null
    queryClient?: QueryClient
    route?: string
  } = {}
) => {
  const { session = mockSession, queryClient = new QueryClient(), route = '/' } = options

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <Router router={createMemoryRouter([{ path: route, element: children }])} />
      </SessionProvider>
    </QueryClientProvider>
  )

  return render(ui, { wrapper: Wrapper })
}
```

### Mock Data Factories
```typescript
// tests/fixtures/factories.ts
export const createMockRepository = (overrides: Partial<Repository> = {}): Repository => ({
  id: `repo-${Math.random().toString(36).substr(2, 9)}`,
  name: 'test-repository',
  description: 'A test repository for unit testing',
  language: 'TypeScript',
  stars: Math.floor(Math.random() * 1000),
  forks: Math.floor(Math.random() * 100),
  is_bookmarked: false,
  owner: {
    username: 'testuser',
    avatar_url: 'https://example.com/avatar.jpg',
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  user: {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    image: 'https://example.com/avatar.jpg',
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})
```

### API Mock Helpers
```typescript
// tests/mocks/api-handlers.ts
export const createSuccessHandler = (endpoint: string, data: any) => 
  http.get(endpoint, () => HttpResponse.json({
    success: true,
    data,
    metadata: { execution_time_ms: 25 }
  }))

export const createErrorHandler = (endpoint: string, error: any, status = 500) =>
  http.get(endpoint, () => HttpResponse.json({
    success: false,
    error
  }, { status }))

export const createLoadingHandler = (endpoint: string, delay = 100) =>
  http.get(endpoint, async () => {
    await new Promise(resolve => setTimeout(resolve, delay))
    return HttpResponse.json({ success: true, data: [] })
  })
```

---

## 📊 Coverage and Quality Metrics

### Coverage Targets
- **Component Coverage**: 90%+ (line, branch, function)
- **Integration Coverage**: 80%+ (critical user paths)
- **Accessibility Coverage**: 100% (all interactive elements)

### Quality Gates
```typescript
// vitest.config.ts coverage thresholds
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90
      },
      include: ['src/components/**/*.{ts,tsx}'],
      exclude: [
        'src/components/**/*.stories.{ts,tsx}',
        'src/components/**/index.ts'
      ]
    }
  }
})
```

### Performance Benchmarks
- **Component Render**: < 16ms (60 FPS)
- **Large List Render**: < 1000ms (100 items)
- **Memory Growth**: < 50MB (typical session)
- **Bundle Size Impact**: < 5KB per component

---

## 🔄 CI/CD Integration

### Pre-commit Hooks
```json
// package.json
{
  "lint-staged": {
    "src/components/**/*.{ts,tsx}": [
      "npm run test:related",
      "npm run lint:fix",
      "npm run type-check"
    ]
  }
}
```

### GitHub Actions Workflow
```yaml
# .github/workflows/component-tests.yml
- name: Run Component Tests
  run: |
    npm run test:components -- --coverage --reporter=verbose
    npm run test:accessibility
    npm run test:performance
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
    flags: components
```

---

## 🎨 Testing Patterns & Anti-Patterns

### ✅ Best Practices

1. **Test User Behavior, Not Implementation**
   ```typescript
   // ✅ Good - Tests user interaction
   await user.click(screen.getByRole('button', { name: /bookmark/i }))
   expect(screen.getByText(/bookmarked/i)).toBeInTheDocument()

   // ❌ Bad - Tests implementation details
   expect(component.state.isBookmarked).toBe(true)
   ```

2. **Use Realistic Data**
   ```typescript
   // ✅ Good - Realistic repository data
   const repository = createMockRepository({
     name: 'react-testing-library',
     description: 'A library for testing React components',
     stars: 15000
   })

   // ❌ Bad - Minimal/fake data
   const repository = { name: 'test', stars: 1 }
   ```

3. **Test Error States**
   ```typescript
   it('handles API errors gracefully', async () => {
     server.use(
       http.get('/api/repositories', () => 
         HttpResponse.json({ error: 'Service unavailable' }, { status: 503 })
       )
     )

     render(<RepositoryList />)
     
     await waitFor(() => {
       expect(screen.getByRole('alert')).toHaveTextContent(/service unavailable/i)
     })
   })
   ```

### ❌ Anti-Patterns to Avoid

1. **Testing Implementation Details**
   ```typescript
   // ❌ Don't test internal state or methods
   expect(wrapper.find('SearchInput').prop('onChange')).toBeDefined()
   
   // ✅ Test user-observable behavior instead
   expect(screen.getByRole('searchbox')).toBeInTheDocument()
   ```

2. **Brittle Selectors**
   ```typescript
   // ❌ Fragile CSS selectors
   screen.getByTestId('search-button-submit-form')
   
   // ✅ Semantic queries
   screen.getByRole('button', { name: /search/i })
   ```

3. **Incomplete Async Testing**
   ```typescript
   // ❌ Missing await/waitFor
   fireEvent.click(button)
   expect(screen.getByText('Loading...')).toBeInTheDocument()
   
   // ✅ Proper async handling
   await user.click(button)
   await waitFor(() => {
     expect(screen.getByText('Loaded!')).toBeInTheDocument()
   })
   ```

---

## 🔍 Debugging Test Issues

### Common Issues & Solutions

1. **Tests Failing Due to Async Operations**
   ```typescript
   // Problem: Test completes before async operation
   // Solution: Use waitFor or findBy queries
   await waitFor(() => {
     expect(screen.getByText('Data loaded')).toBeInTheDocument()
   })
   ```

2. **Mock Service Worker Not Working**
   ```typescript
   // Ensure MSW is properly set up
   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
   afterEach(() => server.resetHandlers())
   afterAll(() => server.close())
   ```

3. **Memory Leaks in Tests**
   ```typescript
   // Cleanup subscriptions and timers
   afterEach(() => {
     cleanup()
     vi.clearAllTimers()
     vi.clearAllMocks()
   })
   ```

### Debug Utilities
```typescript
// Add to tests for debugging
import { prettyDOM, logRoles } from '@testing-library/react'

// Log current DOM state
console.log(prettyDOM(screen.getByRole('main')))

// Log available roles
logRoles(container)

// Debug queries
screen.debug() // Logs full DOM
screen.debug(screen.getByRole('button')) // Logs specific element
```

---

## 📚 Additional Resources

### Essential Documentation
- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest API Reference](https://vitest.dev/api/)
- [MSW Documentation](https://mswjs.io/docs/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### Contribux-Specific Utilities
- Authentication test helpers: `/tests/utils/auth-helpers.ts`
- Database test factories: `/tests/utils/database-factories.ts`
- Component test setup: `/tests/utils/modern-test-helpers.ts`
- Performance monitoring: `/tests/performance/performance-monitoring.test.ts`

### Team Conventions
- All tests must include accessibility checks
- Performance tests required for components rendering >10 items
- Integration tests required for API-connected components
- Error boundary tests required for data-fetching components

---

**Generated by Component Testing Agent | Version 1.0 | NextJS 15 + React 19 + TypeScript**