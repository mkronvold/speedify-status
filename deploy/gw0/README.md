# gw0 agent install

> Public path (any host): [QUICKSTART.md](../../QUICKSTART.md). This page is the OpenWrt/`gw0` detail.

Target: OpenWrt **x86_64** host `gw0` (OpenWrt 24.10). Build with **`GOARCH=amd64`**
(not arm64). The agent is **host-native** (not containerized) and does not touch the
existing `speedify_exporter` on :9961.

## Cross-compile

On a Linux/macOS/WSL build host with Go 1.25+:

```bash
cd apps/agent
GOOS=linux GOARCH=amd64 go build -o speedify-status-agent .
```

## Install (preferred)

`install.sh` is idempotent: installs binary + procd init, writes env only if missing,
enables and restarts the service.

```bash
# from repo root on a machine that can scp to gw0
scp apps/agent/speedify-status-agent \
    deploy/gw0/install.sh \
    deploy/gw0/speedify-status-agent.init \
    deploy/gw0/speedify-status-agent.env.example \
    root@gw0:/tmp/speedify-status/

ssh root@gw0 'mkdir -p /tmp/speedify-status && cd /tmp/speedify-status && \
  AGENT_BIN=./speedify-status-agent sh ./install.sh'
```

Or pipe the installer after copying the binary:

```bash
scp apps/agent/speedify-status-agent root@gw0:/tmp/speedify-status-agent
ssh root@gw0 'sh -s' < deploy/gw0/install.sh
# if init/env.example are not next to install.sh on the remote, scp the full set as above
```

Environment variables for `install.sh`:

| Var         | Meaning                                       |
| ----------- | --------------------------------------------- |
| `AGENT_BIN` | Path to binary (default: nearby / `/tmp/...`) |
| `AGENT_SRC` | Optional download URL if binary not present   |
| `RESTART=0` | Install + enable only; skip start/restart     |

## Manual install (equivalent)

```bash
scp apps/agent/speedify-status-agent root@gw0:/usr/bin/
scp deploy/gw0/speedify-status-agent.env.example root@gw0:/etc/speedify-status-agent.env
scp deploy/gw0/speedify-status-agent.init root@gw0:/etc/init.d/speedify-status-agent
ssh root@gw0 'chmod +x /usr/bin/speedify-status-agent /etc/init.d/speedify-status-agent && \
  /etc/init.d/speedify-status-agent enable && /etc/init.d/speedify-status-agent start'
```

## Ingest URL

Default in the example env:

```text
INGEST_URL=http://speedify.lan/api/ingest/sample
```

That hits the web container nginx proxy (`/api` → `api:4090`). Ensure AdGuard rewrites
`speedify.lan` → docker.lan and NPM forwards `speedify.lan` → `web:80` (http).

See [docs/DEPLOY-HOME.md](../../docs/DEPLOY-HOME.md) for the full home checklist.
