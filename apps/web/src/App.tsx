import { useQuery } from '@tanstack/react-query';
import { QUERY_WINDOWS, type AdapterStatus, type QueryWindow } from '@speedify-status/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHealth, fetchStatus } from './api/client';
import { formatAdapterName, formatAge, formatMbps, formatMs } from './components/format';
import {
  THEME_IDS,
  THEME_LABELS,
  applyTheme,
  persistTheme,
  resolveInitialTheme,
  type ThemeId,
} from './theme';

const WINDOWS: QueryWindow[] = [...QUERY_WINDOWS];

const DISPLAY_REFRESH_OPTIONS = [
  { id: 'pause', label: 'Pause', ms: null as number | null },
  { id: '1s', label: '1s', ms: 1_000 },
  { id: '5s', label: '5s', ms: 5_000 },
  { id: '30s', label: '30s', ms: 30_000 },
  { id: '1m', label: '1m', ms: 60_000 },
] as const;

type DisplayRefreshId = (typeof DISPLAY_REFRESH_OPTIONS)[number]['id'];
type SortKey =
  | 'name'
  | 'state'
  | 'priority'
  | 'latNow'
  | 'latAvg'
  | 'latMax'
  | 'dlNow'
  | 'dlAvg'
  | 'dlMax'
  | 'ulNow'
  | 'ulAvg'
  | 'ulMax';
type SortDir = 'asc' | 'desc';

const WINDOW_KEY = 'speedify-status.window';
const REFRESH_KEY = 'speedify-status.refresh';
const SETTINGS_OPEN_KEY = 'speedify-status.settingsOpen';

function loadWindow(): QueryWindow {
  try {
    const raw = localStorage.getItem(WINDOW_KEY);
    if (raw && (WINDOWS as string[]).includes(raw)) return raw as QueryWindow;
  } catch {
    // ignore
  }
  return '30s';
}

function loadRefresh(): DisplayRefreshId {
  try {
    const raw = localStorage.getItem(REFRESH_KEY);
    if (raw && DISPLAY_REFRESH_OPTIONS.some((o) => o.id === raw)) {
      return raw as DisplayRefreshId;
    }
  } catch {
    // ignore
  }
  return '5s';
}

function loadSettingsOpen(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_OPEN_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // ignore
  }
  return false;
}

function GearIcon() {
  return (
    <svg
      className="settings-gear-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  );
}

function sortValue(row: AdapterStatus, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return formatAdapterName(row.id, row.name).toLowerCase();
    case 'state':
      return row.state.toLowerCase();
    case 'priority':
      return row.workingPriority || row.priority;
    case 'latNow':
      return row.latencyMs.now ?? Number.POSITIVE_INFINITY;
    case 'latAvg':
      return row.latencyMs.avg ?? Number.POSITIVE_INFINITY;
    case 'latMax':
      return row.latencyMs.max ?? Number.POSITIVE_INFINITY;
    case 'dlNow':
      return row.dlMbps.now ?? -1;
    case 'dlAvg':
      return row.dlMbps.avg ?? -1;
    case 'dlMax':
      return row.dlMbps.max ?? -1;
    case 'ulNow':
      return row.ulMbps.now ?? -1;
    case 'ulAvg':
      return row.ulMbps.avg ?? -1;
    case 'ulMax':
      return row.ulMbps.max ?? -1;
    default:
      return 0;
  }
}

function stateClass(state: string): string {
  const s = state.toLowerCase();
  if (s.includes('connect') && !s.includes('disconnect')) return 'connected';
  if (s.includes('disconnect') || s.includes('offline') || s.includes('dead'))
    return 'disconnected';
  return '';
}

export function App() {
  const [window, setWindow] = useState<QueryWindow>(loadWindow);
  const [refreshId, setRefreshId] = useState<DisplayRefreshId>(loadRefresh);
  const [theme, setTheme] = useState<ThemeId>(() => resolveInitialTheme());
  const [settingsOpen, setSettingsOpen] = useState<boolean>(loadSettingsOpen);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const onThemeChange = useCallback((next: ThemeId) => {
    persistTheme(next);
    applyTheme(next);
    setTheme(next);
  }, []);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(SETTINGS_OPEN_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const refreshMs = DISPLAY_REFRESH_OPTIONS.find((o) => o.id === refreshId)?.ms ?? 5_000;

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: refreshMs === null ? false : refreshMs,
    retry: 1,
  });

  const statusQuery = useQuery({
    queryKey: ['status', window],
    queryFn: () => fetchStatus(window),
    refetchInterval: refreshMs === null ? false : refreshMs,
    retry: 1,
  });

  const rows = useMemo(() => {
    const adapters = statusQuery.data?.adapters ?? [];
    const sorted = [...adapters].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [statusQuery.data, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'state' || key === 'priority' ? 'asc' : 'desc');
    }
  };

  const th = (key: SortKey, label: string, numeric = false) => (
    <th
      key={key}
      className={`${numeric ? 'num ' : ''}${sortKey === key ? 'sorted' : ''}`.trim()}
      onClick={() => onSort(key)}
      title="Sort"
    >
      {label}
      {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const thMetric = (key: SortKey, main: string, unit: string) => (
    <th
      key={key}
      className={`num${sortKey === key ? ' sorted' : ''}`}
      onClick={() => onSort(key)}
      title="Sort"
    >
      <span className="th-lines">
        <span className="th-main">
          {main}
          {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
        </span>
        <span className="th-unit">{unit}</span>
      </span>
    </th>
  );

  const age = statusQuery.data?.lastSampleAgeMs ?? healthQuery.data?.lastSampleAgeMs ?? null;
  const healthOk = healthQuery.isSuccess;
  const state = statusQuery.data?.state;
  const server = statusQuery.data?.server?.friendlyName ?? statusQuery.data?.server?.tag;

  return (
    <div className="app">
      <header className="hero">
        <div className="title-row">
          <h1>Speedify Status</h1>
          <button
            type="button"
            className={`settings-toggle${settingsOpen ? ' active' : ''}`}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-controls="settings-panel"
            onClick={toggleSettings}
          >
            <GearIcon />
          </button>
        </div>
        {settingsOpen ? (
          <div id="settings-panel" className="hero-controls">
            <div className="control theme-control">
              <label className="control-label" htmlFor="theme-select">
                Theme
              </label>
              <select
                id="theme-select"
                className="theme-select"
                value={theme}
                aria-label="Color theme"
                onChange={(event) => onThemeChange(event.target.value as ThemeId)}
              >
                {THEME_IDS.map((id) => (
                  <option key={id} value={id}>
                    {THEME_LABELS[id]}
                  </option>
                ))}
              </select>
            </div>
            <div className="control">
              <p className="control-label">Window</p>
              <div className="toggle" role="group" aria-label="Query window">
                {WINDOWS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={window === w ? 'active' : ''}
                    onClick={() => {
                      setWindow(w);
                      try {
                        localStorage.setItem(WINDOW_KEY, w);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div className="control">
              <p className="control-label">Refresh</p>
              <div className="toggle" role="group" aria-label="Display refresh">
                {DISPLAY_REFRESH_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={refreshId === o.id ? 'active' : ''}
                    onClick={() => {
                      setRefreshId(o.id);
                      try {
                        localStorage.setItem(REFRESH_KEY, o.id);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="meta-line">
        <span className={healthOk ? 'ok' : healthQuery.isError ? 'err' : 'warn'}>
          API {healthOk ? 'ok' : healthQuery.isError ? 'down' : '…'}
        </span>
        <span>Last sample: {formatAge(age)}</span>
        {state ? <span>Speedify: {state}</span> : null}
        {server ? <span>Server: {server}</span> : null}
        {statusQuery.isFetching ? <span className="muted">updating…</span> : null}
        {statusQuery.isError ? <span className="err">status error</span> : null}
      </div>

      <div className="panel">
        {rows.length === 0 ? (
          <div className="empty">
            {statusQuery.isLoading ? 'Loading…' : 'No adapter samples yet. Start the gw0 agent.'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {th('name', 'Name')}
                {th('state', 'State')}
                {th('priority', 'Priority')}
                {thMetric('latNow', 'ping now', 'ms')}
                {thMetric('latAvg', 'avg', 'ms')}
                {thMetric('latMax', 'max', 'ms')}
                {thMetric('dlNow', 'dl now', 'mbps')}
                {thMetric('dlAvg', 'avg', 'mbps')}
                {thMetric('dlMax', 'max', 'mbps')}
                {thMetric('ulNow', 'ul now', 'mbps')}
                {thMetric('ulAvg', 'avg', 'mbps')}
                {thMetric('ulMax', 'max', 'mbps')}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td title={`id: ${row.id}`}>{formatAdapterName(row.id, row.name)}</td>
                  <td>
                    <span className={`badge ${stateClass(row.state)}`}>{row.state}</span>
                  </td>
                  <td title={`configured: ${row.priority}`}>
                    {row.workingPriority || row.priority}
                  </td>
                  <td className="num">{formatMs(row.latencyMs.now)}</td>
                  <td className="num">{formatMs(row.latencyMs.avg)}</td>
                  <td className="num">{formatMs(row.latencyMs.max)}</td>
                  <td className="num">{formatMbps(row.dlMbps.now)}</td>
                  <td className="num">{formatMbps(row.dlMbps.avg)}</td>
                  <td className="num">{formatMbps(row.dlMbps.max)}</td>
                  <td className="num">{formatMbps(row.ulMbps.now)}</td>
                  <td className="num">{formatMbps(row.ulMbps.avg)}</td>
                  <td className="num">{formatMbps(row.ulMbps.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="footer">
        Window {window} · ping ms · rates Mbps · sha {import.meta.env.VITE_GIT_SHA ?? 'dev'}
      </p>
    </div>
  );
}
