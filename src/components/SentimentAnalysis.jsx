import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area, Legend, LabelList, LineChart, Line, ReferenceLine, ComposedChart
} from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import ConversationList from './ConversationList';
import { TOPIC_MAPPING, QUERY_TOPIC_MAPPING } from '../utils/topicMapping';
import cloud from 'd3-cloud';
import AthenaPanel, { AthenaTriggerBtn } from './AthenaPanel';
import { useAthena } from '../hooks/useAthena';

// ─── Word Cloud using d3-cloud ───
const WC_COLORS = ['#EF4444','#F87171','#FB923C','#FBBF24','#F43F5E','#E11D48','#DC2626','#EA580C','#D97706','#BE123C','#FB7185','#FCA5A5','#FDBA74','#FDE047','#FDA4AF','#F97316','#EC4899','#F59E0B','#E879F9','#A78BFA'];

const WordCloudSVG = ({ words, onWordClick }) => {
    const [placed, setPlaced] = React.useState([]);
    const W = 900, H = 420;

    React.useEffect(() => {
        if (!words || words.length === 0) { setPlaced([]); return; }
        const maxCount = words[0]?.count || 1;
        const layout = cloud()
            .size([W, H])
            .words(words.map((w, i) => ({ text: w.word, size: 14 + Math.pow(w.count / maxCount, 0.5) * 56, count: w.count, colorIdx: i })))
            .padding(3)
            .rotate(() => { const r = Math.random(); return r < 0.65 ? 0 : r < 0.82 ? 90 : -90; })
            .font("'DM Sans', Impact, 'Arial Black', sans-serif")
            .fontWeight('bold')
            .fontSize(d => d.size)
            .spiral('archimedean')
            .on('end', output => setPlaced(output));
        layout.start();
    }, [words]);

    if (!words || words.length === 0) return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>No data</div>;

    return (
        <div style={{ width: '100%', height: H, overflow: 'hidden' }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
                <g transform={`translate(${W/2},${H/2})`}>
                    {placed.map((w, i) => (
                        <text
                            key={w.text}
                            textAnchor="middle"
                            transform={`translate(${w.x},${w.y}) rotate(${w.rotate})`}
                            fontSize={w.size}
                            fontWeight="bold"
                            fontFamily="'DM Sans', Impact, 'Arial Black', sans-serif"
                            fill={WC_COLORS[w.colorIdx % WC_COLORS.length]}
                            opacity={0.85}
                            style={{ cursor: 'pointer', transition: 'opacity 0.2s, filter 0.2s' }}
                            onMouseEnter={e => { e.target.style.opacity = '1'; e.target.style.filter = `drop-shadow(0 0 8px ${WC_COLORS[w.colorIdx % WC_COLORS.length]}80)`; }}
                            onMouseLeave={e => { e.target.style.opacity = '0.85'; e.target.style.filter = 'none'; }}
                            onClick={() => onWordClick && onWordClick(w.text)}
                        >
                            <title>{w.text}: {w.count} occurrences — click to drill in</title>
                            {w.text}
                        </text>
                    ))}
                </g>
            </svg>
        </div>
    );
};

// ─── DrillInModal ────────────────────────────────────────────────────────────
const DRILL_PAGE_SIZE = 15;

const DrillInModal = ({ drillIn, onClose, onAskAthena }) => {
    const [page, setPage] = useState(0);
    const [sortField, setSortField] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const overlayRef = useRef(null);
    const [viewingConv, setViewingConv] = useState(null); // { id, messages: [{role,text}] }
    const [convLoading, setConvLoading] = useState(false);

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };
    const sortIcon = (field) => sortField !== field ? ' ⇅' : sortDir === 'asc' ? ' ▲' : ' ▼';
    const getSortValue = (row, field) => {
        if (field === 'conversation_id') return row.conversation_id || '';
        if (field === 'sentiment') return row.sentiment || '';
        if (field === 'topic') return Array.isArray(row.main_topic) ? row.main_topic.join(', ') : (row.main_topic || '');
        if (field === 'subtopic') return Array.isArray(row.topic) ? row.topic.join(', ') : (row.topic || '');
        if (field === 'date') return row.created_date_bd || '';
        return '';
    };

    const fetchConversation = useCallback(async (id) => {
        if (!id) return;
        setConvLoading(true);
        setViewingConv({ id, messages: null });
        try {
            const res = await fetch('/api/analyze-topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'fetch-single', conversationId: id }),
            });
            const json = await res.json();
            if (json.success && json.data?.Transcript) {
                const lines = json.data.Transcript.split('\n');
                const messages = lines
                    .map(line => {
                        const trimmed = line.trim();
                        if (!trimmed) return null;
                        if (/^(User|Customer|Client):/i.test(trimmed)) {
                            return { role: 'customer', text: trimmed.replace(/^(User|Customer|Client):\s*/i, '') };
                        }
                        if (/^(Agent|Admin|Teammate):/i.test(trimmed)) {
                            return { role: 'agent', text: trimmed.replace(/^(Agent|Admin|Teammate):\s*/i, '') };
                        }
                        return null;
                    })
                    .filter(Boolean);
                setViewingConv({ id, messages });
            } else {
                setViewingConv({ id, messages: [], error: json.error || 'No transcript available.' });
            }
        } catch (err) {
            setViewingConv({ id, messages: [], error: 'Failed to load conversation.' });
        } finally {
            setConvLoading(false);
        }
    }, []);

    // Pagination removed — render the full set inside the scroll container.
    const baseData = drillIn?.data || [];
    const pageData = sortField
        ? [...baseData].sort((a, b) => {
            const av = String(getSortValue(a, sortField)).toLowerCase();
            const bv = String(getSortValue(b, sortField)).toLowerCase();
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
          })
        : baseData;

    const handleOverlayClick = useCallback((e) => {
        if (e.target === overlayRef.current) onClose();
    }, [onClose]);

    const exportCSV = useCallback(() => {
        if (!drillIn?.data?.length) return;
        const cols = ['conversation_id', 'sentiment', 'topic', 'subtopic', 'channel', 'country', 'created_date_bd', 'transcript_preview'];
        const rows = drillIn.data.map(row => cols.map(col => {
            let val = '';
            if (col === 'topic') val = Array.isArray(row.main_topic) ? row.main_topic.join('; ') : (row.main_topic || '');
            else if (col === 'subtopic') val = Array.isArray(row.topic) ? row.topic.join('; ') : (row.topic || '');
            else if (col === 'transcript_preview') val = (row.transcript || '').slice(0, 120).replace(/\n/g, ' ');
            else val = row[col] ?? '';
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(','));
        const csv = [cols.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(drillIn.title || 'drill-in').replace(/[^a-z0-9]/gi, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [drillIn]);

    if (!drillIn) return null;

    const sentColor = { positive: '#22C55E', neutral: '#6B7280', negative: '#EF4444' };

    return (
        <>
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1.5rem',
            }}
        >
            <div style={{
                background: '#0D1117', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '16px', width: '100%', maxWidth: '1000px',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
                    flexShrink: 0,
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#F0F6FC', fontSize: '1rem', fontWeight: '700' }}>
                            {drillIn.title}
                        </h2>
                        <p style={{ margin: '2px 0 0 0', color: '#8B949E', fontSize: '0.75rem' }}>
                            {drillIn.data.length} conversation{drillIn.data.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {onAskAthena && (
                            <AthenaTriggerBtn onClick={() => onAskAthena(drillIn.title, drillIn.data.length, drillIn.data)} />
                        )}
                        <button
                            onClick={exportCSV}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.4)',
                                background: 'rgba(99,102,241,0.15)', color: '#818CF8', fontSize: '0.8rem',
                                fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s',
                            }}
                            onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.28)'}
                            onMouseLeave={e => e.target.style.background = 'rgba(99,102,241,0.15)'}
                        >
                            Export CSV
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
                                color: '#8B949E', fontSize: '1.1rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.2s, color 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#F0F6FC'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#8B949E'; }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '0 1.5rem' }}>
                    {pageData.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>No data</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ position: 'sticky', top: 0, background: '#0D1117', zIndex: 1 }}>
                                    {[
                                        { label: 'Conversation ID', field: 'conversation_id' },
                                        { label: 'Sentiment', field: 'sentiment' },
                                        { label: 'Topic', field: 'topic' },
                                        { label: 'Subtopic', field: 'subtopic' },
                                        { label: 'Date', field: 'date' },
                                    ].map(h => (
                                        <th key={h.field}
                                            onClick={() => toggleSort(h.field)}
                                            style={{
                                                padding: '12px 8px 10px', textAlign: 'left', color: '#8B949E',
                                                fontWeight: '600', fontSize: '0.7rem', textTransform: 'uppercase',
                                                letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.08)',
                                                whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                                            }}>
                                            {h.label}<span style={{ fontSize: '0.75em', opacity: sortField === h.field ? 0.9 : 0.35 }}>{sortIcon(h.field)}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {pageData.map((row, i) => {
                                    // Bucket raw sentiment into Positive / Neutral / Negative.
                                    // "Very Positive" / "Very Negative" collapse into their base buckets.
                                    const rawSent = (row.sentiment || '').toLowerCase();
                                    const isNeg = rawSent.includes('negative');
                                    const isPos = rawSent.includes('positive');
                                    const displaySentiment = !rawSent ? '—' : isNeg ? 'Negative' : isPos ? 'Positive' : 'Neutral';
                                    const sentKey = isNeg ? 'negative' : isPos ? 'positive' : 'neutral';
                                    const color = sentColor[sentKey] || '#8B949E';
                                    const topics = Array.isArray(row.main_topic) ? row.main_topic.join(', ') : (row.main_topic || '—');
                                    const subtopics = Array.isArray(row.topic) ? row.topic.join(', ') : (row.topic || '—');
                                    const dateStr = row.created_date_bd ? row.created_date_bd.split('T')[0] : '—';
                                    return (
                                        <tr key={row.conversation_id || i} style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            transition: 'background 0.15s',
                                        }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '10px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row.conversation_id ? (
                                                    <span
                                                        onClick={() => fetchConversation(row.conversation_id)}
                                                        style={{
                                                            color: '#C084FC', fontFamily: 'monospace', fontSize: '0.75rem',
                                                            cursor: 'pointer', textDecoration: 'none',
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                                                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                                                        title="View conversation"
                                                    >
                                                        {row.conversation_id}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '10px 8px' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '99px', fontSize: '0.7rem',
                                                    fontWeight: '600', background: `${color}22`, color,
                                                }}>
                                                    {displaySentiment}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 8px', color: '#C9D1D9', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topics}</td>
                                            <td style={{ padding: '10px 8px', color: '#8B949E', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtopics}</td>
                                            <td style={{ padding: '10px 8px', color: '#8B949E', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{dateStr}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

            </div>
        </div>

        {/* Conversation Viewer Overlay */}
        {viewingConv && (
            <div
                onClick={() => setViewingConv(null)}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1.5rem',
                }}
            >
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: '#0D1117', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '16px', width: '100%', maxWidth: '680px',
                        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                    }}
                >
                    {/* Conv header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
                        flexShrink: 0,
                    }}>
                        <div>
                            <span style={{ color: '#8B949E', fontSize: '0.72rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conversation</span>
                            <div style={{ color: '#C084FC', fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '2px' }}>{viewingConv.id}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <a
                                href={`https://app.intercom.com/a/apps/aphmhtyj/inbox/inbox/conversation/${viewingConv.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    padding: '6px 14px', borderRadius: '8px',
                                    border: '1px solid rgba(88,166,255,0.35)',
                                    background: 'rgba(88,166,255,0.12)', color: '#C084FC',
                                    fontSize: '0.78rem', fontWeight: '600', textDecoration: 'none',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(88,166,255,0.22)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(88,166,255,0.12)'}
                            >
                                Open in Intercom ↗
                            </a>
                            <button
                                onClick={() => setViewingConv(null)}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '50%',
                                    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
                                    color: '#8B949E', fontSize: '1.1rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#F0F6FC'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#8B949E'; }}
                            >×</button>
                        </div>
                    </div>

                    {/* Conv body */}
                    <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {convLoading || viewingConv.messages === null ? (
                            <div style={{ textAlign: 'center', color: '#8B949E', padding: '3rem', fontSize: '0.85rem' }}>Loading conversation…</div>
                        ) : viewingConv.error ? (
                            <div style={{ textAlign: 'center', color: '#EF4444', padding: '3rem', fontSize: '0.85rem' }}>{viewingConv.error}</div>
                        ) : viewingConv.messages.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#6B7280', padding: '3rem', fontSize: '0.85rem' }}>No messages to display.</div>
                        ) : (
                            viewingConv.messages.map((msg, idx) => {
                                const isAgent = msg.role === 'agent';
                                return (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        justifyContent: isAgent ? 'flex-end' : 'flex-start',
                                    }}>
                                        <div style={{
                                            maxWidth: '72%',
                                            padding: '8px 12px',
                                            borderRadius: isAgent ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                            background: isAgent ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.07)',
                                            border: isAgent ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.1)',
                                            color: '#C9D1D9',
                                            fontSize: '0.82rem',
                                            lineHeight: '1.5',
                                            wordBreak: 'break-word',
                                        }}>
                                            <div style={{ fontSize: '0.65rem', fontWeight: '700', marginBottom: '4px', color: isAgent ? '#818CF8' : '#C084FC', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {isAgent ? 'Agent' : 'Customer'}
                                            </div>
                                            {msg.text}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

// ─── DrillIn icon button (hover) ─────────────────────────────────────────────
const DrillInBtn = ({ onClick }) => (
    <button
        onClick={e => { e.stopPropagation(); onClick(); }}
        className="drill-in-btn"
        title="Drill in"
        style={{
            position: 'absolute', top: '8px', right: '8px',
            width: '28px', height: '28px', borderRadius: '50%',
            border: 'none', background: 'rgba(99,102,241,0.2)',
            color: '#818CF8', fontSize: '0.85rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0, transition: 'opacity 0.2s ease, background 0.2s ease',
            zIndex: 10, padding: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.38)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.2)'}
    >
        🔍
    </button>
);
// ─────────────────────────────────────────────────────────────────────────────

// Sentiment colors
const SENTIMENT_COLORS = {
    'Positive': '#22C55E',
    'Neutral': '#6B7280',
    'Negative': '#EF4444'
};

// Custom bar shape that rounds only the last segment's end
const RoundedEndBar = (props) => {
    const { fill, x, y, width, height, payload, dataKey } = props;
    
    if (!width || width <= 0 || !height) return null;
    
    // Determine if this segment is the last one with a value
    const isPercentage = dataKey?.includes('Pct');
    const posKey = isPercentage ? 'PositivePct' : 'Positive';
    const neuKey = isPercentage ? 'NeutralPct' : 'Neutral';
    const negKey = isPercentage ? 'NegativePct' : 'Negative';
    
    // Parse as numbers (values might be strings from .toFixed())
    const posVal = Number(payload?.[posKey]) || 0;
    const neuVal = Number(payload?.[neuKey]) || 0;
    const negVal = Number(payload?.[negKey]) || 0;
    
    let isLastSegment = false;
    
    if (dataKey === negKey || dataKey === 'Negative' || dataKey === 'NegativePct') {
        isLastSegment = negVal > 0;
    } else if (dataKey === neuKey || dataKey === 'Neutral' || dataKey === 'NeutralPct') {
        isLastSegment = neuVal > 0 && negVal <= 0;
    } else if (dataKey === posKey || dataKey === 'Positive' || dataKey === 'PositivePct') {
        isLastSegment = posVal > 0 && neuVal <= 0 && negVal <= 0;
    }
    
    const r = isLastSegment ? 6 : 0;
    
    // Draw rectangle with optional rounded right corners
    if (r === 0) {
        return <rect x={x} y={y} width={width} height={height} fill={fill} />;
    }
    
    // Path with rounded right corners only
    return (
        <path
            d={`
                M ${x},${y}
                L ${x + width - r},${y}
                Q ${x + width},${y} ${x + width},${y + r}
                L ${x + width},${y + height - r}
                Q ${x + width},${y + height} ${x + width - r},${y + height}
                L ${x},${y + height}
                Z
            `}
            fill={fill}
        />
    );
};

// Custom bar shape for vertical stacked bars (rounded top on last segment)
const RoundedTopBar = (props) => {
    const { fill, x, y, width, height, payload, dataKey } = props;
    
    if (!width || !height || height <= 0) return null;
    
    const posVal = payload?.Positive || 0;
    const neuVal = payload?.Neutral || 0;
    const negVal = payload?.Negative || 0;
    
    let isLastSegment = false;
    
    if (dataKey === 'Negative') {
        isLastSegment = negVal > 0;
    } else if (dataKey === 'Neutral') {
        isLastSegment = neuVal > 0 && negVal === 0;
    } else if (dataKey === 'Positive') {
        isLastSegment = posVal > 0 && neuVal === 0 && negVal === 0;
    }
    
    const r = isLastSegment ? 6 : 0;
    
    if (r === 0) {
        return <rect x={x} y={y} width={width} height={height} fill={fill} />;
    }
    
    // Path with rounded top corners only
    return (
        <path
            d={`
                M ${x},${y + height}
                L ${x},${y + r}
                Q ${x},${y} ${x + r},${y}
                L ${x + width - r},${y}
                Q ${x + width},${y} ${x + width},${y + r}
                L ${x + width},${y + height}
                Z
            `}
            fill={fill}
        />
    );
};

// Inject hover CSS once
const _drillInStyle = typeof document !== 'undefined' && (() => {
    const id = '__drill-in-hover-style';
    if (!document.getElementById(id)) {
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
            .drill-in-card { position: relative; }
            .drill-in-card:hover .drill-in-btn { opacity: 1 !important; }
        `;
        document.head.appendChild(s);
    }
})();

const SentimentAnalysis = ({ data = [], filters }) => {
    const [showDrillIn, setShowDrillIn] = useState(false);
    const [drillInData, setDrillInData] = useState({ conversations: [], title: '' });
    const [compareMode, setCompareMode] = useState(false);
    const [drillIn, setDrillIn] = useState(null);
    const athena = useAthena();

    // Calculate sentiment statistics
    const sentimentStats = useMemo(() => {
        if (!data || data.length === 0) {
            return { total: 0, positive: 0, neutral: 0, negative: 0, score: 0 };
        }
        let positive = 0, neutral = 0, negative = 0;
        data.forEach(conv => {
            const sentiment = conv.sentiment?.toLowerCase() || '';
            if (sentiment === 'positive') positive++;
            else if (sentiment === 'negative') negative++;
            else neutral++;
        });
        const total = data.length;
        const score = total > 0 ? ((positive / total) * 100).toFixed(1) : 0;
        return { total, positive, neutral, negative, score };
    }, [data]);

    // Sentiment correlation with client outcomes
    const outcomeCorrelation = useMemo(() => {
        if (!data || data.length === 0) return [];

        const stats = { Positive: { yes: 0, no: 0 }, Neutral: { yes: 0, no: 0 }, Negative: { yes: 0, no: 0 } };

        data.forEach(conv => {
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';
            const favor = conv.clientFavor?.toLowerCase() || '';
            const key = sentiment === 'positive' ? 'Positive' : sentiment === 'negative' ? 'Negative' : 'Neutral';

            if (favor === 'yes') stats[key].yes++;
            else if (favor === 'no') stats[key].no++;
        });

        return ['Positive', 'Neutral', 'Negative'].map(s => ({
            sentiment: s,
            'In Favor': stats[s].yes,
            'Not in Favor': stats[s].no,
            total: stats[s].yes + stats[s].no,
            favorRate: stats[s].yes + stats[s].no > 0 
                ? ((stats[s].yes / (stats[s].yes + stats[s].no)) * 100).toFixed(0) 
                : 0
        }));
    }, [data]);

    // Data for donut chart - only "Not in Favor"
    const notInFavorData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const stats = { Positive: { no: 0 }, Neutral: { no: 0 }, Negative: { no: 0 } };

        data.forEach(conv => {
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';
            const favor = conv.clientFavor?.toLowerCase() || '';
            const key = sentiment === 'positive' ? 'Positive' : sentiment === 'negative' ? 'Negative' : 'Neutral';

            if (favor === 'no') stats[key].no++;
        });

        const total = stats.Positive.no + stats.Neutral.no + stats.Negative.no;

        return ['Positive', 'Neutral', 'Negative']
            .map(s => ({
                name: s,
                value: stats[s].no,
                color: SENTIMENT_COLORS[s]
            }))
            .filter(item => item.value > 0);
    }, [data]);

    // Sentiment trend over time with previous period comparison
    const trendData = useMemo(() => {
        if (!data || data.length === 0) return { current: [], previous: [] };

        const currentMap = {};
        const previousMap = {};
        const now = new Date();
        const oneMonthAgo = subMonths(now, 1);
        
        data.forEach(conv => {
            const dateStr = conv.created_date_bd;
            if (!dateStr) return;
            
            const date = dateStr.split('T')[0];
            const convDate = parseISO(date);
            
            // Current period
            if (!currentMap[date]) {
                currentMap[date] = { date, Positive: 0, Neutral: 0, Negative: 0, total: 0 };
            }
            
            const sentiment = conv.sentiment?.toLowerCase() || '';
            currentMap[date].total++;
            if (sentiment === 'positive') currentMap[date].Positive++;
            else if (sentiment === 'negative') currentMap[date].Negative++;
            else currentMap[date].Neutral++;
        });

        const current = Object.values(currentMap)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(d => ({
                ...d,
                positiveRate: d.total > 0 ? ((d.Positive / d.total) * 100).toFixed(1) : 0
            }));

        return { current, previous: [] };
    }, [data]);

    // Issue Area (Main Topics, Issue side) x Sentiment - 100% stacked bar
    // Uses conv.main_topic. A main_topic with "Query"/"Queries" in its name is treated
    // as query-side and excluded from this chart.
    const isQueryMain = (m) => !!m && /quer(y|ies)/i.test(String(m));
    const issueAreaData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const areaMap = {};
        data.forEach(conv => {
            const mains = Array.isArray(conv.main_topic) ? conv.main_topic : [conv.main_topic];
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';
            mains.forEach(m => {
                if (!m || isQueryMain(m)) return;
                if (!areaMap[m]) {
                    areaMap[m] = { name: m, Positive: 0, Neutral: 0, Negative: 0, total: 0 };
                }
                areaMap[m].total++;
                if (sentiment === 'positive') areaMap[m].Positive++;
            else if (sentiment === 'negative') areaMap[m].Negative++;
            else areaMap[m].Neutral++;
            });
        });

        return Object.values(areaMap)
            .filter(d => d.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 12)
            .map(d => {
                const posPct = Math.round((d.Positive / d.total) * 100);
                const neuPct = Math.round((d.Neutral / d.total) * 100);
                const negPct = 100 - posPct - neuPct;
                return { ...d, PositivePct: posPct, NeutralPct: neuPct, NegativePct: Math.max(0, negPct) };
            });
    }, [data]);

    // Issues (Sub-Topics) x Sentiment — include sub-topics that are in TOPIC_MAPPING
    // only (i.e., NOT also present in QUERY_TOPIC_MAPPING). Some sub-topics appear
    // in both mappings; those should only count on the Query side.
    const issuesData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const issueMap = {};
        const issueKeys = new Set(Object.keys(TOPIC_MAPPING));
        const queryKeys = new Set(Object.keys(QUERY_TOPIC_MAPPING));

        data.forEach(conv => {
            const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';

            topics.forEach(topic => {
                if (!topic) return;
                if (!issueKeys.has(topic) || queryKeys.has(topic)) return;

                if (!issueMap[topic]) {
                    issueMap[topic] = { name: topic, Positive: 0, Neutral: 0, Negative: 0, total: 0 };
                }
                issueMap[topic].total++;
                if (sentiment === 'positive') issueMap[topic].Positive++;
            else if (sentiment === 'negative') issueMap[topic].Negative++;
            else issueMap[topic].Neutral++;
            });
        });

        return Object.values(issueMap)
            .filter(d => d.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 15)
            .map(d => {
                const posPct = Math.round((d.Positive / d.total) * 100);
                const neuPct = Math.round((d.Neutral / d.total) * 100);
                const negPct = 100 - posPct - neuPct;
                return { ...d, PositivePct: posPct, NeutralPct: neuPct, NegativePct: Math.max(0, negPct) };
            });
    }, [data]);

    // Query Area (Main Topics, Query side) x Sentiment - 100% stacked bar
    // Uses conv.main_topic. Only main_topics whose name includes "Query"/"Queries"
    // are considered query-side and counted here.
    const queryAreaData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const areaMap = {};
        data.forEach(conv => {
            const mains = Array.isArray(conv.main_topic) ? conv.main_topic : [conv.main_topic];
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';
            mains.forEach(m => {
                if (!m || !isQueryMain(m)) return;
                if (!areaMap[m]) {
                    areaMap[m] = { name: m, Positive: 0, Neutral: 0, Negative: 0, total: 0 };
                }
                areaMap[m].total++;
                if (sentiment === 'positive') areaMap[m].Positive++;
            else if (sentiment === 'negative') areaMap[m].Negative++;
            else areaMap[m].Neutral++;
            });
        });

        return Object.values(areaMap)
            .filter(d => d.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 12)
            .map(d => {
                const posPct = Math.round((d.Positive / d.total) * 100);
                const neuPct = Math.round((d.Neutral / d.total) * 100);
                const negPct = 100 - posPct - neuPct;
                return { ...d, PositivePct: posPct, NeutralPct: neuPct, NegativePct: Math.max(0, negPct) };
            });
    }, [data]);

    // Query (Sub-Topics) x Sentiment — only real sub-topics. Names ending in
    // "Query" or "Queries" are treated as main-category headings (e.g., "Payout
    // Related Query", "Challenge Rules Query") and excluded — these are LLM
    // tagging artifacts where a main-category heading was stored in the
    // sub-topic field. The chart should surface actual sub-topic items.
    const queryData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const queryMap = {};
        const querySubTopics = new Set(Object.keys(QUERY_TOPIC_MAPPING));
        const isMainHeading = (t) => /\bquer(y|ies)\s*$/i.test(String(t).trim());

        data.forEach(conv => {
            const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';

            topics.forEach(topic => {
                if (!topic || !querySubTopics.has(topic)) return;
                if (isMainHeading(topic)) return;

                if (!queryMap[topic]) {
                    queryMap[topic] = { name: topic, Positive: 0, Neutral: 0, Negative: 0, total: 0 };
                }
                queryMap[topic].total++;
                if (sentiment === 'positive') queryMap[topic].Positive++;
            else if (sentiment === 'negative') queryMap[topic].Negative++;
            else queryMap[topic].Neutral++;
            });
        });

        return Object.values(queryMap)
            .filter(d => d.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 15)
            .map(d => {
                const posPct = Math.round((d.Positive / d.total) * 100);
                const neuPct = Math.round((d.Neutral / d.total) * 100);
                const negPct = 100 - posPct - neuPct;
                return { ...d, PositivePct: posPct, NeutralPct: neuPct, NegativePct: Math.max(0, negPct) };
            });
    }, [data]);

    // Product x Sentiment — two buckets only: Futures and CFD.
    // Map raw product values (e.g., "CFD / Forex", "Futures") into canonical labels.
    const productData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const classifyProduct = (raw) => {
            const s = String(raw || '').toLowerCase();
            if (s.includes('future')) return 'Futures';
            if (s.includes('cfd') || s.includes('forex')) return 'CFD';
            return null; // drop rows that don't clearly map
        };

        const productMap = { Futures: { name: 'Futures', Positive: 0, Neutral: 0, Negative: 0, total: 0 },
                             CFD: { name: 'CFD', Positive: 0, Neutral: 0, Negative: 0, total: 0 } };

        data.forEach(conv => {
            const bucket = classifyProduct(conv.product);
            if (!bucket) return;
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';
            productMap[bucket].total++;
            if (sentiment === 'positive') productMap[bucket].Positive++;
            else if (sentiment === 'negative') productMap[bucket].Negative++;
            else productMap[bucket].Neutral++;
        });

        return Object.values(productMap)
            .filter(d => d.total > 0)
            .sort((a, b) => b.total - a.total);
    }, [data]);

    // Country x Sentiment
    const countryData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const countryMap = {};
        
        data.forEach(conv => {
            const country = conv.country || 'Unknown';
            const sentiment = conv.sentiment?.toLowerCase() || 'neutral';
            
            if (!countryMap[country]) {
                countryMap[country] = { name: country, Positive: 0, Neutral: 0, Negative: 0, total: 0 };
            }
            countryMap[country].total++;
            if (sentiment === 'positive') countryMap[country].Positive++;
            else if (sentiment === 'negative') countryMap[country].Negative++;
            else countryMap[country].Neutral++;
        });

        return Object.values(countryMap)
            .filter(d => d.total > 0 && d.name !== 'Unknown')
            .sort((a, b) => b.total - a.total)
            .slice(0, 12);
    }, [data]);

    // Word Cloud — show only genuinely negative words / phrases from client messages
    // in NEGATIVE-sentiment conversations. Matches against a curated lexicon of
    // pain-point terms (grievance, failure, loss, frustration, urgency) plus
    // common two/three-word complaint phrases. Neutral domain nouns like
    // "account", "funded", "image", "trade" are intentionally excluded.
    const wordCloudData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Single-word negative lexicon (matched as whole words, case-insensitive).
        const NEG_WORDS = new Set([
            // generic grievance / failure
            'issue', 'issues', 'problem', 'problems', 'error', 'errors', 'bug', 'bugs',
            'glitch', 'glitchy', 'broken', 'crash', 'crashed', 'freeze', 'frozen', 'stuck',
            'fail', 'failed', 'failing', 'failure', 'failures', 'unable', 'cant', 'cannot',
            'wont', 'didnt', 'doesnt', 'couldnt', 'wouldnt', 'shouldnt', 'havent', 'isnt',
            'wasnt', 'never', 'nothing', 'none', 'missing', 'lost', 'lose', 'losing', 'loss',
            // money / account damage
            'breach', 'breached', 'violation', 'violated', 'deducted', 'deduction',
            'charged', 'overcharged', 'unfair', 'scam', 'fraud', 'stolen',
            // delay / wait / slow
            'delay', 'delayed', 'delays', 'slow', 'slower', 'slowly', 'waiting', 'pending',
            'stuck', 'timeout', 'hours', 'days', 'weeks', 'ages',
            // trading specifics
            'slippage', 'gap', 'requote', 'lagging', 'laggy', 'spread', 'misquote',
            // verdict / denial
            'denied', 'rejected', 'blocked', 'banned', 'suspended', 'disabled', 'closed',
            'terminated', 'deactivated', 'flagged', 'restricted', 'cancelled', 'canceled',
            'locked',
            // support / communication
            'unhelpful', 'unresponsive', 'ignored', 'ignoring', 'silent', 'rude',
            'confusing', 'confused', 'misleading', 'vague',
            // emotional
            'angry', 'upset', 'frustrated', 'frustrating', 'annoyed', 'disappointed',
            'unhappy', 'worried', 'worry', 'anxious', 'stress', 'stressful', 'helpless',
            // quality adjectives
            'worst', 'terrible', 'awful', 'horrible', 'bad', 'poor', 'useless', 'rubbish',
            'garbage', 'pathetic', 'disgusting', 'unacceptable', 'ridiculous', 'shameful',
            // urgency
            'urgent', 'asap', 'emergency', 'immediately', 'still',
            // loss-related
            'drawdown', 'margin', 'liquidated', 'liquidation', 'wiped',
        ]);

        // Multi-word phrases (order matters — longer first so shorter ones don't steal matches).
        const NEG_PHRASES = [
            'stop loss', 'stop-loss', 'daily loss', 'maximum loss', 'not working', 'not received',
            'not responding', 'not available', 'no response', 'no reply', 'no answer',
            'account breach', 'account closed', 'account disabled', 'account banned',
            'payout delay', 'payout delayed', 'payout denied', 'payout rejected',
            'not eligible', 'technical issue', 'technical problem', 'trade execution',
            'wrong charge', 'double charge', 'refund delay', 'withdrawal delay',
            'kyc rejected', 'kyc failed', 'kyc pending', 'verification failed',
            'login issue', 'login failed', 'cant login', 'can not login',
            'unauthorized trade', 'missing payout', 'missing account', 'missing reward',
            'lost money', 'lost my account', 'waste of time', 'waste of money',
            'very slow', 'very bad', 'very poor', 'very confusing',
            'feels like a scam', 'looks like a scam',
        ];

        const counts = new Map();
        const bump = (term) => counts.set(term, (counts.get(term) || 0) + 1);

        const negativeConversations = data.filter(conv => conv.sentiment?.toLowerCase() === 'negative');

        negativeConversations.forEach(conv => {
            if (!conv.transcript) return;
            // Extract only client/user messages from the transcript
            const lines = conv.transcript.split('\n');
            const clientLines = [];
            let isClientMsg = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (/^(user|customer|client|contact)\s*:/i.test(trimmed)) {
                    isClientMsg = true;
                    clientLines.push(trimmed.replace(/^(user|customer|client|contact)\s*:\s*/i, ''));
                } else if (/^(agent|admin|teammate|bot|operator)\s*:/i.test(trimmed)) {
                    isClientMsg = false;
                } else if (isClientMsg) {
                    clientLines.push(trimmed);
                }
            }
            const text = (clientLines.length > 0 ? clientLines.join(' ') : conv.transcript).toLowerCase();

            // Phrase pass first — consume matches so single-word counting doesn't double-count.
            let working = text;
            for (const phrase of NEG_PHRASES) {
                const re = new RegExp(`\\b${phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
                let m;
                while ((m = re.exec(working)) !== null) bump(phrase);
                working = working.replace(re, ' '); // blank out to avoid single-word re-match
            }

            // Single-word pass — strict lexicon match.
            const tokens = working.replace(/[^a-z\s]/g, ' ').split(/\s+/);
            for (const t of tokens) {
                if (!t || t.length < 3) continue;
                if (NEG_WORDS.has(t)) bump(t);
            }
        });

        return [...counts.entries()]
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 60);
    }, [data]);

    // Sentiment Shift (Sankey data) - transitions from Start to End
    const sentimentShiftData = useMemo(() => {
        if (!data || data.length === 0) return { flows: [], totals: { start: {}, end: {} } };

        // Neutral merged into Positive — 4 flows instead of 9.
        const flows = {
            'Negative→Negative': 0, 'Negative→Neutral': 0, 'Negative→Positive': 0,
            'Neutral→Negative': 0, 'Neutral→Neutral': 0, 'Neutral→Positive': 0,
            'Positive→Negative': 0, 'Positive→Neutral': 0, 'Positive→Positive': 0,
        };

        const startTotals = { Positive: 0, Neutral: 0, Negative: 0 };
        const endTotals = { Positive: 0, Neutral: 0, Negative: 0 };

        data.forEach(conv => {
            let start = conv.sentimentStart?.toLowerCase() || '';
            let end = conv.sentiment?.toLowerCase() || '';

            if (start === 'positive') start = 'Positive';
            else if (start === 'negative') start = 'Negative';
            else if (start) start = 'Neutral';
            else return; // Skip if no start sentiment

            if (end === 'positive') end = 'Positive';
            else if (end === 'negative') end = 'Negative';
            else end = 'Neutral';

            const key = `${start}→${end}`;
            flows[key]++;
            startTotals[start]++;
            endTotals[end]++;
        });

        return {
            flows: Object.entries(flows).map(([key, value]) => {
                const [from, to] = key.split('→');
                return { from, to, value };
            }).filter(f => f.value > 0),
            totals: { start: startTotals, end: endTotals }
        };
    }, [data]);

    // Handle drill-in
    const handleDrillIn = (filterFn, title) => {
        const filtered = data.filter(filterFn);
        setDrillInData({ conversations: filtered, title: `${title} (${filtered.length} conversations)` });
        setShowDrillIn(true);
    };

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
    return (
                <div style={{
                    background: '#1C2128',
                    border: '1px solid #30363D',
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                }}>
                    <p style={{ margin: '0 0 8px 0', color: '#F0F6FC', fontWeight: '600' }}>{label}</p>
                    {payload.map((entry, index) => (
                        <p key={index} style={{ margin: '4px 0', color: entry.color, fontSize: '0.875rem' }}>
                            {entry.name}: {entry.value}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    const cardStyle = {
        background: 'rgba(15, 20, 35, 0.5)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.5rem'
    };

    const headerStyle = {
        margin: '0 0 1rem 0',
        fontSize: '0.875rem',
        fontWeight: '600',
        color: '#F0F6FC',
            display: 'flex',
        alignItems: 'center',
        gap: '8px'
    };

    return (
        <div style={{ padding: '0 2rem 2rem 2rem' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#F0F6FC', margin: '0 0 0.5rem 0' }}>
                    Sentiment Analysis
                </h1>
                <p style={{ color: '#8B949E', fontSize: '0.875rem', margin: 0 }}>
                    Comprehensive sentiment insights across conversations
                </p>
            </div>

            {/* Row 1: Scorecards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Sentiment Score Holistic */}
                <div className="drill-in-card" style={{
                    ...cardStyle,
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.02) 100%)',
                    border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Sentiment Score — All Conversations', data })} />
                    <h3 style={headerStyle}>
                        <span>📊</span> Sentiment Score
                    </h3>
                    <div style={{ fontSize: '0.75rem', color: '#8B949E', marginTop: '-4px', marginBottom: '8px' }}>
                        {sentimentStats.total.toLocaleString()} total conversations
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', height: '140px' }}>
                        {/* Left: score + legend */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                    <span style={{ fontSize: '2rem', fontWeight: '700', color: '#22C55E' }}>
                                        {sentimentStats.score}%
                                    </span>
                                    <span style={{ color: '#8B949E', fontSize: '0.75rem' }}>positive</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                    <span style={{ fontSize: '2rem', fontWeight: '700', color: '#EF4444' }}>
                                        {sentimentStats.total > 0 ? ((sentimentStats.negative / sentimentStats.total) * 100).toFixed(1) : 0}%
                                    </span>
                                    <span style={{ color: '#8B949E', fontSize: '0.75rem' }}>negative</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'Positive', count: sentimentStats.positive, color: '#22C55E', match: c => c.sentiment?.toLowerCase() === 'positive' },
                                    { label: 'Neutral',  count: sentimentStats.neutral,  color: '#6B7280', match: c => !['positive', 'negative'].includes(c.sentiment?.toLowerCase()) },
                                    { label: 'Negative', count: sentimentStats.negative, color: '#EF4444', match: c => c.sentiment?.toLowerCase() === 'negative' },
                                ].map(s => (
                                    <div
                                        key={s.label}
                                        onClick={() => setDrillIn({ title: `Sentiment — ${s.label} Conversations`, data: data.filter(s.match) })}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                        <span style={{ color: s.color, fontSize: '1rem', fontWeight: 600 }}>{s.count.toLocaleString()}</span>
                                        <span style={{ color: '#8B949E', fontSize: '0.75rem' }}>{s.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Right: Pie chart */}
                        <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={[
                                            { name: 'Positive', value: sentimentStats.positive, color: '#22C55E' },
                                            { name: 'Neutral',  value: sentimentStats.neutral,  color: '#6B7280' },
                                            { name: 'Negative', value: sentimentStats.negative, color: '#EF4444' },
                                        ]}
                                        cx="50%" cy="50%"
                                        innerRadius={35} outerRadius={58}
                                        paddingAngle={2}
                                        dataKey="value"
                                        onClick={(entry) => setDrillIn({
                                            title: `Sentiment — ${entry.name} Conversations`,
                                            data: entry.name === 'Negative'
                                                ? data.filter(c => c.sentiment?.toLowerCase() === 'negative')
                                                : entry.name === 'Neutral'
                                                    ? data.filter(c => !['positive', 'negative'].includes(c.sentiment?.toLowerCase()))
                                                    : data.filter(c => c.sentiment?.toLowerCase() === 'positive'),
                                        })}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {[
                                            { name: 'Positive', color: '#22C55E' },
                                            { name: 'Neutral',  color: '#6B7280' },
                                            { name: 'Negative', color: '#EF4444' },
                                        ].map(s => (
                                            <Cell key={s.name} fill={s.color} stroke="transparent" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value, name) => [value.toLocaleString(), name]}
                                        contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: 8, fontSize: '0.78rem' }}
                                        itemStyle={{ color: '#C9D1D9' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
            </div>

                {/* Sentiment Correlation with Outcomes - Scorecard */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Sentiment vs Client Outcome — Not in Favor', data: data.filter(c => c.clientFavor?.toLowerCase() === 'no') })} />
                    <h3 style={headerStyle}>
                        <span>🎯</span> Sentiment vs Client Outcome
                    </h3>
                    <div style={{ fontSize: '0.75rem', color: '#8B949E', marginTop: '-4px', marginBottom: '8px' }}>
                        {(data?.length || 0).toLocaleString()} total conversations
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', height: '140px' }}>
                        {/* Left side - Metrics */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                        <span style={{ fontSize: '1.6rem', fontWeight: '700', color: '#EF4444' }}>
                                            {notInFavorData.reduce((sum, item) => sum + item.value, 0)}
                                        </span>
                                        <span style={{ color: '#8B949E', fontSize: '0.75rem' }}>Not in Favor</span>
                                    </div>
                                    {(() => {
                                        const notFavorTotal = notInFavorData.reduce((sum, item) => sum + item.value, 0);
                                        const convTotal = data?.length || 0;
                                        const pct = convTotal > 0 ? ((notFavorTotal / convTotal) * 100).toFixed(1) : 0;
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                <span style={{ fontSize: '1.6rem', fontWeight: '700', color: '#EF4444' }}>{pct}%</span>
                                                <span style={{ color: '#8B949E', fontSize: '0.75rem' }}>negative</span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                {outcomeCorrelation.map(item => {
                                    const key = item.sentiment.toLowerCase();
                                    const match = key === 'neutral'
                                        ? (c => c.clientFavor?.toLowerCase() === 'no' && !['positive', 'negative'].includes(c.sentiment?.toLowerCase()))
                                        : (c => c.clientFavor?.toLowerCase() === 'no' && c.sentiment?.toLowerCase() === key);
                                    return (
                                        <div
                                            key={item.sentiment}
                                            onClick={() => setDrillIn({ title: `${item.sentiment} — Not in Favor`, data: data.filter(match) })}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, transition: 'background 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                backgroundColor: SENTIMENT_COLORS[item.sentiment]
                                            }} />
                                            <span style={{ color: '#8B949E', fontSize: '0.75rem' }}>
                                                {item.sentiment}: <strong style={{ color: '#C9D1D9' }}>{item['Not in Favor']}</strong>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Right side - Small Donut Chart */}
                        <div style={{ width: '140px', height: '140px' }}>
                            {notInFavorData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={notInFavorData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={45}
                                            outerRadius={65}
                                            paddingAngle={2}
                                            dataKey="value"
                                            stroke="none"
                                            style={{ cursor: 'pointer' }}
                                            onClick={(entry) => setDrillIn({
                                                title: `${entry.name} — Not in Favor`,
                                                data: data.filter(c => c.clientFavor?.toLowerCase() === 'no' && c.sentiment?.toLowerCase() === entry.name.toLowerCase())
                                            })}
                                        >
                                            {notInFavorData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip cursor={{ fill: 'transparent' }}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    const total = notInFavorData.reduce((sum, item) => sum + item.value, 0);
                                                    const percent = total > 0 ? ((data.value / total) * 100).toFixed(1) : 0;
                                                    return (
                                                        <div style={{
                                                            background: '#1C2128',
                                                            border: '1px solid #30363D',
                                                            borderRadius: '8px',
                                                            padding: '8px 12px',
                                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                                                        }}>
                                                            <p style={{ margin: '0 0 4px 0', color: '#F0F6FC', fontWeight: '600', fontSize: '0.875rem' }}>
                                                                {data.name}
                                                            </p>
                                                            <p style={{ margin: 0, color: data.color, fontSize: '0.75rem' }}>
                                                                {data.value} ({percent}%)
                                                            </p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                                    height: '100%', 
                                    color: '#6B7280', 
                                    fontSize: '0.75rem' 
                                }}>
                                    No data
                                </div>
                            )}
                        </div>
                    </div>
                    <p style={{ color: '#6B7280', fontSize: '0.7rem', margin: '8px 0 0 0', textAlign: 'center' }}>
                        Shows outcomes not in client's favor by sentiment
                    </p>
                </div>
            </div>

            {/* Row 2: Sentiment Trend (Full Width) */}
            <div className="drill-in-card" style={{ ...cardStyle, marginBottom: '1.5rem' }}>
                <DrillInBtn onClick={() => setDrillIn({ title: 'Sentiment Trend — All Conversations', data })} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ ...headerStyle, margin: 0 }}>
                        <span>📈</span> Sentiment Trend Over Time
                    </h3>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart
                        data={trendData.current}
                        style={{ cursor: 'pointer' }}
                        onClick={(chartData) => {
                            const date = chartData?.activePayload?.[0]?.payload?.date;
                            if (date) setDrillIn({ title: `Sentiment — ${date}`, data: data.filter(c => (c.created_date_bd || '').split('T')[0] === date) });
                        }}
                    >
                        <defs>
                            <linearGradient id="positiveGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="neutralGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#9CA3AF" stopOpacity={0.25}/>
                                <stop offset="95%" stopColor="#9CA3AF" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis 
                            dataKey="date" 
                            tick={{ fill: '#8B949E', fontSize: 10 }}
                            tickFormatter={(val) => { try { return format(parseISO(val), 'MMM d'); } catch { return val; } }}
                            axisLine={{ stroke: '#30363D' }}
                        />
                        <YAxis tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} />
                        <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                        <Legend verticalAlign="top" height={36} />
                        <Area type="monotone" dataKey="Positive" stroke="#22C55E" fill="url(#positiveGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="Neutral" stroke="#9CA3AF" fill="url(#neutralGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="Negative" stroke="#EF4444" fill="rgba(239, 68, 68, 0.1)" strokeWidth={2} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Row 3: Sentiment Shift (Full Width) */}
            <div style={{ marginBottom: '1.5rem' }}>
                {/* Sentiment Shift (Sankey Chart) */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Sentiment Shift — Conversations with Start Sentiment', data: data.filter(c => c.sentimentStart) })} />
                    <h3 style={headerStyle}><span>🔄</span> Sentiment Shift (Start → End)</h3>
                    {sentimentShiftData.flows.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '280px', color: '#6B7280' }}>
                            No sentiment transition data available
                        </div>
                    ) : (
                        <div style={{ position: 'relative', height: '280px', padding: '10px' }}>
                            <svg width="100%" height="100%" viewBox="0 0 800 260" preserveAspectRatio="xMidYMid meet">
                                <text x="60" y="15" fill="#8B949E" fontSize="12" fontWeight="600">START</text>
                                <text x="700" y="15" fill="#8B949E" fontSize="12" fontWeight="600">END</text>
                                {['Negative', 'Neutral', 'Positive'].map((sentiment, i) => {
                                    const total = sentimentShiftData.totals.start[sentiment] || 0;
                                    const maxTotal = Math.max(...Object.values(sentimentShiftData.totals.start), 1);
                                    const height = Math.max(22, (total / maxTotal) * 75);
                                    const y = 30 + i * 80;
                                    const color = SENTIMENT_COLORS[sentiment];
                                    return (
                                        <g key={`start-${sentiment}`}>
                                            <rect x="20" y={y} width="70" height={height} fill={color} rx="4" opacity="0.9" />
                                            <text x="55" y={y + height / 2 + 4} fill="#fff" fontSize="11" textAnchor="middle" fontWeight="600">{total}</text>
                                            <text x="100" y={y + height / 2 + 4} fill={color} fontSize="10" fontWeight="500">{sentiment}</text>
                                        </g>
                                    );
                                })}
                                {['Negative', 'Neutral', 'Positive'].map((sentiment, i) => {
                                    const total = sentimentShiftData.totals.end[sentiment] || 0;
                                    const maxTotal = Math.max(...Object.values(sentimentShiftData.totals.end), 1);
                                    const height = Math.max(22, (total / maxTotal) * 75);
                                    const y = 30 + i * 80;
                                    const color = SENTIMENT_COLORS[sentiment];
                                    return (
                                        <g key={`end-${sentiment}`}>
                                            <rect x="710" y={y} width="70" height={height} fill={color} rx="4" opacity="0.9" />
                                            <text x="745" y={y + height / 2 + 4} fill="#fff" fontSize="11" textAnchor="middle" fontWeight="600">{total}</text>
                                            <text x="700" y={y + height / 2 + 4} fill={color} fontSize="10" textAnchor="end" fontWeight="500">{sentiment}</text>
                                        </g>
                                    );
                                })}
                                {sentimentShiftData.flows.map((flow, idx) => {
                                    const fromIdx = ['Negative', 'Neutral', 'Positive'].indexOf(flow.from);
                                    const toIdx = ['Negative', 'Neutral', 'Positive'].indexOf(flow.to);
                                    if (fromIdx === -1 || toIdx === -1) return null;
                                    const fromY = 30 + fromIdx * 80 + 22;
                                    const toY = 30 + toIdx * 80 + 22;
                                    const maxFlow = Math.max(...sentimentShiftData.flows.map(f => f.value), 1);
                                    const strokeWidth = Math.max(2, (flow.value / maxFlow) * 22);
                                    const color = SENTIMENT_COLORS[flow.to];
                                    const path = `M 90 ${fromY} C 300 ${fromY}, 500 ${toY}, 710 ${toY}`;
                                    return (
                                        <g key={`flow-${idx}`}>
                                            <path
                                                d={path}
                                                fill="none"
                                                stroke={color}
                                                strokeWidth={strokeWidth}
                                                opacity="0.4"
                                                strokeLinecap="round"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => setDrillIn({
                                                    title: `Sentiment Shift: ${flow.from} → ${flow.to} (${flow.value})`,
                                                    data: data.filter(c => {
                                                        let s = c.sentimentStart?.toLowerCase() || '';
                                                        let e = c.sentiment?.toLowerCase() || '';
                                                        const norm = v => v === 'positive' ? 'Positive' : v === 'negative' ? 'Negative' : v ? 'Neutral' : null;
                                                        return norm(s) === flow.from && norm(e) === flow.to;
                                                    })
                                                })}
                                            />
                                            {flow.value > 0 && strokeWidth > 4 && (
                                                <text x="400" y={(fromY + toY) / 2 + (fromIdx - toIdx) * 6} fill="#C9D1D9" fontSize="10" textAnchor="middle">{flow.value}</text>
                                            )}
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 4: Country x Sentiment + Channel x Sentiment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Country x Sentiment */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Country x Sentiment — All Conversations', data })} />
                    <h3 style={headerStyle}><span>🌍</span> Country x Sentiment</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.7rem', margin: '-8px 0 8px 0' }}>Click a bar segment to drill-in</p>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={countryData}>
                            <XAxis dataKey="name" tick={{ fill: '#C9D1D9', fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
                            <YAxis tick={{ fill: '#8B949E', fontSize: 10 }} />
                            <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                            <Legend verticalAlign="top" height={36} />
                            <Bar dataKey="Positive" stackId="a" fill="#22C55E" shape={RoundedTopBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => c.country === d.name && c.sentiment?.toLowerCase() === 'positive', `${d.name} — Positive`)} />
                            <Bar dataKey="Neutral" stackId="a" fill="#6B7280" shape={RoundedTopBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => c.country === d.name && !['positive', 'negative'].includes(c.sentiment?.toLowerCase()), `${d.name} — Neutral`)} />
                            <Bar dataKey="Negative" stackId="a" fill="#EF4444" shape={RoundedTopBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => c.country === d.name && c.sentiment?.toLowerCase() === 'negative', `${d.name} — Negative`)} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Product x Sentiment */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Product x Sentiment — All Conversations', data })} />
                    <h3 style={headerStyle}><span>📦</span> Product x Sentiment</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.7rem', margin: '-8px 0 8px 0' }}>Click a bar segment to drill-in</p>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '300px' }}>
                        {/* Scrollable bars */}
                        <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden' }}>
                            <div style={{ height: Math.max(250, productData.length * 60), width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={productData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" tick={{ fill: '#C9D1D9', fontSize: 11 }} width={100} />
                                        <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                                        <Legend verticalAlign="top" height={30} />
                                        <Bar dataKey="Positive" stackId="a" fill="#22C55E" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (String(c.product || '').toLowerCase().includes(d.name === 'Futures' ? 'future' : 'cfd') || (d.name === 'CFD' && String(c.product || '').toLowerCase().includes('forex'))) && c.sentiment?.toLowerCase() === 'positive', `${d.name} — Positive`)} />
                                        <Bar dataKey="Neutral" stackId="a" fill="#6B7280" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (String(c.product || '').toLowerCase().includes(d.name === 'Futures' ? 'future' : 'cfd') || (d.name === 'CFD' && String(c.product || '').toLowerCase().includes('forex'))) && !['positive', 'negative'].includes(c.sentiment?.toLowerCase()), `${d.name} — Neutral`)} />
                                        <Bar dataKey="Negative" stackId="a" fill="#EF4444" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (String(c.product || '').toLowerCase().includes(d.name === 'Futures' ? 'future' : 'cfd') || (d.name === 'CFD' && String(c.product || '').toLowerCase().includes('forex'))) && c.sentiment?.toLowerCase() === 'negative', `${d.name} — Negative`)} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        {/* Sticky X-axis */}
                        <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={productData} layout="vertical" margin={{ left: 10, right: 30, top: 8, bottom: 24 }}>
                                    <XAxis type="number" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                    <YAxis type="category" dataKey="name" width={100} tick={false} axisLine={false} tickLine={false} />
                                    <Bar dataKey="Positive" fill="transparent" barSize={0} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 5: Word Cloud (Full Width) - Client Negative Keywords */}
            <div style={{ marginBottom: '1.5rem' }}>
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Word Cloud — Negative Sentiment Conversations', data: data.filter(c => c.sentiment?.toLowerCase() === 'negative') })} />
                    <h3 style={headerStyle}><span>☁️</span> Word Cloud (Top Client Keywords)</h3>
                    <p style={{ color: '#EF4444', fontSize: '0.7rem', margin: '-8px 0 12px 0' }}>Extracted from client messages in negative sentiment conversations</p>
                    <div style={{
                        position: 'relative',
                        minHeight: '400px',
                        background: 'rgba(10, 14, 25, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        padding: '1rem',
                    }}>
                        {wordCloudData.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '350px', color: '#6B7280', fontSize: '0.875rem' }}>
                                No negative sentiment conversations found
                            </div>
                        ) : (
                            <WordCloudSVG
                                words={wordCloudData.slice(0, 60)}
                                onWordClick={(word) => {
                                    const filtered = data.filter(c => c.sentiment?.toLowerCase() === 'negative' && (c.transcript || '').toLowerCase().includes(word.toLowerCase()));
                                    setDrillIn({ title: `Word Cloud — "${word}" (${filtered.length} negative conversations)`, data: filtered });
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Row 6: Issue Area x Sentiment + Query Area x Sentiment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Issue Area x Sentiment - 100% Stacked */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Issue Area x Sentiment — All Issue Conversations', data: data.filter(c => { const mains = Array.isArray(c.main_topic) ? c.main_topic : [c.main_topic]; return mains.some(m => m && !isQueryMain(m)); }) })} />
                    <h3 style={headerStyle}><span>📋</span> Issue Area x Sentiment</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.7rem', margin: '-8px 0 8px 0' }}>Main Topics (Issues) • Click bar to drill-in</p>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '350px' }}>
                        <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden' }}>
                            <div style={{ height: Math.max(300, issueAreaData.length * 30), width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={issueAreaData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" tick={{ fill: '#C9D1D9', fontSize: 9 }} width={140} />
                                        <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                                        <Legend verticalAlign="top" height={30} />
                                        <Bar dataKey="Positive" stackId="a" fill="#22C55E" shape={RoundedEndBar} onClick={(d) => handleDrillIn(c => (Array.isArray(c.main_topic) ? c.main_topic.includes(d.name) : c.main_topic === d.name) && c.sentiment?.toLowerCase() === 'positive', `${d.name} - Positive`)} style={{ cursor: 'pointer' }} />
                                        <Bar dataKey="Neutral" stackId="a" fill="#6B7280" shape={RoundedEndBar} onClick={(d) => handleDrillIn(c => (Array.isArray(c.main_topic) ? c.main_topic.includes(d.name) : c.main_topic === d.name) && !['positive', 'negative'].includes(c.sentiment?.toLowerCase()), `${d.name} - Neutral`)} style={{ cursor: 'pointer' }} />
                                        <Bar dataKey="Negative" stackId="a" fill="#EF4444" shape={RoundedEndBar} onClick={(d) => handleDrillIn(c => (Array.isArray(c.main_topic) ? c.main_topic.includes(d.name) : c.main_topic === d.name) && c.sentiment?.toLowerCase() === 'negative', `${d.name} - Negative`)} style={{ cursor: 'pointer' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={issueAreaData} layout="vertical" margin={{ left: 10, right: 30, top: 8, bottom: 24 }}>
                                    <XAxis type="number" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                    <YAxis type="category" dataKey="name" width={140} tick={false} axisLine={false} tickLine={false} />
                                    <Bar dataKey="Positive" fill="transparent" barSize={0} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Query Area x Sentiment */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Query Area x Sentiment — All Query Conversations', data: data.filter(c => { const mains = Array.isArray(c.main_topic) ? c.main_topic : [c.main_topic]; return mains.some(m => m && isQueryMain(m)); }) })} />
                    <h3 style={headerStyle}><span>❓</span> Query Area x Sentiment</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.7rem', margin: '-8px 0 8px 0' }}>Main Topics (Queries) • Click bar to drill-in</p>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '350px' }}>
                        <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden' }}>
                            <div style={{ height: Math.max(300, queryAreaData.length * 28), width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={queryAreaData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" tick={{ fill: '#C9D1D9', fontSize: 9 }} width={140} />
                                        <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                                        <Legend verticalAlign="top" height={30} />
                                        <Bar dataKey="Positive" stackId="a" fill="#22C55E" shape={RoundedEndBar} onClick={(d) => handleDrillIn(c => (Array.isArray(c.main_topic) ? c.main_topic.includes(d.name) : c.main_topic === d.name) && c.sentiment?.toLowerCase() === 'positive', `${d.name} - Positive`)} style={{ cursor: 'pointer' }} />
                                        <Bar dataKey="Neutral" stackId="a" fill="#6B7280" shape={RoundedEndBar} onClick={(d) => handleDrillIn(c => (Array.isArray(c.main_topic) ? c.main_topic.includes(d.name) : c.main_topic === d.name) && !['positive', 'negative'].includes(c.sentiment?.toLowerCase()), `${d.name} - Neutral`)} style={{ cursor: 'pointer' }} />
                                        <Bar dataKey="Negative" stackId="a" fill="#EF4444" shape={RoundedEndBar} onClick={(d) => handleDrillIn(c => (Array.isArray(c.main_topic) ? c.main_topic.includes(d.name) : c.main_topic === d.name) && c.sentiment?.toLowerCase() === 'negative', `${d.name} - Negative`)} style={{ cursor: 'pointer' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={queryAreaData} layout="vertical" margin={{ left: 10, right: 30, top: 8, bottom: 24 }}>
                                    <XAxis type="number" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                    <YAxis type="category" dataKey="name" width={140} tick={false} axisLine={false} tickLine={false} />
                                    <Bar dataKey="Positive" fill="transparent" barSize={0} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 7: Issues x Sentiment + Query x Sentiment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Issues x Sentiment */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Issues x Sentiment — All Issue Conversations', data: data.filter(c => { const topics = Array.isArray(c.topic) ? c.topic : [c.topic]; return topics.some(t => t && Object.keys(TOPIC_MAPPING).includes(t)); }) })} />
                    <h3 style={headerStyle}><span>⚠️</span> Issues x Sentiment</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.7rem', margin: '-8px 0 8px 0' }}>Sorted by total conversations</p>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '350px' }}>
                        <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden' }}>
                            <div style={{ height: Math.max(300, issuesData.length * 28), width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={issuesData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" tick={{ fill: '#C9D1D9', fontSize: 9 }} width={140} />
                                        <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                                        <Legend verticalAlign="top" height={30} />
                                        <Bar dataKey="Positive" stackId="a" fill="#22C55E" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (Array.isArray(c.topic) ? c.topic.includes(d.name) : c.topic === d.name) && c.sentiment?.toLowerCase() === 'positive', `${d.name} — Positive`)} />
                                        <Bar dataKey="Neutral" stackId="a" fill="#6B7280" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (Array.isArray(c.topic) ? c.topic.includes(d.name) : c.topic === d.name) && !['positive', 'negative'].includes(c.sentiment?.toLowerCase()), `${d.name} — Neutral`)} />
                                        <Bar dataKey="Negative" stackId="a" fill="#EF4444" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (Array.isArray(c.topic) ? c.topic.includes(d.name) : c.topic === d.name) && c.sentiment?.toLowerCase() === 'negative', `${d.name} — Negative`)} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={issuesData} layout="vertical" margin={{ left: 10, right: 30, top: 8, bottom: 24 }}>
                                    <XAxis type="number" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                    <YAxis type="category" dataKey="name" width={140} tick={false} axisLine={false} tickLine={false} />
                                    <Bar dataKey="Positive" fill="transparent" barSize={0} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Query x Sentiment */}
                <div className="drill-in-card" style={cardStyle}>
                    <DrillInBtn onClick={() => setDrillIn({ title: 'Query x Sentiment — All Query Conversations', data: data.filter(c => { const topics = Array.isArray(c.topic) ? c.topic : [c.topic]; return topics.some(t => t && Object.keys(QUERY_TOPIC_MAPPING).includes(t)); }) })} />
                    <h3 style={headerStyle}><span>💬</span> Query x Sentiment</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.7rem', margin: '-8px 0 8px 0' }}>Sorted by total conversations</p>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '350px' }}>
                        <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden' }}>
                            <div style={{ height: Math.max(300, queryData.length * 28), width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={queryData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" tick={{ fill: '#C9D1D9', fontSize: 9 }} width={140} />
                                        <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                                        <Legend verticalAlign="top" height={30} />
                                        <Bar dataKey="Positive" stackId="a" fill="#22C55E" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (Array.isArray(c.topic) ? c.topic.includes(d.name) : c.topic === d.name) && c.sentiment?.toLowerCase() === 'positive', `${d.name} — Positive`)} />
                                        <Bar dataKey="Neutral" stackId="a" fill="#6B7280" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (Array.isArray(c.topic) ? c.topic.includes(d.name) : c.topic === d.name) && !['positive', 'negative'].includes(c.sentiment?.toLowerCase()), `${d.name} — Neutral`)} />
                                        <Bar dataKey="Negative" stackId="a" fill="#EF4444" shape={RoundedEndBar} style={{ cursor: 'pointer' }} onClick={(d) => handleDrillIn(c => (Array.isArray(c.topic) ? c.topic.includes(d.name) : c.topic === d.name) && c.sentiment?.toLowerCase() === 'negative', `${d.name} — Negative`)} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={queryData} layout="vertical" margin={{ left: 10, right: 30, top: 8, bottom: 24 }}>
                                    <XAxis type="number" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                    <YAxis type="category" dataKey="name" width={140} tick={false} axisLine={false} tickLine={false} />
                                    <Bar dataKey="Positive" fill="transparent" barSize={0} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Drill-in Modal */}
            {showDrillIn && (
                <ConversationList
                    conversations={drillInData.conversations}
                    title={drillInData.title}
                    onClose={() => setShowDrillIn(false)}
                    mode="sentiment"
                    onAskAthena={(title, count, items) => athena.openAthenaForContext(title, 'sentiment-drill', title, '#8B5CF6', count, items)}
                />
            )}

            {/* Icon-triggered DrillInModal */}
            <DrillInModal drillIn={drillIn} onClose={() => setDrillIn(null)} onAskAthena={(title, count, items) => athena.openAthenaForContext(title, 'sentiment-drill', title, '#8B5CF6', count, items)} />

            {/* Athena Panel */}
            <AthenaPanel {...athena} pageLabel="conversations" />
        </div>
    );
};

export default SentimentAnalysis;
