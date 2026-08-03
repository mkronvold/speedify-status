#!/bin/sh
# Idempotent OpenWrt installer for speedify-status-agent on gw0 (x86_64 / amd64).
#
# Run ON gw0 (or: ssh root@gw0 'sh -s' < deploy/gw0/install.sh)
#
# Options (env):
#   AGENT_BIN   Path to pre-built binary to install (default: ./speedify-status-agent
#               next to this script, or /tmp/speedify-status-agent)
#   AGENT_SRC   Optional URL to download the binary with wget/curl when AGENT_BIN missing
#   RESTART=0   Install/enable only; do not restart (default: restart)
#
# Example:
#   scp apps/agent/speedify-status-agent root@gw0:/tmp/
#   scp deploy/gw0/install.sh deploy/gw0/speedify-status-agent.init \
#       deploy/gw0/speedify-status-agent.env.example root@gw0:/tmp/speedify-status/
#   ssh root@gw0 'cd /tmp/speedify-status && AGENT_BIN=./speedify-status-agent sh ./install.sh'
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BIN_DST=/usr/bin/speedify-status-agent
INIT_DST=/etc/init.d/speedify-status-agent
ENV_DST=/etc/speedify-status-agent.env
RESTART=${RESTART:-1}

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

resolve_agent_bin() {
  if [ -n "${AGENT_BIN:-}" ]; then
    [ -f "$AGENT_BIN" ] || die "AGENT_BIN not found: $AGENT_BIN"
    printf '%s\n' "$AGENT_BIN"
    return 0
  fi
  for candidate in \
    "$SCRIPT_DIR/speedify-status-agent" \
    ./speedify-status-agent \
    /tmp/speedify-status-agent; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  if [ -n "${AGENT_SRC:-}" ]; then
    tmp=/tmp/speedify-status-agent.download
    log "Downloading agent from AGENT_SRC..."
    if command -v wget >/dev/null 2>&1; then
      wget -q -O "$tmp" "$AGENT_SRC" || die "wget failed for AGENT_SRC"
    elif command -v curl >/dev/null 2>&1; then
      curl -fsSL -o "$tmp" "$AGENT_SRC" || die "curl failed for AGENT_SRC"
    else
      die "need wget or curl to download AGENT_SRC"
    fi
    printf '%s\n' "$tmp"
    return 0
  fi
  die "No agent binary found. Set AGENT_BIN=/path/to/speedify-status-agent or AGENT_SRC=URL"
}

resolve_init() {
  for candidate in \
    "$SCRIPT_DIR/speedify-status-agent.init" \
    ./speedify-status-agent.init; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  die "speedify-status-agent.init not found next to install.sh"
}

resolve_env_example() {
  for candidate in \
    "$SCRIPT_DIR/speedify-status-agent.env.example" \
    ./speedify-status-agent.env.example; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  # Optional — env example may be missing if operator already has ENV_DST
  printf '%s\n' ""
}

AGENT_SRC_PATH=$(resolve_agent_bin)
INIT_SRC=$(resolve_init)
ENV_EXAMPLE=$(resolve_env_example)

log "Installing binary → $BIN_DST"
cp "$AGENT_SRC_PATH" "$BIN_DST"
chmod 755 "$BIN_DST"

log "Installing init → $INIT_DST"
cp "$INIT_SRC" "$INIT_DST"
chmod 755 "$INIT_DST"

if [ -f "$ENV_DST" ]; then
  log "Keeping existing env $ENV_DST (not overwriting)"
else
  if [ -n "$ENV_EXAMPLE" ] && [ -f "$ENV_EXAMPLE" ]; then
    log "Installing env example → $ENV_DST"
    cp "$ENV_EXAMPLE" "$ENV_DST"
    chmod 600 "$ENV_DST"
  else
    log "Writing default env → $ENV_DST"
    cat >"$ENV_DST" <<'EOF'
# speedify-status-agent on gw0
INGEST_URL=http://speedify.lan/api/ingest/sample
# INGEST_TOKEN=
INTERVAL_SEC=1
SPEEDIFY_CLI=/usr/share/speedify/speedify_cli
LATENCY_FALLBACK_HOST=1.1.1.1
EOF
    chmod 600 "$ENV_DST"
  fi
fi

if [ -x "$INIT_DST" ]; then
  log "Enabling service"
  "$INIT_DST" enable || true
  if [ "$RESTART" = "1" ]; then
    log "Restarting service"
    if "$INIT_DST" running >/dev/null 2>&1 || "$INIT_DST" status >/dev/null 2>&1; then
      "$INIT_DST" restart || "$INIT_DST" start
    else
      "$INIT_DST" start
    fi
  else
    log "RESTART=0 — skipped start/restart"
  fi
fi

log "Done."
log "  binary: $BIN_DST"
log "  init:   $INIT_DST"
log "  env:    $ENV_DST"
log "Edit INGEST_URL if needed (default http://speedify.lan/api/ingest/sample)."
log "Existing speedify_exporter :9961 is left alone."
