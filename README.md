# speedify-status

Purpose-built **Speedify WAN health** dashboard (independent of WDMBG).

- **Go agent** on OpenWrt `gw0` (x86_64 / **amd64**) samples adapters + interface Mbps + ICMP latency
- **Fastify API** keeps an in-memory **1s ring ~1 hour** (no Postgres in MVP)
- **React** compact dark UI: window + refresh controls and a sortable adapter table

Stack follows [mkronvold/techstack](https://github.com/mkronvold/techstack) product-app shape (pnpm@10 + Turbo, Node 26, GHCR). Do not duplicate full policy here.

Home LAN host: `speedify.lan` (NPM → web:80, no SSL). Planned public host: `speedify.kronvold.org` (document only).

**Home deploy:** [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md)

## Architecture

```
gw0 (OpenWrt x86_64)              lab host (docker.lan)
┌─────────────────────┐           ┌──────────────────────────────┐
│ speedify-status-    │  POST     │ api  :4090  in-memory ring   │
│ agent (procd)       │──────────▶│ web  :80    React static     │
│ speedify_cli +      │  /api/    │ via NPM speedify.lan         │
│ /proc/net/dev + ICMP│  ingest   └──────────────────────────────┘
└─────────────────────┘
```

| Path                 | Role                               |
| -------------------- | ---------------------------------- |
| `apps/agent`         | Host-native Go binary for gw0      |
| `apps/api`           | Fastify + TypeScript ingest/status |
| `apps/web`           | React 19 + Vite dashboard          |
| `packages/contracts` | Shared Zod schemas                 |
| `packages/config`    | Defaults / env helpers             |
| `deploy/compose`     | api+web Compose for docker.lan     |
| `deploy/gw0`         | Agent install + procd (amd64)      |
| `docs/DEPLOY-HOME.md`| Home lab bring-up checklist        |

## Dashboard columns (MVP)

`Name | State | Priority | Lat min | avg | max | DL min | avg | max | UL avg | Daily GB`

Controls: query **window** `5s|30s|5m|15m|30m|1h` and **display refresh** (pause/1s/5s/30s…).

## Local development

Requirements: Node 26, corepack/pnpm 10, Go 1.25+.

```bash
corepack enable
pnpm install
pnpm validate          # lint, typecheck, test, build, format
```

```bash
# terminal 1 — API (default :4090)
pnpm --filter @speedify-status/api dev

# terminal 2 — web (default :5174, proxies /api → API)
pnpm --filter @speedify-status/web dev

# terminal 3 — simulated agent → local API
cd apps/agent
go run . -simulate -once -ingest-url http://127.0.0.1:4090/api/ingest/sample
# or continuous:
go run . -simulate -ingest-url http://127.0.0.1:4090/api/ingest/sample
```

Open http://127.0.0.1:5174/

### Agent tests / real gw0

```bash
cd apps/agent && go test ./...
# cross-compile for gw0 (OpenWrt x86_64):
GOOS=linux GOARCH=amd64 go build -o speedify-status-agent .
```

Real path uses `/usr/share/speedify/speedify_cli show adapters`, `/proc/net/dev` byte deltas for Mbps, and per-iface ICMP (`ping -I ethN`) to the interface gateway (fallback `1.1.1.1`). See [`deploy/gw0/`](./deploy/gw0/) and [`docs/DEPLOY-HOME.md`](./docs/DEPLOY-HOME.md).

## API

| Method | Path                     | Notes                              |
| ------ | ------------------------ | ---------------------------------- |
| `GET`  | `/health`, `/api/health` | liveness + last sample age         |
| `POST` | `/api/ingest/sample`     | agent sample batch                 |
| `GET`  | `/api/status?window=30s` | per-adapter min/avg/max aggregates |

Optional `SPEEDIFY_STATUS_INGEST_TOKEN` — send `Authorization: Bearer …` or `X-Ingest-Token`.

## Compose (docker.lan)

```bash
cp deploy/env/api.env.example deploy/env/api.env
# edit token etc.
cd deploy/compose && ./up.sh
```

Full checklist (NPM `speedify.lan`, AdGuard, gw0 agent): **[docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md)**.

Images (on `main`):

- `ghcr.io/mkronvold/speedify-status-api`
- `ghcr.io/mkronvold/speedify-status-web`

## Env vars

| Var                            | Where | Default                                         |
| ------------------------------ | ----- | ----------------------------------------------- |
| `SPEEDIFY_STATUS_API_HOST`     | api   | `0.0.0.0`                                       |
| `SPEEDIFY_STATUS_API_PORT`     | api   | `4090`                                          |
| `SPEEDIFY_STATUS_INGEST_TOKEN` | api   | unset                                           |
| `INGEST_URL`                   | agent | `http://speedify.lan/api/ingest/sample` (home)  |
| `INGEST_TOKEN`                 | agent | unset                                           |
| `INTERVAL_SEC`                 | agent | `1`                                             |
| `SPEEDIFY_CLI`                 | agent | `/usr/share/speedify/speedify_cli`              |
| `LATENCY_FALLBACK_HOST`        | agent | `1.1.1.1`                                       |
| `SIMULATE`                     | agent | `false`                                         |

## Non-goals (MVP)

Postgres, Prometheus exporter replacement, Speedify connect/disconnect controls, log parsing, WDMBG code changes, multi-router.

## CI

- **Validate** — pnpm lint/typecheck/test/build/format + `go test` / build agent
- **Images** — build/push api+web to GHCR on `main`
