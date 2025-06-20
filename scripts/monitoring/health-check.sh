#\!/bin/bash
# Database health check script

echo "🔍 Running database health check..."

# Test database connection
echo "Testing database connectivity..."
if npm run db:test-connection > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Check required extensions
echo "Checking extensions..."
EXTENSIONS=$(node -e "
const {neon} = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql\`SELECT string_agg(extname, ', ') as extensions FROM pg_extension WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto')\`.then(r => console.log(r[0]?.extensions || 'none')).catch(e => console.log('error'));
")

if [[ "$EXTENSIONS" == *"vector"* && "$EXTENSIONS" == *"pg_trgm"* ]]; then
    echo "✅ Required extensions installed: $EXTENSIONS"
else
    echo "⚠️  Missing extensions. Found: $EXTENSIONS"
fi

# Check vector indexes
echo "Checking HNSW indexes..."
VECTOR_INDEXES=$(node -e "
const {neon} = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql\`SELECT COUNT(*) as count FROM pg_indexes WHERE indexname LIKE '%hnsw%'\`.then(r => console.log(r[0].count)).catch(e => console.log(0));
")

if [ "$VECTOR_INDEXES" -gt 0 ]; then
    echo "✅ Found $VECTOR_INDEXES HNSW vector indexes"
else
    echo "⚠️  No HNSW vector indexes found"
fi

echo "✅ Health check completed"
