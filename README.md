# Contribux

Contribux is a Next.js application for exploring GitHub repositories and contribution opportunities. The project is under active development, and this README distinguishes working paths from planned integrations.

## Current implementation

| Area | Current state |
| --- | --- |
| Repository search | `GET /api/search/repositories` validates filters and searches three bundled demo records |
| Opportunity search | `GET /api/search/opportunities` requires authentication and queries PostgreSQL through Drizzle |
| Opportunity matching | `OpportunityMatcher` implements deterministic weighted matching with unit tests, but the product search route doesn't call it |
| Vector search | Database migrations and query helpers contain pgvector primitives; the application doesn't generate embeddings |
| Authentication | NextAuth.js exposes GitHub and Google OAuth handlers; development also includes demo authentication |
| MFA | Time-based one-time password and WebAuthn routes exist, but session boundaries, challenge binding, and persistence remain incomplete |
| Request security | The Next.js proxy applies rate limiting, access-token checks, Content Security Policy headers, and other response headers |
| Webhooks | In progress: validator logic exists, but the active proxy blocks standard GitHub deliveries and most handlers only acknowledge events |
| Observability | In progress: health primitives exist, but dashboard, deployment, and performance routes include simulated or stale signals |

No tracked runtime path invokes a model or agent. `OPENAI_API_KEY` remains optional configuration without a caller.

## Stack

- Next.js 16 and React 19
- TypeScript 5.9
- Tailwind CSS 4
- PostgreSQL, Drizzle ORM, and pgvector migrations
- NextAuth.js with GitHub and Google OAuth
- Vitest, Playwright, and PGlite
- OpenTelemetry and Prometheus primitives
- pnpm 10.12.4

## Run the project

Install Node.js 20 or newer and enable Corepack. The repository pins pnpm in `package.json`.

```bash
corepack enable
pnpm install
cp .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Replace the placeholder `NEXTAUTH_SECRET` in `.env.local` with the generated value. The value contains 64 characters and satisfies the 32-character minimum. Then start the application:

```bash
pnpm dev
```

Open `http://localhost:3000`.

The application also requires `DATABASE_URL`. Production OAuth requires the provider variables in `.env.example`.

## Validate changes

Run the repository gates before opening a pull request:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Use these focused commands when their dependencies are available:

```bash
pnpm test:coverage
pnpm test:integration:ci
pnpm test:e2e:ci
pnpm test:db
```

The generated coverage report is the authority for coverage. This repository doesn't promise a fixed coverage percentage.

## API reference

See [the tracked API routes](./docs/features/api-documentation.md) for the current route inventory and known limitations.

Two search routes define the current product surface:

```text
GET /api/search/repositories?q=react
GET /api/search/opportunities?q=documentation
```

Repository search is public and demo-backed. Opportunity search requires a valid session and configured database.

## Security status

The repository contains implemented controls and unfinished security integrations. No tracked certification or legal-compliance evidence exists.

Read [the security status](./docs/security/README.md) before relying on a control. Report suspected vulnerabilities through a private maintainer channel rather than a public issue.

## Documentation index

- [Documentation index](./docs/README.md)
- [API routes](./docs/features/api-documentation.md)
- [Authentication](./docs/features/authentication.md)
- [Security status](./docs/security/README.md)
- [Testing](./docs/testing/README.md)
- [Deployment](./docs/processes/deployment.md)

Some historical guides describe targets or examples. Verify those statements against tracked source before using them as current behavior.

## Contributing

Keep changes source-aligned:

1. Trace the active route or caller before editing.
2. Add the smallest test that proves changed behavior.
3. Run the relevant validation commands.
4. Update documentation when a tracked contract changes.

## License

Contribux is available under the [MIT License](./LICENSE).
