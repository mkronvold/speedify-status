# Home deployment (docker.lan + gw0)

> Lab-specific checklist. **General public install:** [QUICKSTART.md](../QUICKSTART.md) · design: [DESIGN.md](../DESIGN.md).

Home-lab pattern matches WDMBG: app stack on `docker.lan`, host-native agent on OpenWrt `gw0`,
front door via Nginx Proxy Manager on `speedify.lan` (http, no SSL).

## Targets

| Role                     | Host                         | Access                |
| ------------------------ | ---------------------------- | --------------------- |
| App stack (`web`, `api`) | `docker.lan`                 | SSH `user@docker.lan` |
| Agent (Speedify sample)  | `gw0` (OpenWrt 24.10 x86_64) | SSH `root@gw0`        |

Leave the existing **`speedify_exporter` :9961** alone.

## App directory on docker.lan

```text
~/src/speedify-status
```

Suggested layout after checkout:

```text
~/src/speedify-status/
  deploy/compose/   # compose.prod.yml, images.env, up.sh, down.sh, autoupdate.sh
  deploy/env/       # api.env (from example)
  deploy/gw0/       # agent install for OpenWrt
```

## Networking (locked)

| Service | Networks                                 | Published host ports |
| ------- | ---------------------------------------- | -------------------- |
| `web`   | app-local **and** `nginxproxy_proxy-net` | **None**             |
| `api`   | app-local only                           | **None**             |

- Shared proxy network: **`nginxproxy_proxy-net`** (external; owned by NPM).
- Only **web** attaches to the proxy network.
- Web nginx reverse-proxies `/api/*` and `/health` to private `api:4090`.
- No public DNS, no Let's Encrypt, no host port publishes.

## LAN DNS and NPM

| Item            | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| docker.lan IP   | `10.0.0.202` (lab)                                                                               |
| AdGuard rewrite | `speedify.lan` → `10.0.0.202`                                                                    |
| NPM domain      | `speedify.lan` (LAN only — not kronvold.org)                                                     |
| NPM scheme      | `http`                                                                                           |
| NPM forward     | Compose container **`speedify-status-web-1:80`** (or Docker DNS service name `web` on proxy net) |
| NPM conf (lab)  | `/data/nginx/proxy_host/4.conf` (proxy_host id may vary)                                         |
| SSL             | Off / Force SSL off                                                                              |
| Websockets      | Optional / off (not required for MVP)                                                            |

NPM admin (internal): `http://npm.lan:81`. AdGuard UI: `http://adguard.lan`.

## URLs

| Client       | URL                                         |
| ------------ | ------------------------------------------- |
| Dashboard    | `http://speedify.lan/`                      |
| Health       | `http://speedify.lan/health`                |
| Status API   | `http://speedify.lan/api/status?window=30s` |
| Agent ingest | `http://speedify.lan/api/ingest/sample`     |

GHCR images (on `main`):

- `ghcr.io/mkronvold/speedify-status-api:main`
- `ghcr.io/mkronvold/speedify-status-web:main`

## Bring-up (docker.lan)

```bash
ssh user@docker.lan
mkdir -p ~/src && cd ~/src
# Prefer git when the host has remote auth; otherwise rsync/scp tree from a build machine:
#   rsync -a --delete ./ user@docker.lan:~/src/speedify-status/
git clone https://github.com/mkronvold/speedify-status.git speedify-status   # or: git pull
cd ~/src/speedify-status

cp deploy/env/api.env.example deploy/env/api.env
chmod 600 deploy/env/api.env
# optional: set SPEEDIFY_STATUS_INGEST_TOKEN=...

# ensure external NPM network exists
docker network inspect nginxproxy_proxy-net >/dev/null

cd deploy/compose
# scripts are LF (Unix); if copied from Windows without .gitattributes, run: sed -i 's/\r$//' *.sh
chmod +x up.sh down.sh autoupdate.sh
./up.sh
docker compose -f compose.prod.yml --env-file images.env ps
```

Optional auto-refresh (pull when `:main` moves):

```bash
cd ~/src/speedify-status/deploy/compose
./autoupdate.sh --once
# or cron/systemd timer every ~30m: ./autoupdate.sh --once
```

Compose uses `restart: unless-stopped`; keep Docker enabled on boot.

## NPM + AdGuard checklist

1. **AdGuard** → rewrite `speedify.lan` → `10.0.0.202` (docker.lan).
2. **NPM** → Proxy Host:
   - Domain: `speedify.lan`
   - Scheme: `http`
   - Forward hostname: `speedify-status-web-1` (or service `web` on `nginxproxy_proxy-net`)
   - Forward port: `80`
   - SSL: none / Force SSL off
   - Websockets: off (optional)
3. Confirm from any LAN host:
   ```bash
   curl -sS http://speedify.lan/health
   curl -sS 'http://speedify.lan/api/status?window=30s'
   ```

## Agent install (gw0)

`gw0` is **x86_64 OpenWrt** → build **`GOOS=linux GOARCH=amd64`** (not arm64).

```bash
# on a build host with Go 1.25+
cd apps/agent
GOOS=linux GOARCH=amd64 go build -o speedify-status-agent .

scp speedify-status-agent \
    ../../deploy/gw0/install.sh \
    ../../deploy/gw0/speedify-status-agent.init \
    ../../deploy/gw0/speedify-status-agent.env.example \
    root@gw0:/tmp/speedify-status/

ssh root@gw0 'cd /tmp/speedify-status && AGENT_BIN=./speedify-status-agent sh ./install.sh'
```

Default env (written only if `/etc/speedify-status-agent.env` is missing):

```text
INGEST_URL=http://speedify.lan/api/ingest/sample
```

Paths after install:

| Path                                | Role                               |
| ----------------------------------- | ---------------------------------- |
| `/usr/bin/speedify-status-agent`    | binary                             |
| `/etc/init.d/speedify-status-agent` | procd init                         |
| `/etc/speedify-status-agent.env`    | env (not overwritten on reinstall) |

If gw0 cannot resolve `speedify.lan` via AdGuard yet, pin it in `/etc/hosts`:

```text
10.0.0.202 speedify.lan
```

Details: [`deploy/gw0/README.md`](../deploy/gw0/README.md).

## Smoke checklist

1. `docker compose … ps` — `api` healthy, `web` running.
2. `curl -sS http://speedify.lan/health` — OK JSON.
3. `curl -sS 'http://speedify.lan/api/status?window=30s'` — status payload (may be empty until agent posts).
4. Agent logs / one-shot: after install, wait a few seconds and re-check `/api/status` for adapters.
5. Confirm `speedify_exporter` still serves :9961 unchanged.

## Safety

1. Internal routes and DNS only — no public DNS records.
2. No public TLS or internet exposure.
3. No host port publishes when NPM reaches web on `nginxproxy_proxy-net`.
4. Attach **only** web to the proxy network; api stays app-local.
5. Secrets in mode-600 env files; never commit `api.env`.
6. Do not overwrite an existing `/etc/speedify-status-agent.env` on reinstall.
7. Prefer docs + git over risky live host mutation when blocked.
