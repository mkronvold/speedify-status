package sample

import (
	"encoding/json"
	"time"

	"github.com/mkronvold/speedify-status/apps/agent/internal/adapters"
	"github.com/mkronvold/speedify-status/apps/agent/internal/netdev"
)

// AdapterSample matches packages/contracts adapterSampleSchema.
type AdapterSample struct {
	ID                   string   `json:"id"`
	Name                 string   `json:"name"`
	State                string   `json:"state"`
	Priority             string   `json:"priority"`
	WorkingPriority      string   `json:"workingPriority"`
	LatencyMs            *float64 `json:"latencyMs"`
	DlMbps               float64  `json:"dlMbps"`
	UlMbps               float64  `json:"ulMbps"`
	UsageDailyBytes      *uint64  `json:"usageDailyBytes,omitempty"`
	UsageDailyLimitBytes *uint64  `json:"usageDailyLimitBytes,omitempty"`
}

// ServerInfo optional Speedify server metadata.
type ServerInfo struct {
	FriendlyName string `json:"friendlyName,omitempty"`
	Tag          string `json:"tag,omitempty"`
}

// Envelope is POST /api/ingest/sample body.
type Envelope struct {
	TS       int64           `json:"ts"`
	State    string          `json:"state,omitempty"`
	Server   *ServerInfo     `json:"server,omitempty"`
	Adapters []AdapterSample `json:"adapters"`
}

// Build creates an envelope from adapter list, rates, and latencies.
func Build(
	now time.Time,
	state string,
	server *ServerInfo,
	list []adapters.Adapter,
	rates map[string]netdev.Rates,
	latency map[string]*float64,
) Envelope {
	out := make([]AdapterSample, 0, len(list))
	for _, a := range list {
		r := rates[a.ID]
		s := AdapterSample{
			ID:                   a.ID,
			Name:                 a.Name,
			State:                a.State,
			Priority:             a.Priority,
			WorkingPriority:      a.WorkingPriority,
			LatencyMs:            latency[a.ID],
			DlMbps:               r.DlMbps,
			UlMbps:               r.UlMbps,
			UsageDailyBytes:      a.UsageDailyBytes,
			UsageDailyLimitBytes: a.UsageDailyLimitBytes,
		}
		out = append(out, s)
	}
	env := Envelope{
		TS:       now.UnixMilli(),
		Adapters: out,
	}
	if state != "" {
		env.State = state
	}
	if server != nil && (server.FriendlyName != "" || server.Tag != "") {
		env.Server = server
	}
	return env
}

// MarshalJSON returns compact JSON.
func MarshalJSON(env Envelope) ([]byte, error) {
	return json.Marshal(env)
}
