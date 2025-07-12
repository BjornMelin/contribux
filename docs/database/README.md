# Database Documentation

This directory contains database-related documentation for the Contribux project's PostgreSQL/Neon infrastructure.

## Files

- [database-connectivity-fix.md](database-connectivity-fix.md) - Database connectivity troubleshooting and fixes
- [neon-postgresql-production-optimization-guide.md](neon-postgresql-production-optimization-guide.md) - Production optimization guide for Neon PostgreSQL

## Database Stack

- **Database**: Neon PostgreSQL 16 with pgvector extension
- **Vector Search**: halfvec(1536) embeddings with HNSW indexes
- **Environment**: Production, Development, and Test environments

## Quick Links

- **Connection Issues?** See [database-connectivity-fix.md](database-connectivity-fix.md)
- **Production Optimization?** Check [neon-postgresql-production-optimization-guide.md](neon-postgresql-production-optimization-guide.md)
- **Performance Monitoring?** See [../development/database-performance-monitoring.md](../development/database-performance-monitoring.md)