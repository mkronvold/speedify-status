import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { SampleStore } from './status/store.js';

describe('API', () => {
  const store = new SampleStore();
  const appPromise = buildApp({ store, logger: false, ingestToken: 'secret' });

  beforeEach(() => {
    store.clear();
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const app = await appPromise;
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'speedify-status-api',
      sampleCount: 0,
      lastSampleAgeMs: null,
    });
  });

  it('rejects ingest without token when configured', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/sample',
      payload: { ts: Date.now(), adapters: [] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('accepts ingest with bearer token and returns status', async () => {
    const app = await appPromise;
    const now = Date.now();
    const ingest = await app.inject({
      method: 'POST',
      url: '/api/ingest/sample',
      headers: { authorization: 'Bearer secret' },
      payload: {
        ts: now,
        state: 'CONNECTED',
        adapters: [
          {
            id: 'eth2',
            name: 'Starlink',
            state: 'connected',
            priority: 'always',
            workingPriority: 'always',
            latencyMs: 25,
            dlMbps: 80,
            ulMbps: 12,
            usageDailyBytes: 5_000_000_000,
          },
        ],
      },
    });
    expect(ingest.statusCode).toBe(202);
    expect(ingest.json()).toMatchObject({ ok: true, adapters: 1 });

    const status = await app.inject({ method: 'GET', url: '/api/status?window=30s' });
    expect(status.statusCode).toBe(200);
    const body = status.json();
    expect(body.window).toBe('30s');
    expect(body.state).toBe('CONNECTED');
    expect(body.adapters).toHaveLength(1);
    expect(body.adapters[0].name).toBe('Starlink');
    expect(body.adapters[0].latencyMs.avg).toBe(25);
    expect(body.adapters[0].dlMbps.max).toBe(80);
  });

  it('rejects invalid window', async () => {
    const app = await appPromise;
    const response = await app.inject({ method: 'GET', url: '/api/status?window=2m' });
    expect(response.statusCode).toBe(400);
  });

  it('rejects invalid sample body', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/sample',
      headers: { 'x-ingest-token': 'secret' },
      payload: { adapters: 'nope' },
    });
    expect(response.statusCode).toBe(400);
  });
});
