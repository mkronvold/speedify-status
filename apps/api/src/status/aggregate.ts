import {
  avgOrNull,
  metricStats,
  type AdapterStatus,
  type QueryWindow,
  type SampleEnvelope,
  type ServerInfo,
  type StatusResponse,
} from '@speedify-status/contracts';
import type { SampleStore, StoredSample } from './store.js';

interface AdapterAccum {
  id: string;
  name: string;
  state: string;
  priority: string;
  workingPriority: string;
  latency: number[];
  dl: number[];
  ul: number[];
  usageDailyBytes: number | null;
  usageDailyLimitBytes: number | null;
  lastTs: number;
}

function bumpAdapter(map: Map<string, AdapterAccum>, sample: StoredSample): void {
  for (const a of sample.adapters) {
    let acc = map.get(a.id);
    if (!acc) {
      acc = {
        id: a.id,
        name: a.name,
        state: a.state,
        priority: a.priority,
        workingPriority: a.workingPriority,
        latency: [],
        dl: [],
        ul: [],
        usageDailyBytes: a.usageDailyBytes ?? null,
        usageDailyLimitBytes: a.usageDailyLimitBytes ?? null,
        lastTs: sample.ts,
      };
      map.set(a.id, acc);
    }
    // Prefer latest metadata
    if (sample.ts >= acc.lastTs) {
      acc.name = a.name;
      acc.state = a.state;
      acc.priority = a.priority;
      acc.workingPriority = a.workingPriority;
      acc.usageDailyBytes = a.usageDailyBytes ?? null;
      acc.usageDailyLimitBytes = a.usageDailyLimitBytes ?? null;
      acc.lastTs = sample.ts;
    }
    if (a.latencyMs !== null && Number.isFinite(a.latencyMs)) {
      acc.latency.push(a.latencyMs);
    }
    if (Number.isFinite(a.dlMbps)) acc.dl.push(a.dlMbps);
    if (Number.isFinite(a.ulMbps)) acc.ul.push(a.ulMbps);
  }
}

export function toAdapterStatus(acc: AdapterAccum): AdapterStatus {
  return {
    id: acc.id,
    name: acc.name,
    state: acc.state,
    priority: acc.priority,
    workingPriority: acc.workingPriority,
    latencyMs: metricStats(acc.latency),
    dlMbps: metricStats(acc.dl),
    ulMbps: { avg: avgOrNull(acc.ul) },
    usageDailyBytes: acc.usageDailyBytes,
    usageDailyLimitBytes: acc.usageDailyLimitBytes,
    sampleCount: Math.max(acc.dl.length, acc.ul.length, acc.latency.length, 1),
  };
}

export function buildStatus(
  store: SampleStore,
  window: QueryWindow,
  nowMs = Date.now(),
): StatusResponse {
  const samples = store.samplesForWindow(window, nowMs);
  const latest = store.latest();
  const map = new Map<string, AdapterAccum>();
  for (const s of samples) {
    bumpAdapter(map, s);
  }

  // If window is empty but we have a latest sample outside it, still show latest adapters
  // with empty stats — only when there is no data at all leave adapters empty.
  if (map.size === 0 && latest) {
    for (const a of latest.adapters) {
      map.set(a.id, {
        id: a.id,
        name: a.name,
        state: a.state,
        priority: a.priority,
        workingPriority: a.workingPriority,
        latency: a.latencyMs !== null ? [a.latencyMs] : [],
        dl: [a.dlMbps],
        ul: [a.ulMbps],
        usageDailyBytes: a.usageDailyBytes ?? null,
        usageDailyLimitBytes: a.usageDailyLimitBytes ?? null,
        lastTs: latest.ts,
      });
    }
  }

  const adapters = [...map.values()]
    .map(toAdapterStatus)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const lastSampleTs = latest?.ts ?? null;
  const lastSampleAgeMs =
    lastSampleTs === null ? null : Math.max(0, nowMs - (latest?.receivedAt ?? lastSampleTs));

  let state: string | null = latest?.state ?? null;
  let server: ServerInfo | null = latest?.server ?? null;
  if (!state && samples.length > 0) {
    const last = samples[samples.length - 1]!;
    state = last.state ?? null;
    server = last.server ?? null;
  }

  return {
    window,
    generatedAt: new Date(nowMs).toISOString(),
    lastSampleTs,
    lastSampleAgeMs,
    state,
    server,
    adapters,
  };
}

/** Test helper: aggregate adapters from an explicit sample list. */
export function aggregateSamples(samples: SampleEnvelope[], window: QueryWindow): AdapterStatus[] {
  const store = {
    samplesForWindow: () => samples.map((s) => ({ ...s, receivedAt: s.ts })),
    latest: () => {
      if (samples.length === 0) return null;
      const last = samples[samples.length - 1]!;
      return { ...last, receivedAt: last.ts };
    },
  } as unknown as SampleStore;
  return buildStatus(store, window).adapters;
}
