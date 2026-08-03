# Design

## Goals

- **Per-WAN visibility** for Speedify bonded connections: latency and throughput without netflow, DPI, or a full NMS.
- **Tiny controls**: pick a lookback window and a display refresh rate; sortable adapter table.
- **Embeddable**: CSP/`frame-ancestors` friendly so the UI can sit in a dashboard URL card or iframe.
- **Small ops surface**: host-native agent on the Speedify box; API+web as two GHCR images behind any reverse proxy.
- **LAN-first**: useful on a home or lab network with optional ingest token; not a multi-tenant cloud product.

## Non-goals (MVP)

- Replace Prometheus **`speedify_exporter`** (or any other exporter already on the router).
- Speedify **control plane** (connect/disconnect, server pick, policy edits).
- Multi-tenant SaaS, accounts, or public internet exposure requirements.
- **Postgres** (or other durable DB) for the MVP ring buffer.
- Netflow / ntop / L7 traffic attribution (see WDMBG for LAN traffic identity).
- Multi-router fleets, HA API, or long-term historical warehousing.

## Why not WDMBG?

|           | **speedify-status**                | **WDMBG**                             |
| --------- | ---------------------------------- | ------------------------------------- |
| Question  | Is each bonded WAN healthy?        | Who/what is using the LAN uplink?     |
| Signals   | Speedify adapters, iface Mbps, RTT | Packet capture / rollups / enrichment |
| Placement | Agent next to `speedify_cli`       | Probe on a span/mirror path           |

They can sit side by side. This repo stays independent so WAN bond health does not couple to capture pipelines.

## Data plane

```
speedify_cli show adapters  ─┐
/proc/net/dev byte counters ─┼─► agent sample (~1s) ─POST─► API ring ─► GET /api/status?window=
ICMP (and optional future HTTP) RTT per iface ─┘
```

### Sampling

- Target interval **1 second** (`INTERVAL_SEC`, floor ~0.2s).
- Adapter inventory/state/priority from **`speedify_cli`**.
- Throughput from **`/proc/net/dev`** byte deltas → **Mbps (bits/s)**, not MB/s.
- Latency: per-interface ICMP (bind to iface / gateway when possible; fallback host configurable).
- Optional **simulate** mode fabricates adapters for local UI/API work without Speedify.

### API memory model

- In-memory **ring ~1 hour at 1s** resolution (MVP; process restart clears history).
- `GET /api/status?window=` aggregates per adapter over `5s | 30s | 5m | 15m | 30m | 1h` (min/avg/max where applicable).
- Web is static assets + nginx reverse proxy to the API; no separate public API port required.

### Units and columns

- Latency: milliseconds (min/avg/max over the window).
- Downstream / upstream: **Mbps**.
- Daily GB and priority/state come from Speedify adapter fields when present.

## Trust model

- **LAN-trusted ingest** by default: anyone who can reach `POST /api/ingest/sample` can write samples.
- Optional shared secret: `SPEEDIFY_STATUS_INGEST_TOKEN` on API; agent `INGEST_TOKEN` / `-token` via `Authorization: Bearer` or `X-Ingest-Token`.
- Prefer keeping api **off** the public proxy network; only **web** joins the reverse-proxy network; no host port publishes when the proxy can reach `web:80` over a Docker network.
- Do not assume internet exposure, public DNS, or automated public TLS for the MVP path.

## Packaging choices

- **Agent is host-native** (OpenWrt procd example provided). Containers on the router are optional and not required.
- **Compose** pins GHCR images via `deploy/compose/images.env`; `up.sh` / `down.sh` / optional `autoupdate.sh`.
- Arch: document **amd64 and arm64** builds; pick `GOARCH` for the Speedify host (many x86_64 OpenWrt boxes are `amd64`).

## Future (non-binding)

- Log-tail derived latency/loss if CLI metrics are insufficient.
- Explicit **loss** column when a reliable signal exists.
- Stronger autoupdate / digest pinning for air-gapped labs.
- First-class WDMBG (or other dashboard) URL-card embed presets.
- Optional durable history beyond the 1h ring.

## Related docs

- [QUICKSTART.md](./QUICKSTART.md) — install path
- [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md) — one lab’s concrete names/IPs
