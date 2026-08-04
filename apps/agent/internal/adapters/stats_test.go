package adapters

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
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

// blockingReader yields data then blocks until closed — models a never-ending stats stream.
type blockingReader struct {
	buf    *bytes.Reader
	closed chan struct{}
}

func newBlockingReader(data string) *blockingReader {
	return &blockingReader{
		buf:    bytes.NewReader([]byte(data)),
		closed: make(chan struct{}),
	}
}

func (r *blockingReader) Read(p []byte) (int, error) {
	n, err := r.buf.Read(p)
	if n > 0 {
		return n, nil
	}
	if err == io.EOF {
		select {
		case <-r.closed:
			return 0, io.EOF
		}
	}
	return n, err
}

func (r *blockingReader) Close() error {
	select {
	case <-r.closed:
	default:
		close(r.closed)
	}
	return nil
}

func TestReadConnectionStatsStreamEarlyStop(t *testing.T) {
	// After connection_stats, an enormous trailing document would hang a full drain.
	// Early-stop must return without reading it all — we only feed the head and then block.
	head := `[ "state", { "state": "CONNECTED" } ]
[ "connection_stats", {"connections":[{"adapterID":"eth2","latencyMs":29}]} ]
[ "speed_stats", {"pad":"`
	// Do not append the huge pad into the reader buffer; after head is consumed the reader blocks.
	r := newBlockingReader(head)
	defer r.Close()

	done := make(chan struct{})
	var m map[string]float64
	var err error
	go func() {
		m, err = ReadConnectionStatsStream(r)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("ReadConnectionStatsStream did not return early; still draining stream")
	}
	if err != nil {
		t.Fatal(err)
	}
	if m["eth2"] != 29 {
		t.Fatalf("got %v", m)
	}
}

func TestReadConnectionStatsStreamTruncatedAfterStats(t *testing.T) {
	// Process killed mid-next-document after a good connection_stats.
	raw := `[ "connection_stats", {"connections":[{"adapterID":"eth1","latencyMs":12}]} ]
[ "speed_stats", {"downloadMbps": `
	m, err := ReadConnectionStatsStream(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if m["eth1"] != 12 {
		t.Fatalf("got %v", m)
	}
}

func TestConnectionLatencyContextMockStream(t *testing.T) {
	bin := buildMockStatsCLI(t, liveStatsFixture, 50*time.Millisecond)
	r := Runner{Bin: bin}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	start := time.Now()
	m, err := r.ConnectionLatencyContext(ctx)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatal(err)
	}
	if m["eth2"] != 29 {
		t.Fatalf("got %v", m)
	}
	// Must not wait for the mock's infinite loop / long sleep after first docs.
	if elapsed > 2*time.Second {
		t.Fatalf("ConnectionLatency took too long: %v (did not stop early?)", elapsed)
	}
}

func TestConnectionLatencyContextTimeoutNoStats(t *testing.T) {
	// Stream only state docs forever — should error so main can ICMP-fallback.
	bin := buildMockStatsCLI(t, `[ "state", { "state": "CONNECTED" } ]`+"\n", 200*time.Millisecond)
	r := Runner{Bin: bin}

	ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer cancel()

	m, err := r.ConnectionLatencyContext(ctx)
	if err == nil {
		t.Fatalf("expected error, got %v", m)
	}
	if len(m) > 0 {
		t.Fatalf("expected no latencies, got %v", m)
	}
}

// buildMockStatsCLI writes a small Go program that prints fixture once, then sleeps
// in a loop (never exits), mimicking speedify_cli stats.
func buildMockStatsCLI(t *testing.T, fixture string, loopSleep time.Duration) string {
	t.Helper()
	dir := t.TempDir()
	src := filepath.Join(dir, "mock_stats.go")
	fixPath := filepath.Join(dir, "fixture.json")
	if err := os.WriteFile(fixPath, []byte(fixture), 0o644); err != nil {
		t.Fatal(err)
	}
	prog := fmt.Sprintf(`package main
import (
  "fmt"
  "os"
  "time"
)
func main() {
  if len(os.Args) < 2 || os.Args[1] != "stats" {
    os.Exit(2)
  }
  b, err := os.ReadFile(%s)
  if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
  os.Stdout.Write(b)
  _ = os.Stdout.Sync()
  for { time.Sleep(%d * time.Millisecond) }
}
`, strconvQuote(fixPath), loopSleep.Milliseconds())

	if err := os.WriteFile(src, []byte(prog), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "mock_speedify_cli")
	if runtime.GOOS == "windows" {
		out += ".exe"
	}
	cmd := exec.Command("go", "build", "-o", out, src)
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	if b, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build mock: %v\n%s", err, b)
	}
	return out
}

func strconvQuote(p string) string {
	return fmt.Sprintf("%q", filepath.ToSlash(p))
}
