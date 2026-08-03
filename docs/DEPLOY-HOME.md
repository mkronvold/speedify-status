# Home lab reference (author)

**Public setup path:** start at **[QUICKSTART.md](../QUICKSTART.md)** and **[DESIGN.md](../DESIGN.md)**.

This page records one concrete lab layout so operators can mirror or ignore it. Names and IPs below are **examples**, not requirements.

## This lab’s map

| Role                      | Value                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Docker host               | `docker.lan` (`10.0.0.202`)                                                                                   |
| App dir                   | `~/src/speedify-status` (git or rsync)                                                                        |
| Dashboard DNS             | `speedify.lan` → `10.0.0.202` (AdGuard rewrite)                                                               |
| NPM                       | `speedify.lan` → `speedify-status-web-1:80` http, SSL off (`proxy_host` conf under `/data/nginx/proxy_host/`) |
| Proxy network             | external `nginxproxy_proxy-net` (web only; api app-local)                                                     |
| Agent host                | OpenWrt **x86_64** `gw0` → build `GOARCH=amd64`                                                               |
| Agent ingest              | `INGEST_URL=http://speedify.lan/api/ingest/sample`                                                            |
| Agent paths               | `/usr/bin/speedify-status-agent`, `/etc/init.d/speedify-status-agent`, `/etc/speedify-status-agent.env`       |
| Optional hosts pin on gw0 | `10.0.0.202 speedify.lan`                                                                                     |
| Leave alone               | existing `speedify_exporter` on `:9961`                                                                       |

## Bring-up (same steps as QUICKSTART)

```bash
# on docker host
cd ~/src/speedify-status   # clone or rsync
cp deploy/env/api.env.example deploy/env/api.env && chmod 600 deploy/env/api.env
docker network inspect nginxproxy_proxy-net >/dev/null
cd deploy/compose && chmod +x *.sh && ./up.sh
```

```bash
# agent build + install (amd64 for this lab’s gw0)
cd apps/agent
GOOS=linux GOARCH=amd64 go build -o speedify-status-agent .
# scp binary + deploy/gw0/{install.sh,*.init,*.env.example} → router
# AGENT_BIN=./speedify-status-agent sh ./install.sh
```

```bash
curl -sS http://speedify.lan/health
curl -sS 'http://speedify.lan/api/status?window=30s'
```

## Notes

- Prefer **git pull** on the Docker host when remote auth exists; otherwise rsync the tree from a workstation.
- Shell scripts are **LF**; strip CR if a Windows copy breaks bash: `sed -i 's/\r$//' deploy/compose/*.sh`.
- DHCP hostname `speedify` can steal `speedify.lan` — rename the lease or the dashboard name (see QUICKSTART).
- Do not overwrite a live `/etc/speedify-status-agent.env` on reinstall (`install.sh` keeps it).
