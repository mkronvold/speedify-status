import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_IDS,
  THEME_STORAGE_KEY,
  applyTheme,
  normalizeThemeId,
  persistTheme,
  readStoredTheme,
  resolveInitialTheme,
  systemTheme,
} from './theme';

describe('theme helpers', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads system preference when nothing is stored', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    expect(systemTheme()).toBe('light');
    expect(resolveInitialTheme()).toBe('light');
  });

  it('maps system dark preference to midnight', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    expect(systemTheme()).toBe('midnight');
  });

  it('prefers stored theme over system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'ocean');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    expect(readStoredTheme()).toBe('ocean');
    expect(resolveInitialTheme()).toBe('ocean');
  });

  it('normalizes legacy and alias theme ids', () => {
    expect(normalizeThemeId('dark')).toBe('midnight');
    expect(normalizeThemeId('dawn')).toBe('light');
    expect(normalizeThemeId('linen')).toBe('sepia');
    expect(normalizeThemeId('mist')).toBe('coyote');
    expect(normalizeThemeId('summer-nights')).toBe('coyote');
    expect(normalizeThemeId('winter-nights')).toBe('ocean');
    expect(normalizeThemeId('not-a-theme')).toBeNull();
    expect(THEME_IDS).toContain('midnight');
  });

  it('reads aliased stored values as canonical ids', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('midnight');
    expect(resolveInitialTheme()).toBe('midnight');
  });

  it('applies and persists theme', () => {
    applyTheme('obsidian');
    expect(document.documentElement.dataset.theme).toBe('obsidian');
    persistTheme('obsidian');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('obsidian');
  });
});
