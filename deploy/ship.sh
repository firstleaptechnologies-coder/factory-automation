#!/usr/bin/env bash
#
# Put this working tree on the box and start it.
#
#   deploy/ship.sh fas-prod          # host from ~/.ssh/config
#   REMOTE_DIR=/srv/fas deploy/ship.sh fas-prod
#
# Copies the source, migrates every tenant, then restarts the API — in that
# order, because code that expects a column the database has not got yet is a
# deployment that half works.
#
# Nothing here reads a secret. deploy/api.env and deploy/.env live on the box
# and are not copied, which is also why --delete is not passed to rsync.
set -euo pipefail

HOST="${1:-}"
REMOTE_DIR="${REMOTE_DIR:-/srv/fas}"

if [ -z "$HOST" ]; then
  echo "usage: deploy/ship.sh <ssh-host>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The mobile app is built by Xcode and Gradle; the box has no use for it, and
# its android/ and ios/ build output is the largest thing in the repository.
rsync -az --info=stats1 \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.next' \
  --exclude 'apps/mobile' \
  --exclude 'deploy/api.env' \
  --exclude 'deploy/.env' \
  --exclude '.DS_Store' \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

ssh "$HOST" "cd $REMOTE_DIR && \
  docker compose -f deploy/compose.yml build && \
  docker compose -f deploy/compose.yml --profile migrate run --rm migrate && \
  docker compose -f deploy/compose.yml up -d"

echo
echo "Deployed. What it says it is:"
# Asked of the container rather than of the domain, so this reports on the code
# that was just started even when DNS or the certificate is the thing that is
# broken.
ssh "$HOST" "cd $REMOTE_DIR && docker compose -f deploy/compose.yml exec -T api \
  node -e \"fetch('http://127.0.0.1:3001/api/health').then(r=>r.text()).then(console.log)\""
