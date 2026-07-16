# Review the Contribux security status

Contribux has implemented security controls and unfinished integration work. This directory documents source behavior, not a certification or deployed security posture.

## Current controls

| Control | Source | Status |
| --- | --- | --- |
| GitHub and Google OAuth | `src/lib/auth`, `src/app/api/auth` | Implemented; production requires provider configuration |
| Linked-provider ownership checks | `src/app/api/auth` | In progress; route checks exist, but the product interface simulates linked-account state |
| Content Security Policy and response headers | `src/proxy.ts`, `src/lib/security/csp.ts` | Implemented in the Next.js request proxy |
| Request rate limiting | `src/proxy.ts`, `src/lib/security/rate-limiter.ts` | Implemented; storage depends on environment configuration |
| Input validation | Route-level Zod schemas and `src/lib/security/input-validation.ts` | Implemented on selected request boundaries |
| GitHub webhook verification | `src/lib/security/webhook-security.ts` | In progress; validator logic exists, but the proxy blocks standard GitHub delivery |
| Browser security reports | `src/app/api/security/csp-report`, `src/app/api/security/network-report` | In progress; the proxy blocks browser submissions |
| Security event and request logging | `src/lib/auth`, `src/lib/security`, `src/lib/telemetry` | Implemented across selected paths |
| MFA and WebAuthn | `src/app/api/auth/mfa`, `src/app/api/security/webauthn` | In progress |
| API-key and audit-log administration | `src/app/api/security` | In progress; placeholder behavior remains |

## Verify security changes

Run the default security gate:

```bash
pnpm test:security
```

That command runs the tracked header and Content Security Policy test files. It doesn't run every file under `tests/security`.

Run the standard repository gates for broader regression coverage:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Use generated test and coverage output as the authority. Historical pass counts and fixed coverage percentages are not current evidence.

## Known integration gaps

- WebAuthn registration requires a NextAuth.js session; authentication supports userless credentials at the route layer, but every WebAuthn route is custom-token gated
- Server-side WebAuthn challenge binding remains incomplete ([issue #24](https://github.com/BjornMelin/contribux/issues/24))
- The linked-account interface simulates state instead of calling the route handlers ([issue #25](https://github.com/BjornMelin/contribux/issues/25))
- Time-based one-time password enrollment doesn't yet persist every generated credential path
- Some MFA handlers expect request authentication context that the active proxy doesn't attach
- API-key listing and audit-log administration contain placeholder implementations
- GitHub webhook and browser report ingress conflicts with the active proxy authentication boundary ([issue #22](https://github.com/BjornMelin/contribux/issues/22))
- Webhook body-size enforcement needs hardening, and event handlers mostly acknowledge valid events ([issue #23](https://github.com/BjornMelin/contribux/issues/23))
- Session and custom access-token code use separate configuration paths
- Dashboard, deployment, and performance outputs need sourced telemetry ([issue #26](https://github.com/BjornMelin/contribux/issues/26))
- Deployed headers, origins, secrets, storage, and telemetry still require environment-specific verification

See [the implementation status](./security-implementation.md) for source references and operational boundaries.

## Documentation index

- [Security implementation status](./security-implementation.md)
- [Content Security Policy nonce usage](./csp-nonce-usage.md)
- [Rate limiting](./rate-limiting.md)

Treat dated completion reports and benchmark documents as historical context. Verify every claim against current source and test output.

## Compliance boundary

No tracked certification or legal-compliance evidence exists. An independent audit must evaluate deployed configuration, operations, evidence retention, and organizational processes.

## Report a vulnerability

Don't publish suspected vulnerabilities in a public issue. Use GitHub private vulnerability reporting when available, or contact the maintainer privately.
