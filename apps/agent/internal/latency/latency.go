package latency

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Prober measures RTT bound to a network interface when possible.
type Prober struct {
	// FallbackHost used when no gateway is found (default 1.1.1.1).
	FallbackHost string
	// Timeout per probe.
	Timeout time.Duration
	// GatewayLookup overrides default /proc/net/route gateway lookup (tests).
	GatewayLookup func(iface string) (string, bool)
	// PingRunner overrides system ping (tests).
	PingRunner func(ctx context.Context, iface, host string, timeout time.Duration) (*float64, error)
}

func (p Prober) fallback() string {
	if p.FallbackHost != "" {
		return p.FallbackHost
	}
	return "1.1.1.1"
}

func (p Prober) timeout() time.Duration {
	if p.Timeout > 0 {
		return p.Timeout
	}
	return 800 * time.Millisecond
}

// Probe returns RTT milliseconds for iface, or nil on failure.
func (p Prober) Probe(ctx context.Context, iface string) *float64 {
	host := p.fallback()
	lookup := p.GatewayLookup
	if lookup == nil {
		lookup = GatewayForIface
	}
	if gw, ok := lookup(iface); ok && gw != "" {
		host = gw
	}
	runner := p.PingRunner
	if runner == nil {
		runner = runSystemPing
	}
	ms, err := runner(ctx, iface, host, p.timeout())
	if err != nil {
		return nil
	}
	return ms
}

// GatewayForIface reads the IPv4 default/on-link gateway for iface from /proc/net/route.
func GatewayForIface(iface string) (string, bool) {
	data, err := readFile("/proc/net/route")
	if err != nil {
		return "", false
	}
	return parseGateway(data, iface)
}

func readFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func parseGateway(data []byte, iface string) (string, bool) {
	sc := bufio.NewScanner(bytes.NewReader(data))
	// Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT
	first := true
	var bestGW string
	bestMetric := int(^uint(0) >> 1)
	for sc.Scan() {
		line := sc.Text()
		if first {
			first = false
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 8 {
			continue
		}
		if fields[0] != iface {
			continue
		}
		// Destination 00000000 = default route
		if !strings.EqualFold(fields[1], "00000000") {
			continue
		}
		gwHex := fields[2]
		metric, _ := strconv.Atoi(fields[6])
		ip := hexIP(gwHex)
		if ip == "" || ip == "0.0.0.0" {
			continue
		}
		if bestGW == "" || metric < bestMetric {
			bestGW = ip
			bestMetric = metric
		}
	}
	if bestGW == "" {
		return "", false
	}
	return bestGW, true
}

func hexIP(hex string) string {
	if len(hex) != 8 {
		return ""
	}
	// /proc/net/route stores IPv4 as little-endian hex: "0101A8C0" => 192.168.1.1
	p0, e0 := strconv.ParseUint(hex[6:8], 16, 8)
	p1, e1 := strconv.ParseUint(hex[4:6], 16, 8)
	p2, e2 := strconv.ParseUint(hex[2:4], 16, 8)
	p3, e3 := strconv.ParseUint(hex[0:2], 16, 8)
	if e0 != nil || e1 != nil || e2 != nil || e3 != nil {
		return ""
	}
	return fmt.Sprintf("%d.%d.%d.%d", p0, p1, p2, p3)
}

var rttRe = regexp.MustCompile(`(?i)time[=<]([0-9.]+)\s*ms`)

func runSystemPing(ctx context.Context, iface, host string, timeout time.Duration) (*float64, error) {
	// Prefer binding to interface on Linux/OpenWrt.
	args := []string{"-c", "1", "-W", fmt.Sprintf("%d", int(timeout.Seconds()+0.999))}
	if runtime.GOOS == "linux" && iface != "" {
		args = append(args, "-I", iface)
	}
	// some busybox wants -w deadline seconds
	args = append(args, host)

	ctx, cancel := context.WithTimeout(ctx, timeout+500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ping", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		// try without -I if bind failed
		if iface != "" {
			args2 := []string{"-c", "1", "-W", fmt.Sprintf("%d", int(timeout.Seconds()+0.999)), host}
			cmd2 := exec.CommandContext(ctx, "ping", args2...)
			out, err = cmd2.CombinedOutput()
			if err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}
	return parsePingRTT(out)
}

func parsePingRTT(out []byte) (*float64, error) {
	m := rttRe.FindSubmatch(out)
	if m == nil {
		return nil, fmt.Errorf("no rtt in ping output")
	}
	v, err := strconv.ParseFloat(string(m[1]), 64)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// ResolveHost is a tiny helper used by optional HTTP fallback.
func ResolveHost(host string) (string, error) {
	ips, err := net.LookupIP(host)
	if err != nil {
		return "", err
	}
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			return v4.String(), nil
		}
	}
	return "", fmt.Errorf("no ipv4 for %s", host)
}
