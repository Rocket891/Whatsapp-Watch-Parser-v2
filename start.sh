#!/bin/bash
# Railway production start script

# Build frontend only (builds to dist/public)
vite build

# Copy built frontend to server/public for production serving
mkdir -p server/public
cp -r dist/public/* server/public/

# Start server with tsx (no bundling needed)
NODE_ENV=production npx tsx server/index.ts
