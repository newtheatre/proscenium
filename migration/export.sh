#!/usr/bin/env bash
# Pulls fresh dumps of the four production databases. Read-only against production.
set -euo pipefail
cd "$(dirname "$0")/.."
export CLOUDFLARE_ACCOUNT_ID=3d250a94794003bd921b7f0379de7f00
STAMP=$(date +%Y-%m-%d)
DIR="migration/dumps/$STAMP"
mkdir -p "$DIR"
for DB in auth rooms training proscenium; do
  echo "exporting $DB..."
  bunx wrangler d1 export "$DB" --remote --output "$DIR/$DB.sql"
done
ls -lh "$DIR"
echo "$STAMP" > migration/dumps/LATEST
