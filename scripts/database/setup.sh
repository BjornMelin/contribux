#!/bin/bash
# Database setup script for contribux test environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.test.yml"
DB_CONTAINER="contribux-test-db"
DB_NAME="contribux_test"
DB_USER="postgres"
DB_PORT="5433"
MAX_WAIT_TIME=60

echo -e "${BLUE}🚀 Setting up contribux test database...${NC}"

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
        exit 1
    fi
}

# Function to wait for database to be ready
wait_for_db() {
    echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
    
    local attempt=0
    local max_attempts=$((MAX_WAIT_TIME / 2))
    
    while [ $attempt -lt $max_attempts ]; do
        if docker exec $DB_CONTAINER pg_isready -U $DB_USER -d $DB_NAME >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Database is ready!${NC}"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ Database failed to start within ${MAX_WAIT_TIME} seconds${NC}"
    return 1
}

# Function to verify database schema
verify_schema() {
    echo -e "${YELLOW}🔍 Verifying database schema...${NC}"
    
    # Check if extensions are installed
    local extensions=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM pg_extension WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto');")
    
    if [ "$extensions" -ge 4 ]; then
        echo -e "${GREEN}✅ Required extensions are installed${NC}"
    else
        echo -e "${RED}❌ Missing required extensions${NC}"
        return 1
    fi
    
    # Check if tables exist
    local tables=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'repositories', 'opportunities');")
    
    if [ "$tables" -ge 3 ]; then
        echo -e "${GREEN}✅ Core tables are created${NC}"
    else
        echo -e "${RED}❌ Missing core tables${NC}"
        return 1
    fi
    
    # Check if search functions exist
    local functions=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name LIKE '%search%';")
    
    if [ "$functions" -ge 3 ]; then
        echo -e "${GREEN}✅ Search functions are created${NC}"
    else
        echo -e "${RED}❌ Missing search functions${NC}"
        return 1
    fi
    
    # Check sample data
    local users=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM users;")
    
    if [ "$users" -gt 0 ]; then
        echo -e "${GREEN}✅ Sample data is loaded (${users} users)${NC}"
    else
        echo -e "${YELLOW}⚠️ No sample data found${NC}"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}📋 Starting database setup process...${NC}"
    
    # Check prerequisites
    check_docker
    
    # Stop existing containers
    echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
    docker-compose -f $COMPOSE_FILE down --volumes 2>/dev/null || true
    
    # Start database container
    echo -e "${YELLOW}🚀 Starting database container...${NC}"
    docker-compose -f $COMPOSE_FILE up -d test-db
    
    # Wait for database to be ready
    if wait_for_db; then
        # Verify schema and data
        if verify_schema; then
            echo -e "${GREEN}🎉 Database setup completed successfully!${NC}"
            echo -e "${BLUE}📊 Database connection info:${NC}"
            echo -e "  Host: localhost"
            echo -e "  Port: $DB_PORT"
            echo -e "  Database: $DB_NAME"
            echo -e "  User: $DB_USER"
            echo -e "  Password: password"
            echo ""
            echo -e "${BLUE}🔗 Connection URL:${NC}"
            echo -e "  postgresql://postgres:password@localhost:5433/contribux_test"
            echo ""
            echo -e "${BLUE}🧪 Run tests with:${NC}"
            echo -e "  pnpm test:db"
            return 0
        else
            echo -e "${RED}❌ Schema verification failed${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Database setup failed${NC}"
        return 1
    fi
}

# Handle script arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "stop")
        echo -e "${YELLOW}🛑 Stopping database...${NC}"
        docker-compose -f $COMPOSE_FILE down
        echo -e "${GREEN}✅ Database stopped${NC}"
        ;;
    "restart")
        echo -e "${YELLOW}🔄 Restarting database...${NC}"
        docker-compose -f $COMPOSE_FILE down
        sleep 2
        main
        ;;
    "logs")
        echo -e "${BLUE}📋 Database logs:${NC}"
        docker-compose -f $COMPOSE_FILE logs test-db
        ;;
    "status")
        echo -e "${BLUE}📊 Database status:${NC}"
        docker-compose -f $COMPOSE_FILE ps
        ;;
    "clean")
        echo -e "${YELLOW}🧹 Cleaning up database...${NC}"
        docker-compose -f $COMPOSE_FILE down --volumes --rmi local 2>/dev/null || true
        echo -e "${GREEN}✅ Database cleaned${NC}"
        ;;
    *)
        echo -e "${BLUE}Usage: $0 {setup|stop|restart|logs|status|clean}${NC}"
        echo -e "  setup   - Set up and start the test database (default)"
        echo -e "  stop    - Stop the database"
        echo -e "  restart - Restart the database"
        echo -e "  logs    - Show database logs"
        echo -e "  status  - Show database status"
        echo -e "  clean   - Remove database containers and volumes"
        exit 1
        ;;
esac