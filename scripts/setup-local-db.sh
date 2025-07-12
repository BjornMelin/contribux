#!/bin/bash

# Local PostgreSQL setup script for contribux development
# This script sets up your local PostgreSQL database with required extensions

set -e

echo "🚀 Setting up local PostgreSQL for contribux development..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database configuration
DB_USER=${USER}
DB_DEV="contribux_dev"
DB_TEST="contribux_test"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL is not installed. Please install PostgreSQL 16 first:"
    echo "  Ubuntu/Debian: sudo apt install postgresql-16 postgresql-client-16"
    echo "  macOS: brew install postgresql@16"
    exit 1
fi

# Check if PostgreSQL is running
if ! pgrep postgres > /dev/null; then
    print_warning "PostgreSQL is not running. Starting PostgreSQL..."
    
    # Try to start PostgreSQL (different methods for different systems)
    if command -v systemctl &> /dev/null; then
        sudo systemctl start postgresql
        print_status "PostgreSQL started via systemctl"
    elif command -v brew &> /dev/null; then
        brew services start postgresql@16
        print_status "PostgreSQL started via brew"
    else
        print_error "Cannot start PostgreSQL automatically. Please start it manually."
        exit 1
    fi
fi

# Check if user has PostgreSQL access
if ! psql -U ${DB_USER} -d postgres -c "SELECT 1;" &> /dev/null; then
    print_error "Cannot connect to PostgreSQL as user '${DB_USER}'"
    echo "Please create a PostgreSQL user:"
    echo "  sudo -u postgres createuser --interactive --pwprompt ${DB_USER}"
    exit 1
fi

print_status "PostgreSQL connection verified"

# Create development database
echo "📦 Creating development database..."
if psql -U ${DB_USER} -d postgres -lqt | cut -d \| -f 1 | grep -qw ${DB_DEV}; then
    print_warning "Database '${DB_DEV}' already exists"
else
    createdb -U ${DB_USER} ${DB_DEV}
    print_status "Created database '${DB_DEV}'"
fi

# Create test database
echo "📦 Creating test database..."
if psql -U ${DB_USER} -d postgres -lqt | cut -d \| -f 1 | grep -qw ${DB_TEST}; then
    print_warning "Database '${DB_TEST}' already exists"
else
    createdb -U ${DB_USER} ${DB_TEST}
    print_status "Created database '${DB_TEST}'"
fi

# Function to setup database with extensions
setup_database() {
    local db_name=$1
    echo "🔧 Setting up extensions for ${db_name}..."
    
    # Enable required extensions
    psql -U ${DB_USER} -d ${db_name} -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" > /dev/null
    psql -U ${DB_USER} -d ${db_name} -c "CREATE EXTENSION IF NOT EXISTS \"vector\";" > /dev/null
    
    # Verify extensions
    local uuid_ext=$(psql -U ${DB_USER} -d ${db_name} -tAc "SELECT 1 FROM pg_extension WHERE extname='uuid-ossp';")
    local vector_ext=$(psql -U ${DB_USER} -d ${db_name} -tAc "SELECT 1 FROM pg_extension WHERE extname='vector';")
    
    if [[ "$uuid_ext" == "1" && "$vector_ext" == "1" ]]; then
        print_status "Extensions enabled for ${db_name}"
    else
        print_error "Failed to enable extensions for ${db_name}"
        if [[ "$vector_ext" != "1" ]]; then
            echo "  Vector extension missing. Install with: sudo apt install postgresql-16-pgvector"
        fi
        exit 1
    fi
}

# Setup both databases
setup_database ${DB_DEV}
setup_database ${DB_TEST}

# Run initial migration
echo "🗄️ Running database migrations..."
if [[ -f "drizzle/0001_initial_schema.sql" ]]; then
    psql -U ${DB_USER} -d ${DB_DEV} -f drizzle/0001_initial_schema.sql > /dev/null 2>&1
    print_status "Initial schema applied to development database"
    
    psql -U ${DB_USER} -d ${DB_TEST} -f drizzle/0001_initial_schema.sql > /dev/null 2>&1
    print_status "Initial schema applied to test database"
else
    print_warning "Initial schema file not found. Run migrations manually with: pnpm db:migrate"
fi

# Test database connection
echo "🧪 Testing database connection..."
export DATABASE_URL="postgresql://${DB_USER}@localhost:5432/${DB_DEV}"
export DATABASE_URL_TEST="postgresql://${DB_USER}@localhost:5432/${DB_TEST}"

if pnpm db:test-connection > /dev/null 2>&1; then
    print_status "Database connection test passed"
else
    print_warning "Database connection test failed. Check your .env.local file"
fi

# Display final status
echo ""
echo "🎉 Local PostgreSQL setup complete!"
echo ""
echo "📋 Configuration:"
echo "  Development DB: postgresql://${DB_USER}@localhost:5432/${DB_DEV}"
echo "  Test DB: postgresql://${DB_USER}@localhost:5432/${DB_TEST}"
echo ""
echo "🔧 Next steps:"
echo "  1. Update .env.local with your username if needed"
echo "  2. Run: pnpm db:migrate (to apply any remaining migrations)"
echo "  3. Run: pnpm dev (to start development server)"
echo ""
echo "✅ You can now develop locally with PostgreSQL!"