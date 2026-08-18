import React, { useMemo, useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { supabase } from '../services/supabaseClient';

const SENTIMENT_COLORS = { Positive: '#3FB950', Neutral: '#E3B341', Negative: '#FF7B72' };
const BAR_COLOR = '#388BFD';

// ── helpers ──────────────────────────────────────────────────────────────────
function parseDateRange(filters) {
    const dr = filters?.dateRange || 'last_3_months';
    const DHAKA_MS = 6 * 3600000;
    const now = new Date(Date.now() + DHAKA_MS);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    };
    if (dr.startsWith('custom_')) {
        const p = dr.split('_');
        if (p.length === 3) return { from: p[1], to: p[2] };
    }
    if (dr === 'today') { const d = fmt(today); return { from: d, to: d }; }
    if (dr === 'yesterday') {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return { from: fmt(y), to: fmt(y) };
    }
    if (dr === 'this_month') {
        return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
    }
    if (dr === 'last_month') {
        const f = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(f.getTime() - 86400000);
        const start = new Date(end.getFullYear(), end.getMonth(), 1);
        return { from: fmt(start), to: fmt(end) };
    }
    const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90, last_3_months: 90 }[dr] ?? 30;
    const from = new Date(today); from.setDate(from.getDate() - days);
    return { from: fmt(from), to: fmt(today) };
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
            <div style={{ color: '#F0F6FC', fontWeight: 600, marginBottom: 4 }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.color || '#C9D1D9' }}>
                    {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
                </div>
            ))}
        </div>
    );
};

const SentimentTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    return (
        <div style={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
            <div style={{ color: '#F0F6FC', fontWeight: 600, marginBottom: 4 }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: SENTIMENT_COLORS[p.name] || '#C9D1D9' }}>
                    {p.name}: <strong>{p.value}</strong> ({total > 0 ? ((p.value / total) * 100).toFixed(1) : 0}%)
                </div>
            ))}
            <div style={{ color: '#8B949E', marginTop: 4 }}>Total: {total}</div>
        </div>
    );
};

// ── Card wrapper ──────────────────────────────────────────────────────────────
const Card = ({ title, subtitle, children, style = {} }) => (
    <div style={{
        background: 'rgba(15,20,35,0.5)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: '1.25rem 1.5rem', ...style
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

// ── KPI scorecard ─────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color = '#388BFD' }) => (
    <div style={{
        background: 'rgba(15,20,35,0.5)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
        padding: '1rem 1.25rem', flex: 1, minWidth: 0
    }}>
        <div style={{ fontSize: '0.75rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: '#6E7681', marginTop: 5 }}>{sub}</div>}
    </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const CountryPerformance = ({ data = [], filters = {} }) => {
    const [csatRows, setCsatRows] = useState([]);
    const [csatLoading, setCsatLoading] = useState(true);

    // Fetch CSAT data for the same date range
    useEffect(() => {
        const { from, to } = parseDateRange(filters);
        setCsatLoading(true);
        supabase
            .from('CSAT New')
            .select('Date, "Conversation rating", Country')
            .gte('Date', from)
            .lte('Date', to)
            .then(({ data: rows }) => {
                setCsatRows(rows || []);
                setCsatLoading(false);
            });
    }, [filters?.dateRange]);

    // ── Country Conversation Volume ───────────────────────────────────────────
    const volumeData = useMemo(() => {
        const counts = {};
        data.forEach(c => {
            const country = c.country || c.Country || 'Unknown';
            if (!country || country === 'Unknown') return;
            counts[country] = (counts[country] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([country, count]) => ({ country, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 25);
    }, [data]);

    // ── Country Sentiment Distribution (100% stacked, sorted by % negative) ──
    const sentimentData = useMemo(() => {
        const byCountry = {};
        data.forEach(c => {
            const country = c.country || c.Country || 'Unknown';
            if (!country || country === 'Unknown') return;
            const sentiment = c.sentiment || 'Neutral';
            if (!byCountry[country]) byCountry[country] = { Positive: 0, Neutral: 0, Negative: 0, total: 0 };
            const key = ['Positive', 'Negative', 'Neutral'].find(s => sentiment.toLowerCase().includes(s.toLowerCase())) || 'Neutral';
            byCountry[country][key]++;
            byCountry[country].total++;
        });
        return Object.entries(byCountry)
            .filter(([, v]) => v.total >= 3)
            .map(([country, v]) => ({
                country,
                Positive: parseFloat(((v.Positive / v.total) * 100).toFixed(1)),
                Neutral: parseFloat(((v.Neutral / v.total) * 100).toFixed(1)),
                Negative: parseFloat(((v.Negative / v.total) * 100).toFixed(1)),
                total: v.total,
            }))
            .sort((a, b) => b.Negative - a.Negative)
            .slice(0, 25);
    }, [data]);

    // ── Country CSAT ──────────────────────────────────────────────────────────
    const csatData = useMemo(() => {
        const byCountry = {};
        csatRows.forEach(r => {
            const country = r.Country || 'Unknown';
            if (!country || country === 'Unknown') return;
            const rating = parseFloat(r['Conversation rating']);
            if (isNaN(rating)) return;
            if (!byCountry[country]) byCountry[country] = { sum: 0, count: 0 };
            byCountry[country].sum += rating;
            byCountry[country].count++;
        });
        return Object.entries(byCountry)
            .filter(([, v]) => v.count >= 2)
            .map(([country, v]) => ({
                country,
                avgCsat: parseFloat((v.sum / v.count).toFixed(2)),
                count: v.count,
            }))
            .sort((a, b) => b.avgCsat - a.avgCsat)
            .slice(0, 25);
    }, [csatRows]);

    // ── Summary KPIs ──────────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const countries = new Set(data.map(c => c.country || c.Country).filter(Boolean));
        const total = data.length;
        const neg = data.filter(c => (c.sentiment || '').toLowerCase().includes('negative')).length;
        const pos = data.filter(c => (c.sentiment || '').toLowerCase().includes('positive')).length;
        const avgCsat = csatRows.length > 0
            ? (csatRows.reduce((s, r) => s + (parseFloat(r['Conversation rating']) || 0), 0) / csatRows.length).toFixed(2)
            : '—';
        return { countries: countries.size, total, neg, pos, avgCsat };
    }, [data, csatRows]);

    const barH = (n) => Math.max(n * 32, 300);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* KPI Row */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <KpiCard label="Countries" value={kpis.countries} sub="with conversations" />
                <KpiCard label="Total Conversations" value={kpis.total.toLocaleString()} sub="in selected period" color="#A78BFA" />
                <KpiCard label="Negative Sentiment" value={kpis.total > 0 ? `${((kpis.neg / kpis.total) * 100).toFixed(1)}%` : '—'} sub={`${kpis.neg} conversations`} color="#FF7B72" />
                <KpiCard label="Positive Sentiment" value={kpis.total > 0 ? `${((kpis.pos / kpis.total) * 100).toFixed(1)}%` : '—'} sub={`${kpis.pos} conversations`} color="#3FB950" />
                <KpiCard label="Avg CSAT Score" value={csatLoading ? '...' : kpis.avgCsat} sub="across all countries" color="#E3B341" />
            </div>

            {/* Row 1: Volume + Sentiment side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

                {/* Country Volume */}
                <Card title="Conversation Volume by Country" subtitle="Top 25 countries, ranked by volume">
                    <div style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
                        {volumeData.length > 0 ? (
                            <>
                                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                                    <div style={{ height: barH(volumeData.length), minHeight: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={volumeData} layout="vertical" margin={{ top: 4, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,148,158,0.1)" horizontal={false} />
                                                <XAxis type="number" hide />
                                                <YAxis type="category" dataKey="country" width={100} tick={{ fontSize: 11, fill: '#C9D1D9' }} interval={0} axisLine={false} tickLine={false} />
                                                <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                                <Bar dataKey="count" name="Conversations" radius={[0, 4, 4, 0]} barSize={20} fill={BAR_COLOR}>
                                                    {volumeData.map((_, i) => <Cell key={i} fill={BAR_COLOR} />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div style={{ height: 48, flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={volumeData} layout="vertical" margin={{ top: 4, right: 50, left: 10, bottom: 20 }}>
                                            <XAxis type="number" stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                            <YAxis type="category" dataKey="country" width={100} tick={false} axisLine={false} tickLine={false} />
                                            <Bar dataKey="count" fill="transparent" barSize={0} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>No data available</div>
                        )}
                    </div>
                </Card>

                {/* Country Sentiment */}
                <Card title="Sentiment Distribution by Country" subtitle="Sorted by % negative · min 3 conversations · top 25">
                    <div style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
                        {sentimentData.length > 0 ? (
                            <>
                                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                                    <div style={{ height: barH(sentimentData.length), minHeight: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={sentimentData} layout="vertical" margin={{ top: 4, right: 10, left: 10, bottom: 0 }} barCategoryGap="20%">
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,148,158,0.1)" horizontal={false} />
                                                <XAxis type="number" domain={[0, 100]} hide tickFormatter={v => `${v}%`} />
                                                <YAxis type="category" dataKey="country" width={100} tick={{ fontSize: 11, fill: '#C9D1D9' }} interval={0} axisLine={false} tickLine={false} />
                                                <Tooltip content={<SentimentTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                                <Bar dataKey="Negative" stackId="s" fill={SENTIMENT_COLORS.Negative} barSize={20} name="Negative" />
                                                <Bar dataKey="Neutral" stackId="s" fill={SENTIMENT_COLORS.Neutral} barSize={20} name="Neutral" />
                                                <Bar dataKey="Positive" stackId="s" fill={SENTIMENT_COLORS.Positive} barSize={20} name="Positive" radius={[0, 4, 4, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div style={{ height: 48, flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={sentimentData} layout="vertical" margin={{ top: 4, right: 10, left: 10, bottom: 20 }}>
                                            <XAxis type="number" domain={[0, 100]} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} tickFormatter={v => `${v}%`} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                            <YAxis type="category" dataKey="country" width={100} tick={false} axisLine={false} tickLine={false} />
                                            <Bar dataKey="Negative" stackId="s" fill="transparent" barSize={0} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Legend */}
                                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingTop: 8 }}>
                                    {['Negative', 'Neutral', 'Positive'].map(s => (
                                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#C9D1D9' }}>
                                            <div style={{ width: 10, height: 10, borderRadius: 2, background: SENTIMENT_COLORS[s] }} />
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>No sentiment data available</div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Row 2: CSAT by Country */}
            <Card title="Average CSAT Score by Country" subtitle="Ranked highest to lowest · min 2 ratings · top 25">
                <div style={{ display: 'flex', flexDirection: 'column', height: 420 }}>
                    {csatLoading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>Loading CSAT data...</div>
                    ) : csatData.length > 0 ? (
                        <>
                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                                <div style={{ height: barH(csatData.length), minHeight: 300 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={csatData} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 0 }} barCategoryGap="20%">
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,148,158,0.1)" horizontal={false} />
                                            <XAxis type="number" domain={[0, 5]} hide />
                                            <YAxis type="category" dataKey="country" width={110} tick={{ fontSize: 11, fill: '#C9D1D9' }} interval={0} axisLine={false} tickLine={false} />
                                            <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                            <ReferenceLine x={4} stroke="#3FB950" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Target 4.0', position: 'insideTopRight', fill: '#3FB950', fontSize: 10 }} />
                                            <Bar dataKey="avgCsat" name="Avg CSAT" radius={[0, 4, 4, 0]} barSize={20}>
                                                {csatData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.avgCsat >= 4 ? '#3FB950' : entry.avgCsat >= 3 ? '#E3B341' : '#FF7B72'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div style={{ height: 48, flexShrink: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={csatData} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 20 }}>
                                        <XAxis type="number" domain={[0, 5]} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                        <YAxis type="category" dataKey="country" width={110} tick={false} axisLine={false} tickLine={false} />
                                        <Bar dataKey="avgCsat" fill="transparent" barSize={0} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#6E7681', textAlign: 'center', paddingTop: 4 }}>
                                Green ≥ 4.0 · Yellow ≥ 3.0 · Red &lt; 3.0 &nbsp;|&nbsp; Dashed line = target (4.0)
                            </div>
                        </>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>No CSAT data available</div>
                    )}
                </div>
            </Card>

            {/* Coming Soon Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                {[
                    { title: 'ART / AHT / FRT by Country', desc: 'Average Response, Handling & First Response Time per country' },
                    { title: 'QC Score by Country', desc: 'Agent quality compliance score per country' },
                    { title: 'CXScore by Country', desc: 'Overall CX score per country — requires CXScore data' },
                ].map(({ title, desc }) => (
                    <Card key={title} style={{ opacity: 0.5 }}>
                        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔒</div>
                            <div style={{ color: '#F0F6FC', fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>{title}</div>
                            <div style={{ color: '#6E7681', fontSize: '0.75rem' }}>{desc}</div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default CountryPerformance;
