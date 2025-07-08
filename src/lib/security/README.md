# Security Module Overview

## CSP Dynamic Nonce Implementation

The contribux project implements dynamic Content Security Policy (CSP) nonces to prevent XSS attacks while maintaining functionality.

### Key Components

1. **CSP Builder** (`csp.ts`)
   - `generateNonce()`: Creates 128-bit cryptographically secure nonces
   - `buildCSP()`: Constructs CSP headers with nonce injection
   - `defaultCSPDirectives`: Base security policy configuration

2. **Middleware** (`src/middleware.ts`)
   - Generates unique nonce per request
   - Stores nonce in `x-nonce` header
   - Applies CSP and other security headers

3. **Headers Utility** (`headers.ts`)
   - Fallback security header application
   - CORS configuration for API routes
   - Modular header management

### Quick Start

#### Using Nonces in Server Components

```tsx
import { headers } from 'next/headers'

export default async function MyComponent() {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce')

  return (
    <script nonce={nonce} dangerouslySetInnerHTML={{
      __html: `console.log('Secure script');`
    }} />
  )
}
```

#### Modifying CSP Directives

Edit `defaultCSPDirectives` in `csp.ts`:

```typescript
export const defaultCSPDirectives: CSPDirectives = {
  'script-src': ["'self'", 'https://trusted-cdn.com'],
  // ... other directives
}
```

### Security Features

- **Per-request nonces**: Each HTTP request gets a unique nonce
- **Cryptographic security**: Uses `crypto.getRandomValues()` for randomness
- **Base64 URL-safe encoding**: Compatible with HTTP headers
- **Automatic injection**: Nonces added to script-src and style-src
- **Middleware integration**: Seamless with Next.js 15

### Testing

Visit `/csp-demo` to see the implementation in action and verify:
- Nonce generation
- Script execution with valid nonces
- CSP blocking of non-nonce scripts

### Best Practices

1. **Minimize inline scripts**: Use external scripts when possible
2. **Never expose nonces**: Don't include in URLs or logs
3. **Validate third-party scripts**: Add domains to CSP allowlist
4. **Monitor violations**: Set up CSP reporting (future enhancement)