# Quick start

End-to-end setup for a new home lab: Docker API+web, reverse proxy, DNS, and the host-native Speedify agent.

Shell scripts under `deploy/` use **LF** line endings. If you copy them from Windows and bash complains about `$'\r'`, run:

```bash
sed -i 's/\r$//' deploy/compose/*.sh deploy/gw0/*.sh deploy/gw0/*.init
```

## 1. Prerequisites

| Piece              | Notes                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Docker host**    | Docker Engine + Compose v2. Optional: [Nginx Proxy Manager](https://nginxproxymanager.com/) (or any reverse proxy) on an external Docker network |
| **Speedify host**  | Linux router/OpenWrt (or any Linux box) running Speedify with `speedify_cli` (default path `/usr/share/speedify/speedify_cli`)                   |
| **DNS (optional)** | AdGuard / Pi-hole / router rewrite so a friendly name (e.g. `speedify.lan`) points at the Docker host                                            |
| **Go 1.25+**       | Only needed to **build** the agent (cross-compile is fine)                                                                                       |

The agent does **not** replace or reconfigure any existing Prometheus `speedify_exporter` (or similar) you may already run.

## 2. Compose (API + web)

On the Docker host:

```bash
git clone https://github.com/mkronvold/speedify-status.git
cd speedify-status

cp deploy/env/api.env.example deploy/env/api.env
chmod 600 deploy/env/api.env
# optional: SPEEDIFY_STATUS_INGEST_TOKEN=...

# If you use NPM / nginx-proxy, the external network must already exist:
docker network inspect nginxproxy_proxy-net >/dev/null
# create only if your proxy stack expects this exact name and it is missing:
# docker network create nginxproxy_proxy-net

cd deploy/compose
# images.env pins GHCR tags (defaults to :main)
chmod +x up.sh down.sh autoupdate.sh
./up.sh
docker compose -f compose.prod.yml --env-file images.env ps
```

Networking (locked by `compose.prod.yml`):

| Service | Networks                                           | Host ports |
| ------- | -------------------------------------------------- | ---------- |
| `web`   | app bridge **and** external `nginxproxy_proxy-net` | none       |
| `api`   | app bridge only                                    | none       |

`web` nginx already proxies `/api/*` and `/health` to `api:4090` inside the compose network. You only need to expose **web:80** via your reverse proxy.

Images:

- `ghcr.io/mkronvold/speedify-status-api:main`
- `ghcr.io/mkronvold/speedify-status-web:main`

Private GHCR pulls (if ever needed): `echo $CR_PAT | docker login ghcr.io -u USER --password-stdin`. Public packages pull without auth.

Optional refresh when `:main` moves: `./autoupdate.sh --once` (or a cron/timer).

## 3. Reverse proxy / NPM

Point a hostname at the **web** container port **80** (HTTP is fine on a trusted LAN).

Example (Nginx Proxy Manager):

| Field            | Value                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Domain           | `speedify.lan` (or your choice)                                                                            |
| Scheme           | `http`                                                                                                     |
| Forward hostname | compose container name (e.g. `speedify-status-web-1`) or Docker DNS name `web` on the shared proxy network |
| Forward port     | `80`                                                                                                       |
| SSL              | off for pure LAN; enable only if you want local TLS                                                        |
| Websockets       | optional / off for MVP                                                                                     |

No need to proxy the API container separately — browsers and the agent should use the web front door so `/api` is same-origin.

## 4. DNS

Create an A record or DNS rewrite:

```text
speedify.lan  →  <docker-host-ip>
```

**Warning:** if a DHCP client hostname is literally `speedify`, some resolvers will publish `speedify.lan` for that lease and **steal** your rewrite. Rename the lease/client or pick another dashboard name (e.g. `speedify-status.lan`).

## 5. Agent (Speedify host)

Build for your router CPU (**not** only one arch):

```bash
cd apps/agent

# x86_64 OpenWrt / most mini-PCs:
GOOS=linux GOARCH=amd64 go build -o speedify-status-agent .

# aarch64 / many ARM SBCs and some OpenWrt boards:
# GOOS=linux GOARCH=arm64 go build -o speedify-status-agent .
```

Install with the idempotent helper (binary + procd init; **does not overwrite** an existing env file):

```bash
scp speedify-status-agent \
    ../../deploy/gw0/install.sh \
    ../../deploy/gw0/speedify-status-agent.init \
    ../../deploy/gw0/speedify-status-agent.env.example \
    root@ROUTER:/tmp/speedify-status/

ssh root@ROUTER 'cd /tmp/speedify-status && AGENT_BIN=./speedify-status-agent sh ./install.sh'
```

Example env (`/etc/speedify-status-agent.env`) — replace the hostname with **your** reverse-proxy name:

```bash
# Placeholder hostname — use the name you configured in DNS + NPM (see above).
INGEST_URL=http://speedify.lan/api/ingest/sample
# INGEST_TOKEN=          # must match SPEEDIFY_STATUS_INGEST_TOKEN if set
INTERVAL_SEC=1
SPEEDIFY_CLI=/usr/share/speedify/speedify_cli
LATENCY_FALLBACK_HOST=1.1.1.1
```

If the router cannot resolve that name yet, pin it in `/etc/hosts`:

```text
<docker-host-ip>  speedify.lan
```

Paths after install: `/usr/bin/speedify-status-agent`, `/etc/init.d/speedify-status-agent`, `/etc/speedify-status-agent.env`.

More detail: [`deploy/gw0/README.md`](./deploy/gw0/README.md).

## 6. Smoke test

```bash
curl -sS http://speedify.lan/health
curl -sS 'http://speedify.lan/api/status?window=30s'
```

Open `http://speedify.lan/` — set window + refresh, confirm adapters appear after the agent posts (often within a few seconds).

Expect ~one sample/sec per connected adapter while the agent runs. Status may be empty until the first successful ingest.

## 7. Local development (no Docker / no router)

Requirements: Node 26, corepack/pnpm 10, Go 1.25+.

```bash
corepack enable
pnpm install
pnpm validate          # lint, typecheck, test, build, format

# terminal 1
pnpm --filter @speedify-status/api dev

# terminal 2
pnpm --filter @speedify-status/web dev

# terminal 3 — simulated adapters
cd apps/agent
go run . -simulate -ingest-url http://127.0.0.1:4090/api/ingest/sample
```

UI: http://127.0.0.1:5174/

```bash
cd apps/agent && go test ./...
```

## Env reference

| Var                            | Where | Default / notes                                                                                    |
| ------------------------------ | ----- | -------------------------------------------------------------------------------------------------- |
| `SPEEDIFY_STATUS_API_HOST`     | api   | `0.0.0.0`                                                                                          |
| `SPEEDIFY_STATUS_API_PORT`     | api   | `4090`                                                                                             |
| `SPEEDIFY_STATUS_INGEST_TOKEN` | api   | unset                                                                                              |
| `INGEST_URL`                   | agent | CLI default `http://127.0.0.1:4090/api/ingest/sample`; production example env uses your proxy host |
| `INGEST_TOKEN`                 | agent | unset                                                                                              |
| `INTERVAL_SEC`                 | agent | `1`                                                                                                |
| `SPEEDIFY_CLI`                 | agent | `/usr/share/speedify/speedify_cli`                                                                 |
| `LATENCY_FALLBACK_HOST`        | agent | `1.1.1.1`                                                                                          |
| `SIMULATE`                     | agent | `false`                                                                                            |

## Next reading

- [DESIGN.md](./DESIGN.md) — why this shape exists
- [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md) — one concrete lab layout (optional)
