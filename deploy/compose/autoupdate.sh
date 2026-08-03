#!/usr/bin/env bash
# Thin GHCR auto-refresh for speedify-status (api + web).
# Modeled on wdmbg deploy/compose/autoupdate.sh — pull when local tag drifts.
#
# Usage:
#   ./autoupdate.sh --once
#   ./autoupdate.sh [interval-minutes]   # default 30
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

readonly default_interval_minutes=30
readonly no_updates_exit_code=10
readonly lock_file=".autoupdate.lock"
readonly ghcr_services=(api web)
readonly health_services=(api web)
readonly compose_file="compose.prod.yml"
readonly images_file="images.env"

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(timestamp)" "$*"; }
log_error() { printf '[%s] %s\n' "$(timestamp)" "$*" >&2; }

usage() {
  log_error "Usage: $0 [interval-minutes]"
  log_error "       $0 --once"
}

for cmd in docker curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "$cmd is required."
    exit 1
  fi
done

one_shot=false
interval_minutes="$default_interval_minutes"

if (( $# > 1 )); then
  usage
  exit 1
fi

case "${1:-}" in
  '') ;;
  --once) one_shot=true ;;
  *)
    interval_minutes="$1"
    if ! [[ "$interval_minutes" =~ ^[0-9]+$ ]] || (( interval_minutes <= 0 )); then
      log_error 'Interval must be a positive number of minutes.'
      exit 1
    fi
    ;;
esac

readonly interval_minutes
readonly sleep_seconds=$((interval_minutes * 60))

load_env() {
  set -a
  # shellcheck disable=SC1091
  [[ -f "$images_file" ]] && . "./$images_file"
  set +a
}

compose_cmd() {
  local -a args=()
  [[ -f "$images_file" ]] && args+=(--env-file "$images_file")
  args+=(-f "$compose_file")
  docker compose "${args[@]}" "$@"
}

# Resolve image from images.env / environment (compose project is simple: api + web).
resolve_image() {
  local service="$1"
  case "$service" in
    api) printf '%s\n' "${SPEEDIFY_STATUS_API_IMAGE:-ghcr.io/mkronvold/speedify-status-api:main}" ;;
    web) printf '%s\n' "${SPEEDIFY_STATUS_WEB_IMAGE:-ghcr.io/mkronvold/speedify-status-web:main}" ;;
    *) return 1 ;;
  esac
}

local_image_id() {
  docker image inspect "$1" --format '{{.Id}}' 2>/dev/null || true
}

running_service_image_id() {
  local cid
  cid="$(compose_cmd ps -q "$1" 2>/dev/null || true)"
  [[ -n "$cid" ]] || return 1
  docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || true
}

# Compare local tag presence vs remote by attempting a quiet pull and checking id change.
# Simpler than full GHCR digest auth flow; good enough for private-lab main tags.
check_and_pull() {
  local service=""
  local image=""
  local before=""
  local after=""
  local updated=()

  log 'Checking for updated GHCR images...'
  for service in "${ghcr_services[@]}"; do
    image="$(resolve_image "$service")"
    before="$(local_image_id "$image")"
    log "Pulling ${service} (${image})..."
    if ! compose_cmd pull "$service"; then
      log_error "Pull failed for ${service}"
      return 1
    fi
    after="$(local_image_id "$image")"
    running="$(running_service_image_id "$service" || true)"
    if [[ -z "$before" || "$before" != "$after" || -z "$running" || "$running" != "$after" ]]; then
      log "Update needed for '${service}'"
      updated+=("$service")
    else
      log "Unchanged '${service}'"
    fi
  done

  if ((${#updated[@]} == 0)); then
    log 'No new images / stack already current.'
    return "$no_updates_exit_code"
  fi

  log "Recreating stack for: ${updated[*]}"
  bash ./up.sh
  verify_health
}

verify_health() {
  local service="" cid="" status="" attempt=1 max_attempts=18 healthy=true

  log 'Verifying service health...'
  while ((attempt <= max_attempts)); do
    healthy=true
    for service in "${health_services[@]}"; do
      cid="$(compose_cmd ps -q "$service" 2>/dev/null || true)"
      if [[ -z "$cid" ]]; then
        log "  ${service}: missing"
        healthy=false
        continue
      fi
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      log "  ${service}: ${status:-unknown}"
      if [[ "$status" != "healthy" && "$status" != "running" ]]; then
        healthy=false
      fi
    done
    [[ "$healthy" == true ]] && return 0
    ((attempt == max_attempts)) && break
    log "Health not ready (attempt ${attempt}/${max_attempts}); waiting 5s..."
    sleep 5
    ((attempt += 1))
  done
  log_error 'One or more services failed health verification.'
  return 1
}

ensure_stack_running() {
  local missing=0
  local service=""
  for service in "${health_services[@]}"; do
    if [[ -z "$(compose_cmd ps -q "$service" 2>/dev/null || true)" ]]; then
      missing=1
      break
    fi
  done
  if ((missing == 1)); then
    log 'Stack not fully running; starting via up.sh'
    bash ./up.sh
  fi
}

run_cycle() {
  local status=0
  ensure_stack_running
  set +e
  check_and_pull
  status=$?
  set -e
  if ((status == 0 || status == no_updates_exit_code)); then
    return "$status"
  fi
  return "$status"
}

load_env

# Optional flock when available (OpenWrt hosts may lack it — compose host is docker.lan).
if command -v flock >/dev/null 2>&1; then
  exec 9>"$lock_file"
  if ! flock -n 9; then
    log_error "Another autoupdate holds ${lock_file}; exiting."
    exit 1
  fi
fi

if [[ "$one_shot" == true ]]; then
  log 'Running a single update check.'
  set +e
  run_cycle
  status=$?
  set -e
  if ((status == 0 || status == no_updates_exit_code)); then
    exit 0
  fi
  exit "$status"
fi

log "Watching GHCR images every ${interval_minutes} minute(s)."
while true; do
  set +e
  run_cycle
  status=$?
  set -e
  if ((status != 0 && status != no_updates_exit_code)); then
    log 'Update check failed; will retry next interval.'
  fi
  log "Sleeping ${interval_minutes} minute(s)..."
  sleep "$sleep_seconds"
done
