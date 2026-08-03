# Quick start

Public path to run **speedify-status**: API + web via Compose, a reverse proxy in front of **web**, and a host-native agent on the Speedify box.

Design background: [DESIGN.md](./DESIGN.md).  
One concrete home-lab example (hostnames, AdGuard, NPM): [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md).

> **Line endings:** scripts under `deploy/**` are **LF** (Unix). The repo sets `* text=auto eol=lf` in [`.gitattributes`](./.gitattributes). If bash errors on `$'\r'` after a Windows copy, run:
>
> ```bash
> sed -i 's/\r$//' deploy/compose/*.sh deploy/gw0/*.sh deploy/gw0/*.init 2>/dev/null || true
> chmod +x deploy/compose/*.sh deploy/gw0/install.sh
> ```

## 1. Prerequisites

- Docker Engine + Compose plugin on the **app host**
- A reverse proxy you control (Nginx Proxy Manager, Caddy, Traefik, plain nginx, …)
- LAN DNS (or `/etc/hosts`) for a hostname that points at the app host / proxy
- Go **1.25+** on a build machine (to cross-compile the agent)
- A Linux Speedify host with `speedify_cli` and `/proc/net/dev` (OpenWrt, Debian, …)
- Outbound pull access to GHCR: `ghcr.io/mkronvold/*`

Leave any existing **Prometheus `speedify_exporter`** (or similar) alone — this agent does not replace it.

## 2. Run API + web (Compose)

From a clone of this repo on the app host:

```bash
cp deploy/env/api.env.example deploy/env/api.env
chmod 600 deploy/env/api.env
# optional: set SPEEDIFY_STATUS_INGEST_TOKEN=...
```

Image pins ([`deploy/compose/images.env`](./deploy/compose/images.env)):

- `ghcr.io/mkronvold/speedify-status-api:main`
- `ghcr.io/mkronvold/speedify-status-web:main`

Default Compose ([`deploy/compose/compose.prod.yml`](./deploy/compose/compose.prod.yml)):

| Service | Networks                                 | Published ports |
| ------- | ---------------------------------------- | --------------- |
| `api`   | app-local only                           | none            |
| `web`   | app-local **and** external proxy network | none            |

The stock file expects an **external** Docker network named `nginxproxy_proxy-net` (typical NPM setup). Create it or attach your proxy’s network:

```bash
# only if you do not already have NPM's network
docker network create nginxproxy_proxy-net

cd deploy/compose
chmod +x up.sh down.sh autoupdate.sh
./up.sh
docker compose -f compose.prod.yml --env-file images.env ps
```

`up.sh` fails fast if `deploy/env/api.env` or the external proxy network is missing.

**Optional proxy network:** if you prefer host ports or a different network name, copy/edit `compose.prod.yml` (publish `web:80`, or rename the external network). Keep **api** off the public edge; let **web** nginx proxy `/api` and `/health`.

## 3. Reverse proxy

Point your hostname at the **web** service on port **80** (HTTP is fine on a trusted LAN).

| Proxy target | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Upstream     | Docker DNS name `web` (or container name on the shared proxy network) |
| Port         | `80`                                                                  |
| TLS          | Optional; many home labs run plain HTTP on `.lan`                     |

**Web already reverse-proxies:**

- `/api/*` → `api:4090`
- `/health` → `api:4090`

Browsers and the agent should use the **same front-door hostname** so paths stay consistent:

| Client       | URL                                   |
| ------------ | ------------------------------------- |
| Dashboard    | `http://<host>/`                      |
| Health       | `http://<host>/health`                |
| Status       | `http://<host>/api/status?window=30s` |
| Agent ingest | `http://<host>/api/ingest/sample`     |

Example (Nginx Proxy Manager): domain → scheme `http`, forward hostname `web`, forward port `80`, SSL off unless you terminate TLS at the proxy.

## 4. DNS notes

- Create a LAN record (AdGuard / Pi-hole / router DNS / hosts file) from your chosen name to the **app host** (or the host that runs the reverse proxy).
- Prefer a **dedicated** name (for example `speedify-status.lan` or your own domain).

### Warning: DHCP hostname `speedify`

If a device on the LAN registers DHCP/mDNS hostname **`speedify`**, many resolvers will answer **`speedify.lan`** (or `speedify.local`) for that device — **not** your dashboard host. That silently steals the name and breaks both the UI and agent ingest.

Mitigations:

- Use a less ambiguous hostname for the dashboard, **or**
- Pin an explicit DNS rewrite / static host override for the name you choose, **and**
- Avoid giving the Speedify appliance (or any other box) the bare hostname `speedify` if you also want `speedify.lan` for this app.

## 5. Build and install the agent

The agent is **host-native** (not containerized). It must run on the machine that has Speedify adapters and `/proc/net/dev`.

### Cross-compile

```bash
cd apps/agent

# typical x86_64 OpenWrt / Linux gateway
GOOS=linux GOARCH=amd64 go build -o speedify-status-agent .

# 64-bit ARM gateways
GOOS=linux GOARCH=arm64 go build -o speedify-status-agent .
```

### Install (OpenWrt procd helper)

[`deploy/gw0/install.sh`](./deploy/gw0/install.sh) installs the binary, env file (only if missing), and procd init. Idempotent; does not overwrite an existing `/etc/speedify-status-agent.env`.

```bash
scp speedify-status-agent \
    deploy/gw0/install.sh \
    deploy/gw0/speedify-status-agent.init \
    deploy/gw0/speedify-status-agent.env.example \
    root@<speedify-host>:/tmp/speedify-status/

ssh root@<speedify-host> \
  'cd /tmp/speedify-status && AGENT_BIN=./speedify-status-agent sh ./install.sh'
```

Set ingest to your front door (not a raw API container port unless you published one):

```text
INGEST_URL=http://<host>/api/ingest/sample
# optional, must match API:
# INGEST_TOKEN=...
INTERVAL_SEC=1
```

More detail: [`deploy/gw0/README.md`](./deploy/gw0/README.md).

**Do not** stop or reconfigure an existing Prometheus Speedify exporter if you already run one.

## 6. Smoke checks

```bash
curl -sS http://<host>/health
curl -sS 'http://<host>/api/status?window=30s'
```

Expect health JSON quickly; status may show empty adapters until the agent posts.

After the agent is up:

```bash
# on the Speedify host — service name may match procd init
logread -e speedify-status-agent   # OpenWrt example
# or: journalctl -u speedify-status-agent -f
```

Re-check `/api/status` for adapter rows, then open `http://<host>/` in a browser.

## 7. Local dev with `-simulate`

No Speedify hardware required:

```bash
corepack enable && pnpm install

pnpm --filter @speedify-status/api dev          # :4090
pnpm --filter @speedify-status/web dev          # :5174

cd apps/agent
go run . -simulate -ingest-url http://127.0.0.1:4090/api/ingest/sample
```

UI: http://127.0.0.1:5174/

One-shot:

```bash
go run . -simulate -once -ingest-url http://127.0.0.1:4090/api/ingest/sample
```

## Optional: pull newer `:main` images

```bash
cd deploy/compose
./autoupdate.sh --once
```

## Next

- Architecture and non-goals → [DESIGN.md](./DESIGN.md)
- Lab-specific hostnames and checklist → [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md)
- Repo overview → [README.md](./README.md)
