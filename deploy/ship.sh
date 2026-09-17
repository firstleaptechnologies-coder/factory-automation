#!/usr/bin/env bash
#
# Put this working tree on one environment's box and start it.
#
#   deploy/ship.sh staging
#   deploy/ship.sh production
#
# Copies the source, migrates every tenant, then restarts the API — in that
# order, because code that expects a column the database has not got yet is a
# deployment that half works.
#
# The environment decides the host, the domain and which env file the box is
# already holding; see deploy/environments.json. Nothing here reads a secret:
# deploy/env/<environment>.env lives on the box and is not copied, which is
# also why --delete is not passed to rsync.
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/env.sh" "${1:-}"

HOST="${FAS_SSH_HOST}"
REMOTE_DIR="${FAS_REMOTE_DIR}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The mobile app is built by Xcode and Gradle; the box has no use for it, and
# its android/ and ios/ build output is the largest thing in the repository.
# --stats, not --info=stats1: macOS ships openrsync, which does not have the
# latter and fails the whole deploy on an unrecognised option.
rsync -az --stats \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.next' \
  --exclude 'apps/mobile' \
  --exclude 'deploy/env' \
  --exclude 'deploy/.env' \
  --exclude '.DS_Store' \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

ssh "$HOST" "cd $REMOTE_DIR && \
  docker compose -f deploy/compose.yml build && \
  docker compose -f deploy/compose.yml --profile migrate run --rm migrate && \
  docker compose -f deploy/compose.yml up -d"

echo
echo "Waiting for $FAS_ENV to answer..."
# Asked of the container rather than of the domain, so this reports on the code
# that was just started even when DNS or the certificate is the thing that is
# broken.
#
# And waited for: Nest takes some seconds to map every route on a small box, so
# asking once the moment the container starts reports ECONNREFUSED on a deploy
# that worked perfectly. A deploy that cries wolf is one nobody reads.
for attempt in $(seq 1 30); do
  if out=$(ssh "$HOST" "cd $REMOTE_DIR && docker compose -f deploy/compose.yml exec -T api \
      node -e \"fetch('http://127.0.0.1:3001/api/health').then(r=>r.text()).then(console.log)\"" 2>/dev/null); then
    echo "$out"
    exit 0
  fi
  sleep 2
done

echo "It never answered. What it logged:" >&2
ssh "$HOST" "cd $REMOTE_DIR && docker compose -f deploy/compose.yml logs api --tail 40" >&2
exit 1
