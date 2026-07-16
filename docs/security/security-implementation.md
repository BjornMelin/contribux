# Evaluate the implemented security controls

This guide maps Contribux security controls to tracked source. It also identifies work required before a production security review.

## Authentication and session boundaries

NextAuth.js exposes GitHub and Google OAuth through `src/app/api/auth/[...nextauth]/route.ts`. Provider selection lives in `src/lib/auth/providers`.

Development uses demo provider credentials and a development-only sign-in route. Production requires configured provider credentials and `NEXTAUTH_SECRET`.

Linked-account routes use the current session and compare the requested user identifier with the session user. The product interface doesn't call those routes: it simulates provider state and account changes, so linked-account management remains in progress.

The repository also contains a custom access-token and refresh-token implementation in `src/lib/auth/jwt.ts`. The request proxy verifies those access tokens on protected routes. NextAuth.js sessions and custom access tokens use different configuration paths, so their lifecycle remains an integration boundary.

Don't describe the application session as a short-lived token contract. Confirm the active authentication path and its configured lifetime before documenting a client guarantee.

## MFA status

Multi-factor authentication (MFA) routes live under `src/app/api/auth/mfa`:

| Route group | Current behavior | Remaining work |
| --- | --- | --- |
| Enrollment | Lists supported methods and calls the MFA service | Align request authentication and persist every credential path |
| Verification | Validates time-based one-time passwords, backup codes, or WebAuthn input | Prove the full session transition through end-to-end tests |
| Settings | Reads and changes MFA settings | Complete disable and credential-removal behavior |

`src/lib/auth/mfa-service.ts` and `src/lib/auth/totp.ts` contain the underlying time-based one-time password primitives. Some persistence paths remain commented or incomplete.

## WebAuthn status

The Web Authentication (WebAuthn) routes live under `src/app/api/security/webauthn`. They generate and verify registration or authentication options through `@simplewebauthn/server`.

Registration requires a NextAuth.js session and the WebAuthn feature flag. Authentication supports a userless credential flow at the route layer. The active proxy still requires a custom access token for every WebAuthn route.

Server-side challenge binding remains incomplete for registration and authentication. Complete that boundary before enabling WebAuthn as a production sign-in flow.

## Request proxy controls

`src/proxy.ts` applies these controls to matched application routes:

- Request rate limiting
- Public-route and protected-route decisions
- Custom access-token verification for protected routes
- Per-request Content Security Policy nonces
- Content Security Policy, framing, content-type, referrer, and permissions headers
- Production-only transport and cross-origin isolation headers
- Cross-origin resource sharing headers for API routes

Static assets and Next.js internals bypass the proxy. The matcher and public-route list in `src/proxy.ts` are the source of truth.

## Input and database boundaries

Selected route handlers use Zod schemas before accepting query parameters or request bodies. Database helpers use Drizzle expressions or tagged SQL templates for parameter binding.

This repository-wide pattern doesn't prove that every boundary is validated. Review each changed route and query during development.

Database migrations define pgvector columns and Hierarchical Navigable Small World indexes. Query helpers validate and serialize vector inputs before using vector operators. The application doesn't currently generate embeddings, so these primitives don't establish an active model pipeline.

`src/lib/business-logic/opportunity-matcher.ts` implements deterministic weighted matching. It uses fixed inputs and weighted rules.

## GitHub webhook boundary

`POST /api/webhooks/github` creates a validator from `GITHUB_WEBHOOK_SECRET`. Its validation logic checks:

- Required GitHub headers and allowed event names
- Payload metadata and content type
- HMAC signature authenticity
- Delivery identifiers
- Rate limits when production enables them
- Parsed payload shape

The active proxy requires a custom access token on this route, which blocks standard GitHub delivery. Body-size enforcement also needs hardening. Most tracked event handlers acknowledge validated events without updating repositories or opportunities. Treat the route as in progress, not operational ingress.

## Observability limitations

The repository includes structured logging, OpenTelemetry primitives, Prometheus metrics, health routes, and browser report collectors. The active proxy blocks browser submissions to the Content Security Policy and network-report collectors.

Dashboard, deployment, and performance routes include simulated, hardcoded, stale, or process-local signals. Their output isn't current production telemetry. External export still requires configured endpoints and credentials.

## Security API status

Routes under `src/app/api/security` cover API keys, audit logs, reports, health checks, and diagnostics. Several handlers remain demonstrations or partial integrations:

- API-key listing returns placeholder data through the current manager
- Audit-log administrator checks use configured identifiers instead of a complete authorization model
- Some security-health checks report placeholders
- Report collectors don't provide a complete alerting workflow

Keep these routes behind authenticated and environment-appropriate boundaries until their persistence and authorization paths are complete.

## Production review checklist

Before production use:

1. Align NextAuth.js sessions and custom access-token enforcement.
2. Complete server-side WebAuthn challenge binding.
3. Complete MFA credential persistence, disable behavior, and end-to-end tests.
4. Replace API-key and audit-log placeholders with database-backed authorization.
5. Verify the deployed Content Security Policy and cross-origin headers.
6. Verify rate-limit storage and failure behavior under load.
7. Define compatible authentication for GitHub webhook and browser-report ingress.
8. Harden webhook body-size enforcement and test delivery handling.
9. Review production secrets, database permissions, and telemetry destinations.
10. Run repository tests and a deployment-specific security assessment.

## Compliance boundary

Contribux has no tracked certification or legal-compliance evidence.

Don't convert code controls into compliance claims. Certification and legal compliance require a scoped assessment of the deployed system and operating organization.

## Verify changes

Run the default security and repository gates:

```bash
pnpm test:security
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Add focused tests for any control you change. Record deployed verification separately from repository test results.
