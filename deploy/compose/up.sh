#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
set -a
[ -f images.env ] && . ./images.env
set +a
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
