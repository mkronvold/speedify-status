package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// Adapter is a normalized Speedify adapter row from `speedify_cli show adapters`.
type Adapter struct {
	ID                  string
	Name                string
	State               string
	Priority            string
	WorkingPriority     string
	UsageDailyBytes     *uint64
	UsageDailyLimitBytes *uint64
	// Optional ISP-reported latency (not used as primary RTT in MVP).
	IspLatencyMs *float64
}

type rawAdapter struct {
	AdapterID       string          `json:"adapterID"`
	ISP             string          `json:"isp"`
	State           string          `json:"state"`
	Priority        string          `json:"priority"`
	WorkingPriority string          `json:"workingPriority"`
	DataUsage       *rawDataUsage   `json:"dataUsage"`
	IspStats        json.RawMessage `json:"ispStats"`
}

type rawDataUsage struct {
	UsageDaily json.Number `json:"usageDaily"`
	UsageLimit json.Number `json:"usageLimit"`
}

// ParseAdaptersJSON parses the JSON array from show adapters.
func ParseAdaptersJSON(data []byte) ([]Adapter, error) {
	data = bytes.TrimSpace(data)
	if len(data) == 0 {
		return nil, fmt.Errorf("empty adapters json")
	}
	// CLI may wrap in object; accept array or {adapters:[]}
	if data[0] == '{' {
		var wrap struct {
			Adapters []rawAdapter `json:"adapters"`
		}
		if err := json.Unmarshal(data, &wrap); err != nil {
			return nil, err
		}
		return normalize(wrap.Adapters), nil
	}
	var raw []rawAdapter
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	return normalize(raw), nil
}

func normalize(raw []rawAdapter) []Adapter {
	out := make([]Adapter, 0, len(raw))
	for _, r := range raw {
		id := strings.TrimSpace(r.AdapterID)
		if id == "" {
			continue
		}
		name := strings.TrimSpace(r.ISP)
		if name == "" {
			name = id
		}
		a := Adapter{
			ID:              id,
			Name:            name,
			State:           strings.TrimSpace(r.State),
			Priority:        strings.TrimSpace(r.Priority),
			WorkingPriority: strings.TrimSpace(r.WorkingPriority),
		}
		if a.State == "" {
			a.State = "unknown"
		}
		if a.Priority == "" {
			a.Priority = "unknown"
		}
		if a.WorkingPriority == "" {
			a.WorkingPriority = a.Priority
		}
		if r.DataUsage != nil {
			if v, err := r.DataUsage.UsageDaily.Float64(); err == nil && v >= 0 {
				u := uint64(v)
				a.UsageDailyBytes = &u
			}
			if v, err := r.DataUsage.UsageLimit.Float64(); err == nil && v >= 0 {
				u := uint64(v)
				a.UsageDailyLimitBytes = &u
			}
		}
		// best-effort ispStats.latency_ms
		if len(r.IspStats) > 0 {
			var stats struct {
				LatencyMs *float64 `json:"latency_ms"`
			}
			if json.Unmarshal(r.IspStats, &stats) == nil && stats.LatencyMs != nil {
				a.IspLatencyMs = stats.LatencyMs
			}
		}
		out = append(out, a)
	}
	return out
}

// Runner executes speedify_cli.
type Runner struct {
	Bin string
}

func (r Runner) bin() string {
	if r.Bin != "" {
		return r.Bin
	}
	return "/usr/share/speedify/speedify_cli"
}

// ShowAdapters runs `speedify_cli show adapters`.
func (r Runner) ShowAdapters() ([]Adapter, error) {
	cmd := exec.Command(r.bin(), "show", "adapters")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("speedify_cli show adapters: %w", err)
	}
	return ParseAdaptersJSON(out)
}

// State runs `speedify_cli state` and returns the state string when present.
func (r Runner) State() (string, error) {
	cmd := exec.Command(r.bin(), "state")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	var obj struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(out, &obj); err != nil {
		return strings.TrimSpace(string(out)), nil
	}
	return obj.State, nil
}

// CurrentServer runs `speedify_cli show currentserver` best-effort.
func (r Runner) CurrentServer() (friendlyName, tag string) {
	cmd := exec.Command(r.bin(), "show", "currentserver")
	out, err := cmd.Output()
	if err != nil {
		return "", ""
	}
	var obj struct {
		FriendlyName string `json:"friendlyName"`
		Tag          string `json:"tag"`
		Server       struct {
			FriendlyName string `json:"friendlyName"`
			Tag          string `json:"tag"`
		} `json:"server"`
	}
	if json.Unmarshal(out, &obj) != nil {
		return "", ""
	}
	if obj.FriendlyName != "" || obj.Tag != "" {
		return obj.FriendlyName, obj.Tag
	}
	return obj.Server.FriendlyName, obj.Server.Tag
}
