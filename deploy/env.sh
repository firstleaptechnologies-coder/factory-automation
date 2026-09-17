#!/usr/bin/env bash
#
# Read one environment out of deploy/environments.json and export it.
#
#   . deploy/env.sh staging
#
# Sourced by provision-aws.sh and ship.sh so there is one place that knows what
# an environment is, and no script invents a name of its own. Every resource is
# suffixed with the environment, which is what makes a second world possible at
# all: `fas-staging` and `fas-production` cannot collide in one AWS account.
set -euo pipefail

FAS_ENV="${1:-}"
if [ -z "$FAS_ENV" ]; then
  echo "usage: <script> <staging|production>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/deploy/environments.json"

read_key() {
  python3 -c "
import json, sys
d = json.load(open('$CONF'))
if '$FAS_ENV' not in d or '$FAS_ENV'.startswith('_'):
    sys.exit('no such environment: $FAS_ENV (have: ' + ', '.join(k for k in d if not k.startswith('_')) + ')')
v = d['$FAS_ENV'].get('$1')
sys.stdout.write('' if v is None else str(v))
"
}

export FAS_ENV
export FAS_NAME="fas-$FAS_ENV"
export FAS_API_DOMAIN="$(read_key apiDomain)"
export FAS_OTA_CHANNEL="$(read_key otaChannel)"
export FAS_APP_ENV="$(read_key appEnv)"
export FAS_REGION="$(read_key region)"
export FAS_INSTANCE_TYPE="$(read_key instanceType)"
export FAS_VOLUME_GB="$(read_key volumeGb)"
export FAS_ENV_FILE="$ROOT/deploy/env/$FAS_ENV.env"
export FAS_REMOTE_DIR="${FAS_REMOTE_DIR:-/srv/fas}"
export FAS_SSH_HOST="${FAS_SSH_HOST:-fas-$FAS_ENV}"
