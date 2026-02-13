#!/bin/bash

echo "🎥 Random Video Chat - Quick Start Script"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16 or higher."
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Navigate to server directory
cd server

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Build the project
echo "🔨 Building TypeScript..."
npm run build
echo ""

# Start the server
echo "🚀 Starting server..."
echo "📍 Server will be available at: http://localhost:3000"
echo "💡 Open multiple browser tabs to test the video chat"
echo "⌨️  Press Ctrl+C to stop the server"
echo ""

npm start