import React, { useState, useEffect, useMemo } from 'react';
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, Cell, Legend
} from 'recharts';
import { supabase } from '../services/supabaseClient';

const SPO_TABLE = 'Service Performance Overview';
const TOPIC_TABLE = 'Intercom Topic';
const CSAT_TABLE = 'CSAT New';

function parseDateRange(filters) {
    const dr = filters?.dateRange || 'last_3_months';
    const DHAKA_MS = 6 * 3600000;
    const now = new Date(Date.now() + DHAKA_MS);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = d => {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    };
    if (dr.startsWith('custom_')) { const p = dr.split('_'); if (p.length === 3) return { from: p[1], to: p[2] }; }
    if (dr === 'today') { const d = fmt(today); return { from: d, to: d }; }
    if (dr === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: fmt(y), to: fmt(y) }; }
    if (dr === 'this_month') return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
    if (dr === 'last_month') {
        const f = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(f.getTime() - 86400000);
        return { from: fmt(new Date(end.getFullYear(), end.getMonth(), 1)), to: fmt(end) };
    }
    const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90, last_3_months: 90 }[dr] ?? 30;
    const from = new Date(today); from.setDate(from.getDate() - days);
    return { from: fmt(from), to: fmt(today) };
}

const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

const scoreColor = v => {
    if (v == null) return '#8B949E';
    if (v >= 4) return '#10B981';
    if (v >= 3) return '#F59E0B';
    return '#EF4444';
};

const DarkTooltip = ({ active, payload, label, formatter }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
            <div style={{ color: '#F0F6FC', fontWeight: 600, marginBottom: 4 }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.stroke || p.fill || '#C9D1D9' }}>
                    {p.name}: <strong>{formatter ? formatter(p.value) : p.value}</strong>
                </div>
            ))}
        </div>
    );
};

const KpiCard = ({ label, value, sub, color = '#8B5CF6', locked }) => (
    <div style={{
        background: 'rgba(15,20,35,0.5)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
        padding: '1rem 1.25rem', flex: 1, minWidth: 0, position: 'relative'
    }}>
        {locked && (
            <span style={{
                position: 'absolute', top: 8, right: 10,
                background: 'rgba(251,191,36,0.15)', color: '#FBBF24',
                fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, fontWeight: 600
            }}>ON HOLD</span>
        )}
        <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: '#6E7681', marginTop: 5 }}>{sub}</div>}
    </div>
);

const Card = ({ title, subtitle, children, fullWidth }) => (
    <div style={{
        background: 'rgba(15,20,35,0.5)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: '1.25rem 1.5rem',
        ...(fullWidth ? { gridColumn: '1 / -1' } : {})
    }}>
        {title && (
            <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#F0F6FC', fontSize: '0.9375rem', fontWeight: 600 }}>{title}</h3>
                {subtitle && <p style={{ margin: '4px 0 0', color: '#8B949E', fontSize: '0.75rem' }}>{subtitle}</p>}
            </div>
        )}
        {children}
    </div>
);

// Scrollable horizontal bar with sticky axis
const HBarChart = ({ data, valueKey, color, formatter, refVal }) => {
    const ROW_H = 32, MIN_H = 300, MAX_VIS = 12;
    const plotH = Math.max(MIN_H, data.length * ROW_H);
    const visH = Math.min(plotH, MAX_VIS * ROW_H + 40);
    const domain = [0, Math.max(...data.map(d => d[valueKey] || 0)) * 1.1];

    return (
        <div style={{ position: 'relative', height: visH, userSelect: 'none' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <div style={{ height: plotH }}>
                    <ResponsiveContainer width="100%" height={plotH}>
                        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                            <XAxis type="number" domain={domain} tick={false} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="topic" width={160} tick={{ fill: '#C9D1D9', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip formatter={formatter} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                            {refVal != null && <ReferenceLine x={refVal} stroke="#F59E0B" strokeDasharray="4 4" />}
                            <Bar dataKey={valueKey} name="CX Score" radius={[0, 4, 4, 0]}>
                                {data.map((entry, i) => (
                                    <Cell key={i} fill={color ? color : scoreColor(entry[valueKey])} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {/* Sticky x-axis */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: 'rgba(15,20,35,0.95)', pointerEvents: 'none', zIndex: 2 }}>
                <ResponsiveContainer width="100%" height={28}>
                    <BarChart data={[data[0]]} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <XAxis type="number" domain={domain} tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} tickFormatter={formatter} />
                        <YAxis type="category" dataKey="topic" width={160} tick={false} axisLine={false} tickLine={false} />
                        <Bar dataKey={valueKey} fill="transparent" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default function CXScore({ filters = {} }) {
    const [spoData, setSpoData] = useState([]);
    const [topicMap, setTopicMap] = useState({});
    const [csatTrend, setCsatTrend] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const { from, to } = parseDateRange(filters);
        setLoading(true);

        Promise.all([
            supabase.from(SPO_TABLE)
                .select('conversation_id, "CX score", created_at, sentiment')
                .gte('created_at', from)
                .lte('created_at', to + 'T23:59:59')
                .not('"CX score"', 'is', null)
                .limit(10000),

            supabase.from(TOPIC_TABLE)
                .select('"Conversation ID", "Main-Topics"')
                .gte('created_date_bd', from)
                .lte('created_date_bd', to)
                .limit(10000),

            supabase.from(CSAT_TABLE)
                .select('Date, "Conversation rating"')
                .gte('Date', from)
                .lte('Date', to)
                .not('"Conversation rating"', 'is', null)
                .limit(10000),
        ]).then(([spoRes, topicRes, csatRes]) => {
            setSpoData(spoRes.data || []);

            const map = {};
            (topicRes.data || []).forEach(row => {
                const id = row['Conversation ID'];
                const topics = Array.isArray(row['Main-Topics']) ? row['Main-Topics'] : [];
                if (id && topics.length) map[String(id)] = topics;
            });
            setTopicMap(map);
            setCsatTrend(csatRes.data || []);
            setLoading(false);
        });
    }, [filters?.dateRange]);

    // Scorecards
    const kpis = useMemo(() => {
        if (!spoData.length) return null;
        const scores = spoData.map(r => r['CX score']).filter(v => v != null);
        const mean = avg(scores);
        const high = scores.filter(v => v >= 4).length;
        const low = scores.filter(v => v < 3).length;
        return {
            avg: mean != null ? mean.toFixed(2) : '—',
            total: scores.length,
            highPct: scores.length ? ((high / scores.length) * 100).toFixed(1) : '—',
            lowPct: scores.length ? ((low / scores.length) * 100).toFixed(1) : '—',
        };
    }, [spoData]);

    // CXScore by topic
    const topicData = useMemo(() => {
        const acc = {};
        spoData.forEach(row => {
            const id = String(row.conversation_id || '');
            const topics = topicMap[id] || [];
            if (!topics.length) return;
            topics.forEach(topic => {
                if (!acc[topic]) acc[topic] = [];
                acc[topic].push(row['CX score']);
            });
        });
        return Object.entries(acc)
            .map(([topic, vals]) => ({ topic, cx: avg(vals) != null ? +avg(vals).toFixed(2) : null }))
            .filter(d => d.cx != null)
            .sort((a, b) => b.cx - a.cx);
    }, [spoData, topicMap]);

    // CXScore trend (weekly buckets)
    const cxTrend = useMemo(() => {
        const buckets = {};
        spoData.forEach(row => {
            const d = (row.created_at || '').slice(0, 10);
            if (!d) return;
            if (!buckets[d]) buckets[d] = [];
            buckets[d].push(row['CX score']);
        });
        return Object.entries(buckets)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, vals]) => ({ date, cx: +avg(vals).toFixed(2) }));
    }, [spoData]);

    // CSAT trend for comparison (daily)
    const csatTrendData = useMemo(() => {
        const buckets = {};
        csatTrend.forEach(row => {
            const d = (row.Date || '').slice(0, 10);
            if (!d) return;
            if (!buckets[d]) buckets[d] = [];
            buckets[d].push(row['Conversation rating']);
        });
        return Object.entries(buckets)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, vals]) => ({ date, csat: +avg(vals).toFixed(2) }));
    }, [csatTrend]);

    // Merge CX + CSAT trends by date
    const comparisonData = useMemo(() => {
        const map = {};
        cxTrend.forEach(r => { map[r.date] = { date: r.date, cx: r.cx }; });
        csatTrendData.forEach(r => {
            if (!map[r.date]) map[r.date] = { date: r.date };
            map[r.date].csat = r.csat;
        });
        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    }, [cxTrend, csatTrendData]);

    const fmtScore = v => v != null ? `${v}` : '—';

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#8B949E', fontSize: '0.9rem' }}>
                Loading CX Score data...
            </div>
        );
    }

    return (
        <div style={{ padding: '0 0 2rem' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(15,20,35,0.8) 0%, rgba(30,41,59,0.6) 50%, rgba(15,20,35,0.8) 100%)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16, padding: '1.25rem 2rem', marginBottom: '1.5rem',
                border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid #8B5CF6',
                display: 'flex', alignItems: 'center', gap: '0.75rem'
            }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <h1 style={{ color: '#F8FAFC', fontSize: '1.25rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg,#F8FAFC 0%,#94A3B8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    CX Score
                </h1>
            </div>

            {/* KPI Row */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <KpiCard
                    label="Avg CX Score"
                    value={kpis?.avg ?? '—'}
                    sub="out of 5.0"
                    color={kpis?.avg != null ? scoreColor(parseFloat(kpis.avg)) : '#8B949E'}
                />
                <KpiCard label="Scored Conversations" value={kpis?.total?.toLocaleString() ?? '—'} sub="with CX Score data" color="#388BFD" />
                <KpiCard
                    label="High Score (≥ 4.0)"
                    value={kpis?.highPct != null ? `${kpis.highPct}%` : '—'}
                    sub="of scored conversations"
                    color="#10B981"
                />
                <KpiCard
                    label="Low Score (< 3.0)"
                    value={kpis?.lowPct != null ? `${kpis.lowPct}%` : '—'}
                    sub="of scored conversations"
                    color="#EF4444"
                />
            </div>

            {/* Charts grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                {/* CXScore Trend */}
                <Card title="CX Score Trend Over Time" subtitle="Daily average CX Score" fullWidth={false}>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={cxTrend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="cxGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={false} tickLine={false}
                                tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                            <YAxis domain={[0, 5]} tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip formatter={fmtScore} />} />
                            <ReferenceLine y={4} stroke="#10B981" strokeDasharray="4 4" strokeOpacity={0.5} />
                            <ReferenceLine y={3} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.4} />
                            <Area type="monotone" dataKey="cx" name="CX Score" stroke="#8B5CF6" strokeWidth={2} fill="url(#cxGrad)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </Card>

                {/* CX vs CSAT Comparison */}
                <Card title="CX Score vs CSAT Comparison" subtitle="Daily averages — CX Score (purple) vs CSAT (teal)">
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={comparisonData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={false} tickLine={false}
                                tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                            <YAxis domain={[0, 5]} tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip formatter={fmtScore} />} />
                            <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#8B949E' }} />
                            <Line type="monotone" dataKey="cx" name="CX Score" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="csat" name="CSAT" stroke="#14B8A6" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                        </LineChart>
                    </ResponsiveContainer>
                </Card>

                {/* CXScore by Topic */}
                <Card title="CX Score by Topic" subtitle="Average CX Score per main topic — color-coded by score" fullWidth>
                    {topicData.length === 0 ? (
                        <div style={{ color: '#8B949E', textAlign: 'center', padding: '2rem' }}>No topic data available for this period.</div>
                    ) : (
                        <HBarChart
                            data={topicData}
                            valueKey="cx"
                            formatter={v => v?.toFixed(2)}
                            refVal={4}
                        />
                    )}
                </Card>
            </div>
        </div>
    );
}
