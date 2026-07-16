# Find Contribux documentation

Use this index to find current setup, API, authentication, security, testing, and deployment guidance. Treat unlinked dated reports as historical records rather than current behavior.

## Start development

- [Project setup](../README.md#run-the-project)
- [Development guides](./development/README.md)
- [Database guides](./database/README.md)
- [Testing guides](./testing/README.md)

## Review product surfaces

- [API route reference](./features/api-documentation.md)
- [Authentication status](./features/authentication.md)
- [Security status](./security/README.md)

## Operate the application

- [Deployment guide](./processes/deployment.md)
- [Monitoring and alerting guide](./processes/monitoring-alerting.md)
- [Continuous integration and deployment setup](./processes/ci-cd-setup.md)

## Verify claims

Tracked source and current command output take precedence over dated reports, completion summaries, benchmarks, and fixed test counts. Start with these gates:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```
