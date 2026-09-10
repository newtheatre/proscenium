#!/usr/bin/env bash
# The documented rehearsal sequence (migration/README.md), against dumps already pulled by
# export.sh. Refuses without a target: load, bookings and money all write into one.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "usage: migration/dry-run.sh <target-sqlite-file>" >&2
  echo "load.ts, transform-bookings.ts and transform-money.ts all write into the same target," >&2
  echo "which needs the real application schema already applied (migration/README.md)." >&2
  exit 1
fi
TARGET="$1"

bun migration/inventory.ts
bun migration/transform-identity.ts
bun migration/reconcile.ts
bun migration/load.ts "$TARGET"
bun migration/transform-bookings.ts "$TARGET"
bun migration/transform-money.ts "$TARGET"
