import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

function stubEmptyDashboardFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/health')) {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'speedify-status-api',
            version: '0.0.0',
            lastSampleAgeMs: null,
            sampleCount: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/status')) {
        return new Response(
          JSON.stringify({
            window: '30s',
            generatedAt: new Date().toISOString(),
            lastSampleTs: null,
            lastSampleAgeMs: null,
            state: null,
            server: null,
            adapters: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

describe('App', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders dashboard chrome and empty state', async () => {
    stubEmptyDashboardFetch();

    renderApp();
    expect(screen.getByText('Speedify Status')).toBeInTheDocument();
    expect(screen.queryByText('WAN health')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Per-adapter latency and throughput over a sliding window/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Color theme')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No adapter samples yet/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/API ok/i)).toBeInTheDocument();
    expect(screen.queryByText(/Daily GB/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ping ms · rates Mbps/i)).toBeInTheDocument();
  });

  it('toggles settings panel with gear and persists open state', () => {
    stubEmptyDashboardFetch();

    renderApp();
    const gear = screen.getByRole('button', { name: 'Settings' });
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Color theme')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Query window')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Display refresh')).not.toBeInTheDocument();

    fireEvent.click(gear);
    expect(gear).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Color theme')).toBeInTheDocument();
    expect(screen.getByLabelText('Query window')).toBeInTheDocument();
    expect(screen.getByLabelText('Display refresh')).toBeInTheDocument();
    expect(localStorage.getItem('speedify-status.settingsOpen')).toBe('1');

    fireEvent.click(gear);
    expect(gear).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Color theme')).not.toBeInTheDocument();
    expect(localStorage.getItem('speedify-status.settingsOpen')).toBe('0');
  });

  it('restores open settings from localStorage', async () => {
    localStorage.setItem('speedify-status.settingsOpen', '1');
    stubEmptyDashboardFetch();

    renderApp();
    const gear = screen.getByRole('button', { name: 'Settings' });
    expect(gear).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Color theme')).toBeInTheDocument();
  });

  it('renders now/avg/max columns without Daily GB', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/health')) {
          return new Response(
            JSON.stringify({
              status: 'ok',
              service: 'speedify-status-api',
              version: '0.0.0',
              lastSampleAgeMs: 100,
              sampleCount: 1,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/status')) {
          return new Response(
            JSON.stringify({
              window: '30s',
              generatedAt: new Date().toISOString(),
              lastSampleTs: Date.now(),
              lastSampleAgeMs: 100,
              state: 'CONNECTED',
              server: null,
              adapters: [
                {
                  id: 'eth2',
                  name: 'Starlink',
                  state: 'connected',
                  priority: 'always',
                  workingPriority: 'always',
                  latencyMs: { now: 25, avg: 30, max: 40, min: 20 },
                  dlMbps: { now: 150, avg: 120, max: 200, min: 80 },
                  ulMbps: { now: 12, avg: 10, max: 15, min: 5 },
                  usageDailyBytes: 5_000_000_000,
                  usageDailyLimitBytes: null,
                  sampleCount: 3,
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );

    renderApp();
    await waitFor(() => {
      expect(screen.getByText('eth2:Starlink')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Starlink\s*\(eth2\)/)).not.toBeInTheDocument();
    expect(screen.getByText('ping now')).toBeInTheDocument();
    expect(screen.getByText('dl now')).toBeInTheDocument();
    expect(screen.getByText('ul now')).toBeInTheDocument();
    expect(screen.getAllByText('ms').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('mbps').length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText('Daily GB')).not.toBeInTheDocument();
    expect(screen.queryByText(/daily GB/i)).not.toBeInTheDocument();
    // now / avg / max cells — one decimal
    expect(screen.getByText('25.0')).toBeInTheDocument();
    expect(screen.getByText('150.0')).toBeInTheDocument();
    expect(screen.getByText('12.0')).toBeInTheDocument();
  });
});
