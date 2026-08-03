package netdev

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Counters holds cumulative interface byte counters from /proc/net/dev.
type Counters struct {
	RxBytes uint64
	TxBytes uint64
}

// Snapshot is counters keyed by interface name (e.g. eth2).
type Snapshot map[string]Counters

// ReadProcNetDev parses /proc/net/dev.
func ReadProcNetDev(path string) (Snapshot, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	out := make(Snapshot)
	sc := bufio.NewScanner(f)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(sc.Text())
		if lineNo <= 2 || line == "" {
			continue
		}
		// iface: rx_bytes rx_packets ... tx_bytes ...
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		fields := strings.Fields(parts[1])
		if len(fields) < 9 {
			continue
		}
		rx, err1 := strconv.ParseUint(fields[0], 10, 64)
		tx, err2 := strconv.ParseUint(fields[8], 10, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		out[name] = Counters{RxBytes: rx, TxBytes: tx}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// Rates holds Mbps computed from two snapshots.
type Rates struct {
	DlMbps float64
	UlMbps float64
}

// MbpsFromDelta computes download (rx) and upload (tx) Mbps between two counter samples.
func MbpsFromDelta(prev, cur Counters, dt time.Duration) Rates {
	if dt <= 0 {
		return Rates{}
	}
	sec := dt.Seconds()
	var drx, dtx float64
	if cur.RxBytes >= prev.RxBytes {
		drx = float64(cur.RxBytes - prev.RxBytes)
	}
	if cur.TxBytes >= prev.TxBytes {
		dtx = float64(cur.TxBytes - prev.TxBytes)
	}
	// bytes * 8 / 1e6 / seconds
	return Rates{
		DlMbps: (drx * 8) / 1e6 / sec,
		UlMbps: (dtx * 8) / 1e6 / sec,
	}
}

// DiffAll returns per-iface rates for interfaces present in both snapshots.
func DiffAll(prev, cur Snapshot, dt time.Duration) map[string]Rates {
	out := make(map[string]Rates)
	for name, c := range cur {
		p, ok := prev[name]
		if !ok {
			continue
		}
		out[name] = MbpsFromDelta(p, c, dt)
	}
	return out
}

// FormatDebug is a small helper for tests/logging.
func FormatDebug(name string, r Rates) string {
	return fmt.Sprintf("%s dl=%.3f ul=%.3f", name, r.DlMbps, r.UlMbps)
}
