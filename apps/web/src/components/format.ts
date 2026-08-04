/** Format Mbps for table cells. */
export function formatMbps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (value < 0.01) return value.toFixed(3);
  if (value < 10) return value.toFixed(2);
  if (value < 100) return value.toFixed(1);
  return value.toFixed(0);
}

/** Format latency ms. */
export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value < 10) return value.toFixed(1);
  return value.toFixed(0);
}

/** Display label: interface id first, then adapter name (`eth4:e-vergent.com`). */
export function formatAdapterName(id: string, name: string): string {
  return `${id}:${name}`;
}

export function formatAge(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'no samples';
  if (ms < 1500) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
