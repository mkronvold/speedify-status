import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dashboard chrome and empty state', async () => {
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

    renderApp();
    expect(screen.getByText('Speedify Status')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No adapter samples yet/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/API ok/i)).toBeInTheDocument();
  });
});
