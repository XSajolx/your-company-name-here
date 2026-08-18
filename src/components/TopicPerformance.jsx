import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { supabase } from '../services/supabaseClient';

const SPO_TABLE = 'Service Performance Overview';
const TOPIC_TABLE = 'Intercom Topic';

// ── date helpers ──────────────────────────────────────────────────────────────
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

function fmtTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    if (s < 3600) { const m = Math.floor(s / 60), rs = s % 60; return rs > 0 ? `${m}m ${rs}s` : `${m}m`; }
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── shared UI ─────────────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label, formatter }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
            <div style={{ color: '#F0F6FC', fontWeight: 600, marginBottom: 4 }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.fill || '#C9D1D9' }}>
                    {p.name}: <strong>{formatter ? formatter(p.value) : p.value}</strong>
                </div>
            ))}
        </div>
    );
};

const KpiCard = ({ label, value, sub, color = '#388BFD' }) => (
    <div style={{
        background: 'rgba(15,20,35,0.5)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
        padding: '1rem 1.25rem', flex: 1, minWidth: 0
    }}>
        <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: '#6E7681', marginTop: 5 }}>{sub}</div>}
    </div>
);

const Card = ({ title, subtitle, children }) => (
    <div style={{
        background: 'rgba(15,20,35,0.5)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: '1.25rem 1.5rem'
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

// ── Horizontal scrollable bar chart with sticky x-axis ───────────────────────
const HBarChart = ({ data, dataKey, color, formatter, refLine }) => {
    const maxVal = data.length > 0 ? Math.max(...data.map(d => d[dataKey] || 0)) : 0;
    const h = Math.max(data.length * 36, 300);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 420 }}>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                <div style={{ height: h, minHeight: 280, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 0 }} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,148,158,0.1)" horizontal={false} />
                            <XAxis type="number" hide domain={[0, maxVal * 1.1 || 1]} />
                            <YAxis type="category" dataKey="topic" width={170} tick={{ fontSize: 10, fill: '#C9D1D9' }} interval={0} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip formatter={formatter} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                            {refLine && <ReferenceLine x={refLine.value} stroke={refLine.color} strokeDasharray="4 4" strokeOpacity={0.6}
                                label={{ value: refLine.label, position: 'insideTopRight', fill: refLine.color, fontSize: 10 }} />}
                            <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} barSize={22} name={dataKey}>
                                {data.map((entry, i) => (
                                    <Cell key={i} fill={refLine
                                        ? (entry[dataKey] <= refLine.value ? '#3FB950' : '#FF7B72')
                                        : color
                                    } />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div style={{ height: 52, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 20 }}>
                        <XAxis type="number" domain={[0, maxVal * 1.1 || 1]} stroke="#30363D"
                            tick={{ fill: '#8B949E', fontSize: 10 }} tickFormatter={formatter}
                            axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                        <YAxis type="category" dataKey="topic" width={170} tick={false} axisLine={false} tickLine={false} />
                        <Bar dataKey={dataKey} fill="transparent" barSize={0} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// ── Metric selector tabs ──────────────────────────────────────────────────────
const TabBtn = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
        padding: '5px 14px', fontSize: '0.75rem', borderRadius: 6, border: 'none', cursor: 'pointer',
        background: active ? '#388BFD' : 'rgba(255,255,255,0.05)',
        color: active ? '#fff' : '#8B949E', fontWeight: active ? 600 : 400,
        transition: 'all 0.15s'
    }}>{children}</button>
);

// ── Main component ────────────────────────────────────────────────────────────
const TopicPerformance = ({ filters = {} }) => {
    const [spoData, setSpoData] = useState([]);
    const [topicMap, setTopicMap] = useState({});   // conv_id → [main topics]
    const [loading, setLoading] = useState(true);
    const [activeMetric, setActiveMetric] = useState('art');

    useEffect(() => {
        const { from, to } = parseDateRange(filters);
        setLoading(true);

        Promise.all([
            // SPO table — timing + CX score
            supabase.from(SPO_TABLE)
                .select('conversation_id, frt_seconds, art_seconds, aht_seconds, "FRT Hit Rate", "ART Hit Rate", "CX score"')
                .gte('created_at', from)
                .lte('created_at', to + 'T23:59:59'),

            // Intercom Topic — conversation → main topics (paginated via range)
            supabase.from(TOPIC_TABLE)
                .select('"Conversation ID", "Main-Topics"')
                .gte('created_date_bd', from)
                .lte('created_date_bd', to)
                .limit(10000),
        ]).then(([spoRes, topicRes]) => {
            setSpoData(spoRes.data || []);

            // Build lookup: conversation_id → Set of main topics
            const map = {};
            (topicRes.data || []).forEach(row => {
                const id = row['Conversation ID'];
                const topics = Array.isArray(row['Main-Topics']) ? row['Main-Topics'] : [];
                if (id && topics.length) map[String(id)] = topics;
            });
            setTopicMap(map);
            setLoading(false);
        });
    }, [filters?.dateRange]);

    // ── Join: distribute SPO rows across their main topics ───────────────────
    const byTopic = useMemo(() => {
        const acc = {};
        spoData.forEach(row => {
            const id = String(row.conversation_id || '');
            const topics = topicMap[id] || ['Unclassified'];
            topics.forEach(topic => {
                if (!acc[topic]) acc[topic] = { frt: [], art: [], aht: [], cx: [], frtHit: 0, artHit: 0, total: 0 };
                const t = acc[topic];
                if (row.frt_seconds != null) t.frt.push(row.frt_seconds);
                if (row.art_seconds != null) t.art.push(row.art_seconds);
                if (row.aht_seconds != null) t.aht.push(row.aht_seconds);
                if (row['CX score'] != null) t.cx.push(row['CX score']);
                if (row['FRT Hit Rate'] === 'Met' || row['FRT Hit Rate'] === true) t.frtHit++;
                if (row['ART Hit Rate'] === 'Met' || row['ART Hit Rate'] === true) t.artHit++;
                t.total++;
            });
        });
        return acc;
    }, [spoData, topicMap]);

    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    const tableData = useMemo(() => {
        return Object.entries(byTopic)
            .filter(([t]) => t !== 'Unclassified')
            .map(([topic, v]) => ({
                topic,
                art: avg(v.art),
                frt: avg(v.frt),
                aht: avg(v.aht),
                cx: avg(v.cx),
                frtHitRate: v.total > 0 ? (v.frtHit / v.total) * 100 : null,
                artHitRate: v.total > 0 ? (v.artHit / v.total) * 100 : null,
                count: v.total,
            }))
            .sort((a, b) => (b[activeMetric] ?? 0) - (a[activeMetric] ?? 0))
            .filter(d => d[activeMetric] != null);
    }, [byTopic, activeMetric]);

    // ── Scorecards ────────────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const all = Object.values(byTopic);
        const frtAll = all.flatMap(v => v.frt);
        const artAll = all.flatMap(v => v.art);
        const ahtAll = all.flatMap(v => v.aht);
        const cxAll = all.flatMap(v => v.cx);
        const totalFrtHit = all.reduce((s, v) => s + v.frtHit, 0);
        const totalArtHit = all.reduce((s, v) => s + v.artHit, 0);
        const total = all.reduce((s, v) => s + v.total, 0);
        return {
            frt: avg(frtAll), art: avg(artAll), aht: avg(ahtAll), cx: avg(cxAll),
            frtHitRate: total > 0 ? (totalFrtHit / total) * 100 : null,
            artHitRate: total > 0 ? (totalArtHit / total) * 100 : null,
            total,
        };
    }, [byTopic]);

    const METRICS = [
        { key: 'art', label: 'Avg Response Time', color: '#C084FC', formatter: fmtTime, ref: null },
        { key: 'frt', label: 'First Response Time', color: '#A78BFA', formatter: fmtTime, ref: null },
        { key: 'aht', label: 'Avg Handling Time', color: '#FB923C', formatter: fmtTime, ref: null },
        { key: 'cx', label: 'CX Score', color: '#3FB950', formatter: v => v?.toFixed(2) ?? '—', ref: { value: 4, color: '#3FB950', label: 'Target 4.0' } },
        { key: 'frtHitRate', label: 'FRT Hit Rate', color: '#3FB950', formatter: v => `${v?.toFixed(1)}%`, ref: null },
        { key: 'artHitRate', label: 'ART Hit Rate', color: '#3FB950', formatter: v => `${v?.toFixed(1)}%`, ref: null },
    ];

    const activeMeta = METRICS.find(m => m.key === activeMetric) || METRICS[0];

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#8B949E', fontSize: '0.9rem' }}>
                Loading performance data...
            </div>
        );
    }

    const noData = spoData.length === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* KPI Row */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <KpiCard label="Avg Response Time (ART)" value={fmtTime(kpis.art)} sub="across all topics" color="#C084FC" />
                <KpiCard label="First Response Time (FRT)" value={fmtTime(kpis.frt)} sub="across all topics" color="#A78BFA" />
                <KpiCard label="Avg Handling Time (AHT)" value={fmtTime(kpis.aht)} sub="across all topics" color="#FB923C" />
                <KpiCard label="CX Score" value={kpis.cx != null ? kpis.cx.toFixed(2) : '—'} sub="avg across all topics" color="#3FB950" />
                <KpiCard label="FRT Hit Rate" value={kpis.frtHitRate != null ? `${kpis.frtHitRate.toFixed(1)}%` : '—'} sub={`${kpis.total} conversations`} color="#E3B341" />
                <KpiCard label="ART Hit Rate" value={kpis.artHitRate != null ? `${kpis.artHitRate.toFixed(1)}%` : '—'} sub="conversations meeting SLA" color="#F472B6" />
            </div>

            {/* Chart — metric selector + bar */}
            <Card
                title="Performance by Main Topic"
                subtitle="Select a metric to rank topics · sorted highest to lowest"
            >
                {noData ? (
                    <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                        No performance data found for the selected date range.
                        {Object.keys(topicMap).length === 0 && ' (Topic mapping is empty — try a wider date range.)'}
                    </div>
                ) : (
                    <>
                        {/* Metric tab selector */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
                            {METRICS.map(m => (
                                <TabBtn key={m.key} active={activeMetric === m.key} onClick={() => setActiveMetric(m.key)}>
                                    {m.label}
                                </TabBtn>
                            ))}
                        </div>

                        {tableData.length > 0 ? (
                            <HBarChart
                                data={tableData}
                                dataKey={activeMetric}
                                color={activeMeta.color}
                                formatter={activeMeta.formatter}
                                refLine={activeMeta.ref}
                            />
                        ) : (
                            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                                No data for this metric
                            </div>
                        )}
                    </>
                )}
            </Card>

            {/* Summary Table */}
            <Card title="All Topics — Performance Summary" subtitle="All metrics side by side">
                {noData ? (
                    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>No data</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ background: '#1C2128', borderBottom: '1px solid #30363D' }}>
                                    {['Main Topic', 'Conversations', 'Avg ART', 'Avg FRT', 'Avg AHT', 'CX Score', 'FRT Hit Rate', 'ART Hit Rate'].map(col => (
                                        <th key={col} style={{ padding: '10px 14px', textAlign: 'left', color: '#8B949E', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(byTopic)
                                    .filter(([t]) => t !== 'Unclassified')
                                    .sort((a, b) => b[1].total - a[1].total)
                                    .map(([topic, v], i) => {
                                        const artAvg = avg(v.art), frtAvg = avg(v.frt), ahtAvg = avg(v.aht), cxAvg = avg(v.cx);
                                        const frtHR = v.total > 0 ? (v.frtHit / v.total) * 100 : null;
                                        const artHR = v.total > 0 ? (v.artHit / v.total) * 100 : null;
                                        return (
                                            <tr key={topic} style={{ borderBottom: '1px solid rgba(48,54,61,0.6)', background: i % 2 === 0 ? 'transparent' : 'rgba(28,33,40,0.4)' }}>
                                                <td style={{ padding: '9px 14px', color: '#F0F6FC', fontWeight: 500 }}>{topic}</td>
                                                <td style={{ padding: '9px 14px', color: '#8B949E' }}>{v.total.toLocaleString()}</td>
                                                <td style={{ padding: '9px 14px', color: '#C084FC' }}>{fmtTime(artAvg)}</td>
                                                <td style={{ padding: '9px 14px', color: '#A78BFA' }}>{fmtTime(frtAvg)}</td>
                                                <td style={{ padding: '9px 14px', color: '#FB923C' }}>{fmtTime(ahtAvg)}</td>
                                                <td style={{ padding: '9px 14px', color: cxAvg != null ? (cxAvg >= 4 ? '#3FB950' : cxAvg >= 3 ? '#E3B341' : '#FF7B72') : '#6E7681' }}>
                                                    {cxAvg != null ? cxAvg.toFixed(2) : '—'}
                                                </td>
                                                <td style={{ padding: '9px 14px', color: frtHR != null ? (frtHR >= 80 ? '#3FB950' : frtHR >= 60 ? '#E3B341' : '#FF7B72') : '#6E7681' }}>
                                                    {frtHR != null ? `${frtHR.toFixed(1)}%` : '—'}
                                                </td>
                                                <td style={{ padding: '9px 14px', color: artHR != null ? (artHR >= 80 ? '#3FB950' : artHR >= 60 ? '#E3B341' : '#FF7B72') : '#6E7681' }}>
                                                    {artHR != null ? `${artHR.toFixed(1)}%` : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default TopicPerformance;
