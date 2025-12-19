#!/bin/bash
# Script to merge Replit production database data into Neon database

# INSTRUCTIONS:
# 1. Get the production database URL from Replit:
#    - Go to Database pane
#    - Click "Production Database"
#    - Go to "Settings" tab
#    - Copy the DATABASE_URL connection string
# 2. Set it as PRODUCTION_DB_URL environment variable
# 3. Run this script

if [ -z "$PRODUCTION_DB_URL" ]; then
    echo "ERROR: Please set PRODUCTION_DB_URL environment variable"
    echo "Get it from: Database pane -> Production Database -> Settings"
    exit 1
fi

echo "=== Merging Production Database into Neon ==="

# Step 1: Export key tables from production
echo "Step 1: Exporting data from production database..."
pg_dump "$PRODUCTION_DB_URL" \
  --data-only \
  --table=watch_listings \
  --table=contacts \
  --table=processing_logs \
  --table=message_logs \
  --table=whatsapp_groups \
  > /tmp/production_export.sql

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to export from production database"
    exit 1
fi

echo "Step 2: Getting record counts from production..."
psql "$PRODUCTION_DB_URL" -c "SELECT 'watch_listings' as table_name, COUNT(*) FROM watch_listings UNION ALL SELECT 'contacts', COUNT(*) FROM contacts;"

echo "Step 3: Importing into Neon (with conflict handling)..."
# Import with ON CONFLICT DO NOTHING to avoid duplicates
psql "$DATABASE_URL" -c "SET session_replication_role = 'replica';"
psql "$DATABASE_URL" < /tmp/production_export.sql
psql "$DATABASE_URL" -c "SET session_replication_role = 'origin';"

echo "Step 4: Verifying merge..."
psql "$DATABASE_URL" -c "SELECT 'watch_listings' as table_name, COUNT(*) FROM watch_listings UNION ALL SELECT 'contacts', COUNT(*) FROM contacts;"

echo "=== Merge Complete ==="
echo "Now republish with 'Configure myself' to use Neon for production"
