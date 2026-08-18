import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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

const SHIFTS = [
  { label: "7AM-1PM", hours: [7,8,9,10,11,12], crossesMidnight: false },
  { label: "1PM-10PM", hours: [13,14,15,16,17,18,19,20,21], crossesMidnight: false },
  { label: "10PM-3AM", hoursToday: [22,23], hoursTomorrow: [0,1,2], crossesMidnight: true, totalHours: 5 },
  { label: "3AM-7AM", hours: [3,4,5,6], crossesMidnight: false },
];

const ALL_SHIFTS_DEF = [
  { hours: [7,8,9,10,11,12], nextDayHours: [] },
  { hours: [13,14,15,16,17,18,19,20,21], nextDayHours: [] },
  { hours: [22,23], nextDayHours: [0,1,2] },
  { hours: [], nextDayHours: [3,4,5,6] },
];

const NEXT_DAY_MAP = {};
for (let i = 0; i < DAY_NAMES_H.length; i++) {
  NEXT_DAY_MAP[DAY_NAMES_H[i]] = DAY_NAMES_H[(i + 1) % 7];
}

const API_BASE = window.location.origin + "/api";

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
  summaryCard: (color) => ({
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
function SummaryCards({ totalCfd, totalFut }) {
  const totalLC = totalCfd + totalFut;
  const cards = [
    { label: 'Total Live Chat', value: totalLC, color: '#D946EF' },
    { label: 'CFD Chats', value: totalCfd, color: '#EF4444' },
    { label: 'Futures Chats', value: totalFut, color: '#F97316' },
  ];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'16px', marginBottom:'24px' }}>
      {cards.map(c => (
        <div key={c.label} style={S.summaryCard(c.color)}>
          <div style={S.summaryValue(c.color)}>{c.value.toLocaleString()}</div>
          <div style={S.summaryLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function HourlyHeatmap({ avgData, title, themeColor }) {
  let minV = Infinity, maxV = -Infinity;
  for (const day of DAY_ORDER) for (let h = 0; h < 24; h++) { const v = avgData[day]?.[h] ?? 0; if (v < minV) minV = v; if (v > maxV) maxV = v; }
  if (minV === maxV) { minV = 0; maxV = Math.max(1, maxV); }

  const dayTotals = {};
  for (const day of DAY_ORDER) dayTotals[day] = (avgData[day] || Array(24).fill(0)).reduce((s,v) => s+v, 0);

  return (
    <div>
      <div style={S.sectionTitle(themeColor)}>{title}</div>
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
              <td style={{...S.td, background:themeColor, color:'#fff', fontWeight:'700', textAlign:'left'}}>Daily Avg</td>
              {DAY_ORDER.map(d => <td key={d} style={{...S.td, background:themeColor, color:'#fff', fontWeight:'700'}}>{dayTotals[d]}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AvgInflowTable({ avgInflowData, shifts, title, themeColor }) {
  let minV = Infinity, maxV = -Infinity;
  for (const day of DAY_ORDER) for (let si = 0; si < shifts.length; si++) { const v = avgInflowData[day]?.[si] ?? 0; if (v < minV) minV = v; if (v > maxV) maxV = v; }
  if (minV === maxV) { minV = 0; maxV = Math.max(1, maxV); }

  return (
    <div>
      <div style={S.sectionTitle(themeColor)}>{title}</div>
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

function HeadcountTable({ shiftMaxData, shifts, ahtHours, conc, leaveRate, breakRate, title, themeColor, tableId, currentAgents, onCurrentChange }) {
  const rgbMap = { '#0d9e9e': '13,158,158', '#EF4444': '239,68,68', '#F97316': '249,115,22' };
  const rgb = rgbMap[themeColor] || '100,100,100';
  const nightBreakRate = 0.10;

  const grid = [];
  let maxTotal = 0;
  for (let si = 0; si < shifts.length; si++) {
    const isNightShift = si >= 2;
    const effectiveBreakRate = isNightShift ? nightBreakRate : breakRate;
    grid[si] = [];
    for (let di = 0; di < DAY_ORDER.length; di++) {
      const day = DAY_ORDER[di];
      const v = shiftMaxData[day]?.[si] ?? 0;
      const rawBase = (v * ahtHours) / conc;
      const leave = Math.ceil(rawBase * leaveRate);
      const brk = Math.ceil(rawBase * effectiveBreakRate);
      const total = Math.ceil(rawBase + leave + brk);
      const base = Math.ceil(rawBase);
      grid[si][di] = { base, leave, brk, total, v };
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
      <div style={S.sectionTitle(themeColor)}>{title}</div>
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
                    const { total } = grid[si][di];
                    const ratio = maxTotal > 0 ? total / maxTotal : 0;
                    const alpha = 0.08 + ratio * 0.4;
                    return <td key={day} style={{...S.td, background:`rgba(${rgb}, ${alpha})`, fontWeight:'700'}}>{total}</td>;
                  })}
                  <td style={{...S.td, fontWeight:'700', background:'rgba(15,20,35,0.5)'}}>{totalNeeded[si]}</td>
                  <td style={{...S.td, background:'rgba(15,20,35,0.3)'}}>
                    <input
                      type="number"
                      value={curr}
                      min="0"
                      step="1"
                      onChange={(e) => onCurrentChange(tableId, si, parseInt(e.target.value) || 0)}
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

// ============================================================
// Main Component
// ============================================================
const LCCapacity = () => {
  const [dateRange, setDateRange] = useState('last_7_days');
  const { from: fromDate, to: toDate } = useMemo(() => parseDateRange(dateRange), [dateRange]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Data state
  const [summaryData, setSummaryData] = useState(null);
  const [hourlyData, setHourlyData] = useState(null);

  // Calculator params
  const [aht, setAht] = useState(35);
  const [conc, setConc] = useState(5);
  const [leaves, setLeaves] = useState(32);
  const [workDays, setWorkDays] = useState(264);
  const [breakTime, setBreakTime] = useState(1.5);
  const [workHrs, setWorkHrs] = useState(9);

  // Current agents per shift per table
  const [currentAgents, setCurrentAgents] = useState({
    agent_all: [0,0,0,0],
    agent_cfd: [0,0,0,0],
    agent_fut: [0,0,0,0],
  });

  const handleCurrentChange = useCallback((tableId, shiftIdx, value) => {
    setCurrentAgents(prev => {
      const next = { ...prev };
      next[tableId] = [...prev[tableId]];
      next[tableId][shiftIdx] = value;
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError('');
    setStatus('');

    try {
      const dateList = buildDateList(fromDate, toDate);
      setStatus(`Fetching data for ${dateList.length} day(s)...`);

      // Phase 1: chat-count for each day
      const allDays = [];
      for (let i = 0; i < dateList.length; i++) {
        setStatus(`Processing day ${i+1} of ${dateList.length} (${dateList[i]})...`);
        const res = await fetch(`${API_BASE}/chat-count?date=${dateList[i]}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error || `HTTP ${res.status} on ${dateList[i]}`);
        }
        const data = await res.json();
        allDays.push({
          date: data.date,
          day: data.day,
          chat: data.chat,
          email: data.email,
          fin: data.fin,
          ticket: data.ticket,
          cfd: data.cfd || 0,
          fut: data.fut || 0,
          estimated: data.estimated,
        });
      }

      const totalCfd = allDays.reduce((s, d) => s + (d.cfd || 0), 0);
      const totalFut = allDays.reduce((s, d) => s + (d.fut || 0), 0);
      setSummaryData({ totalCfd, totalFut });

      // Phase 2: hourly data
      setStatus('Fetching hourly breakdown...');
      const accAll = {}, accCfd = {}, accFut = {};
      for (const day of DAY_NAMES_H) {
        accAll[day] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
        accCfd[day] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
        accFut[day] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
      }

      const months = [...new Set(dateList.map(d => d.slice(0,7)))].sort();
      const monthAccAll = {}, monthAccCfd = {}, monthAccFut = {};
      for (const m of months) {
        monthAccAll[m] = {}; monthAccCfd[m] = {}; monthAccFut[m] = {};
        for (const day of DAY_NAMES_H) {
          monthAccAll[m][day] = Array.from({length:24}, () => ({sum:0,count:0}));
          monthAccCfd[m][day] = Array.from({length:24}, () => ({sum:0,count:0}));
          monthAccFut[m][day] = Array.from({length:24}, () => ({sum:0,count:0}));
        }
      }

      const dailyHourly = {};
      for (let i = 0; i < dateList.length; i++) {
        setStatus(`Hourly data: day ${i+1} of ${dateList.length} (${dateList[i]})...`);
        const hRes = await fetch(`${API_BASE}/chat-hourly?date=${dateList[i]}`);
        if (!hRes.ok) {
          const e = await hRes.json().catch(() => ({error:`HTTP ${hRes.status}`}));
          throw new Error(e.error || `HTTP ${hRes.status} on hourly ${dateList[i]}`);
        }
        const hData = await hRes.json();
        const dayName = hData.day;
        dailyHourly[dateList[i]] = hData;
        const mk = dateList[i].slice(0,7);

        for (let h = 0; h < 24; h++) {
          accAll[dayName][h].sum += hData.hours[h]||0; accAll[dayName][h].count += 1;
          accCfd[dayName][h].sum += hData.cfd_hours[h]||0; accCfd[dayName][h].count += 1;
          accFut[dayName][h].sum += hData.fut_hours[h]||0; accFut[dayName][h].count += 1;
          monthAccAll[mk][dayName][h].sum += hData.hours[h]||0; monthAccAll[mk][dayName][h].count += 1;
          monthAccCfd[mk][dayName][h].sum += hData.cfd_hours[h]||0; monthAccCfd[mk][dayName][h].count += 1;
          monthAccFut[mk][dayName][h].sum += hData.fut_hours[h]||0; monthAccFut[mk][dayName][h].count += 1;
        }
      }

      const computeAvg = (acc) => {
        const avg = {};
        for (const day of DAY_NAMES_H) avg[day] = acc[day].map(({sum,count}) => count > 0 ? Math.round(sum/count) : 0);
        return avg;
      };
      const avgAll = computeAvg(accAll), avgCfd = computeAvg(accCfd), avgFut = computeAvg(accFut);

      const computeMonthlyShiftMax = (monthAcc) => {
        const result = {};
        for (const m of months) {
          result[m] = {};
          for (const day of DAY_NAMES_H) {
            const nextDay = NEXT_DAY_MAP[day];
            result[m][day] = ALL_SHIFTS_DEF.map(shift => {
              let mx = 0;
              for (const h of shift.hours) {
                const {sum,count} = monthAcc[m][day][h];
                const a = count > 0 ? sum/count : 0;
                if (a > mx) mx = a;
              }
              for (const h of shift.nextDayHours) {
                const {sum,count} = monthAcc[m][nextDay][h];
                const a = count > 0 ? sum/count : 0;
                if (a > mx) mx = a;
              }
              return mx;
            });
          }
        }
        return result;
      };

      const monthShiftAll = computeMonthlyShiftMax(monthAccAll);
      const monthShiftCfd = computeMonthlyShiftMax(monthAccCfd);
      const monthShiftFut = computeMonthlyShiftMax(monthAccFut);

      const computeAvgInflow = (monthShift) => {
        const ai = {};
        for (const day of DAY_NAMES_H) {
          ai[day] = ALL_SHIFTS_DEF.map((_, si) => {
            let s = 0, c = 0;
            for (const m of months) {
              if (monthShift[m][day]) {
                const v = monthShift[m][day][si];
                if (v > 0) { s += v; c++; }
              }
            }
            return c > 0 ? s/c : 0;
          });
        }
        return ai;
      };

      const avgInflowAll = computeAvgInflow(monthShiftAll);
      const avgInflowCfd = computeAvgInflow(monthShiftCfd);
      const avgInflowFut = computeAvgInflow(monthShiftFut);

      setHourlyData({ avgAll, avgCfd, avgFut, avgInflowAll, avgInflowCfd, avgInflowFut, months });
      setStatus(`Done -- ${allDays.length} days loaded`);
    } catch (err) {
      setError(err.message);
      setStatus('Failed');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const ahtHours = aht / 60;
  const leaveRate = workDays > 0 ? leaves / workDays : 0;
  const breakRate = workHrs > 0 ? breakTime / workHrs : 0;

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
          <SummaryCards totalCfd={summaryData.totalCfd} totalFut={summaryData.totalFut} />
          <div style={{ fontSize:'0.78rem', color:'#64748B', textAlign:'right', marginBottom:'16px' }}>
            Period: {fromDate} to {toDate} (GMT+6)
          </div>
        </>
      )}

      {/* Calculator */}
      {hourlyData && (
        <>
          <div style={S.sectionTitle('#8B5CF6')}>Agents Required Calculator</div>
          <div style={{ ...S.card, marginBottom:'16px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'12px', fontSize:'0.85rem' }}>
              {[
                { label: 'AHT (minutes)', value: aht, setter: setAht, step: 1 },
                { label: 'Concurrency (C)', value: conc, setter: setConc, step: 1 },
                { label: 'Leaves / Year', value: leaves, setter: setLeaves, step: 1 },
                { label: 'Working Days / Year', value: workDays, setter: setWorkDays, step: 1 },
                { label: 'Break Time (hrs)', value: breakTime, setter: setBreakTime, step: 0.5 },
                { label: 'Working Hours', value: workHrs, setter: setWorkHrs, step: 0.5 },
              ].map(p => (
                <label key={p.label} style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                  <span style={{ fontWeight:'600', color:'#94A3B8', fontSize:'0.8rem' }}>{p.label}</span>
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
              AHT: <strong style={{color:'#F8FAFC'}}>{ahtHours.toFixed(2)} hrs</strong> &nbsp;|&nbsp;
              Leave Rate: <strong style={{color:'#F8FAFC'}}>{(leaveRate * 100).toFixed(2)}%</strong> &nbsp;|&nbsp;
              Day Break Rate: <strong style={{color:'#F8FAFC'}}>{(breakRate * 100).toFixed(2)}%</strong> &nbsp;|&nbsp;
              Night Break Rate (10PM-7AM): <strong style={{color:'#F8FAFC'}}>10.00%</strong>
            </div>
          </div>

          {/* Headcount Tables */}
          <HeadcountTable shiftMaxData={hourlyData.avgInflowAll} shifts={SHIFTS} ahtHours={ahtHours} conc={conc} leaveRate={leaveRate} breakRate={breakRate} title="Required Headcount -- All Chats" themeColor="#0d9e9e" tableId="agent_all" currentAgents={currentAgents.agent_all} onCurrentChange={handleCurrentChange} />
          <HeadcountTable shiftMaxData={hourlyData.avgInflowCfd} shifts={SHIFTS} ahtHours={ahtHours} conc={conc} leaveRate={leaveRate} breakRate={breakRate} title="Required Headcount -- CFD" themeColor="#EF4444" tableId="agent_cfd" currentAgents={currentAgents.agent_cfd} onCurrentChange={handleCurrentChange} />
          <HeadcountTable shiftMaxData={hourlyData.avgInflowFut} shifts={SHIFTS} ahtHours={ahtHours} conc={conc} leaveRate={leaveRate} breakRate={breakRate} title="Required Headcount -- Futures" themeColor="#F97316" tableId="agent_fut" currentAgents={currentAgents.agent_fut} onCurrentChange={handleCurrentChange} />

          {/* Heatmaps */}
          <HourlyHeatmap avgData={hourlyData.avgAll} title="Hourly Average -- All Chats" themeColor="#0d9e9e" />
          <AvgInflowTable avgInflowData={hourlyData.avgInflowAll} shifts={SHIFTS} title={`Average Inflow -- All Chats (${hourlyData.months.length} months)`} themeColor="#0d9e9e" />
          <HourlyHeatmap avgData={hourlyData.avgCfd} title="Hourly Average -- CFD" themeColor="#EF4444" />
          <AvgInflowTable avgInflowData={hourlyData.avgInflowCfd} shifts={SHIFTS} title={`Average Inflow -- CFD (${hourlyData.months.length} months)`} themeColor="#EF4444" />
          <HourlyHeatmap avgData={hourlyData.avgFut} title="Hourly Average -- Futures" themeColor="#F97316" />
          <AvgInflowTable avgInflowData={hourlyData.avgInflowFut} shifts={SHIFTS} title={`Average Inflow -- Futures (${hourlyData.months.length} months)`} themeColor="#F97316" />
        </>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default LCCapacity;
