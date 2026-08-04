# Design

Why **speedify-status** exists, what it measures, and what it deliberately does not do.

Install path: [QUICKSTART.md](./QUICKSTART.md). Overview: [README.md](./README.md).

## Goals

- Show **multi-WAN health** for Speedify adapters at a glance.
- Per WAN, over a chosen window:
  - **Latency** now / avg / max (ms)
  - **Throughput** download and upload Mbps now / avg / max
  - **Priority** and **state** (and related working priority)
- Sample on the order of **1 Hz** with enough history for short operational windows (up to ~1 hour).
- Stay **small**: one agent binary, one API process, one static web UI.
- Deploy cleanly behind a normal reverse proxy on a LAN.

## Non-goals (MVP)

- Not a traffic accounting or flow analytics product (no NetFlow/sFlow, no ntop, no deep packet inspection).
- Not a replacement for **WDMBG** or other volume/history dashboards.
- Not a replacement for an existing Prometheus **`speedify_exporter`** (or similar); leave those alone.
- No Postgres / durable TSDB in MVP (in-memory ring only).
- No Speedify connect/disconnect or policy controls from the UI.
- No multi-tenant cloud SaaS, public internet exposure requirements, or multi-router mesh control plane.

## Data plane

```text
speedify_cli show adapters ──┐
/proc/net/dev byte counters ─┼─▶ agent (≈1s) ─POST─▶ API ring ─▶ GET /api/status ─▶ web
per-iface ICMP RTT ──────────┘
```

### Sampling (agent)

| Input                        | Use                                           |
| ---------------------------- | --------------------------------------------- |
| `speedify_cli` adapter list  | id, name, state, priority, daily usage fields |
| `/proc/net/dev`              | rx/tx **byte** counters per interface         |
| ICMP via iface (`ping -I …`) | RTT to iface gateway, fallback host if needed |

**Mbps are bit rates**, not byte rates:

```text
Mbps = (delta_bytes * 8) / 1e6 / delta_seconds
```

Default interval is **1 second** (`INTERVAL_SEC`, minimum clamped for safety). The agent POSTs a JSON envelope to `/api/ingest/sample`.

### Storage (API)

- Fixed-size **in-memory ring**: **3600** slots ≈ **1 hour @ 1s** (`RING_SAMPLE_COUNT`).
- No disk persistence in MVP; process restart clears history.
- Query windows: `5s`, `30s`, `5m`, `15m`, `30m`, `1h`.
- `GET /api/status?window=…` aggregates per-adapter now/avg/max over samples whose agent timestamps fall in the window.

### Presentation (web)

- Compact dark table, sortable columns.
- Window selector + display refresh interval (independent of agent sample rate).
- Talks only to same-origin `/api/*` (dev server or web nginx proxy).

## Why separate from traffic dashboards (WDMBG)

| Concern          | Traffic dashboards (e.g. WDMBG / ntop) | speedify-status                                 |
| ---------------- | -------------------------------------- | ----------------------------------------------- |
| Primary question | How much did we transfer? Who talked?  | Is each WAN healthy _right now_?                |
| Timescale        | Hours–months, rollups                  | Seconds–1 hour, live ring                       |
| Key metrics      | Bytes, flows, top talkers              | RTT, instantaneous Mbps, adapter state/priority |
| Coupling         | Often NetFlow/mirror/SPAN              | Speedify CLI + local `/proc` + ICMP             |

Bonding health is a different job from volume analytics. Keeping this board separate avoids overloading traffic UIs and avoids coupling release cycles.

## Trust model

- Intended for a **trusted LAN** (or similarly private network).
- Ingest path is reachable wherever you expose the reverse-proxied `/api/ingest/sample`.
- **Optional shared token**:
  - API: `SPEEDIFY_STATUS_INGEST_TOKEN`
  - Agent: `INGEST_TOKEN` / `-token` → `Authorization: Bearer` or `X-Ingest-Token`
- No end-user accounts in MVP; treat network placement + optional token as the boundary.
- Prefer **not** publishing API host ports; only **web** on the proxy network, with nginx proxying `/api` and `/health`.

## Future ideas

Not committed; useful directions if the MVP holds up:

| Idea             | Notes                                                                |
| ---------------- | -------------------------------------------------------------------- |
| **Loss column**  | Packet loss % alongside latency (probe or Speedify signals)          |
| **Log-tail**     | Surface recent agent/Speedify log lines in the UI                    |
| **Autoupdate**   | Lean on `deploy/compose/autoupdate.sh` / image digests more formally |
| **iframe embed** | Document CSP-friendly embed for homelab portals                      |
| Durable history  | Optional TSDB/Postgres if multi-hour trends become required          |
| Arm packaging    | Prebuilt agent binaries for amd64/arm64 in releases                  |

## Related docs

- [QUICKSTART.md](./QUICKSTART.md) — compose, proxy, agent, smoke tests
- [docs/DEPLOY-HOME.md](./docs/DEPLOY-HOME.md) — one lab’s concrete hostnames and checklist
- [deploy/gw0/README.md](./deploy/gw0/README.md) — agent install details
