import {
  healthSchema,
  statusResponseSchema,
  type Health,
  type QueryWindow,
  type StatusResponse,
} from '@speedify-status/contracts';

async function getJson<T>(url: string, parse: (data: unknown) => T): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status}`);
  }
  return parse(await response.json());
}

export function fetchHealth(): Promise<Health> {
  return getJson('/api/health', (d) => healthSchema.parse(d));
}

export function fetchStatus(window: QueryWindow): Promise<StatusResponse> {
  return getJson(`/api/status?window=${window}`, (d) => statusResponseSchema.parse(d));
}
