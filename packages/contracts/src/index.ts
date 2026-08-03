import { z } from 'zod';

/** Sliding query windows over the 1-hour in-memory ring. */
export const windowSchema = z.enum(['5s', '30s', '5m', '15m', '30m', '1h']);
export type QueryWindow = z.infer<typeof windowSchema>;

export const WINDOW_SECONDS: Record<QueryWindow, number> = {
  '5s': 5,
  '30s': 30,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
};

export const QUERY_WINDOWS = Object.keys(WINDOW_SECONDS) as QueryWindow[];

export const RING_SAMPLE_COUNT = 3600;
export const SAMPLE_INTERVAL_MS = 1000;

/** Health payload shared across API and web. */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
  lastSampleAgeMs: z.number().nonnegative().nullable(),
  sampleCount: z.number().int().nonnegative(),
});
export type Health = z.infer<typeof healthSchema>;

export const serverInfoSchema = z.object({
  friendlyName: z.string().optional(),
  tag: z.string().optional(),
});
export type ServerInfo = z.infer<typeof serverInfoSchema>;

/** One adapter snapshot inside a sample. */
export const adapterSampleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  state: z.string().min(1),
  priority: z.string().min(1),
  workingPriority: z.string().min(1),
  latencyMs: z.number().finite().nonnegative().nullable(),
  dlMbps: z.number().finite().nonnegative(),
  ulMbps: z.number().finite().nonnegative(),
  usageDailyBytes: z.number().finite().nonnegative().optional(),
  usageDailyLimitBytes: z.number().finite().nonnegative().optional(),
});
export type AdapterSample = z.infer<typeof adapterSampleSchema>;

/** Agent → API sample envelope (POST /api/ingest/sample). */
export const sampleEnvelopeSchema = z.object({
  ts: z.number().int().nonnegative(),
  state: z.string().min(1).optional(),
  server: serverInfoSchema.optional(),
  adapters: z.array(adapterSampleSchema).max(64),
});
export type SampleEnvelope = z.infer<typeof sampleEnvelopeSchema>;

export const metricStatsSchema = z.object({
  min: z.number().finite().nullable(),
  avg: z.number().finite().nullable(),
  max: z.number().finite().nullable(),
});
export type MetricStats = z.infer<typeof metricStatsSchema>;

/** Per-adapter row returned by GET /api/status. */
export const adapterStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  priority: z.string(),
  workingPriority: z.string(),
  latencyMs: metricStatsSchema,
  dlMbps: metricStatsSchema,
  ulMbps: z.object({
    avg: z.number().finite().nullable(),
  }),
  usageDailyBytes: z.number().finite().nonnegative().nullable(),
  usageDailyLimitBytes: z.number().finite().nonnegative().nullable(),
  sampleCount: z.number().int().nonnegative(),
});
export type AdapterStatus = z.infer<typeof adapterStatusSchema>;

export const statusResponseSchema = z.object({
  window: windowSchema,
  generatedAt: z.string().datetime(),
  lastSampleTs: z.number().int().nonnegative().nullable(),
  lastSampleAgeMs: z.number().nonnegative().nullable(),
  state: z.string().nullable(),
  server: serverInfoSchema.nullable(),
  adapters: z.array(adapterStatusSchema),
});
export type StatusResponse = z.infer<typeof statusResponseSchema>;

/** Parse a window query param; default 30s. Throws ZodError on invalid. */
export function parseWindow(raw: unknown, fallback: QueryWindow = '30s'): QueryWindow {
  const value = typeof raw === 'string' && raw.length > 0 ? raw : fallback;
  return windowSchema.parse(value);
}

/** Aggregate finite numbers into min/avg/max; empty → all null. */
export function metricStats(values: readonly number[]): MetricStats {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) {
    return { min: null, avg: null, max: null };
  }
  let min = nums[0]!;
  let max = nums[0]!;
  let sum = 0;
  for (const v of nums) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, avg: sum / nums.length, max };
}

/** Average of finite numbers; empty → null. */
export function avgOrNull(values: readonly number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
