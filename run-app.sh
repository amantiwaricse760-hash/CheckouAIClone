#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================="
echo "🦅 Starting Stealth AI Interview Copilot..."
echo "=========================================="

# Check if node_modules exists
if [ ! -d "node_modules/electron" ]; then
    echo "Installing desktop app dependencies (first-time setup)..."
    npm install
fi

# Run native desktop app
echo "Launching desktop window..."
npm start
