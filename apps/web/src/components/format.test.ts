import { describe, expect, it } from 'vitest';
import { formatAge, formatDailyGb, formatMbps, formatMs } from './format';

describe('format helpers', () => {
  it('formats mbps and ms nulls', () => {
    expect(formatMbps(null)).toBe('—');
    expect(formatMs(undefined)).toBe('—');
    expect(formatMbps(12.34)).toBe('12.3');
    expect(formatMs(8.2)).toBe('8.2');
  });

  it('formats daily GB and age', () => {
    expect(formatDailyGb(5_000_000_000)).toBe('5.00');
    expect(formatAge(null)).toBe('no samples');
    expect(formatAge(500)).toBe('just now');
    expect(formatAge(12_000)).toBe('12s ago');
  });
});
