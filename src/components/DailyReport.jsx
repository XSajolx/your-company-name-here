import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { supabase } from '../services/supabaseClient';
import { calculateDateRanges } from '../services/api';
import DateRangePicker from './DateRangePicker';

// ─── Constants ──────────────────────────────────────────────────────────────

const CARD_STYLE = {
  background: 'rgba(15, 20, 35, 0.5)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#1C2128',
  border: '1px solid #30363D',
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  color: '#F0F6FC',
};

const COLORS = [
  '#C084FC', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#8B5CF6', '#84CC16', '#F43F5E',
];

// Canonical DB metric names (from the `daily_report` table).
const METRIC = {
  TOTAL_KNOCK: 'Total Knock',
  CFD_KNOCK:   'Total knock Count - CFD',
  FUT_KNOCK:   'Total knock Count - Futures',
  CSAT:        'CSAT Score',
  FRT:         'First Response Time (FRT)',
  ART:         'Average Response Time (ART)',
  FRT_HIT:     'FRT Hit Rate',
  ART_HIT:     'ART Hit Rate',
  EMAIL_HIT:   'Email Hit Rate',
  EMAIL_AHT:   'Email Average Handling Time',
  TICKET_AHT:  'Ticket Average Handling Time',
  TICKETS:     'Total Ticket Count',
  EMAILS:      'Total Email Count',
  QC:          'QC Passing Rate',
  TP_POS:      'TP Positive Review',
  TP_NEG:      'TP Negative Review',
  SALES:       'Sales Count',
  LATE:        'Late Count',
};

// Friendly display labels for cards/charts (keeps UI tight while queries use real names).
const METRIC_LABELS = {
  [METRIC.CFD_KNOCK]:  'CFD Knock',
  [METRIC.FUT_KNOCK]:  'Futures Knock',
  [METRIC.FRT]:        'FRT',
  [METRIC.ART]:        'ART',
  [METRIC.EMAIL_AHT]:  'Email AHT',
  [METRIC.TICKET_AHT]: 'Ticket AHT',
  [METRIC.TP_POS]:     'TP Positive',
  [METRIC.TP_NEG]:     'TP Negative',
};

const SCORECARD_METRICS = [
  METRIC.TOTAL_KNOCK, METRIC.CSAT, METRIC.FRT, METRIC.ART,
  METRIC.FRT_HIT, METRIC.ART_HIT, METRIC.EMAIL_HIT,
  METRIC.TICKETS, METRIC.EMAILS,
];

const CHART_GROUPS = [
  {
    title: 'Volume',
    metrics: [METRIC.TOTAL_KNOCK, METRIC.CFD_KNOCK, METRIC.FUT_KNOCK],
    targets: {},
  },
  {
    title: 'CSAT Score',
    metrics: [METRIC.CSAT],
    targets: { [METRIC.CSAT]: 95 },
  },
  {
    title: 'Response Times',
    metrics: [METRIC.FRT, METRIC.ART],
    targets: { [METRIC.FRT]: 30, [METRIC.ART]: 70 },
    suffix: 's',
  },
  {
    title: 'Hit Rates',
    metrics: [METRIC.FRT_HIT, METRIC.ART_HIT, METRIC.EMAIL_HIT],
    targets: { [METRIC.FRT_HIT]: 75, [METRIC.ART_HIT]: 60, [METRIC.EMAIL_HIT]: 85 },
    suffix: '%',
  },
  {
    title: 'Handling Times',
    metrics: [METRIC.EMAIL_AHT, METRIC.TICKET_AHT],
    targets: { [METRIC.EMAIL_AHT]: 60, [METRIC.TICKET_AHT]: 60 },
    suffix: 'm',
  },
  {
    title: 'Tickets & Emails',
    metrics: [METRIC.TICKETS, METRIC.EMAILS],
    targets: {},
  },
  {
    title: 'QC & Reviews',
    metrics: [METRIC.QC, METRIC.TP_POS, METRIC.TP_NEG],
    targets: { [METRIC.QC]: 90 },
  },
  {
    title: 'Other',
    metrics: [METRIC.SALES, METRIC.LATE],
    targets: {},
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse a raw value string to a number. Handles %, commas, and plain numbers. */
function parseMetricValue(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (str === '' || str === '-') return null;
  const cleaned = str.replace(/%$/, '').replace(/,/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/** Format a number for display, restoring % suffix where appropriate. */
function formatDisplayValue(num, metricName) {
  if (num == null) return '-';
  const pctMetrics = [METRIC.CSAT, METRIC.FRT_HIT, METRIC.ART_HIT, METRIC.EMAIL_HIT, METRIC.QC];
  if (pctMetrics.includes(metricName)) {
    return `${Number(num).toFixed(1)}%`;
  }
  if (Number.isInteger(num)) return num.toLocaleString();
  return Number(num).toFixed(1);
}

/** Determine trend direction comparing two numeric values.
 *  For "lower is better" metrics (FRT, ART, Late Count, AHTs),
 *  a decrease is positive (up). For everything else, increase is positive. */
function getTrend(current, previous, metricName) {
  if (current == null || previous == null) return { direction: null, label: '' };
  const diff = current - previous;
  if (diff === 0) return { direction: 'flat', label: '0' };

  const lowerIsBetter = [METRIC.FRT, METRIC.ART, METRIC.EMAIL_AHT, METRIC.TICKET_AHT, METRIC.LATE, METRIC.TP_NEG];
  const isGood = lowerIsBetter.includes(metricName) ? diff < 0 : diff > 0;
  const direction = isGood ? 'up' : 'down';
  const formatted = Math.abs(diff) >= 1 ? Number(diff).toFixed(1) : Number(diff).toFixed(2);
  const label = `${diff > 0 ? '+' : ''}${formatted} vs prev`;
  return { direction, label };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const Scorecard = ({ title, value, target, trend, trendLabel, isLoading }) => (
  <div style={{ ...CARD_STYLE, padding: '1.25rem', minWidth: '160px', position: 'relative', overflow: 'hidden' }}>
    <div style={{
      color: '#94A3B8', fontSize: '0.75rem', fontWeight: '500',
      marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>
      {title}
    </div>
    <div style={{ color: '#F8FAFC', fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.25rem' }}>
      {isLoading ? '...' : value}
    </div>
    {target != null && (
      <div style={{ color: '#64748B', fontSize: '0.7rem' }}>Target: {target}</div>
    )}
    {trend && !isLoading && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem',
        color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#94A3B8',
        fontSize: '0.75rem',
      }}>
        {trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192'} {trendLabel}
      </div>
    )}
  </div>
);

const ChartCard = ({ title, children, isLoading }) => (
  <div style={{ ...CARD_STYLE, padding: '1.5rem' }}>
    <h3 style={{ color: '#F8FAFC', fontSize: '1rem', fontWeight: '600', margin: '0 0 1rem 0' }}>
      {title}
    </h3>
    {isLoading ? (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#64748B' }}>
        Loading...
      </div>
    ) : children}
  </div>
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '12px 16px' }}>
      <p style={{
        margin: '0 0 8px 0', fontWeight: '600', fontSize: '0.75rem',
        color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.03em',
      }}>
        {label}
      </p>
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: '4px 0 0', color: entry.color, fontWeight: '600', fontSize: '0.875rem' }}>
          {entry.name}: {entry.value != null ? entry.value : '-'}
        </p>
      ))}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DailyReport() {
  const [dateRange, setDateRange] = useState('last_7_days');
  const [rawData, setRawData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Fetch data from Supabase ──
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { curFrom, curTo } = calculateDateRanges(dateRange);

      // We need one extra day before curFrom for the previous-day comparison on scorecards
      const prevDate = new Date(curFrom);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;

      const { data, error: fetchError } = await supabase
        .from('daily_report')
        .select('date, metric_name, target, value')
        .gte('date', prevStr)
        .lte('date', curTo)
        .order('date', { ascending: true });

      if (fetchError) throw fetchError;
      setRawData(data || []);
    } catch (err) {
      console.error('DailyReport fetch error:', err);
      setError(err.message || 'Failed to load data');
      setRawData([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ──

  const { curFrom } = useMemo(() => calculateDateRanges(dateRange), [dateRange]);

  /** Map: metric_name -> sorted array of { date, value (number), target (number|null), rawValue } */
  const metricSeries = useMemo(() => {
    const map = {};
    for (const row of rawData) {
      if (!row.metric_name) continue;
      if (!map[row.metric_name]) map[row.metric_name] = [];
      map[row.metric_name].push({
        date: row.date,
        value: parseMetricValue(row.value),
        target: parseMetricValue(row.target),
        rawValue: row.value,
      });
    }
    // Sort each series by date
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [rawData]);

  /** Dates that fall within the actual selected range (excluding the extra prev day) */
  const rangeDates = useMemo(() => {
    const dates = new Set();
    for (const row of rawData) {
      if (row.date >= curFrom) dates.add(row.date);
    }
    return [...dates].sort();
  }, [rawData, curFrom]);

  const latestDate = rangeDates.length > 0 ? rangeDates[rangeDates.length - 1] : null;
  const previousDate = useMemo(() => {
    if (!latestDate) return null;
    // Find the date immediately before latestDate in all available data
    const allDates = [...new Set(rawData.map(r => r.date))].sort();
    const idx = allDates.indexOf(latestDate);
    return idx > 0 ? allDates[idx - 1] : null;
  }, [rawData, latestDate]);

  /** Get the value for a metric on a specific date */
  const getValueOnDate = useCallback((metricName, date) => {
    if (!date || !metricSeries[metricName]) return null;
    const entry = metricSeries[metricName].find(e => e.date === date);
    return entry ? entry.value : null;
  }, [metricSeries]);

  /** Get the target for a metric (from latest date row) */
  const getTarget = useCallback((metricName) => {
    if (!latestDate || !metricSeries[metricName]) return null;
    const entry = metricSeries[metricName].find(e => e.date === latestDate);
    return entry ? entry.target : null;
  }, [metricSeries, latestDate]);

  /** Build chart data: array of { date, [metric1]: val, [metric2]: val, ... } */
  const buildChartData = useCallback((metricNames) => {
    const dateMap = {};
    for (const date of rangeDates) {
      dateMap[date] = { date };
    }
    for (const name of metricNames) {
      const series = metricSeries[name] || [];
      for (const entry of series) {
        if (dateMap[entry.date]) {
          dateMap[entry.date][name] = entry.value;
        }
      }
    }
    // Format dates for display
    return Object.values(dateMap).map(row => {
      const d = new Date(row.date + 'T00:00:00');
      return {
        ...row,
        dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });
  }, [rangeDates, metricSeries]);

  // ── Render ──

  return (
    <div style={{ padding: '0' }}>
      {/* Header */}
      <div className="sticky-filter-bar" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem',
      }}>
        <h2 style={{ color: '#F8FAFC', fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
          Daily Report
        </h2>
        <DateRangePicker value={dateRange} onChange={setDateRange} compact />
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px', padding: '1rem 1.5rem', marginBottom: '1.5rem',
          color: '#FCA5A5', fontSize: '0.875rem',
        }}>
          {error}
        </div>
      )}

      {/* Scorecards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {SCORECARD_METRICS.map(metric => {
          const current = getValueOnDate(metric, latestDate);
          const prev = getValueOnDate(metric, previousDate);
          const target = getTarget(metric);
          const { direction, label } = getTrend(current, prev, metric);
          return (
            <Scorecard
              key={metric}
              title={METRIC_LABELS[metric] ?? metric}
              value={formatDisplayValue(current, metric)}
              target={target != null ? formatDisplayValue(target, metric) : null}
              trend={direction}
              trendLabel={label}
              isLoading={isLoading}
            />
          );
        })}
      </div>

      {/* Chart grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1.5rem',
      }}>
        {CHART_GROUPS.map(group => {
          const chartData = buildChartData(group.metrics);
          // Filter to only metrics that actually have data
          const activeMetrics = group.metrics.filter(m => metricSeries[m] && metricSeries[m].length > 0);

          return (
            <ChartCard key={group.title} title={group.title} isLoading={isLoading}>
              {activeMetrics.length === 0 && !isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#64748B' }}>
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      {activeMetrics.map((m, i) => (
                        <linearGradient key={m} id={`grad-${m.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fill: '#8B949E', fontSize: 11 }}
                      axisLine={{ stroke: '#30363D' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: '#8B949E', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={50}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                    <Legend
                      wrapperStyle={{ paddingTop: '8px', fontSize: '0.75rem', color: '#94A3B8' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    {/* Target reference lines */}
                    {Object.entries(group.targets).map(([metricName, targetVal]) => (
                      <ReferenceLine
                        key={`target-${metricName}`}
                        y={targetVal}
                        stroke="#EF4444"
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                        label={{
                          value: `${METRIC_LABELS[metricName] ?? metricName} Target (${targetVal}${group.suffix || ''})`,
                          fill: '#EF4444',
                          fontSize: 10,
                          position: 'insideTopRight',
                        }}
                      />
                    ))}
                    {activeMetrics.map((m, i) => (
                      <Area
                        key={m}
                        type="monotone"
                        dataKey={m}
                        name={METRIC_LABELS[m] ?? m}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        fill={`url(#grad-${m.replace(/\s+/g, '-')})`}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, fill: '#0D1117' }}
                        connectNulls
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          );
        })}
      </div>

      {/* Responsive breakpoint style */}
      <style>{`
        @media (max-width: 900px) {
          /* Force single column on smaller screens */
          div[style*="grid-template-columns: repeat(2"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
