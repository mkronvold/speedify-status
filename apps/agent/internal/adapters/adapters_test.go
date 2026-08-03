package adapters

import "testing"

func TestParseAdaptersJSON(t *testing.T) {
	raw := `[
	  {
	    "adapterID": "eth2",
	    "isp": "Starlink",
	    "state": "connected",
	    "priority": "automatic",
	    "workingPriority": "always",
	    "dataUsage": { "usageDaily": 123456789, "usageLimit": 0 },
	    "ispStats": { "latency_ms": 28.5 }
	  },
	  {
	    "adapterID": "eth1",
	    "isp": "Verizon",
	    "state": "connected",
	    "priority": "backup",
	    "workingPriority": "backup"
	  }
	]`
	list, err := ParseAdaptersJSON([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("len=%d", len(list))
	}
	if list[0].ID != "eth2" || list[0].Name != "Starlink" {
		t.Fatalf("%+v", list[0])
	}
	if list[0].UsageDailyBytes == nil || *list[0].UsageDailyBytes != 123456789 {
		t.Fatalf("usage=%v", list[0].UsageDailyBytes)
	}
	if list[0].IspLatencyMs == nil || *list[0].IspLatencyMs != 28.5 {
		t.Fatalf("lat=%v", list[0].IspLatencyMs)
	}
}
