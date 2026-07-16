# Configure Contribux authentication

Contribux uses NextAuth.js for OAuth sessions. Development also includes demo authentication, while linked-account and multi-factor authentication flows remain in progress.

## Configure OAuth

The production provider loader requires GitHub and Google credentials:

```bash
AUTH_GITHUB_ID=your_github_client_id_here
AUTH_GITHUB_SECRET=your_github_client_secret_here
AUTH_GOOGLE_ID=your_google_client_id_here
AUTH_GOOGLE_SECRET=your_google_client_secret_here
```

Set `NEXTAUTH_SECRET` to a generated value containing at least 32 characters. Set `NEXTAUTH_URL` to the deployed application origin.

The route at `src/app/api/auth/[...nextauth]/route.ts` exports the NextAuth.js `GET` and `POST` handlers. Development loads demo providers instead of production OAuth providers.

## Understand the session boundaries

NextAuth.js sessions protect OAuth and linked-account handlers. The request proxy uses a separate custom access-token implementation for other protected routes.

These authentication paths don't share one complete lifecycle. Confirm both boundaries before exposing a protected route or documenting a client contract.

## Review linked-account status

Routes under `src/app/api/auth` read and change linked-provider records after checking the NextAuth.js session and user identifier. The `LinkedAccounts` product component doesn't call those routes: it simulates provider state and account changes.

Treat linked-account management as in progress until [issue #25](https://github.com/BjornMelin/contribux/issues/25) connects the interface to the route handlers and verifies the full flow.

## Review MFA status

Routes under `src/app/api/auth/mfa` expose enrollment, verification, and settings operations. Credential persistence, disable behavior, and the authenticated session transition remain incomplete.

Keep multi-factor authentication (MFA) disabled for production use until those paths have end-to-end coverage.

## Review WebAuthn status

Web Authentication (WebAuthn) routes require `ENABLE_WEBAUTHN=true` outside development. Configure `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` for the target deployment.

Registration requires a NextAuth.js session. Authentication handlers support a userless credential flow at the route layer, but the active proxy requires a custom access token for every WebAuthn route.

Server-side challenge binding remains incomplete for registration and authentication. Track that work in [issue #24](https://github.com/BjornMelin/contribux/issues/24), and keep WebAuthn disabled for production sign-in until the boundary is complete.

## Verify authentication changes

Run the focused security gate and standard repository checks:

```bash
pnpm test:security
pnpm lint
pnpm type-check
pnpm test
```

Verify OAuth callbacks, linked-account changes, and MFA transitions against the configured deployment before describing them as operational.
