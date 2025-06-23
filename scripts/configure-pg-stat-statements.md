# PostgreSQL pg_stat_statements Configuration

The database monitoring system in this application uses PostgreSQL's `pg_stat_statements` extension to track slow queries and performance metrics. This extension provides detailed statistics about SQL statement execution.

## Current Status

The application handles `pg_stat_statements` gracefully:
- ✅ Extension is installed by default in the database setup
- ⚠️ Extension requires additional server-level configuration for full functionality
- ✅ Application degrades gracefully when full functionality is not available

## Full Configuration (Optional)

To enable complete slow query monitoring, you need to configure PostgreSQL's `shared_preload_libraries`. This is a **server-level configuration** that requires PostgreSQL restart.

### For Local Development (PostgreSQL)

1. Locate your `postgresql.conf` file:
   ```bash
   # Find postgresql.conf location
   sudo find /etc -name "postgresql.conf" 2>/dev/null
   # Or check from within PostgreSQL
   psql -c "SHOW config_file;"
   ```

2. Edit `postgresql.conf` and add/modify:
   ```
   shared_preload_libraries = 'pg_stat_statements'
   ```

3. Restart PostgreSQL:
   ```bash
   # Ubuntu/Debian
   sudo systemctl restart postgresql
   
   # macOS with Homebrew
   brew services restart postgresql
   
   # Docker
   docker restart your-postgres-container
   ```

4. Verify the configuration:
   ```sql
   -- Check if extension is loaded
   SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';
   
   -- Test if statistics are being collected
   SELECT query, calls FROM pg_stat_statements LIMIT 5;
   ```

### For Production (Neon PostgreSQL)

Neon PostgreSQL typically has `pg_stat_statements` pre-configured and available. No additional configuration should be needed for production deployments.

### For Docker Development

If using Docker for development, add to your `postgresql.conf` or Docker environment:

```dockerfile
# In your PostgreSQL Dockerfile or docker-compose.yml
ENV POSTGRES_INITDB_ARGS="-c shared_preload_libraries=pg_stat_statements"
```

## Application Behavior

### When pg_stat_statements is Fully Configured:
- ✅ Real slow query detection and reporting
- ✅ Detailed query performance metrics
- ✅ Complete database performance reports

### When pg_stat_statements is Not Fully Configured:
- ✅ All other monitoring features work normally
- ✅ Index usage statistics work
- ✅ Vector index metrics work
- ✅ Table sizes and health checks work
- ⚠️ Slow query monitoring returns empty results (graceful degradation)

## Troubleshooting

### Error: "pg_stat_statements must be loaded via shared_preload_libraries"

This is expected behavior when the extension is installed but not properly configured. The application handles this gracefully and continues to provide other monitoring features.

To resolve:
1. Follow the configuration steps above
2. Restart PostgreSQL
3. Verify with `SELECT * FROM pg_stat_statements LIMIT 1;`

### No Statistics Showing

If the extension is configured but no statistics appear:
1. Ensure the database has some query activity
2. Check `pg_stat_statements.track` setting:
   ```sql
   SHOW pg_stat_statements.track;
   ```
3. The setting should be `all` or `top`

## Development vs Production

- **Development**: Configuration is optional; tests pass without full setup
- **Testing**: All tests pass with graceful degradation
- **Production**: Neon PostgreSQL typically provides full support out of the box

This design ensures the application works reliably in all environments while providing enhanced monitoring capabilities when available.