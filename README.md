# speedify-status

**Speedify multi-WAN health board** — live per-adapter latency (min/avg/max), throughput in Mbps (min/avg/max), priority, and connection state.

Independent of [WDMBG](https://github.com/mkronvold/wdmbg), ntop, and netflow. This product answers _“how healthy is each bonded WAN right now?”_, not _“who on the LAN is talking?”_.

[![Validate](https://github.com/mkronvold/speedify-status/actions/workflows/validate.yml/badge.svg)](https://github.com/mkronvold/speedify-status/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

| Doc                                              | Purpose                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| **[QUICKSTART.md](./QUICKSTART.md)**             | End-to-end home-lab setup (compose, reverse proxy, agent) |
| **[DESIGN.md](./DESIGN.md)**                     | Goals, non-goals, data plane, trust model                 |
| **[docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md)** | Author lab reference (`speedify.lan` / docker.lan)        |
| **[deploy/](./deploy/)**                         | Compose stack + OpenWrt/ procd agent install              |

## What you get

Dashboard columns (MVP):

`Name | State | Priority | Lat min | avg | max | DL min | avg | max | UL avg | Daily GB`

Controls: query **window** `5s | 30s | 5m | 15m | 30m | 1h` and **display refresh** (pause / 1s / 5s / 30s…). Compact dark UI; embeddable in an iframe (e.g. URL card).

## Architecture

```
Speedify host (router / OpenWrt / Linux)          App host (Docker)
┌──────────────────────────────┐                ┌─────────────────────────────┐
│ speedify-status-agent        │  POST          │ api  :4090  1s ring ~1h     │
│  speedify_cli show adapters  │  /api/ingest/  │ web  :80   React static     │
│  /proc/net/dev → Mbps        │  sample     ──▶│ nginx proxies /api,/health  │
│  ICMP RTT per iface          │                │ (reverse proxy → web:80)    │
└──────────────────────────────┘                └─────────────────────────────┘
```

| Path                 | Role                                            |
| -------------------- | ----------------------------------------------- |
| `apps/agent`         | Host-native Go sampler (not a container)        |
| `apps/api`           | Fastify + TypeScript ingest + status aggregates |
| `apps/web`           | React 19 + Vite dashboard                       |
| `packages/contracts` | Shared Zod schemas                              |
| `packages/config`    | Defaults / env helpers                          |
| `deploy/compose`     | Production Compose (api + web, GHCR images)     |
| `deploy/gw0`         | Agent binary install + procd unit example       |

Stack shape: pnpm@10 + Turbo, Node 26, Go agent, GHCR images. Policy reference: [mkronvold/techstack](https://github.com/mkronvold/techstack).

## Images (GHCR)

On `main`:

- `ghcr.io/mkronvold/speedify-status-api:main`
- `ghcr.io/mkronvold/speedify-status-web:main`

Also tagged with the git SHA. See [QUICKSTART.md](./QUICKSTART.md) to pull and run.

## Quick links

```bash
# Full home-lab path
# → QUICKSTART.md

# Local dev (API + web + simulated agent)
corepack enable && pnpm install
pnpm --filter @speedify-status/api dev          # :4090
pnpm --filter @speedify-status/web dev          # :5174, proxies /api
cd apps/agent && go run . -simulate -ingest-url http://127.0.0.1:4090/api/ingest/sample
```

## API (summary)

| Method | Path                     | Notes                      |
| ------ | ------------------------ | -------------------------- |
| `GET`  | `/health`, `/api/health` | Liveness + last sample age |
| `POST` | `/api/ingest/sample`     | Agent sample batch         |
| `GET`  | `/api/status?window=30s` | Per-adapter min/avg/max    |

Optional shared secret: `SPEEDIFY_STATUS_INGEST_TOKEN` on the API; agent sends `Authorization: Bearer …` or `X-Ingest-Token`.

## License

[MIT](./LICENSE)
