package latency

import (
	"context"
	"testing"
	"time"
)

func TestParseGateway(t *testing.T) {
	// eth2 default via 192.168.1.1 (hex little-endian 0101A8C0)
	table := []byte(`Iface	Destination	Gateway 	Flags	RefCnt	Use	Metric	Mask		MTU	Window	IRTT
eth0	00000000	0100A8C0	0003	0	0	100	00000000	0	0	0
eth2	00000000	0101A8C0	0003	0	0	50	00000000	0	0	0
`)
	gw, ok := parseGateway(table, "eth2")
	if !ok || gw != "192.168.1.1" {
		t.Fatalf("gw=%q ok=%v", gw, ok)
	}
	gw0, ok0 := parseGateway(table, "eth0")
	if !ok0 || gw0 != "192.168.0.1" {
		t.Fatalf("eth0 gw=%q", gw0)
	}
}

func TestParsePingRTT(t *testing.T) {
	out := []byte(`PING 1.1.1.1 (1.1.1.1): 56 data bytes
64 bytes from 1.1.1.1: seq=0 ttl=57 time=18.4 ms
`)
	ms, err := parsePingRTT(out)
	if err != nil || ms == nil || *ms != 18.4 {
		t.Fatalf("ms=%v err=%v", ms, err)
	}
}

func TestProberUsesGatewayAndRunner(t *testing.T) {
	var sawHost, sawIface string
	p := Prober{
		FallbackHost: "1.1.1.1",
		Timeout:      200 * time.Millisecond,
		GatewayLookup: func(iface string) (string, bool) {
			sawIface = iface
			return "10.0.0.1", true
		},
		PingRunner: func(ctx context.Context, iface, host string, timeout time.Duration) (*float64, error) {
			sawHost = host
			v := 12.5
			return &v, nil
		},
	}
	ms := p.Probe(context.Background(), "eth5")
	if ms == nil || *ms != 12.5 {
		t.Fatalf("%v", ms)
	}
	if sawHost != "10.0.0.1" || sawIface != "eth5" {
		t.Fatalf("host=%s iface=%s", sawHost, sawIface)
	}
}
