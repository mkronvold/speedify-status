# Agent install (Speedify host)

Host-native Go agent for the machine running Speedify / `speedify_cli`. **Not** containerized. Does not touch an existing Prometheus `speedify_exporter` (or similar).

Public path: **[QUICKSTART.md](../../QUICKSTART.md)**.

## Cross-compile

Pick **your** router architecture:

```bash
cd apps/agent

# x86_64 / amd64 (many OpenWrt x86 images, mini-PCs)
GOOS=linux GOARCH=amd64 go build -o speedify-status-agent .

# aarch64 / arm64 (many ARM SBCs and some OpenWrt boards)
GOOS=linux GOARCH=arm64 go build -o speedify-status-agent .
```

## Install (preferred)

`install.sh` is idempotent: installs binary + procd init, writes env **only if missing**, enables and restarts the service.

```bash
# from repo root on a machine that can scp to the router
scp apps/agent/speedify-status-agent \
    deploy/gw0/install.sh \
    deploy/gw0/speedify-status-agent.init \
    deploy/gw0/speedify-status-agent.env.example \
    root@ROUTER:/tmp/speedify-status/

ssh root@ROUTER 'mkdir -p /tmp/speedify-status && cd /tmp/speedify-status && \
  AGENT_BIN=./speedify-status-agent sh ./install.sh'
```

| Var         | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `AGENT_BIN` | Path to binary (default: nearby / `/tmp/speedify-status-agent`) |
| `AGENT_SRC` | Optional download URL if binary not present                     |
| `RESTART=0` | Install + enable only; skip start/restart                       |

## Manual install (equivalent)

```bash
scp apps/agent/speedify-status-agent root@ROUTER:/usr/bin/
scp deploy/gw0/speedify-status-agent.env.example root@ROUTER:/etc/speedify-status-agent.env
scp deploy/gw0/speedify-status-agent.init root@ROUTER:/etc/init.d/speedify-status-agent
ssh root@ROUTER 'chmod +x /usr/bin/speedify-status-agent /etc/init.d/speedify-status-agent && \
  /etc/init.d/speedify-status-agent enable && /etc/init.d/speedify-status-agent start'
```

## Ingest URL

Example env uses a **placeholder** LAN hostname — change it to whatever you put on the reverse proxy:

```text
INGEST_URL=http://speedify.lan/api/ingest/sample
```

That hits the **web** nginx proxy (`/api` → `api:4090`). Ensure DNS/rewrite and the proxy forward to `web:80` (HTTP is fine on LAN).

If the router cannot resolve the name yet:

```text
# /etc/hosts on the Speedify host
<docker-host-ip>  speedify.lan
```

Installed paths: `/usr/bin/speedify-status-agent`, `/etc/init.d/speedify-status-agent`, `/etc/speedify-status-agent.env`.
