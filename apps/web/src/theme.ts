/** Canonical theme ids from mkronvold/themes (brightest → darkest). */
export const THEME_IDS = [
  'sunshower',
  'light',
  'sepia',
  'summer',
  'autumn-light',
  'spring',
  'coyote',
  'autumn',
  'coyote-dark',
  'pine',
  'ocean',
  'forest',
  'guinness',
  'midnight',
  'obsidian',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** @deprecated Use ThemeId — kept for call-site clarity. */
export type Theme = ThemeId;

export const THEME_STORAGE_KEY = 'speedify-status.theme';

export const THEME_LABELS: Record<ThemeId, string> = {
  sunshower: 'Sunshower',
  light: 'Light',
  sepia: 'Sepia',
  summer: 'Summer',
  'autumn-light': 'Autumn Light',
  spring: 'Spring',
  coyote: 'Coyote',
  autumn: 'Autumn',
  'coyote-dark': 'Coyote Dark',
  pine: 'Pine',
  ocean: 'Ocean',
  forest: 'Forest',
  guinness: 'Guinness',
  midnight: 'Midnight',
  obsidian: 'Obsidian',
};

/** Legacy / alternate ids accepted from storage, normalized to canonical ids. */
export const THEME_ALIASES: Record<string, ThemeId> = {
  dark: 'midnight',
  dawn: 'light',
  linen: 'sepia',
  mist: 'coyote',
  'coyote-medium': 'coyote',
  'summer-nights': 'coyote',
  'winter-nights': 'ocean',
};

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

export function normalizeThemeId(raw: string | null | undefined): ThemeId | null {
  if (!raw) return null;
  if (isThemeId(raw)) return raw;
  return THEME_ALIASES[raw] ?? null;
}

export function systemTheme(): ThemeId {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'midnight';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'midnight';
}

export function readStoredTheme(): ThemeId | null {
  try {
    return normalizeThemeId(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // ignore quota / private mode
  }
  return null;
}

export function resolveInitialTheme(): ThemeId {
  return readStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}

export function persistTheme(theme: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore quota / private mode
  }
}
