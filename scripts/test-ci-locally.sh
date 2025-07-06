#!/bin/bash

# Local CI Testing Script
# This script simulates the CI environment locally to test the pipeline

set -e

echo "🧪 Starting local CI simulation..."

# Check required environment variables
if [ -z "$NEON_API_KEY" ] || [ -z "$NEON_PROJECT_ID" ]; then
  echo "❌ Missing required environment variables:"
  echo "   NEON_API_KEY: ${NEON_API_KEY:+Set}${NEON_API_KEY:-Missing}"
  echo "   NEON_PROJECT_ID: ${NEON_PROJECT_ID:+Set}${NEON_PROJECT_ID:-Missing}"
  echo ""
  echo "💡 Set them with:"
  echo "   export NEON_API_KEY='your-neon-api-key'"
  echo "   export NEON_PROJECT_ID='your-project-id'"
  exit 1
fi

# Set CI environment variables
export CI=true
export NODE_ENV=test
export NEXTAUTH_SECRET="test-secret-$(date +%s)"
export NEXTAUTH_URL="http://localhost:3000"

echo "✅ Environment variables configured"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🎭 Installing Playwright browsers..."
pnpm playwright:install

# Create test branch
BRANCH_NAME="local-test-$(date +%s)"
echo "🌿 Creating test Neon branch: $BRANCH_NAME"

RESPONSE=$(curl -s -m 30 -X POST \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"branch\": {\"name\": \"$BRANCH_NAME\"}}")

BRANCH_ID=$(echo $RESPONSE | jq -r '.branch.id' 2>/dev/null || echo "null")

if [ "$BRANCH_ID" = "null" ] || [ -z "$BRANCH_ID" ]; then
  echo "❌ Failed to create test branch"
  echo "Response: $RESPONSE"
  exit 1
fi

CONNECTION_URI=$(echo $RESPONSE | jq -r '.connection_uris[0].connection_uri')
export DATABASE_URL="$CONNECTION_URI"
export DATABASE_URL_TEST="$CONNECTION_URI"

echo "✅ Test branch created: $BRANCH_ID"

# Cleanup function
cleanup() {
  echo "🧹 Cleaning up test branch: $BRANCH_ID"
  curl -s -X DELETE \
    "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$BRANCH_ID" \
    -H "Authorization: Bearer $NEON_API_KEY" || true
  echo "✅ Cleanup completed"
}

# Set trap for cleanup
trap cleanup EXIT

# Run tests in CI mode
echo "🔍 Running linting..."
pnpm lint

echo "🔍 Running type checking..."
pnpm type-check

echo "🧪 Running unit tests..."
pnpm test

echo "🗄️ Running database tests..."
timeout 5m pnpm test:db

echo "🔗 Running integration tests..."
timeout 8m pnpm test:integration:ci

echo "🎭 Building application..."
timeout 5m pnpm build

echo "🌐 Running E2E tests..."
timeout 8m pnpm test:e2e:ci

echo "🎉 All tests passed successfully!"
echo "💡 Your CI pipeline should work correctly on GitHub Actions"