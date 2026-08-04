import { describe, expect, it } from 'vitest';
import { formatAdapterName, formatAge, formatMbps, formatMs } from './format';

describe('format helpers', () => {
  it('formats mbps with one decimal and ms as integers', () => {
    expect(formatMbps(null)).toBe('—');
    expect(formatMs(undefined)).toBe('—');
    expect(formatMbps(12.34)).toBe('12.3');
    expect(formatMbps(0)).toBe('0.0');
    expect(formatMbps(150)).toBe('150.0');
    expect(formatMbps(0.05)).toBe('0.1');
    expect(formatMs(8.2)).toBe('8');
    expect(formatMs(25)).toBe('25');
    expect(formatMs(0)).toBe('0');
    expect(formatMs(46.1)).toBe('46');
    expect(formatMs(0.6)).toBe('1');
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
