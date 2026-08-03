# speedify-status

[![Validate](https://github.com/mkronvold/speedify-status/actions/workflows/validate.yml/badge.svg)](https://github.com/mkronvold/speedify-status/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Speedify multi-WAN health board** — live per-WAN latency (min/avg/max), throughput in **Mbps** (min/avg/max), and adapter priority/state.

This project is a focused health board for Speedify bonding adapters. It is **independent of** WDMBG, ntop, NetFlow, and other traffic-volume dashboards.

| Doc                                              | Audience                                              |
| ------------------------------------------------ | ----------------------------------------------------- |
| **[QUICKSTART.md](./QUICKSTART.md)**             | Public install path (compose + reverse proxy + agent) |
| **[DESIGN.md](./DESIGN.md)**                     | Goals, data plane, trust model, roadmap               |
| **[docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md)** | One home-lab reference (optional detail)              |
| **[deploy/](./deploy/)**                         | Compose stack + OpenWrt agent install scripts         |

License: [MIT](./LICENSE)

## What you get

- Per-adapter **latency** min / avg / max (ms)
- Per-adapter **download Mbps** min / avg / max and **upload Mbps** avg
- Adapter **name**, **state**, **priority** / working priority, optional daily usage
- Query **windows**: `5s` · `30s` · `5m` · `15m` · `30m` · `1h`
- Display refresh controls (pause / 1s / 5s / …)

## Architecture

```text
Speedify host                         App host (Docker)
┌──────────────────────────┐          ┌─────────────────────────────┐
│ Go agent (host-native)   │  POST    │ Fastify API                 │
│  speedify_cli adapters   │ ───────▶ │  in-memory 1s ring (~1h)    │
│  /proc/net/dev → Mbps    │ /api/    │ React web (static + nginx)  │
│  per-iface ICMP RTT      │ ingest   │  proxies /api and /health   │
└──────────────────────────┘          └─────────────────────────────┘
```

1. **Agent** on the Speedify host samples adapters about once per second and POSTs a batch.
2. **API** keeps samples in an in-memory ring (no database in MVP).
3. **Web UI** polls `/api/status?window=…` and renders a compact dark table.

## Stack

| Piece     | Tech                                      |
| --------- | ----------------------------------------- |
| Monorepo  | **pnpm** + **Turbo**                      |
| Agent     | **Go** host binary (`apps/agent`)         |
| API       | **Fastify** + TypeScript (`apps/api`)     |
| Web       | **React** + Vite (`apps/web`)             |
| Contracts | Shared Zod schemas (`packages/contracts`) |

## GHCR images

Published from `main`:

- `ghcr.io/mkronvold/speedify-status-api:main`
- `ghcr.io/mkronvold/speedify-status-web:main`

Pins live in [`deploy/compose/images.env`](./deploy/compose/images.env).

## Quick links

- **Production-style bring-up:** [QUICKSTART.md](./QUICKSTART.md)
- **Design / non-goals:** [DESIGN.md](./DESIGN.md)
- **Compose:** [`deploy/compose/`](./deploy/compose/)
- **Agent install (OpenWrt-style procd):** [`deploy/gw0/`](./deploy/gw0/)

## Local development (simulate)

Requirements: **Node 26**, corepack / **pnpm 10**, **Go 1.25+**.

```bash
corepack enable
pnpm install
pnpm validate   # lint, typecheck, test, build, format
```

```bash
# terminal 1 — API (default :4090)
pnpm --filter @speedify-status/api dev

# terminal 2 — web (default :5174, proxies /api → API)
pnpm --filter @speedify-status/web dev

# terminal 3 — simulated agent → local API
cd apps/agent
go run . -simulate -once -ingest-url http://127.0.0.1:4090/api/ingest/sample
# continuous:
go run . -simulate -ingest-url http://127.0.0.1:4090/api/ingest/sample
```

Open http://127.0.0.1:5174/

## API surface

| Method | Path                     | Notes                      |
| ------ | ------------------------ | -------------------------- |
| `GET`  | `/health`, `/api/health` | Liveness + last sample age |
| `POST` | `/api/ingest/sample`     | Agent sample batch         |
| `GET`  | `/api/status?window=30s` | Per-adapter min/avg/max    |

Optional ingest auth: set `SPEEDIFY_STATUS_INGEST_TOKEN` on the API and send `Authorization: Bearer …` or `X-Ingest-Token` from the agent (`INGEST_TOKEN`).

## Repository layout

| Path                  | Role                       |
| --------------------- | -------------------------- |
| `apps/agent`          | Host-native Go sampler     |
| `apps/api`            | Fastify ingest + status    |
| `apps/web`            | React dashboard            |
| `packages/contracts`  | Shared Zod schemas         |
| `packages/config`     | Defaults / env helpers     |
| `deploy/compose`      | api + web Compose          |
| `deploy/gw0`          | Agent install + procd unit |
| `docs/DEPLOY-HOME.md` | Lab-specific checklist     |

## CI

- **Validate** — pnpm lint / typecheck / test / build / format + `go test` / amd64 agent build
- **Images** — build and push api + web to GHCR on `main`
