import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import DateRangePicker from './DateRangePicker';
import {
  BarChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from 'recharts';

// ============ CONSTANTS ============
const API_BASE = '/api';

const COLORS = {
  cardBg: 'rgba(15, 20, 35, 0.5)',
  cardBgGradient: 'rgba(15, 20, 35, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  tableHeaderBg: 'rgba(15, 23, 42, 0.6)',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#8B5CF6',
  indigo: '#8B5CF6',
  cyan: '#8B5CF6',
  pink: '#EC4899',
  sky: '#0EA5E9',
  lime: '#84CC16',
  rose: '#F43F5E',
  rowHover: 'rgba(255, 255, 255, 0.03)',
  tableBorder: 'rgba(255, 255, 255, 0.06)',
};

const CHART_PALETTE = [
  '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#0EA5E9', '#F43F5E', '#84CC16', '#8B5CF6', '#EC4899',
];

// ============ UTILITY FUNCTIONS ============
const fmt = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normDate = (d) => {
  if (!d) return '';
  const parts = d.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return d;
};

const rankColor = (i) => i === 0 ? COLORS.amber : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : COLORS.indigo;

// ============ REUSABLE DARK TOOLTIP ============
const DarkTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: '#1C2128',
      border: '1px solid #30363D',
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '0.78rem',
      color: COLORS.textPrimary,
    }}>
      {label && <div style={{ marginBottom: '6px', fontWeight: 600, color: COLORS.textSecondary }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill }} />
          <span style={{ color: COLORS.textSecondary }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatter ? formatter(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ============ KPI CARD ============
const KPICard = ({ label, value, color, tooltip }) => {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      style={{
        background: COLORS.cardBgGradient,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '16px',
        padding: '18px 20px',
        border: COLORS.border,
        textAlign: 'center',
        position: 'relative',
        cursor: tooltip ? 'help' : 'default',
      }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      {tooltip && showTip && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1C2128',
          color: COLORS.textPrimary,
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '0.72rem',
          lineHeight: 1.5,
          width: 260,
          textAlign: 'left',
          zIndex: 100,
          border: '1px solid #30363D',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
          marginBottom: '8px',
        }}>
          {tooltip}
        </div>
      )}
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: color || COLORS.indigo, lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.72rem',
        color: COLORS.textMuted,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginTop: '4px',
      }}>
        {label}
      </div>
    </div>
  );
};

// ============ SECTION CARD ============
const SectionCard = ({ title, children, style }) => (
  <div style={{
    background: COLORS.cardBgGradient,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '1.5rem',
    border: COLORS.border,
    ...style,
  }}>
    {title && (
      <h3 style={{ color: COLORS.textPrimary, fontSize: '1rem', fontWeight: 600, margin: 0, marginBottom: '1rem' }}>
        {title}
      </h3>
    )}
    {children}
  </div>
);

// ============ RANK TABLE ============
const RankTable = ({ columns, rows, maxHeight }) => {
  const thStyle = {
    textAlign: 'left',
    padding: '8px 10px',
    background: COLORS.tableHeaderBg,
    color: COLORS.textSecondary,
    fontWeight: 700,
    borderBottom: `2px solid ${COLORS.tableBorder}`,
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };
  const tdStyle = {
    padding: '8px 10px',
    borderBottom: `1px solid ${COLORS.tableBorder}`,
    color: COLORS.textSecondary,
    fontSize: '0.82rem',
  };

  return (
    <div style={{ maxHeight: maxHeight || 'none', overflowY: maxHeight ? 'auto' : 'visible', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{ ...thStyle, textAlign: col.align || 'left' }}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ transition: 'background 0.15s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = COLORS.rowHover}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {columns.map((col, ci) => (
                <td key={ci} style={{
                  ...tdStyle,
                  textAlign: col.align || 'left',
                  fontWeight: col.bold ? 700 : 'normal',
                  color: col.color ? col.color(row, ri) : COLORS.textSecondary,
                  maxWidth: col.maxWidth || 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: col.nowrap ? 'nowrap' : 'normal',
                }}>
                  {col.render ? col.render(row, ri) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============ DATE RANGE HELPER ============
function parseDateRange(dateRange) {
  const DHAKA_MS = 6 * 3600000;
  const now = new Date(Date.now() + DHAKA_MS);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (dateRange?.startsWith('custom_')) { const p = dateRange.split('_'); return { from: p[1], to: p[2] }; }
  if (dateRange === 'today') { const d = fmt(today); return { from: d, to: d }; }
  if (dateRange === 'yesterday') { const y = new Date(today); y.setDate(y.getDate()-1); return { from: fmt(y), to: fmt(y) }; }
  if (dateRange === 'this_month') { return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) }; }
  if (dateRange === 'last_month') { const f = new Date(today.getFullYear(), today.getMonth(), 1); const e = new Date(f.getTime()-86400000); return { from: fmt(new Date(e.getFullYear(), e.getMonth(), 1)), to: fmt(e) }; }
  const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90 }[dateRange] || 30;
  const s = new Date(today); s.setDate(s.getDate() - days);
  return { from: fmt(s), to: fmt(today) };
}

// ============ MAIN COMPONENT ============
const SalesDashboardNew = () => {
  const [dateRange, setDateRange] = useState('last_7_days');
  const { from: dateFrom, to: dateTo } = useMemo(() => parseDateRange(dateRange), [dateRange]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [approaches, setApproaches] = useState([]);
  const [sales, setSales] = useState([]);
  const salesFileRef = useRef(null);
  const approachFileRef = useRef(null);

  // ---- Upload CSV handler ----
  const uploadCSV = useCallback(async (file, endpoint, label) => {
    if (!file) return;
    setLoading(true);
    setStatus(`Uploading ${label}: ${file.name}...`);
    setError('');
    try {
      const text = await file.text();
      const resp = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Upload failed');
      setStatus(`${data.inserted} ${label} rows uploaded!`);
      setTimeout(() => setStatus(''), 4000);
      await loadDashboard();
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  // ---- Load dashboard data ----
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = `from=${dateFrom}&to=${dateTo}`;
      const [approachResp, salesResp] = await Promise.all([
        fetch(`${API_BASE}/sales-approach?${params}`),
        fetch(`${API_BASE}/sales-upload?${params}`),
      ]);
      const approachJson = await approachResp.json();
      const salesJson = await salesResp.json();
      if (approachJson.error) throw new Error(approachJson.error);
      if (salesJson.error) throw new Error(salesJson.error);
      setApproaches(approachJson.data || []);
      setSales(salesJson.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  // Auto-load on mount and when date range changes
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // ---- Derived data ----
  const confirmed = useMemo(() => sales.filter(r => r.status && r.status.toLowerCase() === 'enabled'), [sales]);

  const kpis = useMemo(() => {
    const totalApproach = approaches.length;
    const confirmedCount = confirmed.length;
    const confirmRate = totalApproach ? ((confirmedCount / totalApproach) * 100).toFixed(2) : '0.00';
    const totalRevenue = confirmed.reduce((s, r) => s + (parseFloat(r.grand_total) || 0), 0);
    const totalActualSale = confirmed.reduce((s, r) => s + (parseFloat(r.actual_amount_of_sale) || 0), 0);
    const avgOrderValue = confirmedCount ? (totalRevenue / confirmedCount) : 0;
    const uniqueCustomers = new Set(confirmed.map(r => r.customer_email).filter(Boolean)).size;
    const totalDiscount = confirmed.reduce((s, r) => s + (parseFloat(r.discount) || 0), 0);
    return { totalApproach, confirmedCount, confirmRate, totalRevenue, totalActualSale, avgOrderValue, uniqueCustomers, totalDiscount };
  }, [approaches, confirmed]);

  // ---- Media breakdown ----
  const mediaData = useMemo(() => {
    const media = {};
    approaches.forEach(r => {
      const ch = r.channel || 'Unknown';
      if (!media[ch]) media[ch] = { name: ch, approach: 0, confirmed: 0 };
      media[ch].approach++;
    });
    confirmed.forEach(r => {
      const ch = r.communication_platform || 'Unknown';
      if (!media[ch]) media[ch] = { name: ch, approach: 0, confirmed: 0 };
      media[ch].confirmed++;
    });
    const sorted = Object.values(media).sort((a, b) => b.approach - a.approach);
    const totApp = sorted.reduce((s, e) => s + e.approach, 0);
    const totConf = sorted.reduce((s, e) => s + e.confirmed, 0);
    return { rows: sorted, totApp, totConf };
  }, [approaches, confirmed]);

  // ---- Daily trend ----
  const dailyTrendData = useMemo(() => {
    const daily = {};
    approaches.forEach(r => {
      const d = normDate(r.sorted_date);
      if (!daily[d]) daily[d] = { date: d, approaches: 0, confirmed: 0, revenue: 0 };
      daily[d].approaches++;
    });
    confirmed.forEach(r => {
      const d = normDate(r.date);
      if (!daily[d]) daily[d] = { date: d, approaches: 0, confirmed: 0, revenue: 0 };
      daily[d].confirmed++;
      daily[d].revenue += parseFloat(r.grand_total) || 0;
    });
    return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      revenue: +d.revenue.toFixed(2),
    }));
  }, [approaches, confirmed]);

  // ---- Remarks breakdown ----
  const remarksData = useMemo(() => {
    const groups = {};
    confirmed.forEach(r => {
      const key = (r.remarks || 'N/A').trim() || 'N/A';
      if (!groups[key]) groups[key] = { name: key, count: 0, revenue: 0 };
      groups[key].count++;
      groups[key].revenue += parseFloat(r.grand_total) || 0;
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [confirmed]);

  // ---- Agent leaderboard ----
  const agentData = useMemo(() => {
    const approachByAgent = {};
    approaches.forEach(r => {
      const name = r.agent_name || 'Unknown';
      approachByAgent[name] = (approachByAgent[name] || 0) + 1;
    });
    const agents = {};
    confirmed.forEach(r => {
      const name = r.agent_name || 'Unknown';
      if (!agents[name]) agents[name] = { name, count: 0, revenue: 0, actual: 0 };
      agents[name].count++;
      agents[name].revenue += parseFloat(r.grand_total) || 0;
      agents[name].actual += parseFloat(r.actual_amount_of_sale) || 0;
    });
    for (const name of Object.keys(approachByAgent)) {
      if (!agents[name]) agents[name] = { name, count: 0, revenue: 0, actual: 0 };
    }
    const sorted = Object.values(agents).sort((a, b) => b.actual - a.actual);
    return sorted.map(a => ({
      ...a,
      approach: approachByAgent[a.name] || 0,
      rate: (approachByAgent[a.name] || 0) ? ((a.count / (approachByAgent[a.name] || 1)) * 100).toFixed(1) : '0.0',
    }));
  }, [approaches, confirmed]);

  // ---- Country rankings ----
  const countryData = useMemo(() => {
    const countries = {};
    confirmed.forEach(r => {
      const c = r.country || 'Unknown';
      if (!countries[c]) countries[c] = { name: c, count: 0, revenue: 0 };
      countries[c].count++;
      countries[c].revenue += parseFloat(r.grand_total) || 0;
    });
    return Object.values(countries).sort((a, b) => b.revenue - a.revenue);
  }, [confirmed]);

  // ---- Top plans ----
  const planData = useMemo(() => {
    const plans = {};
    confirmed.forEach(r => {
      const p = r.plan_name || 'Unknown';
      if (!plans[p]) plans[p] = { name: p, count: 0, revenue: 0 };
      plans[p].count++;
      plans[p].revenue += parseFloat(r.grand_total) || 0;
    });
    return Object.values(plans).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [confirmed]);

  // ---- Gateway breakdown ----
  const gatewayData = useMemo(() => {
    const gateways = {};
    confirmed.forEach(r => {
      const g = r.gateway || 'Unknown';
      if (!gateways[g]) gateways[g] = { name: g, count: 0, revenue: 0 };
      gateways[g].count++;
      gateways[g].revenue += parseFloat(r.grand_total) || 0;
    });
    return Object.values(gateways).sort((a, b) => b.revenue - a.revenue);
  }, [confirmed]);

  // ---- Platform split ----
  const platformData = useMemo(() => {
    const platforms = {};
    confirmed.forEach(r => {
      const p = r.platform || 'Unknown';
      if (!platforms[p]) platforms[p] = { name: p, count: 0, revenue: 0 };
      platforms[p].count++;
      platforms[p].revenue += parseFloat(r.grand_total) || 0;
    });
    return Object.values(platforms).sort((a, b) => b.revenue - a.revenue);
  }, [confirmed]);

  // ---- Quality breakdown ----
  const qualityData = useMemo(() => {
    const qualities = {};
    confirmed.forEach(r => {
      const q = r.quality || 'Unknown';
      if (!qualities[q]) qualities[q] = { name: q, count: 0, revenue: 0 };
      qualities[q].count++;
      qualities[q].revenue += parseFloat(r.grand_total) || 0;
    });
    return Object.values(qualities).sort((a, b) => b.count - a.count);
  }, [confirmed]);

  // ---- Styles ----
  const inputStyle = {
    padding: '8px 12px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: COLORS.textPrimary,
    fontSize: '0.85rem',
    outline: 'none',
  };

  const btnPrimary = {
    background: COLORS.indigo,
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    opacity: loading ? 0.6 : 1,
  };

  const btnGreen = { ...btnPrimary, background: COLORS.green };

  const gridTwoCols = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '24px',
  };

  const noData = !approaches.length && !sales.length;

  // ========================================
  // RENDER
  // ========================================
  return (
    <div style={{ width: '100%' }}>
      {/* ---- FILTERS ---- */}
      <div className="sticky-filter-bar" style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <DateRangePicker value={dateRange} onChange={setDateRange} mode="csat" compact />
        {/* Upload buttons hidden for now */}
        {false && <>
        <button
          style={btnGreen}
          onClick={() => approachFileRef.current?.click()}
          disabled={loading}
        >
          Upload Approach CSV
        </button>
        <button
          style={btnPrimary}
          onClick={() => salesFileRef.current?.click()}
          disabled={loading}
        >
          Upload Sales CSV
        </button>
        </>}
        <input
          ref={approachFileRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            uploadCSV(e.target.files[0], 'sales-approach', 'Approach');
            e.target.value = '';
          }}
        />
        <input
          ref={salesFileRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            uploadCSV(e.target.files[0], 'sales-upload', 'Sales');
            e.target.value = '';
          }}
        />
        {loading && (
          <div style={{
            width: 20,
            height: 20,
            border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: COLORS.indigo,
            borderRadius: '50%',
            animation: 'sdSpin 0.7s linear infinite',
          }} />
        )}
        {status && <span style={{ color: COLORS.textSecondary, fontSize: '0.85rem' }}>{status}</span>}
      </div>

      {/* spinner keyframes injected once */}
      <style>{`@keyframes sdSpin { to { transform: rotate(360deg); } }`}</style>

      {/* ---- ERROR ---- */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: COLORS.red,
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      {/* ---- EMPTY STATE ---- */}
      {noData && !loading && (
        <div style={{ color: COLORS.textMuted, padding: '40px 0', textAlign: 'center', fontSize: '0.9rem' }}>
          No data found for this date range. Upload CSVs or adjust date range.
        </div>
      )}

      {/* ---- DASHBOARD CONTENT ---- */}
      {!noData && (
        <>
          {/* ======== KPI CARDS ======== */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
            <KPICard
              label="Total Approach"
              value={kpis.totalApproach}
              color={COLORS.indigo}
              tooltip={<>Total number of sales approaches made by agents in the selected date range.<br /><b>Source:</b> Approach CSV (all rows)</>}
            />
            <KPICard
              label="Confirmed Sales"
              value={kpis.confirmedCount}
              color={COLORS.green}
              tooltip={<>Number of approaches that converted into confirmed sales (Status = Enabled).<br /><b>Source:</b> Sales CSV where Status = "Enabled"</>}
            />
            <KPICard
              label="Confirmation Rate"
              value={`${kpis.confirmRate}%`}
              color={COLORS.amber}
              tooltip={<>Percentage of approaches that converted into sales.<br /><b>Formula:</b> (Confirmed / Total Approach) x 100</>}
            />
            <KPICard
              label="Total Revenue"
              value={`$${fmt(kpis.totalRevenue)}`}
              color={COLORS.green}
              tooltip={<>Sum of Grand Total from all confirmed sales.<br /><b>Note:</b> Includes discounts and add-ons</>}
            />
            <KPICard
              label="Avg Order Value"
              value={`$${fmt(kpis.avgOrderValue)}`}
              color={COLORS.textPrimary}
              tooltip={<>Average revenue per confirmed sale.<br /><b>Formula:</b> Total Revenue / Confirmed Sales</>}
            />
            <KPICard
              label="Actual Sale Amount"
              value={`$${fmt(kpis.totalActualSale)}`}
              color={COLORS.green}
              tooltip={<>Sum of "Actual Amount of Sale" from confirmed sales. This is the real profit/margin amount after costs.</>}
            />
            <KPICard
              label="Unique Customers"
              value={kpis.uniqueCustomers}
              color={COLORS.textPrimary}
              tooltip={<>Number of unique customer emails across all confirmed sales.</>}
            />
            <KPICard
              label="Total Discount"
              value={`$${fmt(kpis.totalDiscount)}`}
              color={COLORS.red}
              tooltip={<>Total discount given across all confirmed sales.</>}
            />
          </div>

          {/* ======== MEDIA BREAKDOWN ======== */}
          <div style={{ marginBottom: '24px' }}>
            <SectionCard title="Media Breakdown">
              <RankTable
                columns={[
                  { header: 'Media', key: 'name' },
                  { header: 'Approach', key: 'approach', align: 'center' },
                  { header: 'Confirmed', key: 'confirmed', align: 'center' },
                ]}
                rows={[
                  ...mediaData.rows,
                  { name: 'Total', approach: mediaData.totApp, confirmed: mediaData.totConf, _isTotal: true },
                ].map(r => r._isTotal ? { ...r, _bold: true } : r)}
              />
            </SectionCard>
          </div>

          {/* ======== DAILY TREND + REMARKS ======== */}
          <div style={gridTwoCols}>
            <SectionCard title="Daily Sales Trend">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dailyTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fill: COLORS.textMuted, fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" tick={{ fill: COLORS.textMuted, fontSize: 10 }} label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fill: COLORS.textMuted, fontSize: 11 } }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: COLORS.textMuted, fontSize: 10 }} label={{ value: 'Revenue ($)', angle: 90, position: 'insideRight', style: { fill: COLORS.textMuted, fontSize: 11 } }} />
                  <Tooltip cursor={{ fill: 'transparent' }} content={<DarkTooltip formatter={(v, name) => name === 'Revenue ($)' ? `$${fmt(v)}` : v} />} />
                  <Legend wrapperStyle={{ fontSize: '0.75rem', color: COLORS.textSecondary }} />
                  <Bar yAxisId="left" dataKey="approaches" name="Approaches" fill="rgba(99,102,241,0.35)" stroke={COLORS.indigo} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="left" dataKey="confirmed" name="Confirmed" fill={COLORS.green} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue ($)" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title="Sales by Remarks Type">
              {remarksData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={remarksData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={95}
                      paddingAngle={2}
                      stroke="rgba(15,23,42,0.8)"
                      strokeWidth={2}
                    >
                      {remarksData.map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip cursor={{ fill: 'transparent' }} content={<DarkTooltip formatter={(v, name) => {
                      const entry = remarksData.find(r => r.name === name);
                      return entry ? `${v} sales ($${fmt(entry.revenue)})` : v;
                    }} />} />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: '0.72rem', color: COLORS.textSecondary, paddingLeft: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: COLORS.textMuted, textAlign: 'center', padding: '60px 0', fontSize: '0.85rem' }}>No remarks data</div>
              )}
            </SectionCard>
          </div>

          {/* ======== AGENT LEADERBOARD ======== */}
          <div style={gridTwoCols}>
            <SectionCard title="Agent Leaderboard -- Chart" style={{ overflow: 'hidden' }}>
              <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'hidden' }}>
                <ResponsiveContainer width="100%" height={Math.max(300, agentData.length * 30)}>
                  <BarChart data={agentData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fill: COLORS.textSecondary, fontSize: 10 }} />
                    <Tooltip cursor={{ fill: 'transparent' }} content={<DarkTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem', color: COLORS.textSecondary }} />
                    <Bar dataKey="approach" name="Approach" fill="rgba(99,102,241,0.35)" stroke={COLORS.indigo} radius={[0, 3, 3, 0]} />
                    <Bar dataKey="count" name="Confirmed" fill={COLORS.green} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Agent Leaderboard -- Table">
              <RankTable
                maxHeight={400}
                columns={[
                  { header: '#', render: (_, i) => i + 1, align: 'center', bold: true, color: (_, i) => rankColor(i) },
                  { header: 'Agent', key: 'name' },
                  { header: 'Approach', key: 'approach', align: 'center' },
                  { header: 'Confirmed', key: 'count', align: 'center' },
                  { header: 'Rate%', render: (r) => `${r.rate}%`, align: 'center' },
                  { header: 'Sales Amount', render: (r) => `$${fmt(r.actual)}`, align: 'right', bold: true, color: () => COLORS.green },
                ]}
                rows={agentData}
              />
            </SectionCard>
          </div>

          {/* ======== COUNTRY RANKINGS ======== */}
          <div style={gridTwoCols}>
            <SectionCard title="Country Rankings -- Chart">
              {countryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={countryData.slice(0, 10)}
                      dataKey="revenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      paddingAngle={1}
                      stroke="rgba(15,23,42,0.8)"
                      strokeWidth={2}
                    >
                      {countryData.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length] + 'CC'} />
                      ))}
                    </Pie>
                    <Tooltip cursor={{ fill: 'transparent' }} content={<DarkTooltip formatter={(v) => `$${fmt(v)}`} />} />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: '0.7rem', color: COLORS.textSecondary, paddingLeft: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: COLORS.textMuted, textAlign: 'center', padding: '60px 0', fontSize: '0.85rem' }}>No data</div>
              )}
            </SectionCard>

            <SectionCard title="Country Rankings -- Table">
              <RankTable
                maxHeight={380}
                columns={[
                  { header: '#', render: (_, i) => i + 1, align: 'center', bold: true, color: (_, i) => rankColor(i) },
                  { header: 'Country', key: 'name' },
                  { header: 'Sales', key: 'count', align: 'center' },
                  { header: 'Revenue', render: (r) => `$${fmt(r.revenue)}`, align: 'right', bold: true, color: () => COLORS.green },
                ]}
                rows={countryData}
              />
            </SectionCard>
          </div>

          {/* ======== TOP PLANS ======== */}
          <div style={gridTwoCols}>
            <SectionCard title="Top Plans -- Chart">
              {planData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={planData.slice(0, 10)} margin={{ top: 5, right: 10, left: 0, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                      angle={-40}
                      textAnchor="end"
                      height={70}
                      tickFormatter={(v) => v.length > 22 ? v.slice(0, 20) + '...' : v}
                    />
                    <YAxis yAxisId="left" tick={{ fill: COLORS.textMuted, fontSize: 10 }} label={{ value: 'Sold', angle: -90, position: 'insideLeft', style: { fill: COLORS.textMuted, fontSize: 10 } }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: COLORS.textMuted, fontSize: 10 }} label={{ value: 'Revenue ($)', angle: 90, position: 'insideRight', style: { fill: COLORS.textMuted, fontSize: 10 } }} />
                    <Tooltip cursor={{ fill: 'transparent' }} content={<DarkTooltip formatter={(v, name) => name === 'Revenue ($)' ? `$${fmt(v)}` : v} />} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem', color: COLORS.textSecondary }} />
                    <Bar yAxisId="left" dataKey="count" name="Sold" radius={[4, 4, 0, 0]}>
                      {planData.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length] + 'CC'} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} strokeWidth={1} />
                      ))}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue ($)" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: COLORS.textMuted, textAlign: 'center', padding: '60px 0', fontSize: '0.85rem' }}>No data</div>
              )}
            </SectionCard>

            <SectionCard title="Top Plans -- Table">
              <RankTable
                maxHeight={380}
                columns={[
                  { header: '#', render: (_, i) => i + 1, align: 'center', bold: true, color: (_, i) => rankColor(i) },
                  { header: 'Plan', key: 'name', maxWidth: 200, nowrap: true },
                  { header: 'Sold', key: 'count', align: 'center' },
                  { header: 'Revenue', render: (r) => `$${fmt(r.revenue)}`, align: 'right', bold: true, color: () => COLORS.green },
                ]}
                rows={planData}
              />
            </SectionCard>
          </div>

          {/* ======== GATEWAY + PLATFORM ======== */}
          <div style={gridTwoCols}>
            <SectionCard title="Gateway Breakdown">
              {gatewayData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={gatewayData}
                      dataKey="revenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="rgba(15,23,42,0.8)"
                      strokeWidth={2}
                    >
                      {gatewayData.map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip cursor={{ fill: 'transparent' }} content={<DarkTooltip formatter={(v, name) => {
                      const entry = gatewayData.find(g => g.name === name);
                      return `$${fmt(v)} (${entry?.count || 0} sales)`;
                    }} />} />
                    <Legend wrapperStyle={{ fontSize: '0.7rem', color: COLORS.textSecondary }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: COLORS.textMuted, textAlign: 'center', padding: '40px 0', fontSize: '0.85rem' }}>No data</div>
              )}
              <div style={{ marginTop: '12px' }}>
                <RankTable
                  columns={[
                    { header: '#', render: (_, i) => i + 1, align: 'center', bold: true, color: (_, i) => rankColor(i) },
                    { header: 'Gateway', key: 'name' },
                    { header: 'Count', key: 'count', align: 'center' },
                    { header: 'Revenue', render: (r) => `$${fmt(r.revenue)}`, align: 'right', bold: true, color: () => COLORS.green },
                  ]}
                  rows={gatewayData}
                />
              </div>
            </SectionCard>

            <SectionCard title="Platform Split">
              {platformData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={platformData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="rgba(15,23,42,0.8)"
                      strokeWidth={2}
                    >
                      {platformData.map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip cursor={{ fill: 'transparent' }} content={<DarkTooltip formatter={(v, name) => {
                      const entry = platformData.find(p => p.name === name);
                      return `${v} sales ($${fmt(entry?.revenue || 0)})`;
                    }} />} />
                    <Legend wrapperStyle={{ fontSize: '0.7rem', color: COLORS.textSecondary }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: COLORS.textMuted, textAlign: 'center', padding: '40px 0', fontSize: '0.85rem' }}>No data</div>
              )}
              <div style={{ marginTop: '12px' }}>
                <RankTable
                  columns={[
                    { header: '#', render: (_, i) => i + 1, align: 'center', bold: true, color: (_, i) => rankColor(i) },
                    { header: 'Platform', key: 'name' },
                    { header: 'Count', key: 'count', align: 'center' },
                    { header: 'Revenue', render: (r) => `$${fmt(r.revenue)}`, align: 'right', bold: true, color: () => COLORS.green },
                  ]}
                  rows={platformData}
                />
              </div>
            </SectionCard>
          </div>

          {/* ======== QUALITY BREAKDOWN ======== */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <SectionCard title="Quality Breakdown">
              <RankTable
                columns={[
                  { header: '#', render: (_, i) => i + 1, align: 'center', bold: true, color: (_, i) => rankColor(i) },
                  { header: 'Quality', key: 'name' },
                  { header: 'Count', key: 'count', align: 'center' },
                  { header: 'Revenue', render: (r) => `$${fmt(r.revenue)}`, align: 'right', bold: true, color: () => COLORS.green },
                ]}
                rows={qualityData}
              />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesDashboardNew;
