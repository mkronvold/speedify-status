import { describe, expect, it } from 'vitest';
import { formatAdapterName, formatAge, formatMbps, formatMs } from './format';

describe('format helpers', () => {
  it('formats mbps and ms nulls', () => {
    expect(formatMbps(null)).toBe('—');
    expect(formatMs(undefined)).toBe('—');
    expect(formatMbps(12.34)).toBe('12.3');
    expect(formatMs(8.2)).toBe('8.2');
  });

  it('formats adapter name as id:name', () => {
    expect(formatAdapterName('eth4', 'e-vergent.com')).toBe('eth4:e-vergent.com');
    expect(formatAdapterName('eth2', 'Starlink')).toBe('eth2:Starlink');
  });

  it('formats age', () => {
    expect(formatAge(null)).toBe('no samples');
    expect(formatAge(500)).toBe('just now');
    expect(formatAge(12_000)).toBe('12s ago');
  });
});
