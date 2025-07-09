# Local PostgreSQL Development Setup Guide

This guide explains how to set up local PostgreSQL for development while maintaining the automated Neon database branching for CI/CD.

## 🎯 Why Use Local PostgreSQL?

**Hybrid Development Approach:**
- **Local Development** → Local PostgreSQL (fast, offline, free)
- **CI/Testing** → Automated Neon branches (isolated, production-like)
- **Production** → Neon Cloud (managed, scalable)

**Benefits:**
- ⚡ **Instant feedback** - Zero network latency
- 💰 **Zero cost** - Local development is free
- 🌐 **Offline capable** - Work anywhere without internet
- 🔧 **Full control** - Experiment with configurations and extensions
- 🐛 **Better debugging** - Direct access to database logs and query plans

## 📋 Prerequisites

- Ubuntu/Debian (WSL2 supported)
- Node.js 20+ and pnpm
- Sudo access for PostgreSQL installation

## 🚀 Installation Steps

### Step 1: Install PostgreSQL 16 + pgvector

```bash
# Update package list
sudo apt update

# Install PostgreSQL 16 from official repository
sudo apt install -y wget ca-certificates
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# Update and install PostgreSQL 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-client-16 postgresql-contrib-16

# Install pgvector extension (required for vector search)
sudo apt install -y postgresql-16-pgvector

# Install build tools for extensions
sudo apt install -y build-essential postgresql-server-dev-16
```

### Step 2: Configure PostgreSQL Service

```bash
# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify PostgreSQL is running
sudo systemctl status postgresql
```

### Step 3: Create Database User

```bash
# Switch to postgres user and create your user
sudo -u postgres createuser --interactive --pwprompt $USER

# When prompted, answer:
# - Enter password for new role: [choose a secure password]
# - Shall the new role be a superuser? y
# - Shall the new role be allowed to create databases? y
# - Shall the new role be allowed to create more new roles? y
```

### Step 4: Automated Database Setup

The project includes automated setup scripts:

```bash
# Navigate to project root
cd /path/to/contribux

# Run automated setup (creates databases, enables extensions, applies schema)
pnpm db:setup

# The script will:
# - Create contribux_dev and contribux_test databases
# - Enable uuid-ossp and vector extensions
# - Apply initial schema migration
# - Test database connections
```

### Step 5: Configure Environment Variables

Update your `.env.local` file with local database connections:

```bash
# Database URLs for local development
DATABASE_URL="postgresql://your_username@localhost:5432/contribux_dev"
DATABASE_URL_TEST="postgresql://your_username@localhost:5432/contribux_test"
```

**Important:** Replace `your_username` with your actual system username.

### Step 6: Verify Setup

```bash
# Test database connections
pnpm db:test-connection

# Expected output:
# ✅ Development Database: Connected successfully
# ✅ Test Database: Connected successfully
# ✅ UUID extension working
# ✅ Vector extension working
```

## 🔧 Manual Setup (If Automated Script Fails)

### Create Databases Manually

```bash
# Create development database
createdb contribux_dev

# Create test database
createdb contribux_test
```

### Enable Extensions

```bash
# Connect to development database and enable extensions
psql -d contribux_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
psql -d contribux_dev -c "CREATE EXTENSION IF NOT EXISTS \"vector\";"

# Do the same for test database
psql -d contribux_test -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
psql -d contribux_test -c "CREATE EXTENSION IF NOT EXISTS \"vector\";"
```

### Apply Schema

```bash
# Apply initial schema to both databases
psql -d contribux_dev -f drizzle/0001_initial_schema.sql
psql -d contribux_test -f drizzle/0001_initial_schema.sql
```

## 🏗️ Database Schema

The project uses several PostgreSQL-specific features:

### Required Extensions

- **uuid-ossp** - UUID generation functions
- **vector** - Vector similarity search (pgvector)

### Key Tables

- **users** - User profiles with GitHub integration
- **repositories** - Repository metadata with vector embeddings
- **opportunities** - Contribution opportunities with vector search
- **user_repository_interactions** - User activity tracking

### Vector Search Features

- **HNSW indexes** - Optimized vector similarity search
- **1536-dimensional embeddings** - OpenAI-compatible embedding vectors
- **Cosine similarity** - Vector distance calculations

## 🔄 Development Workflow

### Daily Development

```bash
# Start development server (uses local PostgreSQL)
pnpm dev

# Run database migrations
pnpm db:migrate

# Test database connection
pnpm db:test-connection
```

### Testing

```bash
# Run unit tests (uses local test database)
pnpm test

# Run integration tests
pnpm test:integration

# Run database-specific tests
pnpm test:db
```

## 🤖 CI/CD Integration

The project uses a **hybrid approach**:

### Local Development
- Uses local PostgreSQL for fast iteration
- Conditional database driver automatically detects local environment
- Full offline capability

### CI/CD Pipeline
- **PR Testing** → Automated Neon branch creation via GitHub Actions
- **E2E Testing** → Dedicated Neon branches for each test run
- **Production** → Neon Cloud database

### How It Works

The `src/lib/db/client-factory.ts` automatically detects:
- **Local environment** → Uses `pg` driver for local PostgreSQL
- **Cloud environment** → Uses `@neondatabase/serverless` for Neon

## 🔧 Available Scripts

```bash
# Database setup and management
pnpm db:setup              # Automated local PostgreSQL setup
pnpm db:test-connection     # Test database connections
pnpm db:migrate             # Run database migrations
pnpm db:migrate:status      # Check migration status
pnpm db:migrate:reset       # Reset database (destructive)

# Development
pnpm dev                    # Start development server
pnpm build                  # Build for production
pnpm test                   # Run test suite
```

## 🐛 Troubleshooting

### PostgreSQL Won't Start

```bash
# Check service status
sudo systemctl status postgresql

# Restart service
sudo systemctl restart postgresql

# Check logs
sudo journalctl -u postgresql -f
```

### Connection Refused

```bash
# Check if PostgreSQL is listening
sudo netstat -tulpn | grep :5432

# Verify user exists
sudo -u postgres psql -c "\du"
```

### Extension Not Found

```bash
# Install missing extensions
sudo apt install postgresql-16-pgvector

# Verify extensions are available
psql -d contribux_dev -c "SELECT * FROM pg_available_extensions WHERE name IN ('uuid-ossp', 'vector');"
```

### Permission Denied

```bash
# Grant privileges to your user
sudo -u postgres psql -c "ALTER USER $USER CREATEDB SUPERUSER;"
```

## 🔐 Security Considerations

### Local Development
- Use strong passwords for database users
- Keep `.env.local` out of version control
- Use firewall rules to restrict PostgreSQL access

### Environment Separation
- Different databases for development and testing
- Separate connection strings for each environment
- Feature flags for production vs development features

## 📚 Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/16/)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Neon Documentation](https://neon.tech/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [GitHub Token Setup Guide](./github-token-setup.md) - Required for GitHub API access

## 🆘 Getting Help

If you encounter issues:

1. **Check the troubleshooting section** above
2. **Run the test script** - `pnpm db:test-connection`
3. **Check database logs** - `sudo journalctl -u postgresql -f`
4. **Verify extensions** - Ensure pgvector is properly installed
5. **Ask for help** - Create an issue with error logs and system details

---

**Note:** This local setup is designed to work alongside our automated Neon CI/CD pipeline. You get the best of both worlds: fast local development and reliable cloud testing.