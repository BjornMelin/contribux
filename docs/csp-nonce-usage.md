# CSP Nonce Usage Guide

## Overview

The contribux project implements dynamic CSP (Content Security Policy) nonces to prevent XSS attacks while allowing necessary inline scripts. Each request generates a unique cryptographically secure nonce.

## How It Works

1. **Middleware Generation**: The Next.js middleware (`src/middleware.ts`) generates a unique 128-bit nonce for each request
2. **Header Injection**: The nonce is stored in the `x-nonce` request header
3. **CSP Application**: The CSP header includes `'nonce-{value}'` for script-src and style-src
4. **Script Usage**: Inline scripts must include the nonce attribute to execute

## Usage Examples

### Server Components

```tsx
import { headers } from 'next/headers'

export default async function MyComponent() {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce')

  return (
    <div>
      {nonce && (
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `console.log('This script has a valid nonce');`
          }}
        />
      )}
    </div>
  )
}
```

### Client Components

For client components, pass the nonce as a prop from a parent server component:

```tsx
// Parent Server Component
import { headers } from 'next/headers'
import { ClientComponent } from './client-component'

export default async function ParentComponent() {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce')

  return <ClientComponent nonce={nonce || ''} />
}

// Client Component
'use client'

interface ClientComponentProps {
  nonce: string
}

export function ClientComponent({ nonce }: ClientComponentProps) {
  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: `console.log('Client component script');`
      }}
    />
  )
}
```

### Using the Helper Component

```tsx
import { NonceScriptExample } from '@/components/examples/nonce-script-example'

export default function MyPage() {
  return (
    <div>
      <h1>My Page</h1>
      <NonceScriptExample 
        scriptContent="console.log('Using the helper component');"
        id="my-script"
      />
    </div>
  )
}
```

## Important Notes

1. **Never hardcode nonces** - They must be dynamically generated per request
2. **Avoid inline scripts when possible** - Use external scripts or event handlers
3. **Third-party scripts** - Must be loaded from allowed domains in the CSP
4. **Development vs Production** - The middleware applies to all environments

## CSP Configuration

The default CSP configuration is in `src/lib/security/csp.ts`. To modify allowed sources:

```typescript
export const defaultCSPDirectives: CSPDirectives = {
  'script-src': ["'self'", 'https://vercel.live'], // Add trusted domains here
  'style-src': ["'self'", 'https://fonts.googleapis.com'],
  // ... other directives
}
```

## Troubleshooting

If scripts are blocked:
1. Check the browser console for CSP violations
2. Ensure the script has the correct nonce attribute
3. Verify the nonce is being generated (check response headers)
4. For third-party scripts, add the domain to the CSP allowlist

## Security Best Practices

1. **Minimize inline scripts** - Use external files when possible
2. **Validate all inputs** - Even with CSP, validate user data
3. **Regular audits** - Review CSP reports and violations
4. **Strict CSP** - Keep the policy as restrictive as possible