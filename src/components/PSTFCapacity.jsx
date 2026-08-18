import React, { useState, useMemo, useCallback, useEffect } from 'react';
import DateRangePicker from './DateRangePicker';

// ============================================================
// Constants
// ============================================================
const HOUR_LABELS = [
  "12AM-1AM","1AM-2AM","2AM-3AM","3AM-4AM","4AM-5AM","5AM-6AM",
  "6AM-7AM","7AM-8AM","8AM-9AM","9AM-10AM","10AM-11AM","11AM-12PM",
  "12PM-1PM","1PM-2PM","2PM-3PM","3PM-4PM","4PM-5PM","5PM-6PM",
  "6PM-7PM","7PM-8PM","8PM-9PM","9PM-10PM","10PM-11PM","11PM-12AM",
];
const DAY_NAMES_H = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const PSTF_SHIFTS = [
  { label: "7AM-1PM",  hours: [7,8,9,10,11,12], nextDayHours: [] },
  { label: "1PM-10PM", hours: [13,14,15,16,17,18,19,20,21], nextDayHours: [] },
  { label: "10PM-7AM", hours: [22,23], nextDayHours: [0,1,2,3,4,5,6] },
];

const PSTF_NEXT_DAY = {};
for (let i = 0; i < DAY_NAMES_H.length; i++) {
  PSTF_NEXT_DAY[DAY_NAMES_H[i]] = DAY_NAMES_H[(i + 1) % 7];
}

const API_BASE = window.location.origin + "/api";

const PSTF_AHT_LOOKUP = {
  "CEx - Account Got Flagged But Email Was Not Sent": 5,
  "CEx - Account is Paused Due to Inactivity": 5,
  "CEx - Account Merging": 15,
  "CEx - Account Pause/Unpause": 5,
  "CEx - Add-on Issue": 11,
  "CEx - Breach Event Explanation": 15,
  "CEx - Claim BOGO Free Account": 30,
  "CEx - Change of Payout Address & Method": 5,
  "CEx - Client Asked For Invoice (Payout/Payment)": 15,
  "CEx - Client Made Bank Transfer, but Account/Reset Pending": 11,
  "CEx - Client Made Card Payment, but Account Pending": 12,
  "CEx - Client Made Card Payment, but Reset Pending": 12,
  "CEx - Client Made Crypto Payment But Account Reset Pending": 15,
  "CEx - Client Made Crypto Payment, but Account Activation Pending": 15,
  "CEx - Client made Perfect Money Payment, but Account/Reset Pending": 20,
  "CEx - Client Paid Through Payprocc but Account Activation/Reset Pending": 11,
  "CEx - Client wants to purchase account(s) with payout": 8,
  "CEx - Competition KYC": 8,
  "CEx - Competition Payout address": 5,
  "CEx - Complaint About Discrepancy in Profit Share": 15,
  "CEx - Dashboard Update Issue (Trades, Days)": 8,
  "CEx - Free Trail Account Breached Issue": 15,
  "CEx - Giveaway Account Creation (Twitter and Instagram)": 15,
  "CEx - Invalid Account/Login Issue": 5,
  "CEx - Meet The Criteria For A Certificate, But It Appears To Be Inaccessible.": 8,
  "CEx - Need An Update Of Current Payout": 3,
  "CEx - Need to Respond to Client's Email / Client Missed the Interview": 3,
  "CEx - Pending Order Did Not Execute": 23,
  "CEx - Profit Withdrawal is Not Showing in The Dashboard.": 15,
  "CEx - Referred To The Technical Expert Team.": 15,
  "CEx - Reset with Previous Payment": 30,
  "CEx - Scale Up": 8,
  "CEx - SL/TP Did Not Hit": 23,
  "CEx - Slippage": 15,
  "CEx - Spread": 15,
  "CEx - Swap Explanation": 15,
  "CEx - Switching Account Plan/Platform/Name Change": 8,
  "CEx - Trade Disabled Issue": 10,
  "CEx - Unauthorized trade Explanation": 45,
  "CEx - Unauthorized Trade Explanation": 45,
  "CEx - Veriff Doesn't Accept KYC Documents / Unable to Submit KYC Documents": 8,
  "CEx - Dashboard Update Issue (Days)": 8,
  "CEx - 2FA Issue": 5,
  "CEx - Switching Account Plan/Platform": 8,
  "CEx - Profile Information Update": 10,
  "CEx - Request to Change Email Address": 10,
  "CEx - Giveaway Account Creation (Instagram)": 10,
  "CEx - New Dashboard Registration Approval": 5,
  "CEx - Veriff Doesn't Accept KYC Documents": 5,
  "CEx - Unable To Submit KYC Documents": 5,
};

// ============================================================
// Dark theme styles
// ============================================================
const S = {
  card: {
    background: 'rgba(15, 20, 35, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '20px',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },
  summaryCard: () => ({
    background: 'rgba(15, 20, 35, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '20px',
    textAlign: 'center',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  }),
  summaryValue: (color) => ({
    fontSize: '2rem',
    fontWeight: '700',
    color,
    textShadow: `0 0 20px ${color}40`,
  }),
  summaryLabel: {
    fontSize: '0.7rem',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: '4px',
    letterSpacing: '0.05em',
    fontWeight: '600',
  },
  tableWrap: {
    overflowX: 'auto',
    background: 'rgba(15, 20, 35, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
  },
  th: (bg) => ({
    padding: '10px 12px',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: '0.78rem',
    background: bg,
    color: '#fff',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    whiteSpace: 'nowrap',
  }),
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontSize: '0.82rem',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  sectionTitle: (color) => ({
    fontSize: '0.95rem',
    color,
    margin: '24px 0 10px',
    padding: '10px 14px',
    background: 'rgba(15, 20, 35, 0.6)',
    borderLeft: `4px solid ${color}`,
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.06)',
    fontWeight: '600',
  }),
  input: {
    padding: '8px 10px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    fontSize: '0.85rem',
    color: '#F8FAFC',
    background: 'rgba(15, 20, 35, 0.8)',
    outline: 'none',
    width: '100%',
  },
  btn: {
    background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
    color: '#fff',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '10px',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 0 20px rgba(6,182,212,0.3)',
  },
};

// ============================================================
// Helpers
// ============================================================
function buildDateList(from, to) {
  const dates = [];
  const current = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function heatColor(val, minVal, maxVal) {
  if (maxVal === minVal) return 'rgba(255,255,255,0.05)';
  const ratio = (val - minVal) / (maxVal - minVal);
  if (ratio < 0.33) {
    const g = Math.round(80 + ratio * 3 * 140);
    return `rgba(20, ${g}, 180, ${0.15 + ratio * 0.5})`;
  } else if (ratio < 0.66) {
    const r = Math.round((ratio - 0.33) * 3 * 200);
    return `rgba(${r}, 220, 100, ${0.3 + ratio * 0.3})`;
  } else {
    const g = Math.round(220 - (ratio - 0.66) * 3 * 160);
    return `rgba(240, ${g}, 60, ${0.4 + ratio * 0.3})`;
  }
}

/** Custom rounding for PSTF: round up only when fractional >= 0.6 */
function pstfRound(x) {
  if (x <= 0) return 0;
  return Math.max(1, Math.floor(x) + ((x % 1) >= 0.6 ? 1 : 0));
}

function parseDateRange(dateRange) {
  const DHAKA_MS = 6 * 3600000;
  const now = new Date(Date.now() + DHAKA_MS);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (dateRange?.startsWith('custom_')) { const p = dateRange.split('_'); return { from: p[1], to: p[2] }; }
  if (dateRange === 'today') { const d = fmt(today); return { from: d, to: d }; }
  if (dateRange === 'yesterday') { const y = new Date(today); y.setDate(y.getDate()-1); return { from: fmt(y), to: fmt(y) }; }
  if (dateRange === 'this_week') { const d = new Date(today); d.setDate(d.getDate() - d.getDay()); return { from: fmt(d), to: fmt(today) }; }
  if (dateRange === 'this_month') { return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) }; }
  if (dateRange === 'last_month') { const f = new Date(today.getFullYear(), today.getMonth(), 1); const e = new Date(f.getTime()-86400000); return { from: fmt(new Date(e.getFullYear(), e.getMonth(), 1)), to: fmt(e) }; }
  const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90 }[dateRange] || 90;
  const s = new Date(today); s.setDate(s.getDate() - days);
  return { from: fmt(s), to: fmt(today) };
}

// ============================================================
// Sub-components
// ============================================================
function SummaryCards({ totalTickets, totalBandwidth, dateCount }) {
  const cards = [
    { label: 'Total PSTF Tickets', value: totalTickets.toLocaleString(), color: '#D946EF' },
    { label: 'Total Bandwidth (min)', value: totalBandwidth.toLocaleString(), color: '#0d9e9e' },
    { label: 'Total Bandwidth (hrs)', value: (totalBandwidth / 60).toFixed(1), color: '#10B981' },
    { label: 'Avg Tickets / Day', value: dateCount > 0 ? Math.round(totalTickets / dateCount) : 0, color: '#EF4444' },
  ];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:'16px', marginBottom:'24px' }}>
      {cards.map(c => (
        <div key={c.label} style={S.summaryCard()}>
          <div style={S.summaryValue(c.color)}>{c.value}</div>
          <div style={S.summaryLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function HourlyHeatmap({ avgData, title, themeColor, tooltip }) {
  let minV = Infinity, maxV = -Infinity;
  for (const day of DAY_ORDER) for (let h = 0; h < 24; h++) { const v = avgData[day]?.[h] ?? 0; if (v < minV) minV = v; if (v > maxV) maxV = v; }
  if (minV === maxV) { minV = 0; maxV = Math.max(1, maxV); }

  const dayTotals = {};
  for (const day of DAY_ORDER) dayTotals[day] = (avgData[day] || Array(24).fill(0)).reduce((s,v) => s+v, 0);

  return (
    <div>
      <div style={S.sectionTitle(themeColor)} title={tooltip || ''}>{title}</div>
      <div style={S.tableWrap}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
          <thead>
            <tr>
              <th style={{...S.th(themeColor), textAlign:'left'}}>Hour</th>
              {DAY_ORDER.map(d => <th key={d} style={S.th(themeColor)}>{d.slice(0,3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({length:24}, (_,h) => (
              <tr key={h}>
                <td style={{...S.td, fontWeight:'600', whiteSpace:'nowrap', textAlign:'left', background:'rgba(15,20,35,0.5)', color:'#94A3B8'}}>{HOUR_LABELS[h]}</td>
                {DAY_ORDER.map(day => {
                  const val = avgData[day]?.[h] ?? 0;
                  const bg = heatColor(val, minV, maxV);
                  return <td key={day} style={{...S.td, background:bg, fontWeight:'600'}}>{val}</td>;
                })}
              </tr>
            ))}
            <tr>
              <td style={{...S.td, background:themeColor, color:'#fff', fontWeight:'700', textAlign:'left'}}>Daily Avg Total</td>
              {DAY_ORDER.map(d => <td key={d} style={{...S.td, background:themeColor, color:'#fff', fontWeight:'700'}}>{dayTotals[d]}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InflowTable({ avgInflowData, shifts, title, themeColor, tooltip }) {
  let minV = Infinity, maxV = -Infinity;
  for (const day of DAY_ORDER) for (let si = 0; si < shifts.length; si++) { const v = avgInflowData[day]?.[si] ?? 0; if (v < minV) minV = v; if (v > maxV) maxV = v; }
  if (minV === maxV) { minV = 0; maxV = Math.max(1, maxV); }

  return (
    <div>
      <div style={S.sectionTitle(themeColor)} title={tooltip || ''}>{title}</div>
      <div style={S.tableWrap}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
          <thead>
            <tr>
              <th style={{...S.th(themeColor), textAlign:'left'}}>Shift</th>
              {DAY_ORDER.map(d => <th key={d} style={S.th(themeColor)}>{d.slice(0,3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift, si) => (
              <tr key={si}>
                <td style={{...S.td, fontWeight:'600', whiteSpace:'nowrap', textAlign:'left', background:'rgba(15,20,35,0.5)', color:'#94A3B8'}}>{shift.label}</td>
                {DAY_ORDER.map(day => {
                  const val = avgInflowData[day]?.[si] ?? 0;
                  const bg = heatColor(val, minV, maxV);
                  return <td key={day} style={{...S.td, background:bg, fontWeight:'600'}}>{val.toFixed(1)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeadcountTable({ inflowData, shifts, sla, leaveRate, breakRate, nightBreakRate, currentAgents, onCurrentChange }) {
  const themeColor = '#D946EF';
  const rgb = '168,85,247';

  const grid = [];
  let maxTotal = 0;
  for (let si = 0; si < shifts.length; si++) {
    const isNight = si === 2;
    const effectiveBreakRate = isNight ? nightBreakRate : breakRate;
    grid[si] = [];
    for (let di = 0; di < DAY_ORDER.length; di++) {
      const day = DAY_ORDER[di];
      const v = inflowData[day]?.[si] ?? 0;
      const base = pstfRound(v / sla);
      const leave = base > 0 ? Math.ceil(base * leaveRate) : 0;
      const brk = base > 0 ? Math.ceil(base * effectiveBreakRate) : 0;
      const total = base + leave + brk;
      grid[si][di] = { total, base, v };
      if (total > maxTotal) maxTotal = total;
    }
  }

  const totalNeeded = [];
  for (let si = 0; si < shifts.length; si++) {
    let sum = 0;
    for (let di = 0; di < DAY_ORDER.length; di++) sum += grid[si][di].total;
    totalNeeded[si] = Math.ceil(sum / 5);
  }

  return (
    <div>
      <div style={S.sectionTitle(themeColor)}>Required Headcount -- PSTF</div>
      <div style={S.tableWrap}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
          <thead>
            <tr>
              <th style={{...S.th(themeColor), textAlign:'left'}}>Shift</th>
              {DAY_ORDER.map(d => <th key={d} style={S.th(themeColor)}>{d.slice(0,3)}</th>)}
              <th style={S.th(themeColor)}>Total Needed</th>
              <th style={S.th(themeColor)}>Current</th>
              <th style={S.th(themeColor)}>Gap</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift, si) => {
              const curr = currentAgents[si] || 0;
              const gap = curr - totalNeeded[si];
              return (
                <tr key={si}>
                  <td style={{...S.td, fontWeight:'600', whiteSpace:'nowrap', textAlign:'left', background:'rgba(15,20,35,0.5)', color:'#94A3B8'}}>{shift.label}</td>
                  {DAY_ORDER.map((day, di) => {
                    const { total, base, v } = grid[si][di];
                    const ratio = maxTotal > 0 ? total / maxTotal : 0;
                    const alpha = 0.08 + ratio * 0.4;
                    const isNight = si === 2;
                    const effBR = isNight ? nightBreakRate : breakRate;
                    const lv = base > 0 ? Math.ceil(base * leaveRate) : 0;
                    const bk = base > 0 ? Math.ceil(base * effBR) : 0;
                    const tipText = v > 0 ? `Avg Inflow: ${v.toFixed(1)} / ${sla} SLA = ${(v/sla).toFixed(2)} -> base ${base}\nLeave: CEIL(${base} x ${(leaveRate*100).toFixed(1)}%) = ${lv}\nBreak: CEIL(${base} x ${(effBR*100).toFixed(1)}%) = ${bk}\nTotal: ${base} + ${lv} + ${bk} = ${total}` : '0';
                    return <td key={day} style={{...S.td, background:`rgba(${rgb}, ${alpha})`, fontWeight:'700', cursor:'help'}} title={tipText}>{total}</td>;
                  })}
                  <td style={{...S.td, fontWeight:'700', background:'rgba(15,20,35,0.5)'}}>{totalNeeded[si]}</td>
                  <td style={{...S.td, background:'rgba(15,20,35,0.3)'}}>
                    <input
                      type="number"
                      value={curr}
                      min="0"
                      step="1"
                      onChange={(e) => onCurrentChange(si, parseInt(e.target.value) || 0)}
                      style={{ width:'50px', padding:'4px', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'4px', textAlign:'center', fontSize:'0.82rem', fontWeight:'600', color:'#F8FAFC', background:'rgba(15,20,35,0.8)' }}
                    />
                  </td>
                  <td style={{...S.td, fontWeight:'700'}}>
                    {curr > 0 ? (
                      gap >= 0
                        ? <span style={{ color:'#10B981' }}>{'\u25B2'}{gap}</span>
                        : <span style={{ color:'#EF4444' }}>{'\u25BC'}{Math.abs(gap)}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TicketTypeBreakdown({ typeCounts }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => Object.entries(typeCounts).sort((a, b) => b[1] - a[1]), [typeCounts]);
  const themeColor = '#D946EF';

  return (
    <div style={{ marginTop: '24px' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: '0.9rem',
          color: '#F8FAFC',
          padding: '12px 14px',
          background: 'rgba(168,85,247,0.08)',
          borderRadius: '10px',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid rgba(168,85,247,0.15)',
        }}
      >
        <span>
          <span style={{ display:'inline-block', marginRight:'8px', transition:'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'none' }}>{'\u25B6'}</span>
          Ticket Type Breakdown ({sorted.length} types)
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: '8px' }}>
          <div style={S.tableWrap}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
              <thead>
                <tr>
                  <th style={{...S.th(themeColor), textAlign:'left'}}>#</th>
                  <th style={{...S.th(themeColor), textAlign:'left'}}>Ticket Type</th>
                  <th style={S.th(themeColor)}>Count</th>
                  <th style={S.th(themeColor)}>SLA (min)</th>
                  <th style={S.th(themeColor)}>Total Bandwidth (min)</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(([type, count], i) => {
                  const ahtMin = PSTF_AHT_LOOKUP[type];
                  return (
                    <tr key={type}>
                      <td style={{...S.td, textAlign:'left'}}>{i + 1}</td>
                      <td style={{...S.td, textAlign:'left'}}>{type}</td>
                      <td style={{...S.td, fontWeight:'600'}}>{count}</td>
                      <td style={S.td}>{ahtMin ?? '?'}</td>
                      <td style={{...S.td, fontWeight:'600'}}>{ahtMin != null ? count * ahtMin : '?'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================
const PSTFCapacity = () => {
  const [dateRange, setDateRange] = useState('last_7_days');
  const { from: fromDate, to: toDate } = useMemo(() => parseDateRange(dateRange), [dateRange]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Data state
  const [summaryData, setSummaryData] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);

  // Calculator params
  const [sla, setSla] = useState(60);
  const [leaves, setLeaves] = useState(32);
  const [workDays, setWorkDays] = useState(264);
  const [breakTime, setBreakTime] = useState(1.5);
  const [workHrs, setWorkHrs] = useState(9);

  // Current agents per shift
  const [currentAgents, setCurrentAgents] = useState([0, 0, 0]);

  const handleCurrentChange = useCallback((shiftIdx, value) => {
    setCurrentAgents(prev => {
      const next = [...prev];
      next[shiftIdx] = value;
      return next;
    });
  }, []);

  const leaveRate = workDays > 0 ? leaves / workDays : 0;
  const breakRate = workHrs > 0 ? breakTime / workHrs : 0;
  const nightBreakRate = breakTime > 0 ? 0.10 : 0;

  const fetchData = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError('');
    setStatus('');

    try {
      const dateList = buildDateList(fromDate, toDate);
      setStatus(`Fetching PSTF data for ${dateList.length} day(s)...`);

      // Batch API in chunks of 7 days
      const CHUNK_SIZE = 7;
      const allDays = [];
      let totalCached = 0, totalFetched = 0;

      for (let i = 0; i < dateList.length; i += CHUNK_SIZE) {
        const chunkFrom = dateList[i];
        const chunkTo = dateList[Math.min(i + CHUNK_SIZE - 1, dateList.length - 1)];
        setStatus(`Fetching ${chunkFrom} to ${chunkTo} (${Math.min(i + CHUNK_SIZE, dateList.length)}/${dateList.length} days)...`);

        const apiRes = await fetch(`${API_BASE}/pstf-capacity?from=${chunkFrom}&to=${chunkTo}`);
        if (!apiRes.ok) {
          const err = await apiRes.json().catch(() => ({ error: `HTTP ${apiRes.status}` }));
          throw new Error(err.error || `HTTP ${apiRes.status}`);
        }
        const batchData = await apiRes.json();
        allDays.push(...(batchData.days || []));
        totalCached += batchData.cached_count || 0;
        totalFetched += batchData.fetched_count || 0;
      }

      setStatus(`Processing... (${totalCached} cached, ${totalFetched} fetched from Intercom)`);

      // Accumulate hourly bandwidth per day-of-week
      const acc = {};
      for (const day of DAY_NAMES_H) {
        acc[day] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
      }

      // Monthly accumulators
      const months = [...new Set(dateList.map(d => d.slice(0,7)))].sort();
      const monthAcc = {};
      for (const m of months) {
        monthAcc[m] = {};
        for (const day of DAY_NAMES_H) {
          monthAcc[m][day] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
        }
      }

      let totalTickets = 0;
      let totalBandwidth = 0;
      const allTypeCounts = {};

      for (const data of allDays) {
        if (!data) continue;
        const dayName = data.day;
        const mk = data.date.slice(0, 7);

        for (let h = 0; h < 24; h++) {
          const val = data.hours[h] || 0;
          if (val > 0) {
            acc[dayName][h].sum += val;
            acc[dayName][h].count += 1;
            monthAcc[mk][dayName][h].sum += val;
            monthAcc[mk][dayName][h].count += 1;
          }
        }

        totalTickets += data.ticket_count || 0;
        totalBandwidth += (data.hours || []).reduce((s, v) => s + v, 0);

        if (data.type_counts) {
          for (const [t, c] of Object.entries(data.type_counts)) {
            allTypeCounts[t] = (allTypeCounts[t] || 0) + c;
          }
        }
      }

      // Compute hourly averages (AVERAGEIF excluding zeros)
      const avgHours = {};
      for (const day of DAY_NAMES_H) {
        avgHours[day] = acc[day].map(({ sum, count }) => count > 0 ? Math.round(sum / count) : 0);
      }

      // Monthly shift max
      const monthShift = {};
      for (const m of months) {
        monthShift[m] = {};
        for (const day of DAY_NAMES_H) {
          const nextDay = PSTF_NEXT_DAY[day];
          monthShift[m][day] = PSTF_SHIFTS.map(shift => {
            let maxHourAvg = 0;
            for (const h of shift.hours) {
              const { sum, count } = monthAcc[m][day][h];
              const avg = count > 0 ? sum / count : 0;
              if (avg > maxHourAvg) maxHourAvg = avg;
            }
            for (const h of shift.nextDayHours) {
              const { sum, count } = monthAcc[m][nextDay][h];
              const avg = count > 0 ? sum / count : 0;
              if (avg > maxHourAvg) maxHourAvg = avg;
            }
            return maxHourAvg;
          });
        }
      }

      // Average Inflow = AVERAGEIF excluding zeros
      const avgInflow = {};
      for (const day of DAY_NAMES_H) {
        avgInflow[day] = PSTF_SHIFTS.map((_, si) => {
          let sum = 0, cnt = 0;
          for (const m of months) {
            const val = monthShift[m][day]?.[si] ?? 0;
            if (val > 0) { sum += val; cnt++; }
          }
          return cnt > 0 ? sum / cnt : 0;
        });
      }

      setSummaryData({ totalTickets, totalBandwidth, dateCount: dateList.length });
      setAnalysisData({ avgHours, avgInflow, months, allTypeCounts });
      setStatus(`Done -- ${dateList.length} days, ${totalTickets} PSTF tickets, ${totalBandwidth.toLocaleString()} min bandwidth (${totalCached} cached, ${totalFetched} fresh)`);
    } catch (err) {
      setError(err.message);
      setStatus('Failed');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      {/* Date Picker + Fetch */}
      <div className="sticky-filter-bar" style={{ display:'flex', gap:'12px', alignItems:'center', marginBottom:'20px', flexWrap:'wrap' }}>
        <DateRangePicker value={dateRange} onChange={setDateRange} mode="csat" compact />
        {/* Button hidden — auto-loads on date change */}
        {loading && <div style={{ width:'20px', height:'20px', border:'3px solid rgba(255,255,255,0.1)', borderTopColor:'#8B5CF6', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />}
        <span style={{ fontSize:'0.8rem', color:'#64748B' }}>{status}</span>
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#EF4444', padding:'12px 16px', borderRadius:'10px', marginBottom:'16px', fontSize:'0.85rem' }}>
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summaryData && (
        <>
          <SummaryCards totalTickets={summaryData.totalTickets} totalBandwidth={summaryData.totalBandwidth} dateCount={summaryData.dateCount} />
          <div style={{ fontSize:'0.78rem', color:'#64748B', textAlign:'right', marginBottom:'16px' }}>
            Period: {fromDate} to {toDate} (GMT+6) &mdash; {summaryData.dateCount} days, {analysisData?.months.length} month(s)
          </div>
        </>
      )}

      {/* Calculator + Results */}
      {analysisData && (
        <>
          <div style={S.sectionTitle('#D946EF')}>PSTF Required Headcount</div>
          <div style={{ ...S.card, marginBottom:'16px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:'12px', fontSize:'0.85rem' }}>
              {[
                { label: 'SLA (minutes)', value: sla, setter: setSla, step: 1, tooltip: 'SLA time per ticket in minutes. Base headcount = Average Inflow / SLA.' },
                { label: 'Leaves / Year', value: leaves, setter: setLeaves, step: 1, tooltip: 'Total leave days per agent per year.' },
                { label: 'Working Days / Year', value: workDays, setter: setWorkDays, step: 1, tooltip: 'Total working days per year.' },
                { label: 'Break Time (hrs)', value: breakTime, setter: setBreakTime, step: 0.5, tooltip: 'Total break hours per shift.' },
                { label: 'Working Hours', value: workHrs, setter: setWorkHrs, step: 0.5, tooltip: 'Hours in a working shift.' },
              ].map(p => (
                <label key={p.label} style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                  <span style={{ fontWeight:'600', color:'#94A3B8', fontSize:'0.8rem', cursor:'help' }} title={p.tooltip}>{p.label}</span>
                  <input
                    type="number"
                    value={p.value}
                    min={p.label.includes('Leave') ? 0 : 1}
                    step={p.step}
                    onChange={(e) => p.setter(parseFloat(e.target.value) || 0)}
                    style={S.input}
                  />
                </label>
              ))}
            </div>
            <div style={{ marginTop:'10px', fontSize:'0.78rem', color:'#64748B' }}>
              Leave Rate: <strong style={{color:'#F8FAFC'}}>{(leaveRate * 100).toFixed(2)}%</strong> &nbsp;|&nbsp;
              Day Break Rate: <strong style={{color:'#F8FAFC'}}>{(breakRate * 100).toFixed(2)}%</strong> &nbsp;|&nbsp;
              Night Break Rate (10PM-7AM): <strong style={{color:'#F8FAFC'}}>{(nightBreakRate * 100).toFixed(2)}%</strong>
            </div>
          </div>

          {/* Headcount Table */}
          <HeadcountTable
            inflowData={analysisData.avgInflow}
            shifts={PSTF_SHIFTS}
            sla={sla}
            leaveRate={leaveRate}
            breakRate={breakRate}
            nightBreakRate={nightBreakRate}
            currentAgents={currentAgents}
            onCurrentChange={handleCurrentChange}
          />

          {/* Heatmap */}
          <HourlyHeatmap
            avgData={analysisData.avgHours}
            title="Hourly Average Bandwidth (minutes)"
            themeColor="#D946EF"
            tooltip="Each CEx ticket type has a fixed SLA time in minutes. This heatmap shows the average total bandwidth per hour per weekday."
          />

          {/* Average Inflow Table */}
          <InflowTable
            avgInflowData={analysisData.avgInflow}
            shifts={PSTF_SHIFTS}
            title={`Average Inflow -- PSTF (${analysisData.months.length} months)`}
            themeColor="#D946EF"
            tooltip="Peak workload per shift: monthly MAX single-hour average, then averaged across months (excluding zero months)."
          />

          {/* Ticket Type Breakdown */}
          <TicketTypeBreakdown typeCounts={analysisData.allTypeCounts} />
        </>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default PSTFCapacity;
