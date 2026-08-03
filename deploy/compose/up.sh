#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
log_dir="${SPEEDIFY_STATUS_LOG_DIR:-./logs}"
mkdir -p "$log_dir"
log_file="$log_dir/up-$ts.log"
exec > >(tee -a "$log_file") 2>&1

echo "[up] $(date -u +%FT%TZ) starting"

if [[ ! -f ../env/api.env ]]; then
  echo "[up] missing ../env/api.env — copy from api.env.example first" >&2
  exit 1
fi

if ! docker network inspect nginxproxy_proxy-net >/dev/null 2>&1; then
  echo "[up] external network nginxproxy_proxy-net not found (start NPM first)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
[[ -f ./images.env ]] && . ./images.env
set +a

docker compose -f compose.prod.yml --env-file images.env pull
docker compose -f compose.prod.yml --env-file images.env up -d "$@"
docker compose -f compose.prod.yml --env-file images.env ps
echo "[up] done"
