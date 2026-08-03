package netdev

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestReadProcNetDevAndMbps(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dev")
	content := `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
  eth0: 1000       1    0    0    0     0          0         0     2000       1    0    0    0     0       0          0
  eth2: 5000000    10   0    0    0     0          0         0     1000000     5    0    0    0     0       0          0
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	snap, err := ReadProcNetDev(path)
	if err != nil {
		t.Fatal(err)
	}
	if snap["eth2"].RxBytes != 5_000_000 {
		t.Fatalf("rx=%d", snap["eth2"].RxBytes)
	}

	prev := Snapshot{
		"eth2": {RxBytes: 4_000_000, TxBytes: 500_000},
	}
	cur := Snapshot{
		"eth2": {RxBytes: 5_250_000, TxBytes: 750_000},
	}
	// 1 second: dl = 1_250_000 * 8 / 1e6 = 10 Mbps; ul = 250_000 * 8 / 1e6 = 2 Mbps
	r := MbpsFromDelta(prev["eth2"], cur["eth2"], time.Second)
	if r.DlMbps < 9.9 || r.DlMbps > 10.1 {
		t.Fatalf("dl=%v", r.DlMbps)
	}
	if r.UlMbps < 1.9 || r.UlMbps > 2.1 {
		t.Fatalf("ul=%v", r.UlMbps)
	}
}
