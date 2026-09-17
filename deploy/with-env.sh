#!/usr/bin/env bash
#
# Run a command with deploy/api.env loaded, the way Compose loads it.
#
#   deploy/with-env.sh npm run db:seed
#
# `source deploy/api.env` looks like it would do this and does not: the file is
# written for Compose's env_file, where a value runs to the end of the line and
# nothing is interpreted. A shell reads it as script, so DATABASE_URL's own
# `?sslmode=require&channel_binding=require` ends the statement at the `&` and
# everything below line 10 is silently never exported.
#
# That is not a theoretical failure. It sent a seed meant for production to
# whatever DATABASE_URL happened to be in apps/api/.env instead — the developer
# database, on the same laptop, with the same schema, reporting success.
set -euo pipefail

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")" && pwd)/api.env}"
[ -f "$ENV_FILE" ] || { echo "no such env file: $ENV_FILE" >&2; exit 1; }
[ $# -gt 0 ] || { echo "usage: deploy/with-env.sh <command> [args...]" >&2; exit 2; }

# Read with a parser rather than a shell: split on the first =, take the rest
# verbatim, and hand it to env, which does no interpretation of its own.
# `mapfile` is bash 4; macOS ships bash 3.2, where it silently does nothing and
# env is then handed no variables at all.
PAIRS=()
while IFS= read -r line; do PAIRS+=("$line"); done < <(grep -vE '^[[:space:]]*(#|$)' "$ENV_FILE")
exec env "${PAIRS[@]}" "$@"
