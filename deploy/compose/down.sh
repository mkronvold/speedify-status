#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
log_dir="${SPEEDIFY_STATUS_LOG_DIR:-./logs}"
mkdir -p "$log_dir"
log_file="$log_dir/down-$ts.log"
exec > >(tee -a "$log_file") 2>&1

echo "[down] $(date -u +%FT%TZ) starting"

set -a
# shellcheck disable=SC1091
[[ -f ./images.env ]] && . ./images.env
set +a

docker compose -f compose.prod.yml --env-file images.env down "$@"
echo "[down] done"
