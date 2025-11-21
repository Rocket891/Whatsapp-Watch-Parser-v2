#!/bin/bash
# Railway production start script

# Build frontend only
npm run build

# Start server with tsx (no bundling needed)
NODE_ENV=production npx tsx server/index.ts
