#!/bin/bash

# Build with Memory Check Script
# Builds the project and analyzes memory usage

echo "🚀 Starting optimized build process..."
echo "======================================"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
pnpm clean

# Run dependency analysis
echo -e "\n📦 Analyzing dependencies..."
node scripts/dependency-analysis.js

# Build the project
echo -e "\n🔨 Building production bundle..."
NODE_OPTIONS="--max-old-space-size=2048" pnpm build

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo -e "\n✅ Build completed successfully!"
    
    # Run memory analysis
    echo -e "\n🔍 Running memory analysis..."
    node scripts/memory-analysis.js
    
    # Show bundle size
    echo -e "\n📊 Bundle size analysis:"
    du -sh .next/static
    du -sh .next/server
    
    # Optionally run bundle analyzer
    if [ "$1" == "--analyze" ]; then
        echo -e "\n📈 Opening bundle analyzer..."
        pnpm analyze
    fi
else
    echo -e "\n❌ Build failed!"
    exit 1
fi

echo -e "\n✨ Build process complete!"
echo "Next steps:"
echo "  - Review memory usage above"
echo "  - Run 'pnpm analyze' for detailed bundle analysis"
echo "  - Deploy optimized build to production"