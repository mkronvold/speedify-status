package ingest

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client posts sample JSON to the API ingest endpoint.
type Client struct {
	URL    string
	Token  string
	Client *http.Client
}

func (c Client) http() *http.Client {
	if c.Client != nil {
		return c.Client
	}
	return &http.Client{Timeout: 5 * time.Second}
}

// PostJSON sends raw JSON body to the ingest URL.
func (c Client) PostJSON(ctx context.Context, body []byte) error {
	if c.URL == "" {
		return fmt.Errorf("ingest URL is empty")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
		req.Header.Set("X-Ingest-Token", c.Token)
	}
	res, err := c.http().Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("ingest status %d", res.StatusCode)
	}
	return nil
}
