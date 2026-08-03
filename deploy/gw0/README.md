# gw0 agent install

Cross-compile on a Linux host (or CI) for the OpenWrt architecture, e.g. arm64:

```bash
cd apps/agent
GOOS=linux GOARCH=arm64 go build -o speedify-status-agent .
scp speedify-status-agent root@gw0:/usr/bin/
scp deploy/gw0/speedify-status-agent.env.example root@gw0:/etc/speedify-status-agent.env
scp deploy/gw0/speedify-status-agent.init root@gw0:/etc/init.d/speedify-status-agent
ssh root@gw0 'chmod +x /usr/bin/speedify-status-agent /etc/init.d/speedify-status-agent && /etc/init.d/speedify-status-agent enable && /etc/init.d/speedify-status-agent start'
```

Edit `/etc/speedify-status-agent.env` so `INGEST_URL` points at the lab API
(e.g. `http://10.0.0.202:4090/api/ingest/sample`).

The agent is **host-native** on OpenWrt (not containerized). It does not touch
the existing `speedify_exporter` on :9961.
