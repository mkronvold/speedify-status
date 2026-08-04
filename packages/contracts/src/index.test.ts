import { describe, expect, it } from 'vitest';
import {
  avgOrNull,
  metricStats,
  parseWindow,
  sampleEnvelopeSchema,
  windowSchema,
  WINDOW_SECONDS,
} from './index.js';

describe('windowSchema / parseWindow', () => {
  it('accepts known windows', () => {
    for (const w of Object.keys(WINDOW_SECONDS)) {
      expect(windowSchema.parse(w)).toBe(w);
      expect(parseWindow(w)).toBe(w);
    }
  });

  it('defaults empty/missing to 30s', () => {
    expect(parseWindow(undefined)).toBe('30s');
    expect(parseWindow('')).toBe('30s');
    expect(parseWindow(null)).toBe('30s');
  });

  it('rejects unknown windows', () => {
    expect(() => parseWindow('2m')).toThrow();
    expect(() => windowSchema.parse('10s')).toThrow();
  });
});

describe('metricStats', () => {
  it('returns nulls for empty', () => {
    expect(metricStats([])).toEqual({ now: null, avg: null, max: null, min: null });
  });

  it('computes now/avg/max (now = last value) and keeps min', () => {
    expect(metricStats([10, 20, 30])).toEqual({ now: 30, avg: 20, max: 30, min: 10 });
  });

  it('ignores non-finite', () => {
    expect(metricStats([5, Number.NaN, 15])).toEqual({ now: 15, avg: 10, max: 15, min: 5 });
  });

  it('uses explicit now option (latest-by-ts override)', () => {
    expect(metricStats([10, 20, 30], { now: 12 })).toEqual({
      now: 12,
      avg: 20,
      max: 30,
      min: 10,
    });
    expect(metricStats([10, 20], { now: null })).toEqual({
      now: null,
      avg: 15,
      max: 20,
      min: 10,
    });
  });
});

describe('avgOrNull', () => {
  it('averages or null', () => {
    expect(avgOrNull([])).toBeNull();
    expect(avgOrNull([2, 4, 6])).toBe(4);
  });
});

describe('sampleEnvelopeSchema', () => {
  it('accepts a valid sample', () => {
    const parsed = sampleEnvelopeSchema.parse({
      ts: Date.now(),
      state: 'CONNECTED',
      adapters: [
        {
          id: 'eth2',
          name: 'Starlink',
          state: 'connected',
          priority: 'always',
          workingPriority: 'always',
          latencyMs: 42.5,
          dlMbps: 120.1,
          ulMbps: 12.3,
          usageDailyBytes: 1_000_000,
        },
      ],
    });
    expect(parsed.adapters).toHaveLength(1);
    expect(parsed.adapters[0]?.latencyMs).toBe(42.5);
  });

  it('allows null latency', () => {
    const parsed = sampleEnvelopeSchema.parse({
      ts: 1,
      adapters: [
        {
          id: 'eth1',
          name: 'Verizon',
          state: 'connected',
          priority: 'backup',
          workingPriority: 'backup',
          latencyMs: null,
          dlMbps: 0,
          ulMbps: 0,
        },
      ],
    });
    expect(parsed.adapters[0]?.latencyMs).toBeNull();
  });
});
