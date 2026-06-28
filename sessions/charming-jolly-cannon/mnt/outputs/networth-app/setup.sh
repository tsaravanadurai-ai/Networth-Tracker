#!/bin/bash
# Family Net Worth Tracker - Setup Script
# Run this script to install dependencies and build the app

echo "=== Family Net Worth Tracker Setup ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "Node.js version: $(node -v)"
echo ""

# Check Turso environment variables
if [ -z "$TURSO_DATABASE_URL" ]; then
    echo "WARNING: TURSO_DATABASE_URL is not set."
    echo "Set it with: export TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io"
fi
if [ -z "$TURSO_AUTH_TOKEN" ]; then
    echo "WARNING: TURSO_AUTH_TOKEN is not set."
    echo "Set it with: export TURSO_AUTH_TOKEN=your-auth-token"
fi
if [ -z "$TURSO_DATABASE_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
    echo ""
    echo "The app requires Turso credentials to run."
    echo "Get them from: https://turso.tech/app"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install
cd ..

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd frontend
npm install

# Build frontend
echo ""
echo "Building frontend..."
npm run build
cd ..

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "To start the app locally, run:"
echo "  export TURSO_DATABASE_URL=libsql://your-db.turso.io"
echo "  export TURSO_AUTH_TOKEN=your-token"
echo "  export JWT_SECRET=any-secret-string"
echo "  cd backend && node server.js"
echo ""
echo "Then open http://localhost:5000 in your browser."
echo ""
echo "Login credentials:"
echo "  Username: saravana"
echo "  Password: Saravana@2024"
