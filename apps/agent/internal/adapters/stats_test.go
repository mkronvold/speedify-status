package adapters

import (
	"math"
	"testing"
)

// Fixture shaped like live multi-document `speedify_cli stats` output (IPs redacted).
const liveStatsFixture = `
[ "state", { "state": "CONNECTED" } ]
[ "connection_stats", {
  "connections": [
    {
      "adapterID": "eth1",
      "connected": true,
      "sleeping": false,
      "latencyMs": 110,
      "jitterMs": 32
    },
    {
      "adapterID": "eth2",
      "connected": true,
      "sleeping": false,
      "latencyMs": 29,
      "jitterMs": 4
    },
    {
      "adapterID": "eth3",
      "connected": true,
      "sleeping": false,
      "latencyMs": 30
    },
    {
      "adapterID": "eth4",
      "connected": true,
      "sleeping": false,
      "latencyMs": 51
    },
    {
      "adapterID": "eth5",
      "connected": true,
      "sleeping": false,
      "latencyMs": 32
    },
    {
      "adapterID": "speedify",
      "connected": true,
      "latencyMs": 28
    }
  ]
} ]
[ "speed_stats", { "downloadMbps": 12.5, "uploadMbps": 3.1 } ]
`

func TestParseConnectionStatsLiveFixture(t *testing.T) {
	m, err := ParseConnectionStats([]byte(liveStatsFixture))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]float64{
		"eth1": 110,
		"eth2": 29,
		"eth3": 30,
		"eth4": 51,
		"eth5": 32,
	}
	if len(m) != len(want) {
		t.Fatalf("len=%d got=%v", len(m), m)
	}
	for id, ms := range want {
		got, ok := m[id]
		if !ok {
			t.Fatalf("missing %s", id)
		}
		if math.Abs(got-ms) > 0.001 {
			t.Fatalf("%s: got %v want %v", id, got, ms)
		}
	}
	if _, ok := m["speedify"]; ok {
		t.Fatal("speedify aggregate should be skipped")
	}
}

func TestParseConnectionStatsPrefersConnected(t *testing.T) {
	raw := `
["connection_stats", {"connections":[
  {"adapterID":"eth2","connected":false,"sleeping":true,"latencyMs":999},
  {"adapterID":"eth2","connected":true,"sleeping":false,"latencyMs":29}
]}]
["connection_stats", {"connections":[
  {"adapterID":"eth2","connected":true,"sleeping":true,"latencyMs":50}
]}]
`
	m, err := ParseConnectionStats([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if m["eth2"] != 29 {
		t.Fatalf("got %v want 29 (connected non-sleeping)", m["eth2"])
	}
}

func TestParseConnectionStatsBareObject(t *testing.T) {
	raw := `{"connections":[{"adapterID":"eth1","latencyMs":42.5}]}`
	m, err := ParseConnectionStats([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if m["eth1"] != 42.5 {
		t.Fatalf("got %v", m)
	}
}

func TestParseConnectionStatsEmpty(t *testing.T) {
	if _, err := ParseConnectionStats([]byte("")); err == nil {
		t.Fatal("expected error")
	}
	m, err := ParseConnectionStats([]byte(`["state",{"state":"CONNECTED"}]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 0 {
		t.Fatalf("want empty map, got %v", m)
	}
}
