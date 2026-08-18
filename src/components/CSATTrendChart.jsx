import React, { useState, useEffect, useMemo } from 'react';
import { fetchCSATTrend } from '../services/api';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const CSATTrendChart = ({ filters, onDateClick }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const trendData = await fetchCSATTrend(filters);
                setData(trendData || []);
            } catch (error) {
                console.error('CSATTrendChart: Error loading CSAT trend:', error);
                setData([]);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [filters]);

    // Compute linear regression trend line
    const dataWithTrend = useMemo(() => {
        if (data.length < 2) return data;
        const n = data.length;
        const vals = data.map((d, i) => ({ x: i, y: d.avg_rating || 0 }));
        const sumX = vals.reduce((s, v) => s + v.x, 0);
        const sumY = vals.reduce((s, v) => s + v.y, 0);
        const sumXY = vals.reduce((s, v) => s + v.x * v.y, 0);
        const sumX2 = vals.reduce((s, v) => s + v.x * v.x, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        return data.map((d, i) => ({
            ...d,
            trend: Math.round((slope * i + intercept) * 100) / 100
        }));
    }, [data]);

    const formatXAxis = (value) => {
        const date = new Date(value);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const date = new Date(label);
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
                <div style={{
                    backgroundColor: '#1C2128',
                    padding: '12px 16px',
                    border: '1px solid #30363D',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    color: '#F0F6FC'
                }}>
                    <p style={{ margin: 0, fontWeight: '600', color: '#8B949E', fontSize: '0.75rem' }}>{formattedDate}</p>
                    {payload.map((p, i) => (
                        <p key={i} style={{ margin: '4px 0 0', color: p.color || '#7C3AED', fontWeight: '700', fontSize: '0.9rem' }}>
                            {p.name}: {p.value}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    // Smart label: only show every Nth label to avoid overlap
    const CustomDot = (props) => {
        const { cx, cy, payload, index } = props;
        const total = dataWithTrend.length;
        const showLabel = total <= 10 || index % Math.ceil(total / 10) === 0 || index === total - 1;

        return (
            <g>
                <circle cx={cx} cy={cy} r={3.5} fill="#7C3AED" stroke="#0D1117" strokeWidth={2} />
                {showLabel && (
                    <text x={cx} y={cy - 14} textAnchor="middle" fill="#C084FC" fontSize="10" fontWeight="600">
                        {payload.avg_rating}
                    </text>
                )}
            </g>
        );
    };

    return (
        <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header" style={{ borderBottom: 'none', paddingBottom: '0.5rem' }}>
                <div>
                    <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>
                        CSAT Trends Over Time
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: '#8B949E', margin: 0 }}>
                        {filters.dateRange === 'last_7_days' ? 'Last 7 days' :
                            filters.dateRange === 'last_30_days' ? 'Last 30 days' :
                                'Last 90 days'}
                    </p>
                </div>
            </div>
            <div className="chart-container" style={{ height: '300px', marginTop: '1rem' }}>
                {loading ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                        Loading...
                    </div>
                ) : dataWithTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                                data={dataWithTrend}
                                margin={{ top: 30, right: 30, left: 0, bottom: 5 }}
                                style={onDateClick ? { cursor: 'pointer' } : {}}
                                onClick={onDateClick ? (chartData) => {
                                    const date = chartData?.activePayload?.[0]?.payload?.date;
                                    if (date) onDateClick(date);
                                } : undefined}
                            >
                            <defs>
                                <linearGradient id="colorRating" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.08)" vertical={false} />

                            <XAxis
                                dataKey="date"
                                stroke="#30363D"
                                tick={{ fill: '#6E7681', fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: '#30363D' }}
                                tickFormatter={formatXAxis}
                                interval="preserveStartEnd"
                                minTickGap={50}
                            />

                            <YAxis stroke="#30363D" tick={{ fill: '#6E7681', fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 5]} hide />

                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#7C3AED', strokeWidth: 1, strokeDasharray: '5 5', fill: 'transparent' }} />

                            <Area
                                type="monotone"
                                dataKey="avg_rating"
                                stroke="#7C3AED"
                                strokeWidth={2.5}
                                fill="url(#colorRating)"
                                dot={<CustomDot />}
                                activeDot={{ r: 6, fill: '#7C3AED', stroke: '#0D1117', strokeWidth: 2 }}
                                name="CSAT"
                            />

                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                        No trend data available
                    </div>
                )}
            </div>

            {/* Legend */}
            {dataWithTrend.length > 0 && (
                <div style={{
                    display: 'flex', justifyContent: 'center', gap: '1.5rem',
                    marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #30363D'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#7C3AED' }} />
                        <span style={{ color: '#8B949E', fontSize: '0.75rem', fontWeight: 500 }}>CSAT Score</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CSATTrendChart;
