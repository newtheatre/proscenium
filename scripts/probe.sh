#!/bin/sh
# Builds, serves, and prints what each address renders.
set -e
bun run build >/tmp/claude-0/-home-user/f812baf8-036f-587e-8c27-daaaa7a7f5ec/scratchpad/proof-paths/build.log 2>&1 || { tail -30 /tmp/claude-0/-home-user/f812baf8-036f-587e-8c27-daaaa7a7f5ec/scratchpad/proof-paths/build.log; exit 1; }
PORT=4317 node .output/server/index.mjs >/dev/null 2>&1 &
PID=$!
sleep 2
for p in / /about /whats-on; do printf '%s => ' "$p"; curl -s localhost:4317$p | grep -o '\(UPSTREAM\|THEATRE\)[A-Z -]* v[0-9]*' | sort -u | tr '\n' ';'; echo; done
printf '/api/box-office/ping => '; curl -s localhost:4317/api/box-office/ping; echo
kill $PID
