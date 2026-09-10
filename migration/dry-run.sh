#!/usr/bin/env bash
# The documented rehearsal sequence (migration/README.md), against dumps already pulled by
# export.sh. Refuses without a target: every later step writes into the same one.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "usage: migration/dry-run.sh <target-sqlite-file>" >&2
  echo "The target needs the real application schema already applied, and rooms, union venues" >&2
  echo "and ticket types already authored through their own admin screens (migration/README.md)." >&2
  exit 1
fi
TARGET="$1"

bun migration/inventory.ts
bun migration/transform-identity.ts
bun migration/reconcile.ts
bun migration/load.ts "$TARGET"
bun migration/generate-reference-maps.ts "$TARGET"
bun migration/transform-bookings.ts "$TARGET"
bun migration/transform-training.ts "$TARGET"
bun migration/transform-programme.ts "$TARGET"
bun migration/transform-money.ts "$TARGET"
# transform-reservations.ts (#840) belongs here, run early, once merged: docs/operations.md.
