/** Format Mbps for table cells (always one decimal when finite). */
export function formatMbps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(1);
}

/** Format latency ms as a whole number when finite. */
export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
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
