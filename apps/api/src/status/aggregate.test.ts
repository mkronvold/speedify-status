import { describe, expect, it } from 'vitest';
import { SampleStore } from './store.js';
import { buildStatus, toAdapterStatus } from './aggregate.js';
import { metricStats } from '@speedify-status/contracts';

describe('SampleStore ring', () => {
  it('keeps latest N samples', () => {
    const store = new SampleStore(3);
    for (let i = 1; i <= 5; i += 1) {
      store.ingest({ ts: i * 1000, adapters: [] });
    }
    expect(store.sampleCount).toBe(3);
    const latest = store.latest();
    expect(latest?.ts).toBe(5000);
  });

  it('filters by window', () => {
    const store = new SampleStore();
    const now = 1_000_000;
    store.ingest({ ts: now - 60_000, adapters: [] }, now - 60_000);
    store.ingest({ ts: now - 10_000, adapters: [] }, now - 10_000);
    store.ingest({ ts: now - 2_000, adapters: [] }, now - 2_000);
    const win = store.samplesForWindow('30s', now);
    expect(win.map((s) => s.ts)).toEqual([now - 10_000, now - 2_000]);
  });
});

describe('buildStatus aggregates', () => {
  it('computes now/avg/max for latency, DL, and UL (now = latest sample)', () => {
    const store = new SampleStore();
    const now = Date.now();
    const base = {
      id: 'eth2',
      name: 'Starlink',
      state: 'connected',
      priority: 'always',
      workingPriority: 'always',
    };
    store.ingest(
      {
        ts: now - 2000,
        state: 'CONNECTED',
        adapters: [{ ...base, latencyMs: 20, dlMbps: 100, ulMbps: 10 }],
      },
      now - 2000,
    );
    store.ingest(
      {
        ts: now - 1000,
        state: 'CONNECTED',
        adapters: [{ ...base, latencyMs: 40, dlMbps: 200, ulMbps: 30 }],
      },
      now - 1000,
    );
    store.ingest(
      {
        ts: now - 500,
        state: 'CONNECTED',
        adapters: [{ ...base, latencyMs: null, dlMbps: 150, ulMbps: 20 }],
      },
      now - 500,
    );

    const status = buildStatus(store, '30s', now);
    expect(status.state).toBe('CONNECTED');
    expect(status.adapters).toHaveLength(1);
    const row = status.adapters[0]!;
    // now latency is null because latest sample has null latencyMs
    expect(row.latencyMs).toEqual({ now: null, avg: 30, max: 40, min: 20 });
    expect(row.dlMbps).toEqual({ now: 150, avg: 150, max: 200, min: 100 });
    expect(row.ulMbps).toEqual({ now: 20, avg: 20, max: 30, min: 10 });
  });

  it('sets now from latest-by-ts even if samples are ingested out of order', () => {
    const store = new SampleStore();
    const now = Date.now();
    const base = {
      id: 'eth1',
      name: 'LTE',
      state: 'connected',
      priority: 'backup',
      workingPriority: 'backup',
    };
    // Ingest newer sample first, then older
    store.ingest(
      {
        ts: now - 500,
        adapters: [{ ...base, latencyMs: 50, dlMbps: 40, ulMbps: 8 }],
      },
      now - 500,
    );
    store.ingest(
      {
        ts: now - 2000,
        adapters: [{ ...base, latencyMs: 10, dlMbps: 100, ulMbps: 20 }],
      },
      now - 2000,
    );

    const row = buildStatus(store, '30s', now).adapters[0]!;
    expect(row.latencyMs.now).toBe(50);
    expect(row.dlMbps.now).toBe(40);
    expect(row.ulMbps.now).toBe(8);
    expect(row.latencyMs.avg).toBe(30);
    expect(row.ulMbps.max).toBe(20);
  });

  it('uses metricStats helper consistently', () => {
    expect(metricStats([1, 2, 3])).toEqual({ now: 3, avg: 2, max: 3, min: 1 });
    const row = toAdapterStatus({
      id: 'x',
      name: 'n',
      state: 's',
      priority: 'p',
      workingPriority: 'w',
      latency: [1, 3],
      dl: [10],
      ul: [5, 15],
      lastLatency: 3,
      lastDl: 10,
      lastUl: 15,
      usageDailyBytes: 100,
      usageDailyLimitBytes: null,
      lastTs: 1,
    });
    expect(row.latencyMs.now).toBe(3);
    expect(row.latencyMs.max).toBe(3);
    expect(row.ulMbps).toEqual({ now: 15, avg: 10, max: 15, min: 5 });
    expect(row.usageDailyBytes).toBe(100);
  });
});
