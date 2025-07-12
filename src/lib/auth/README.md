# Authentication System

This directory contains the authentication system for the contribux application, built with NextAuth.js v4 and designed for complete isolation between development and production environments.

## Architecture

### Provider Isolation

The authentication system uses environment-specific providers with complete isolation:

- **Development**: Uses demo providers that simulate OAuth flows without requiring actual credentials
- **Production**: Uses real OAuth providers with proper environment variable configuration

### File Structure

```
src/lib/auth/
├── index.ts                    # Main NextAuth.js configuration
├── providers/
│   ├── index.ts               # Provider loader with environment detection
│   ├── demo.ts                # Demo providers for development
│   └── production.ts          # Production OAuth providers
├── oauth.ts                   # OAuth utilities
├── webauthn.ts               # WebAuthn configuration
└── README.md                 # This file
```

## Development Mode

In development (`NODE_ENV=development`), the system automatically uses demo providers that:

- Simulate OAuth flows without external API calls
- Use mock endpoints (`javascript:void(0)`)
- Return predefined user data
- Require no OAuth credentials

### Demo Users

- **GitHub Demo**: `demo@github.com` with ID `demo-github-123`
- **Google Demo**: `demo@google.com` with ID `demo-google-456`

## Production Mode

In production (`NODE_ENV=production`), the system requires proper OAuth configuration:

### Required Environment Variables

```bash
# GitHub OAuth
AUTH_GITHUB_ID=your-github-client-id
AUTH_GITHUB_SECRET=your-github-client-secret

# Google OAuth
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret

# NextAuth.js
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://your-domain.com
```

### OAuth Provider Setup

1. **GitHub**: Create OAuth App at https://github.com/settings/applications/new
2. **Google**: Create OAuth credentials at https://console.cloud.google.com/apis/credentials

## Security Features

### Environment Isolation

- Demo providers are completely isolated from production
- Production providers validate environment variables
- Warning logs for missing configurations
- Automatic provider filtering based on available credentials

### Security Measures

- Proper cookie configuration (httpOnly, secure, sameSite)
- JWT token strategy with 24-hour expiration
- Environment-specific debug settings
- Secure defaults for production

## Usage

### Basic Configuration

```typescript
import { auth } from '@/lib/auth'

// Get current session
const session = await auth()

// Check if user is authenticated
if (session?.user) {
  console.log('User:', session.user)
}
```

### Provider Management

```typescript
import { getProviders, isAuthConfigured } from '@/lib/auth/providers'

// Get current providers
const providers = getProviders()

// Check if auth is properly configured
const configured = isAuthConfigured()
```

## Development Workflow

1. **Local Development**: No setup required, demo providers work automatically
2. **Testing**: Use demo providers for consistent test data
3. **Production**: Set up OAuth credentials and environment variables

## Troubleshooting

### Common Issues

1. **Missing providers in production**: Check environment variables
2. **OAuth callback errors**: Verify NEXTAUTH_URL and provider callback URLs
3. **Session not persisting**: Check cookie configuration and NEXTAUTH_SECRET

### Debug Mode

Enable debug logging in development:

```bash
NODE_ENV=development
```

Debug information will be logged to the console.

## Migration Guide

### From Mixed Configuration

If upgrading from a mixed development/production configuration:

1. Remove hardcoded demo providers from main config
2. Use `getProviders()` instead of manual provider arrays
3. Set required environment variables for production
4. Test both development and production modes

### Environment Variables

Update your `.env` files to use the new variable names:

```bash
# Old (if using custom names)
GITHUB_ID=xxx
GITHUB_SECRET=xxx

# New (NextAuth.js standard)
AUTH_GITHUB_ID=xxx
AUTH_GITHUB_SECRET=xxx
```

## Best Practices

1. **Never commit OAuth secrets** to version control
2. **Use different OAuth apps** for development and production
3. **Rotate secrets regularly** in production
4. **Monitor authentication logs** for security issues
5. **Test both environments** before deploying

## Contributing

When adding new providers:

1. Add to both `demo.ts` and `production.ts`
2. Update environment variable documentation
3. Add provider-specific configuration
4. Test in both development and production modes