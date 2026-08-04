package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
)

// ParseConnectionStats extracts adapterID → latencyMs from speedify_cli stats output.
// The CLI emits a multi-document stream of JSON values (often 2-element arrays
// like ["connection_stats", { "connections": [...] }]). All documents are scanned;
// only connection_stats payloads contribute. adapterID "speedify" (bonded aggregate)
// is skipped. When the same adapter appears more than once, prefer connected:true
// and non-sleeping rows; otherwise keep the first latency seen.
func ParseConnectionStats(data []byte) (map[string]float64, error) {
	data = bytes.TrimSpace(data)
	if len(data) == 0 {
		return nil, fmt.Errorf("empty stats json")
	}

	type connRow struct {
		AdapterID string  `json:"adapterID"`
		LatencyMs float64 `json:"latencyMs"`
		Connected *bool   `json:"connected"`
		Sleeping  *bool   `json:"sleeping"`
	}
	type statsPayload struct {
		Connections []connRow `json:"connections"`
	}

	type pick struct {
		ms        float64
		connected bool
		sleeping  bool
		set       bool
	}

	out := map[string]pick{}
	dec := json.NewDecoder(bytes.NewReader(data))
	foundDoc := false

	for {
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("stats json: %w", err)
		}
		raw = bytes.TrimSpace(raw)
		if len(raw) == 0 {
			continue
		}

		var payload statsPayload
		switch raw[0] {
		case '[':
			// ["connection_stats", { ... }] or other typed docs
			var pair []json.RawMessage
			if err := json.Unmarshal(raw, &pair); err != nil {
				continue
			}
			if len(pair) < 2 {
				continue
			}
			var tag string
			if err := json.Unmarshal(pair[0], &tag); err != nil {
				continue
			}
			if tag != "connection_stats" {
				continue
			}
			if err := json.Unmarshal(pair[1], &payload); err != nil {
				continue
			}
		case '{':
			// bare { "connections": [...] } (defensive)
			if err := json.Unmarshal(raw, &payload); err != nil {
				continue
			}
			if len(payload.Connections) == 0 {
				continue
			}
		default:
			continue
		}

		foundDoc = true
		for _, c := range payload.Connections {
			id := strings.TrimSpace(c.AdapterID)
			if id == "" || strings.EqualFold(id, "speedify") {
				continue
			}
			connected := c.Connected == nil || *c.Connected
			sleeping := c.Sleeping != nil && *c.Sleeping
			cur, ok := out[id]
			if !ok {
				out[id] = pick{ms: c.LatencyMs, connected: connected, sleeping: sleeping, set: true}
				continue
			}
			// Prefer connected non-sleeping over weaker rows.
			better := false
			if connected && !cur.connected {
				better = true
			} else if connected == cur.connected && !sleeping && cur.sleeping {
				better = true
			}
			if better {
				out[id] = pick{ms: c.LatencyMs, connected: connected, sleeping: sleeping, set: true}
			}
		}
	}

	if !foundDoc && len(out) == 0 {
		// No connection_stats document at all — still return empty map (not error)
		// so caller can fall back to ICMP. Only hard-fail on empty input above.
		return map[string]float64{}, nil
	}

	result := make(map[string]float64, len(out))
	for id, p := range out {
		if p.set {
			result[id] = p.ms
		}
	}
	return result, nil
}

// ConnectionLatency runs `speedify_cli stats` and returns adapterID → latencyMs.
func (r Runner) ConnectionLatency() (map[string]float64, error) {
	cmd := exec.Command(r.bin(), "stats")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("speedify_cli stats: %w", err)
	}
	return ParseConnectionStats(out)
}
