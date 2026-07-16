# Use the tracked Contribux API routes

This reference lists route handlers tracked under `src/app/api`. A route's presence doesn't imply production readiness or a stable public contract.

## Route status

- **Product**: The route serves current application behavior
- **Development**: The route supports local development; production rejects it or returns a no-op response
- **Diagnostic**: The route exposes tests, health data, metrics, or operational data
- **In progress**: The route contains placeholder logic or an incomplete integration

## Search routes

These routes expose the current contribution-discovery surface:

| Route | Methods | Status | Behavior |
| --- | --- | --- | --- |
| `/api/search/repositories` | `GET` | Product | Validates search filters and searches three bundled demo repositories |
| `/api/search/opportunities` | `GET` | Product | Requires a session and queries stored opportunities |
| `/api/search/error` | `GET` | Development | Generates test errors outside production |

### Search demo repositories

`q` is required. The route also accepts `language`, `sort`, `order`, `per_page`, and `page`.

```bash
curl "http://localhost:3000/api/search/repositories?q=react&per_page=10"
```

The result set comes from records in `src/app/api/search/repositories/route.ts`. It doesn't query GitHub.

### Search stored opportunities

The route requires at least one search criterion. It accepts text, score bounds, labels, skills, repository identifiers, contribution flags, sorting, and pagination.

```bash
curl --cookie "next-auth.session-token=your_session_token_here" \
  "http://localhost:3000/api/search/opportunities?q=documentation&per_page=20"
```

Use the route schema in `src/app/api/search/opportunities/route.ts` as the parameter authority.

## Authentication routes

These routes expose NextAuth.js, development authentication, linked-account management, and multi-factor authentication (MFA) work:

| Route | Methods | Status | Behavior |
| --- | --- | --- | --- |
| `/api/auth/[...nextauth]` | `GET`, `POST` | Product | Handles NextAuth.js provider and callback requests |
| `/api/auth/can-unlink` | `GET` | In progress | Checks whether the current account can unlink an OAuth provider |
| `/api/auth/primary-provider` | `GET` | In progress | Reads the current account's primary OAuth provider |
| `/api/auth/set-primary` | `POST` | In progress | Sets a linked OAuth provider as primary |
| `/api/auth/unlink` | `POST` | In progress | Removes a linked OAuth provider when another method remains |
| `/api/auth/demo-signin` | `POST` | Development | Creates a development-only demo session |
| `/api/auth/session` | `GET` | Development | Reads the development demo session |
| `/api/auth/mfa/enroll` | `GET`, `POST` | In progress | Lists MFA methods and starts enrollment |
| `/api/auth/mfa/settings` | `GET`, `PUT`, `DELETE` | In progress | Reads or changes MFA settings |
| `/api/auth/mfa/verify` | `GET`, `POST` | In progress | Reads verification state or verifies an MFA response |

The product interface simulates linked-account state instead of calling the linked-account routes. Track route wiring in [issue #25](https://github.com/BjornMelin/contribux/issues/25). The MFA routes don't yet form a production-complete enrollment and persistence flow.

## WebAuthn routes

Web Authentication (WebAuthn) registration requires the feature flag and a NextAuth.js session. Authentication handlers support a userless credential flow at the route layer, but the active proxy gates every WebAuthn route with a custom access token:

| Route | Methods | Status | Behavior |
| --- | --- | --- | --- |
| `/api/security/webauthn/register/options` | `POST` | In progress | Creates registration options |
| `/api/security/webauthn/register/verify` | `POST` | In progress | Verifies a registration response |
| `/api/security/webauthn/authenticate/options` | `POST` | In progress | Creates authentication options |
| `/api/security/webauthn/authenticate/verify` | `POST` | In progress | Verifies an authentication response |

Server-side challenge binding remains incomplete for registration and authentication. Track that boundary in [issue #24](https://github.com/BjornMelin/contribux/issues/24). Don't treat these routes as a production sign-in flow.

## GitHub integration routes

These routes demonstrate GitHub request boundaries:

| Route | Methods | Status | Behavior |
| --- | --- | --- | --- |
| `/api/github/example` | `GET` | In progress | Returns placeholder data through the API rate limiter |
| `/api/webhooks/github` | `POST` | In progress | Contains request validation, but the active proxy blocks standard GitHub delivery |
| `/api/webhooks/github` | `GET`, `PUT`, `DELETE` | Diagnostic | Returns method-not-allowed responses |

`POST /api/webhooks/github` requires `GITHUB_WEBHOOK_SECRET`. The route isn't operational external ingress while its proxy boundary requires a custom access token. Track ingress alignment in [issue #22](https://github.com/BjornMelin/contribux/issues/22) and body-size hardening in [issue #23](https://github.com/BjornMelin/contribux/issues/23). Most event handlers acknowledge valid events without changing application data.

## Health and observability routes

These routes expose runtime diagnostics. Access depends on the proxy's public-route and token rules:

| Route | Methods | Status | Behavior |
| --- | --- | --- | --- |
| `/api/simple-health` | `GET` | Diagnostic | Returns a dependency-free process response |
| `/api/health` | `GET` | Diagnostic | Checks the system or a selected component |
| `/api/health/redis` | `GET` | Diagnostic | Checks Redis and rate-limiter adapters |
| `/api/metrics` | `GET` | Diagnostic | Returns Prometheus registry output |
| `/api/dashboard/metrics` | `GET` | In progress | Returns simulated and hardcoded dashboard signals |
| `/api/monitoring/dashboard` | `GET` | In progress | Returns process-local monitoring data without durable telemetry |
| `/api/monitoring/deploy-info` | `GET`, `OPTIONS` | In progress | Combines environment metadata with hardcoded feature signals |
| `/api/monitoring/health` | `GET`, `HEAD` | Diagnostic | Returns monitoring health data; `HEAD` checks database connectivity |
| `/api/monitoring/performance` | `GET`, `POST`, `OPTIONS` | In progress | Reads simulated metrics; `POST` only refreshes the process-local cache |
| `/api/performance` | `GET` | In progress | Returns process-local measurements that don't represent end-to-end telemetry |

Dashboard, deployment, and performance outputs include simulated, hardcoded, or process-local values. Don't use them as current production telemetry. Track sourced replacements in [issue #26](https://github.com/BjornMelin/contribux/issues/26).

## Security and diagnostic routes

These handlers expose security primitives and administrative experiments:

| Route | Methods | Status | Behavior |
| --- | --- | --- | --- |
| `/api/demo/rate-limit` | `GET` | Diagnostic | Exercises rate-limit behavior |
| `/api/security/api-keys` | `GET`, `POST`, `PUT`, `DELETE` | In progress | Exercises API-key management services |
| `/api/security/audit-logs` | `GET`, `POST`, `DELETE` | In progress | Exercises audit-log access and retention paths |
| `/api/security/csp-report` | `POST` | In progress | Contains a browser report collector that the active proxy blocks |
| `/api/security/csp-report` | `GET` | Diagnostic | Returns a method-not-allowed response |
| `/api/security/headers-test` | `GET`, `POST` | Diagnostic | Exercises response-header configuration |
| `/api/security/health` | `GET`, `OPTIONS` | In progress | Reports security-component status, including placeholder checks |
| `/api/security/monitoring` | `GET`, `POST` | In progress | Reads or records security-monitoring data |
| `/api/security/network-report` | `POST`, `OPTIONS` | In progress | Contains a browser report collector that the active proxy blocks |

The browser report routes aren't operational ingress while their proxy boundary requires a custom access token. [Issue #22](https://github.com/BjornMelin/contribux/issues/22) tracks the shared ingress boundary. The API-key service and audit-log administration paths still contain placeholder behavior.

## Error behavior

Each route owns its current response shape. Consumers should handle JSON errors and non-`2xx` responses without parsing undocumented fields.

Inspect the corresponding `src/app/api/**/route.ts` file before building a long-lived client. No generated OpenAPI contract currently exists.
