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

  const age = statusQuery.data?.lastSampleAgeMs ?? healthQuery.data?.lastSampleAgeMs ?? null;
  const healthOk = healthQuery.isSuccess;
  const state = statusQuery.data?.state;
  const server = statusQuery.data?.server?.friendlyName ?? statusQuery.data?.server?.tag;

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">WAN health</p>
          <h1>Speedify Status</h1>
          <p className="subtitle">Per-adapter latency and throughput over a sliding window</p>
        </div>
        <div className="hero-meta">
          <div className="hero-controls">
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
        </div>
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
                {th('latNow', 'Lat now', true)}
                {th('latAvg', 'avg', true)}
                {th('latMax', 'max', true)}
                {th('dlNow', 'DL now', true)}
                {th('dlAvg', 'avg', true)}
                {th('dlMax', 'max', true)}
                {th('ulNow', 'UL now', true)}
                {th('ulAvg', 'avg', true)}
                {th('ulMax', 'max', true)}
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
        Window {window} · latency ms · rates Mbps · sha {import.meta.env.VITE_GIT_SHA ?? 'dev'}
      </p>
    </div>
  );
}
