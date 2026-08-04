package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/mkronvold/speedify-status/apps/agent/internal/adapters"
	"github.com/mkronvold/speedify-status/apps/agent/internal/ingest"
	"github.com/mkronvold/speedify-status/apps/agent/internal/latency"
	"github.com/mkronvold/speedify-status/apps/agent/internal/netdev"
	"github.com/mkronvold/speedify-status/apps/agent/internal/sample"
)

const version = "0.1.1"

func main() {
	var (
		showVersion = flag.Bool("version", false, "print version and exit")
		showHelp    = flag.Bool("help", false, "print help and exit")
		ingestURL   = flag.String("ingest-url", envOr("INGEST_URL", "http://127.0.0.1:4090/api/ingest/sample"), "API ingest URL")
		token       = flag.String("token", envOr("INGEST_TOKEN", ""), "optional ingest bearer token")
		cliBin      = flag.String("speedify-cli", envOr("SPEEDIFY_CLI", "/usr/share/speedify/speedify_cli"), "speedify_cli path")
		procNetDev  = flag.String("proc-net-dev", envOr("PROC_NET_DEV", "/proc/net/dev"), "path to proc net dev")
		interval    = flag.Float64("interval", envFloat("INTERVAL_SEC", 1), "sample interval seconds")
		fallback    = flag.String("latency-fallback", envOr("LATENCY_FALLBACK_HOST", "1.1.1.1"), "ICMP target when no gateway")
		once        = flag.Bool("once", false, "collect one sample (simulate adapters if needed) and exit")
		simulate    = flag.Bool("simulate", envBool("SIMULATE", false), "use built-in fake adapters (local dev)")
	)
	flag.Parse()

	if *showHelp {
		flag.Usage()
		return
	}
	if *showVersion {
		fmt.Printf("speedify-status-agent %s\n", version)
		return
	}
	if *interval < 0.2 {
		*interval = 0.2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	runner := adapters.Runner{Bin: *cliBin}
	prober := latency.Prober{FallbackHost: *fallback, Timeout: 800 * time.Millisecond}
	client := ingest.Client{URL: *ingestURL, Token: *token}

	var prev netdev.Snapshot
	var prevAt time.Time
	statsWarnLogged := false

	tick := func() error {
		now := time.Now()
		var list []adapters.Adapter
		var state string
		var server *sample.ServerInfo

		if *simulate {
			list = simAdapters()
			state = "CONNECTED"
			server = &sample.ServerInfo{FriendlyName: "simulate"}
		} else {
			var err error
			list, err = runner.ShowAdapters()
			if err != nil {
				return err
			}
			if s, err := runner.State(); err == nil {
				state = s
			}
			fn, tag := runner.CurrentServer()
			if fn != "" || tag != "" {
				server = &sample.ServerInfo{FriendlyName: fn, Tag: tag}
			}
		}

		cur, err := netdev.ReadProcNetDev(*procNetDev)
		if err != nil {
			// On Windows/dev without /proc, allow zero rates.
			if !*simulate {
				fmt.Fprintf(os.Stderr, "netdev warning: %v\n", err)
			}
			cur = netdev.Snapshot{}
		}

		rates := map[string]netdev.Rates{}
		if prev != nil && !prevAt.IsZero() {
			rates = netdev.DiffAll(prev, cur, now.Sub(prevAt))
		}
		prev = cur
		prevAt = now

		// Primary latency: Speedify tunnel RTT from `speedify_cli stats`
		// (connection_stats.latencyMs). Fallback: ICMP to iface gateway.
		// IspLatencyMs from show adapters is intentionally not used as primary.
		var statsLat map[string]float64
		if !*simulate {
			var statsErr error
			statsLat, statsErr = runner.ConnectionLatency()
			if statsErr != nil {
				if !statsWarnLogged {
					fmt.Fprintf(os.Stderr, "connection_stats warning: %v (using ICMP fallback)\n", statsErr)
					statsWarnLogged = true
				}
				statsLat = nil
			}
		}

		lat := make(map[string]*float64, len(list))
		for _, a := range list {
			if *simulate {
				v := 20.0 + float64(len(a.ID))
				lat[a.ID] = &v
				continue
			}
			if statsLat != nil {
				if ms, ok := statsLat[a.ID]; ok {
					v := ms
					lat[a.ID] = &v
					continue
				}
			}
			lat[a.ID] = prober.Probe(ctx, a.ID)
		}

		env := sample.Build(now, state, server, list, rates, lat)
		body, err := sample.MarshalJSON(env)
		if err != nil {
			return err
		}
		if err := client.PostJSON(ctx, body); err != nil {
			return err
		}
		fmt.Fprintf(os.Stderr, "posted %d adapters ts=%d\n", len(env.Adapters), env.TS)
		return nil
	}

	fmt.Fprintf(os.Stderr, "speedify-status-agent %s → %s interval=%.2fs simulate=%v\n", version, *ingestURL, *interval, *simulate)

	if *once {
			// Two samples so /proc deltas can produce non-zero Mbps when available.
			_ = tick()
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(*interval * float64(time.Second))):
			}
			if err := tick(); err != nil {
				fmt.Fprintf(os.Stderr, "error: %v\n", err)
				os.Exit(1)
			}
			return
		}

	// Prime counters.
	if snap, err := netdev.ReadProcNetDev(*procNetDev); err == nil {
		prev = snap
		prevAt = time.Now()
	}

	ticker := time.NewTicker(time.Duration(*interval * float64(time.Second)))
	defer ticker.Stop()

	// First sample shortly after start.
	if err := tick(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := tick(); err != nil {
				fmt.Fprintf(os.Stderr, "error: %v\n", err)
			}
		}
	}
}

func simAdapters() []adapters.Adapter {
	d1 := uint64(1_000_000_000)
	d2 := uint64(500_000_000)
	return []adapters.Adapter{
		{ID: "eth2", Name: "Starlink", State: "connected", Priority: "always", WorkingPriority: "always", UsageDailyBytes: &d1},
		{ID: "eth5", Name: "T-Mobile", State: "connected", Priority: "always", WorkingPriority: "always", UsageDailyBytes: &d2},
		{ID: "eth1", Name: "Verizon", State: "connected", Priority: "backup", WorkingPriority: "backup"},
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envFloat(k string, def float64) float64 {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return def
	}
	return f
}

func envBool(k string, def bool) bool {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	switch v {
	case "1", "true", "TRUE", "yes", "YES", "on", "ON":
		return true
	case "0", "false", "FALSE", "no", "NO", "off", "OFF":
		return false
	default:
		return def
	}
}
