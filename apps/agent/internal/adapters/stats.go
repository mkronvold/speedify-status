package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"
)

// DefaultStatsTimeout bounds how long we wait on the streaming `speedify_cli stats`
// command. The CLI never exits on its own; we kill it after the first usable
// connection_stats document or when this deadline elapses.
const DefaultStatsTimeout = 1500 * time.Millisecond

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
	return readConnectionStats(bytes.NewReader(data), false)
}

// ReadConnectionStatsStream decodes successive JSON documents from r and returns
// as soon as at least one non-aggregate adapter latency has been collected from a
// complete connection_stats document. Remaining stream data is ignored so callers
// can kill a never-ending `speedify_cli stats` process promptly.
func ReadConnectionStatsStream(r io.Reader) (map[string]float64, error) {
	return readConnectionStats(r, true)
}

func readConnectionStats(r io.Reader, stopEarly bool) (map[string]float64, error) {
	out := map[string]pick{}
	dec := json.NewDecoder(r)
	foundDoc := false

	for {
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			if err == io.EOF {
				break
			}
			// Incomplete trailing JSON after a usable doc is fine (process killed mid-stream).
			if foundDoc && len(resultFromPicks(out)) > 0 {
				break
			}
			return nil, fmt.Errorf("stats json: %w", err)
		}
		raw = bytes.TrimSpace(raw)
		if len(raw) == 0 {
			continue
		}

		payload, ok := extractStatsPayload(raw)
		if !ok {
			continue
		}

		foundDoc = true
		mergeStatsPayload(out, payload)
		if stopEarly && len(resultFromPicks(out)) > 0 {
			// Early stop: first complete connection_stats with ≥1 adapter latency.
			return resultFromPicks(out), nil
		}
	}

	if !foundDoc && len(out) == 0 {
		// No connection_stats document at all — still return empty map (not error)
		// so callers that already have a full buffer can fall back to ICMP.
		// ConnectionLatency treats empty as an error after a live run.
		return map[string]float64{}, nil
	}

	return resultFromPicks(out), nil
}

func extractStatsPayload(raw json.RawMessage) (statsPayload, bool) {
	var payload statsPayload
	switch raw[0] {
	case '[':
		// ["connection_stats", { ... }] or other typed docs
		var pair []json.RawMessage
		if err := json.Unmarshal(raw, &pair); err != nil {
			return payload, false
		}
		if len(pair) < 2 {
			return payload, false
		}
		var tag string
		if err := json.Unmarshal(pair[0], &tag); err != nil {
			return payload, false
		}
		if tag != "connection_stats" {
			return payload, false
		}
		if err := json.Unmarshal(pair[1], &payload); err != nil {
			return payload, false
		}
		return payload, true
	case '{':
		// bare { "connections": [...] } (defensive)
		if err := json.Unmarshal(raw, &payload); err != nil {
			return payload, false
		}
		if len(payload.Connections) == 0 {
			return payload, false
		}
		return payload, true
	default:
		return payload, false
	}
}

func mergeStatsPayload(out map[string]pick, payload statsPayload) {
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

func resultFromPicks(out map[string]pick) map[string]float64 {
	result := make(map[string]float64, len(out))
	for id, p := range out {
		if p.set {
			result[id] = p.ms
		}
	}
	return result
}

// ConnectionLatency runs `speedify_cli stats` with a short deadline, streams JSON
// documents until a usable connection_stats payload arrives (or the deadline hits),
// then kills the process. The CLI streams forever; never use cmd.Output() on it.
func (r Runner) ConnectionLatency() (map[string]float64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), DefaultStatsTimeout)
	defer cancel()
	return r.ConnectionLatencyContext(ctx)
}

// ConnectionLatencyContext is like ConnectionLatency but uses the provided context
// for the process deadline (useful in tests).
func (r Runner) ConnectionLatencyContext(ctx context.Context) (map[string]float64, error) {
	cmd := exec.CommandContext(ctx, r.bin(), "stats")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("speedify_cli stats pipe: %w", err)
	}
	// Discard stderr so a full pipe cannot stall the child.
	cmd.Stderr = io.Discard

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("speedify_cli stats start: %w", err)
	}

	// Always reap the child to avoid zombies / orphaned speedify_cli processes.
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()

	lat, parseErr := ReadConnectionStatsStream(stdout)
	if len(lat) > 0 {
		// Prefer partial/complete stats over parse/context errors once we have data.
		return lat, nil
	}
	if parseErr != nil {
		// Distinguish context timeout with no usable stats for ICMP fallback messaging.
		if ctx.Err() != nil {
			return nil, fmt.Errorf("speedify_cli stats: %w (no connection_stats)", ctx.Err())
		}
		return nil, fmt.Errorf("speedify_cli stats: %w", parseErr)
	}
	if ctx.Err() != nil {
		return nil, fmt.Errorf("speedify_cli stats: %w (no connection_stats)", ctx.Err())
	}
	return nil, fmt.Errorf("speedify_cli stats: no connection_stats adapters")
}
