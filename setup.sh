#!/bin/bash

# Borrowhood Database Setup Script
# Run this script to set up PostgreSQL and the database

set -e

echo "=================================="
echo "Borrowhood Database Setup"
echo "=================================="

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo ""
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ $(uname -m) == "arm64" ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo ""
    echo "Installing PostgreSQL..."
    brew install postgresql@16

    # Add PostgreSQL to PATH
    echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
    export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

# Start PostgreSQL
echo ""
echo "Starting PostgreSQL..."
brew services start postgresql@16 || true

# Wait for PostgreSQL to start
sleep 3

# Create database
echo ""
echo "Creating borrowhood database..."
createdb borrowhood 2>/dev/null || echo "Database may already exist"

# Run migration
echo ""
echo "Running database migration..."
psql borrowhood < server/migrations/001_initial_schema.sql

# Create .env file if it doesn't exist
if [ ! -f server/.env ]; then
    echo ""
    echo "Creating .env file..."
    cp server/.env.example server/.env
    echo ""
    echo "⚠️  Don't forget to add your Stripe API keys to server/.env"
fi

echo ""
echo "=================================="
echo "Database setup complete!"
echo "=================================="
echo ""
echo "To verify, run:"
echo "  psql borrowhood -c '\\dt'"
echo ""
echo "To start the server:"
echo "  cd server && npm install && npm start"
echo ""
