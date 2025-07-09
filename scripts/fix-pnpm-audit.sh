#!/bin/bash

# Fix pnpm audit CI failure script
# This script updates pnpm and regenerates the lockfile to fix the "reference.startsWith is not a function" error

echo "🔧 Fixing pnpm audit CI failure..."
echo ""

# Check current pnpm version
echo "📊 Current pnpm version:"
pnpm --version || echo "pnpm not installed"
echo ""

# Enable corepack (if not already enabled)
echo "🔌 Enabling corepack..."
corepack enable
echo ""

# Install the specified pnpm version
echo "📦 Installing pnpm@10.12.4..."
corepack prepare pnpm@10.12.4 --activate
echo ""

# Verify the new version
echo "✅ New pnpm version:"
pnpm --version
echo ""

# Remove old lockfile and node_modules
echo "🧹 Cleaning up old files..."
rm -rf node_modules pnpm-lock.yaml
echo ""

# Regenerate lockfile
echo "🔄 Regenerating lockfile..."
pnpm install
echo ""

# Run audit to check if the issue is fixed
echo "🔍 Running pnpm audit..."
pnpm audit --audit-level high || echo "⚠️  Audit has some issues, but that's expected"
echo ""

echo "✨ Done! The lockfile has been regenerated with pnpm@10.12.4"
echo ""
echo "📝 Next steps:"
echo "1. Commit the updated pnpm-lock.yaml file"
echo "2. Push the changes to trigger CI"
echo "3. The CI should now pass the audit step (or at least not fail with the startsWith error)"