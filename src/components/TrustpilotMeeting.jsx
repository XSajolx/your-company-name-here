// TrustpilotMeeting.jsx
// Ports /backend/trustpilot/public/meeting.js as a native React component.
// Fetches CSV dataset from /tp/api/meeting/dataset, parses client-side, and
// renders a full filter/chart/table dashboard. Requires auth for all API calls.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------- constants
const LS_KEY = 'tp-meeting-csv-v2';
const PAGE_SIZE = 15;

const OUTCOME_LABEL = {
  removed: 'Removed',
  updated: 'Rating updated',
  not_removed: 'Not removed',
  pending: 'In progress',
};
const OUTCOME_COLOR = {
  removed: '#2f9e6f',
  updated: '#d9a13a',
  not_removed: '#d1495b',
  pending: '#8b92a0',
};

// ---------------------------------------------------------------- style tokens
const C = {
  bg: '#0f1117',
  surface: '#1a1d23',
  surface2: '#22262e',
  border: '#2a2e38',
  accent: '#2f9e6f',
  bad: '#d1495b',
  amber: '#d9a13a',
  muted: '#8b92a0',
  text: '#e8eaf0',
  textDim: '#c4c9d4',
  inputBg: '#13161c',
};

// ---------------------------------------------------------------- CSV parsing (RFC-4180)
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function resolveCols(header) {
  const h = header.map(x => (x || '').trim());
  const find = (...names) => {
    for (const n of names) {
      const i = h.findIndex(x => x.toLowerCase() === n.toLowerCase());
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    date: find('date'),
    name: find('name'),
    email: find('email'),
    login: find('login'),
    country: find('country'),
    description: find('description'),
    link: find('link'),
    issues: find('issue_catagory', 'issue_category'),
    star: find('reveiew_star', 'review_star', 'star'),
    status: find('current_status'),
    category: find('catagory', 'category'),
    finalStatus: find('final_status'),
    cexSummary: find('CEX Issue Summery', 'CEX Issue Summary'),
    commFinal: h.reduce((acc, x, i) => (x === 'Final Status' ? i : acc), -1),
    trmSummary: find('TRM Issue Summery', 'TRM Issue Summary'),
    cpmSummary: find('CPM Issue Summery', 'CPM Issue Summary'),
  };
}

const cleanStr = v => (v == null ? '' : String(v).trim());
const padN = n => String(n).padStart(2, '0');

function parseDate(s) {
  const m = cleanStr(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, d, y] = m;
  y = y.length === 2 ? 2000 + +y : +y;
  const dt = new Date(y, +mo - 1, +d);
  if (isNaN(dt)) return null;
  return { iso: `${y}-${padN(+mo)}-${padN(+d)}`, time: dt.getTime(), ym: `${y}-${padN(+mo)}` };
}

function outcomeOf(finalStatus) {
  const s = cleanStr(finalStatus).toLowerCase();
  if (!s) return 'pending';
  if (s === 'not removed') return 'not_removed';
  if (s.startsWith('updated to')) return 'updated';
  if (s.includes('removed')) return 'removed';
  return 'pending';
}

function toRecord(row, c) {
  const g = i => (i >= 0 ? cleanStr(row[i]) : '');
  const finalStatus = g(c.finalStatus);
  const issuesRaw = g(c.issues);
  return {
    date: parseDate(g(c.date)),
    name: g(c.name),
    email: g(c.email),
    login: g(c.login),
    country: g(c.country) || 'Unknown',
    description: g(c.description),
    link: g(c.link),
    issues: issuesRaw ? issuesRaw.split(',').map(x => x.trim()).filter(Boolean) : [],
    star: parseInt(g(c.star), 10) || null,
    status: g(c.status) || '—',
    category: g(c.category) || 'Undefined',
    finalStatus,
    outcome: outcomeOf(finalStatus),
    cexSummary: g(c.cexSummary),
    trmSummary: g(c.trmSummary),
    cpmSummary: g(c.cpmSummary),
  };
}

function buildRecords(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const cols = resolveCols(rows[0]);
  return rows.slice(1)
    .filter(r => r.some(x => x && x.trim()))
    .map(r => toRecord(r, cols))
    .filter(r => r.link || r.description);
}

// ---------------------------------------------------------------- localStorage cache
function readCache() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
}
function writeCache(text, meta) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ text, meta })); }
  catch (e) { console.warn('Could not cache CSV locally:', e); }
}

// ---------------------------------------------------------------- aggregation
function tally(records, keyFn) {
  const m = new Map();
  for (const r of records) {
    const keys = keyFn(r);
    for (const k of (Array.isArray(keys) ? keys : [keys])) {
      if (k == null || k === '') continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function monthlyTrend(records) {
  const m = new Map();
  for (const r of records) if (r.date) m.set(r.date.ym, (m.get(r.date.ym) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, count]) => ({ ym, count }));
}

// ---------------------------------------------------------------- formatting
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[+m - 1]} ${y}`;
}
const pctCalc = (n, d) => (d ? Math.round((n / d) * 100) : 0);

// ---------------------------------------------------------------- applyFilters (pure)
function applyFilters(all, F) {
  const q = F.q.toLowerCase();
  return all.filter(r => {
    if (F.from && (!r.date || r.date.iso < F.from)) return false;
    if (F.to && (!r.date || r.date.iso > F.to)) return false;
    if (F.star && r.star !== +F.star) return false;
    if (F.country && r.country !== F.country) return false;
    if (F.category && r.category !== F.category) return false;
    if (F.issue && !r.issues.includes(F.issue)) return false;
    if (F.status && r.status !== F.status) return false;
    if (F.outcome && r.outcome !== F.outcome) return false;
    if (q) {
      const hay = [r.name, r.email, r.description, r.cexSummary, r.trmSummary, r.cpmSummary, r.category, r.issues.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- TrendSVG
function TrendSVG({ points }) {
  if (!points.length) {
    return <div style={{ padding: '20px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>No dated reviews in range.</div>;
  }
  const W = 720, H = 220, PL = 44, PR = 12, PT = 16, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = Math.max(...points.map(p => p.count), 1);
  const n = points.length;
  const x = i => PL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = v => PT + ih - (v / max) * ih;
  const lineD = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(' ');
  const areaD = `${lineD} L${x(n - 1).toFixed(1)},${(PT + ih).toFixed(1)} L${x(0).toFixed(1)},${(PT + ih).toFixed(1)} Z`;
  const ticks = 4;
  const yGridLines = Array.from({ length: ticks + 1 }, (_, i) => ({
    v: Math.round((max / ticks) * i),
    yy: y(Math.round((max / ticks) * i)),
  }));
  const step = Math.ceil(n / 8);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', minWidth: 400, height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="tp-mg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f9e6f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2f9e6f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yGridLines.map(({ v, yy }, i) => (
          <g key={i}>
            <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="#2a2e38" strokeWidth="1" />
            <text x={PL - 6} y={yy + 4} fontSize="10" fill="#8b92a0" textAnchor="end">{v}</text>
          </g>
        ))}
        <path d={areaD} fill="url(#tp-mg)" />
        <path d={lineD} fill="none" stroke="#2f9e6f" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <React.Fragment key={i}>
            {(i % step === 0 || i === n - 1) && (
              <text x={x(i).toFixed(1)} y={H - 10} fontSize="10" fill="#8b92a0" textAnchor="middle">{p.ym.slice(2)}</text>
            )}
            <circle cx={x(i).toFixed(1)} cy={y(p.count).toFixed(1)} r="2.5" fill="#2f9e6f">
              <title>{p.ym}: {p.count}</title>
            </circle>
          </React.Fragment>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- BarList
function BarList({ items, max = 12, color = '#2f9e6f', activeVal, onFilter }) {
  const top = items.slice(0, max);
  if (!top.length) return <div style={{ padding: '12px 0', color: C.muted, fontSize: 13 }}>No data.</div>;
  const hi = Math.max(...top.map(i => i.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {top.map(it => {
        const w = Math.max(2, (it.count / hi) * 100);
        const clr = typeof color === 'function' ? color(it.filterVal ?? it.label) : color;
        const isActive = activeVal != null && activeVal === (it.filterVal ?? it.label);
        return (
          <button
            key={it.label}
            onClick={() => onFilter && onFilter(it.filterVal ?? it.label)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: isActive ? '#1e2a24' : 'transparent',
              border: `1px solid ${isActive ? C.accent : 'transparent'}`,
              borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
              textAlign: 'left', width: '100%',
            }}
          >
            <span style={{ fontSize: 12, color: C.textDim, minWidth: 0, flex: '0 0 auto', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</span>
            <span style={{ flex: 1, height: 6, background: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${w}%`, height: '100%', background: clr, borderRadius: 3 }} />
            </span>
            <span style={{ fontSize: 12, color: C.muted, flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{it.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Pagination
function Pager({ page, pageCount, onPage }) {
  const btn = (p, label, disabled, active) => (
    <button key={label + p}
      onClick={() => !disabled && onPage(p)}
      disabled={disabled}
      style={{
        padding: '5px 10px', borderRadius: 5, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? C.accent : C.surface2, color: active ? '#fff' : C.textDim,
        border: `1px solid ${active ? C.accent : C.border}`, opacity: disabled ? 0.4 : 1,
      }}
    >{label}</button>
  );
  const around = [];
  const start = Math.max(1, page - 2), end = Math.min(pageCount, page + 2);
  if (start > 1) { around.push(btn(1, '1', false, false)); if (start > 2) around.push(<span key="gap1" style={{ color: C.muted, padding: '0 4px' }}>…</span>); }
  for (let p = start; p <= end; p++) around.push(btn(p, String(p), false, p === page));
  if (end < pageCount) { if (end < pageCount - 1) around.push(<span key="gap2" style={{ color: C.muted, padding: '0 4px' }}>…</span>); around.push(btn(pageCount, String(pageCount), false, false)); }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '16px 0 4px', flexWrap: 'wrap' }}>
      {btn(page - 1, '‹ Prev', page === 1, false)}
      {around}
      {btn(page + 1, 'Next ›', page === pageCount, false)}
    </div>
  );
}

// ---------------------------------------------------------------- main component
export default function TrustpilotMeeting() {
  const { session } = useAuth();
  const [allRecords, setAllRecords] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ from: '', to: '', star: '', country: '', category: '', issue: '', status: '', outcome: '', q: '' });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const tableRef = useRef(null);
  const searchTimer = useRef(null);
  const fileInputTopRef = useRef(null);
  const fileInputHeroRef = useRef(null);

  const token = session?.access_token;
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  // ---- load shared dataset
  const loadShared = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cache = readCache();
    let serverMeta;
    try {
      const r = await fetch('/tp/api/meeting/dataset/meta', { cache: 'no-store', headers: authHeader });
      serverMeta = (await r.json()).meta;
    } catch (e) {
      if (cache && cache.text) {
        setAllRecords(buildRecords(cache.text));
        setMeta(cache.meta);
        setLoading(false);
        return;
      }
      setError(e.message || 'Network error');
      setLoading(false);
      return;
    }

    if (!serverMeta) { setLoading(false); return; }

    if (cache && cache.text && cache.meta && cache.meta.uploadedAt === serverMeta.uploadedAt) {
      setAllRecords(buildRecords(cache.text));
      setMeta({ ...serverMeta, shared: true });
      setLoading(false);
      return;
    }

    try {
      const r2 = await fetch('/tp/api/meeting/dataset', { cache: 'no-store', headers: authHeader });
      const ds = (await r2.json()).dataset;
      if (!ds || !ds.content) { setLoading(false); return; }
      const recs = buildRecords(ds.content);
      const m = { filename: ds.filename, count: ds.count ?? recs.length, uploadedAt: ds.uploadedAt, uploadedBy: ds.uploadedBy, shared: true };
      setAllRecords(recs);
      setMeta(m);
      writeCache(ds.content, m);
    } catch (e) {
      setError(e.message || 'Failed to fetch dataset');
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) loadShared();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---- debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, q: searchInput }));
      setPage(1);
    }, 220);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  // ---- filter helpers
  const setFilter = useCallback((key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ from: '', to: '', star: '', country: '', category: '', issue: '', status: '', outcome: '', q: '' });
    setSearchInput('');
    setPage(1);
  }, []);

  // ---- file upload
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    let text, recs;
    try {
      text = await file.text();
      recs = buildRecords(text);
    } catch (err) {
      alert('Could not parse that file: ' + err.message);
      return;
    }
    if (!recs.length) {
      alert('No review rows found in that CSV. Check that it\'s the TP Meeting Review Details export.');
      return;
    }
    setUploadStatus(`Publishing ${recs.length.toLocaleString()} reviews to the shared store…`);
    try {
      const res = await fetch('/tp/api/meeting/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ filename: file.name, content: text, count: recs.length }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const m = { filename: file.name, count: recs.length, uploadedAt: j.meta?.uploadedAt, uploadedBy: j.meta?.uploadedBy, shared: true };
      setAllRecords(recs);
      setMeta(m);
      writeCache(text, m);
      setFilters({ from: '', to: '', star: '', country: '', category: '', issue: '', status: '', outcome: '', q: '' });
      setSearchInput('');
      setPage(1);
      setUploadStatus('');
    } catch (err) {
      console.error(err);
      setUploadStatus('');
      alert('File parsed OK, but saving to the shared store failed: ' + err.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---- computed data
  const filteredRows = useMemo(() => applyFilters(allRecords, filters), [allRecords, filters]);

  const {
    total, stars1, stars2, removed, updated, notRemoved, pending, decided, successRate, openOutreach,
    countryOpts, categoryOpts, issueOpts, statusOpts,
    trend, catBars, issueBars, countryBars, statusBars, outcomeBars,
    pageCount, slice,
  } = useMemo(() => {
    const total = filteredRows.length;
    const stars1 = filteredRows.filter(r => r.star === 1).length;
    const stars2 = filteredRows.filter(r => r.star === 2).length;
    const removed = filteredRows.filter(r => r.outcome === 'removed').length;
    const updated = filteredRows.filter(r => r.outcome === 'updated').length;
    const notRemoved = filteredRows.filter(r => r.outcome === 'not_removed').length;
    const pending = filteredRows.filter(r => r.outcome === 'pending').length;
    const decided = removed + updated + notRemoved;
    const successRate = pctCalc(removed + updated, decided);
    const openOutreach = filteredRows.filter(r => /reach out/i.test(r.status)).length;

    const countryOpts = tally(allRecords, r => r.country).map(i => i.label);
    const categoryOpts = tally(allRecords, r => r.category).map(i => i.label);
    const issueOpts = tally(allRecords, r => r.issues).map(i => i.label);
    const statusOpts = tally(allRecords, r => r.status).map(i => i.label);

    const trend = monthlyTrend(filteredRows);
    const catBars = tally(filteredRows, r => r.category);
    const issueBars = tally(filteredRows, r => r.issues);
    const countryBars = tally(filteredRows, r => (r.country === 'Unknown' ? null : r.country));
    const statusBars = tally(filteredRows, r => (r.status === '—' ? null : r.status));
    const outcomeBars = ['removed', 'updated', 'not_removed', 'pending']
      .map(o => ({ label: OUTCOME_LABEL[o], filterVal: o, count: filteredRows.filter(r => r.outcome === o).length }))
      .filter(x => x.count > 0);

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const slice = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    return { total, stars1, stars2, removed, updated, notRemoved, pending, decided, successRate, openOutreach, countryOpts, categoryOpts, issueOpts, statusOpts, trend, catBars, issueBars, countryBars, statusBars, outcomeBars, pageCount, slice };
  }, [filteredRows, allRecords, page]);

  const metaLine = useMemo(() => {
    if (!meta) return '';
    const when = meta.uploadedAt ? fmtDate(String(meta.uploadedAt).slice(0, 10)) : null;
    return [
      meta.filename ? `${meta.filename} · ` : '',
      `${allRecords.length.toLocaleString()} reviews`,
      when ? ` · uploaded ${when}` : '',
      meta.uploadedBy ? ` by ${meta.uploadedBy}` : '',
      ' · shared with everyone',
    ].join('');
  }, [meta, allRecords.length]);

  // ---- styles helpers
  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 };
  const cardHead = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: `1px solid ${C.border}` };
  const inputStyle = { background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 13, width: '100%', outline: 'none' };
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.muted, fontWeight: 600 };

  // ---- render: empty / error / loading states
  if (!token) {
    return (
      <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...card, padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <h2 style={{ margin: '0 0 8px', color: C.text }}>Authentication required</h2>
          <p style={{ color: C.muted, margin: 0 }}>Please sign in to access this page.</p>
        </div>
      </div>
    );
  }

  // ---- render: toolbar (always shown)
  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 12, color: C.muted, flex: 1, minWidth: 0 }}>
        {uploadStatus || metaLine || (loading ? '' : allRecords.length === 0 ? 'No dataset uploaded yet' : '')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: C.textDim, fontWeight: 600 }}>
          ↑ Upload CSV
          <input ref={fileInputTopRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </label>
        <button onClick={loadShared} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: C.textDim, fontWeight: 600 }}>
          ↻ Refresh
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 32px' }}>
        {toolbar}
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
          <h2 style={{ margin: 0, color: C.text }}>Loading the shared dataset…</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 32px' }}>
        {toolbar}
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', color: C.text }}>Couldn't load the shared dataset</h2>
          <p style={{ color: C.muted, marginBottom: 20 }}>{error}</p>
          <label style={{ display: 'inline-flex', alignItems: 'center', background: C.accent, borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 700 }}>
            Upload a CSV
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </label>
        </div>
      </div>
    );
  }

  if (allRecords.length === 0) {
    return (
      <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 32px' }}>
        {toolbar}
        <div style={{ ...card, padding: 48, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
          <h2 style={{ margin: '0 0 12px', color: C.text }}>Upload the TP Meeting Review Details CSV</h2>
          <p style={{ color: C.muted, marginBottom: 24, lineHeight: 1.6, fontSize: 14 }}>
            Export the shared "Trustpilot Flagging &amp; Moderation — TP Meeting Review Details" sheet as CSV, then choose it here.
            It is saved to the shared store, so <strong style={{ color: C.textDim }}>everyone</strong> sees this dataset until someone uploads a newer one.
          </p>
          <label style={{ display: 'inline-flex', alignItems: 'center', background: C.accent, borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontSize: 14, color: '#fff', fontWeight: 700 }}>
            Choose CSV file
            <input ref={fileInputHeroRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </label>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- full dashboard
  const safePage = Math.min(page, pageCount);

  const filterBar = (
    <div style={{ ...card, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={labelStyle}>
          <span>From</span>
          <input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} style={{ ...inputStyle, width: 140 }} />
        </label>
        <label style={labelStyle}>
          <span>To</span>
          <input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} style={{ ...inputStyle, width: 140 }} />
        </label>
        <label style={labelStyle}>
          <span>Star</span>
          <select value={filters.star} onChange={e => setFilter('star', e.target.value)} style={{ ...inputStyle, width: 110 }}>
            <option value="">All stars</option>
            <option value="1">1 ★</option>
            <option value="2">2 ★</option>
          </select>
        </label>
        {[
          { key: 'country', label: 'Country', opts: countryOpts },
          { key: 'category', label: 'Category', opts: categoryOpts },
          { key: 'issue', label: 'Issue tag', opts: issueOpts },
          { key: 'status', label: 'Status', opts: statusOpts },
        ].map(({ key, label, opts }) => (
          <label key={key} style={labelStyle}>
            <span>{label}</span>
            <select value={filters[key]} onChange={e => setFilter(key, e.target.value)} style={{ ...inputStyle, width: 150 }}>
              <option value="">All {label.toLowerCase()}s</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
        <label style={labelStyle}>
          <span>Outcome</span>
          <select value={filters.outcome} onChange={e => setFilter('outcome', e.target.value)} style={{ ...inputStyle, width: 150 }}>
            <option value="">All outcomes</option>
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: 1, minWidth: 180 }}>
          <span>Search</span>
          <input type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="name, email, complaint text…" style={inputStyle} />
        </label>
        <button onClick={resetFilters} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: C.muted, alignSelf: 'flex-end', height: 34 }}>
          Reset
        </button>
      </div>
    </div>
  );

  const kpiBlock = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 20 }}>
      {[
        { label: 'Reviews (filtered)', value: total.toLocaleString(), sub: `${stars1} × 1★ · ${stars2} × 2★`, color: C.text },
        { label: 'Removed / updated', value: (removed + updated).toLocaleString(), sub: `${removed} removed · ${updated} re-rated`, color: C.accent },
        { label: 'Not removed', value: notRemoved.toLocaleString(), sub: 'TP declined / kept', color: C.bad },
        { label: 'Success rate', value: `${successRate}%`, sub: `of ${decided} decided`, color: C.text },
        { label: 'Awaiting outreach', value: openOutreach.toLocaleString(), sub: `${pending} pending outcome`, color: C.amber },
      ].map(kpi => (
        <div key={kpi.label} style={{ ...card, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{kpi.label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color, marginBottom: 4 }}>{kpi.value}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{kpi.sub}</div>
        </div>
      ))}
    </div>
  );

  const chartsBlock = (
    <>
      <div style={{ ...card, padding: 0, marginBottom: 20 }}>
        <div style={cardHead}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Issue volume over time</h2>
          <span style={{ fontSize: 12, color: C.muted }}>reviews logged per month</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <TrendSVG points={trend} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={{ ...card, padding: 0 }}>
          <div style={cardHead}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Top categories</h2>
            <span style={{ fontSize: 12, color: C.muted }}>click to filter</span>
          </div>
          <div style={{ padding: '12px 18px' }}>
            <BarList items={catBars} filterKey="category" activeVal={filters.category} onFilter={v => setFilter('category', filters.category === v ? '' : v)} />
          </div>
        </div>
        <div style={{ ...card, padding: 0 }}>
          <div style={cardHead}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Moderation outcome</h2>
            <span style={{ fontSize: 12, color: C.muted }}>click to filter</span>
          </div>
          <div style={{ padding: '12px 18px' }}>
            <BarList
              items={outcomeBars}
              color={it => OUTCOME_COLOR[it] || C.accent}
              activeVal={filters.outcome}
              onFilter={v => setFilter('outcome', filters.outcome === v ? '' : v)}
            />
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={{ ...card, padding: 0 }}>
          <div style={cardHead}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Top issue tags</h2>
            <span style={{ fontSize: 12, color: C.muted }}>CEX-tagged pain points · click to filter</span>
          </div>
          <div style={{ padding: '12px 18px' }}>
            <BarList items={issueBars} color="#7c6df6" activeVal={filters.issue} onFilter={v => setFilter('issue', filters.issue === v ? '' : v)} />
          </div>
        </div>
        <div style={{ ...card, padding: 0 }}>
          <div style={cardHead}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Top countries</h2>
            <span style={{ fontSize: 12, color: C.muted }}>click to filter</span>
          </div>
          <div style={{ padding: '12px 18px' }}>
            <BarList items={countryBars} color={C.accent} activeVal={filters.country} onFilter={v => setFilter('country', filters.country === v ? '' : v)} />
          </div>
        </div>
      </div>
      <div style={{ ...card, padding: 0, marginBottom: 20 }}>
        <div style={cardHead}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Handling status pipeline</h2>
          <span style={{ fontSize: 12, color: C.muted }}>where each review stands · click to filter</span>
        </div>
        <div style={{ padding: '12px 18px' }}>
          <BarList items={statusBars} color="#3d8bff" activeVal={filters.status} onFilter={v => setFilter('status', filters.status === v ? '' : v)} />
        </div>
      </div>
    </>
  );

  const thStyle = { padding: '9px 12px', background: '#1a1d23', color: C.muted, fontWeight: 600, fontSize: 12, textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 12px', fontSize: 13, color: C.textDim, borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' };

  const tableBlock = (
    <div style={{ ...card, padding: 0 }}>
      <div style={cardHead}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
          Reviews <span style={{ color: C.muted, fontWeight: 400 }}>({total.toLocaleString()})</span>
        </h2>
        <span style={{ fontSize: 12, color: C.muted }}>page {safePage} / {pageCount}</span>
      </div>
      <div ref={tableRef} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 42 }} />
            <col style={{ width: 140 }} />
            <col style={{ minWidth: 200 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr>
              {['Date', 'Customer', 'Country', '★', 'Category', 'Complaint', 'Status', 'Outcome', ''].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0
              ? (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', padding: 32, color: C.muted }}>
                    No reviews match the current filters.
                  </td>
                </tr>
              )
              : slice.map((r, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? 'transparent' : '#151820' }}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(r.date && r.date.iso)}</td>
                  <td style={tdStyle}>
                    <div style={{ color: C.text, fontWeight: 500 }}>{r.name || '—'}</div>
                    {r.email && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{r.email}</div>}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r.country}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#f5c518', fontWeight: 700 }}>{r.star ? `${r.star}★` : '—'}</td>
                  <td style={tdStyle}>
                    <div style={{ color: C.textDim }}>{r.category}</div>
                    {r.issues.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {r.issues.slice(0, 3).map(t => (
                          <span key={t} style={{ fontSize: 10, background: '#272c3a', color: C.muted, borderRadius: 4, padding: '2px 6px' }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 260 }}>
                    <div style={{ color: C.textDim, lineHeight: 1.5, wordBreak: 'break-word' }}>{r.description || '—'}</div>
                    {r.cexSummary && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        <strong>CEX:</strong> {r.cexSummary}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: 12 }}>{r.status}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                      background: `${OUTCOME_COLOR[r.outcome]}22`, color: OUTCOME_COLOR[r.outcome],
                      border: `1px solid ${OUTCOME_COLOR[r.outcome]}44`,
                    }}>
                      {OUTCOME_LABEL[r.outcome]}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {r.link && (
                      <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, fontSize: 16, textDecoration: 'none' }} title="Open on Trustpilot">↗</a>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <Pager page={safePage} pageCount={pageCount} onPage={p => {
          setPage(p);
          tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }} />
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 32px 60px' }}>
      {toolbar}
      {filterBar}
      {kpiBlock}
      {chartsBlock}
      {tableBlock}
    </div>
  );
}
