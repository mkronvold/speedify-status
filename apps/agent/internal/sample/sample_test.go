package sample

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/mkronvold/speedify-status/apps/agent/internal/adapters"
	"github.com/mkronvold/speedify-status/apps/agent/internal/netdev"
)

func TestBuildAndMarshal(t *testing.T) {
	lat := 22.0
	daily := uint64(999)
	env := Build(
		time.UnixMilli(1_700_000_000_000),
		"CONNECTED",
		&ServerInfo{FriendlyName: "lab"},
		[]adapters.Adapter{{
			ID: "eth2", Name: "Starlink", State: "connected",
			Priority: "always", WorkingPriority: "always", UsageDailyBytes: &daily,
		}},
		map[string]netdev.Rates{"eth2": {DlMbps: 100, UlMbps: 10}},
		map[string]*float64{"eth2": &lat},
	)
	b, err := MarshalJSON(env)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if m["state"] != "CONNECTED" {
		t.Fatalf("%v", m["state"])
	}
	ads := m["adapters"].([]any)
	if len(ads) != 1 {
		t.Fatalf("len=%d", len(ads))
	}
}
