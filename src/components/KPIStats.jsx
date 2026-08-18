import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { TOPIC_MAPPING, QUERY_TOPIC_MAPPING, normalizeApostrophe } from '../utils/topicMapping';

// ────────────────────────────────────────────────────────────────────────────
// DrillInModal – dark-themed paginated table with Export CSV
// ────────────────────────────────────────────────────────────────────────────
const DRILL_PAGE_SIZE = 15;

const DrillInModal = ({ title, data, onClose }) => {
    const [page, setPage] = useState(0);
    const overlayRef = useRef(null);
    const [viewingConv, setViewingConv] = useState(null);
    const [convLoading, setConvLoading] = useState(false);

    // Pagination removed — render full dataset inside the scroll container.
    const pageData = data;

    // Close on click outside
    const handleOverlayClick = (e) => {
        if (e.target === overlayRef.current) onClose();
    };

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Export CSV
    const handleExportCSV = () => {
        const cols = ['conversation_id', 'main_topic', 'sub_topic', 'sentiment', 'date'];
        const headers = cols.join(',');
        const rows = data.map(row => {
            let mainTopic = Array.isArray(row.main_topic) && row.main_topic.length > 0 ? row.main_topic.join('; ') : '';
            if (!mainTopic && Array.isArray(row.topic)) {
                const derived = new Set();
                row.topic.forEach(t => { const m = TOPIC_MAPPING[t] || QUERY_TOPIC_MAPPING[t]; if (m) derived.add(m); });
                mainTopic = [...derived].join('; ');
            }
            const subTopic = Array.isArray(row.topic) && row.topic.length > 0 ? row.topic.join('; ') : (row.topic || '');
            const sentiment = row.sentiment || '';
            const date = row.created_date_bd || '';
            const id = row.conversation_id || '';
            return [id, mainTopic, subTopic, sentiment, date]
                .map(v => `"${String(v).replace(/"/g, '""')}"`)
                .join(',');
        });
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '16px'
            }}
        >
            <div style={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '900px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid #30363D',
                    flexShrink: 0
                }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#F0F6FC', fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
                        <p style={{ margin: '4px 0 0', color: '#8B949E', fontSize: '0.75rem' }}>
                            {data.length} record{data.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            onClick={handleExportCSV}
                            style={{
                                background: 'rgba(99,102,241,0.15)',
                                border: '1px solid rgba(99,102,241,0.4)',
                                borderRadius: '6px',
                                color: '#818CF8',
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontWeight: 500
                            }}
                        >
                            Export CSV
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: '1px solid #30363D',
                                borderRadius: '6px',
                                color: '#8B949E',
                                width: '30px', height: '30px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                lineHeight: 1
                            }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                    {data.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#8B949E' }}>No data available</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ background: '#1C2128', borderBottom: '1px solid #30363D', position: 'sticky', top: 0, zIndex: 1 }}>
                                    {['Conversation ID', 'Main Topic', 'Sub Topic', 'Sentiment', 'Date'].map(col => (
                                        <th key={col} style={{
                                            padding: '10px 14px',
                                            textAlign: 'left',
                                            color: '#8B949E',
                                            fontWeight: 600,
                                            fontSize: '0.6875rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            whiteSpace: 'nowrap'
                                        }}>{col}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {pageData.map((row, i) => {
                                    let mainTopic = Array.isArray(row.main_topic) && row.main_topic.length > 0 ? row.main_topic.join(', ') : '';
                                    if (!mainTopic && Array.isArray(row.topic)) {
                                        const derived = new Set();
                                        row.topic.forEach(t => {
                                            const m = TOPIC_MAPPING[t] || QUERY_TOPIC_MAPPING[t];
                                            if (m) derived.add(m);
                                        });
                                        mainTopic = derived.size > 0 ? [...derived].join(', ') : '—';
                                    }
                                    if (!mainTopic) mainTopic = '—';
                                    const subTopic = Array.isArray(row.topic) && row.topic.length > 0 ? row.topic.join(', ') : (row.topic || '—');
                                    const sentiment = row.sentiment || '—';
                                    const date = row.created_date_bd || '—';
                                    return (
                                        <tr key={i} style={{
                                            borderBottom: '1px solid rgba(48,54,61,0.6)',
                                            background: i % 2 === 0 ? 'transparent' : 'rgba(28,33,40,0.4)'
                                        }}>
                                            <td
                                                style={{ padding: '9px 14px', color: '#C084FC', fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap', cursor: row.conversation_id ? 'pointer' : 'default' }}
                                                onClick={row.conversation_id ? async () => {
                                                    const id = row.conversation_id;
                                                    setConvLoading(true);
                                                    setViewingConv({ id, messages: null });
                                                    try {
                                                        const resp = await fetch('/api/analyze-topics', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ action: 'fetch-single', conversationId: String(id) })
                                                        });
                                                        const result = await resp.json();
                                                        const transcript = result.data?.Transcript || '';
                                                        const messages = [];
                                                        if (transcript) {
                                                            const lines = transcript.split('\n');
                                                            lines.forEach(line => {
                                                                const trimmed = line.trim();
                                                                if (!trimmed) return;
                                                                if (/^(user|customer|client|contact)\s*:/i.test(trimmed)) {
                                                                    messages.push({ role: 'customer', text: trimmed.replace(/^(user|customer|client|contact)\s*:\s*/i, '') });
                                                                } else if (/^(agent|admin|teammate|bot|operator)\s*:/i.test(trimmed)) {
                                                                    messages.push({ role: 'agent', text: trimmed.replace(/^(agent|admin|teammate|bot|operator)\s*:\s*/i, ''), author: trimmed.match(/^(\w+)/)?.[1] });
                                                                } else if (messages.length > 0) {
                                                                    messages[messages.length - 1].text += '\n' + trimmed;
                                                                } else {
                                                                    messages.push({ role: 'customer', text: trimmed });
                                                                }
                                                            });
                                                        }
                                                        setViewingConv({ id, messages });
                                                    } catch (e) {
                                                        setViewingConv({ id, messages: [], error: e.message });
                                                    } finally {
                                                        setConvLoading(false);
                                                    }
                                                } : undefined}
                                                onMouseEnter={row.conversation_id ? e => { e.currentTarget.style.textDecoration = 'underline'; } : undefined}
                                                onMouseLeave={row.conversation_id ? e => { e.currentTarget.style.textDecoration = 'none'; } : undefined}
                                            >
                                                {row.conversation_id || '—'}
                                            </td>
                                            <td style={{ padding: '9px 14px', color: '#C9D1D9', maxWidth: '200px' }}>
                                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mainTopic}>{mainTopic}</span>
                                            </td>
                                            <td style={{ padding: '9px 14px', color: '#C9D1D9', maxWidth: '220px' }}>
                                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={subTopic}>{subTopic}</span>
                                            </td>
                                            <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    color: sentiment === 'Positive' ? '#3FB950' : sentiment === 'Negative' ? '#FF7B72' : '#E3B341',
                                                    fontWeight: 500
                                                }}>{sentiment}</span>
                                            </td>
                                            <td style={{ padding: '9px 14px', color: '#8B949E', whiteSpace: 'nowrap' }}>{date}</td>
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
                onClick={(e) => { if (e.target === e.currentTarget) setViewingConv(null); }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}
            >
                <div style={{
                    background: '#161B22', border: '1px solid #30363D', borderRadius: 12,
                    width: '100%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #30363D' }}>
                        <div>
                            <h4 style={{ margin: 0, color: '#F0F6FC', fontSize: '0.9rem' }}>Conversation</h4>
                            <span style={{ color: '#C084FC', fontFamily: 'monospace', fontSize: '0.75rem' }}>{viewingConv.id}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => window.open(`https://app.intercom.com/a/apps/aphmhtyj/inbox/inbox/conversation/${viewingConv.id}`, '_blank')}
                                style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.2)', color: '#C084FC', borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 500 }}>
                                Open in Intercom ↗
                            </button>
                            <button onClick={() => setViewingConv(null)}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #30363D', color: '#8B949E', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                ✕
                            </button>
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
                        {convLoading ? (
                            <div style={{ textAlign: 'center', color: '#8B949E', padding: '2rem' }}>Loading conversation...</div>
                        ) : viewingConv.error ? (
                            <div style={{ textAlign: 'center', color: '#EF4444', padding: '2rem' }}>{viewingConv.error}</div>
                        ) : viewingConv.messages?.length > 0 ? (
                            viewingConv.messages.map((msg, i) => (
                                <div key={i} style={{
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: msg.role === 'agent' ? 'flex-end' : 'flex-start',
                                    marginBottom: 12,
                                }}>
                                    <div style={{
                                        background: msg.role === 'agent' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${msg.role === 'agent' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
                                        borderRadius: 10, padding: '8px 12px', maxWidth: '80%',
                                    }}>
                                        {msg.author && <div style={{ fontSize: '0.65rem', color: '#818CF8', fontWeight: 600, marginBottom: 2 }}>{msg.author}</div>}
                                        <div style={{ fontSize: '0.8rem', color: '#C9D1D9', lineHeight: 1.5 }}>{msg.text}</div>
                                    </div>
                                    {msg.time && <span style={{ fontSize: '0.6rem', color: '#6B7280', marginTop: 2 }}>
                                        {new Date(msg.time * 1000).toLocaleString('en-US', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>}
                                </div>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', color: '#8B949E', padding: '2rem' }}>No messages found</div>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

// Drill-in icon button (shown on parent hover)
const DrillInIcon = ({ onClick }) => (
    <button
        onClick={onClick}
        className="kpi-drill-icon"
        title="View underlying data"
        style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            background: 'rgba(99,102,241,0.2)',
            border: '1px solid rgba(99,102,241,0.35)',
            color: '#818CF8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0,
            transition: 'opacity 0.2s ease, background 0.2s ease',
            padding: 0,
            flexShrink: 0
        }}
    >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
    </button>
);

// Helper to find mapping with normalized apostrophe
const findMapping = (topic, mapping) => {
    if (!topic) return null;
    if (mapping[topic]) return mapping[topic];
    const normalized = normalizeApostrophe(topic);
    if (mapping[normalized]) return mapping[normalized];
    for (const key of Object.keys(mapping)) {
        if (normalizeApostrophe(key) === normalized) {
            return mapping[key];
        }
    }
    return null;
};

const KPIStats = ({ conversations, previousConversations, subTab = 'issue' }) => {
    const [drillIn, setDrillIn] = useState(null); // { title: string, data: array }

    const openDrillIn = useCallback((title, data) => {
        setDrillIn({ title, data });
    }, []);

    const stats = useMemo(() => {
        // Total Conversations: Count only rows that have a topic
        const totalConversations = conversations.filter(c => {
            const hasMain = Array.isArray(c.main_topic) && c.main_topic.length > 0;
            const hasSub = Array.isArray(c.topic) && c.topic.length > 0;
            return hasMain || hasSub;
        }).length;
        
        // Filter conversations: Must have a topic (check for non-empty array)
        // This is used for issues/queries calculations, but total count includes all
        const validConversations = conversations.filter(c => {
            const hasMain = Array.isArray(c.main_topic) && c.main_topic.length > 0;
            const hasSub = Array.isArray(c.topic) && c.topic.length > 0;
            return hasMain || hasSub;
        });

        // 2. Total Issues (count all issues/topics across all conversations, excluding query sub-topics)
        let totalIssues = 0;
        validConversations.forEach(c => {
            if (Array.isArray(c.topic)) {
                totalIssues += c.topic.filter(t => {
                    if (!t || t.toLowerCase().includes('other')) return false;
                    // Exclude query sub-topics from issue count
                    if (findMapping(t, QUERY_TOPIC_MAPPING)) return false;
                    return true;
                }).length;
            }
        });

        // 3. Total Queries (count sub-topics that map to query main topics)
        // Exclude "Challenge Rule Clarification" to match the charts
        let totalQueries = 0;
        validConversations.forEach(c => {
            if (Array.isArray(c.topic)) {
                c.topic.forEach(t => {
                    if (t && t !== 'Challenge Rule Clarification' && findMapping(t, QUERY_TOPIC_MAPPING)) {
                        totalQueries++;
                    }
                });
            }
        });

        // 4. Conversation to Issue Ratio
        const convToIssueRatio = totalIssues > 0 
            ? (totalConversations / totalIssues).toFixed(2) 
            : totalConversations > 0 ? '1.00' : '0.00';

        // 5. Conversation to Query Ratio (as percentage - what % of conversations have queries)
        const convToQueryPercentage = totalConversations > 0 
            ? ((totalQueries / totalConversations) * 100).toFixed(1)
            : '0.0';

        // 6. Query to Issue Ratio (as fraction like 1/27)
        // Find simplified fraction
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        let queryToIssueFraction = '0/0';
        if (totalQueries > 0 && totalIssues > 0) {
            const divisor = gcd(totalQueries, totalIssues);
            const simplifiedQueries = totalQueries / divisor;
            const simplifiedIssues = totalIssues / divisor;
            queryToIssueFraction = `${simplifiedQueries}/${simplifiedIssues}`;
        } else if (totalQueries > 0) {
            queryToIssueFraction = `${totalQueries}/0`;
        } else {
            queryToIssueFraction = `0/${totalIssues || 0}`;
        }

        // Calculate trends for comparison
        const validPreviousConversations = previousConversations
            ? previousConversations.filter(c => {
                const hasMain = Array.isArray(c.main_topic) && c.main_topic.length > 0;
                const hasSub = Array.isArray(c.topic) && c.topic.length > 0;
                return (hasMain || hasSub) && c.conversation_id;
            })
            : [];

        const prevTotalConversations = validPreviousConversations.length;
        
        let prevTotalIssues = 0;
        let prevTotalQueries = 0;
        validPreviousConversations.forEach(c => {
            if (Array.isArray(c.topic)) {
                prevTotalIssues += c.topic.filter(t => {
                    if (!t || t.toLowerCase().includes('other')) return false;
                    // Exclude query sub-topics from issue count
                    if (findMapping(t, QUERY_TOPIC_MAPPING)) return false;
                    return true;
                }).length;
                c.topic.forEach(t => {
                    if (t && t !== 'Challenge Rule Clarification' && findMapping(t, QUERY_TOPIC_MAPPING)) {
                        prevTotalQueries++;
                    }
                });
            }
        });

        // Trends
        const convTrend = prevTotalConversations > 0 
            ? Math.round(((totalConversations - prevTotalConversations) / prevTotalConversations) * 100) 
            : 0;
        
        const issueTrend = prevTotalIssues > 0 
            ? Math.round(((totalIssues - prevTotalIssues) / prevTotalIssues) * 100) 
            : 0;

        const queryTrend = prevTotalQueries > 0 
            ? Math.round(((totalQueries - prevTotalQueries) / prevTotalQueries) * 100) 
            : 0;

        return {
            totalConversations,
            totalIssues,
            totalQueries,
            convToIssueRatio,
            convToQueryPercentage,
            queryToIssueFraction,
            convTrend,
            issueTrend,
            queryTrend,
            prevTotalConversations,
            prevTotalIssues,
            prevTotalQueries
        };
    }, [conversations, previousConversations]);

    // ── Drill-in data arrays (computed once, used by drill-in icons) ──────────
    const drillData = useMemo(() => {
        const validConversations = conversations.filter(c => {
            const hasMain = Array.isArray(c.main_topic) && c.main_topic.length > 0;
            const hasSub = Array.isArray(c.topic) && c.topic.length > 0;
            return hasMain || hasSub;
        });

        // Total Conversations: all valid convs
        const totalConvData = validConversations;

        // Total Issues: convs that have at least one non-query issue sub-topic
        const issueConvData = validConversations.filter(c =>
            Array.isArray(c.topic) && c.topic.some(t =>
                t && !t.toLowerCase().includes('other') && !findMapping(t, QUERY_TOPIC_MAPPING)
            )
        );

        // Total Queries: convs that have at least one query sub-topic
        const queryConvData = validConversations.filter(c =>
            Array.isArray(c.topic) && c.topic.some(t =>
                t && t !== 'Challenge Rule Clarification' && findMapping(t, QUERY_TOPIC_MAPPING)
            )
        );

        // Conv-to-Issue ratio: same as issue convs
        const convToIssueData = issueConvData;

        // Conv-to-Query ratio: same as query convs
        const convToQueryData = queryConvData;

        // Query-to-Issue ratio: convs that have either an issue or query sub-topic
        const queryToIssueData = validConversations.filter(c =>
            Array.isArray(c.topic) && c.topic.some(t =>
                t && (findMapping(t, QUERY_TOPIC_MAPPING) ||
                    (!t.toLowerCase().includes('other') && !findMapping(t, QUERY_TOPIC_MAPPING)))
            )
        );

        return { totalConvData, issueConvData, queryConvData, convToIssueData, convToQueryData, queryToIssueData };
    }, [conversations]);

    // Query Analysis Scorecards
    if (subTab === 'query') {
        return (
            <>
                <style>{`
                    .kpi-card:hover .kpi-drill-icon { opacity: 1 !important; }
                    .kpi-drill-icon:hover { background: rgba(99,102,241,0.35) !important; }
                `}</style>
                <div className="kpi-row">
                    {/* Total Number of Conversations */}
                    <div className="kpi-card" style={{ position: 'relative' }}>
                        <DrillInIcon onClick={() => openDrillIn(`Total Conversations (${stats.totalConversations})`, drillData.totalConvData)} />
                        <div className="kpi-label">Total Conversations</div>
                        <div className="kpi-value">{stats.totalConversations.toLocaleString()}</div>
                        <div className={`kpi-trend ${stats.convTrend >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {stats.prevTotalConversations > 0 ? (
                                <>
                                    {stats.convTrend > 0 ? '↑' : stats.convTrend < 0 ? '↓' : '→'} {Math.abs(stats.convTrend)}% <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>vs previous</span>
                                </>
                            ) : (
                                <span className="neutral" style={{ color: 'var(--text-muted)' }}>No previous data</span>
                            )}
                        </div>
                    </div>

                    {/* Total Number of Queries */}
                    <div className="kpi-card" style={{ position: 'relative' }}>
                        <DrillInIcon onClick={() => openDrillIn(`Total Queries (${stats.totalQueries})`, drillData.queryConvData)} />
                        <div className="kpi-label">Total Queries</div>
                        <div className="kpi-value">{stats.totalQueries.toLocaleString()}</div>
                        <div className={`kpi-trend ${stats.queryTrend >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {stats.prevTotalQueries > 0 ? (
                                <>
                                    {stats.queryTrend > 0 ? '↑' : stats.queryTrend < 0 ? '↓' : '→'} {Math.abs(stats.queryTrend)}% <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>vs previous</span>
                                </>
                            ) : (
                                <span className="neutral" style={{ color: 'var(--text-muted)' }}>No previous data</span>
                            )}
                        </div>
                    </div>

                    {/* Conversation to Query Ratio (Percentage) */}
                    <div className="kpi-card" style={{ position: 'relative' }}>
                        <DrillInIcon onClick={() => openDrillIn(`Conversation to Query Ratio — Query Conversations (${drillData.convToQueryData.length})`, drillData.convToQueryData)} />
                        <div className="kpi-label">Conversation to Query Ratio</div>
                        <div className="kpi-value">{stats.convToQueryPercentage}%</div>
                        <div className="kpi-trend neutral" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            <span style={{ color: 'var(--text-muted)' }}>
                                {stats.totalQueries} queries in {stats.totalConversations} conversations
                            </span>
                        </div>
                    </div>

                    {/* Query to Issue Ratio hidden */}
                </div>

                {drillIn && (
                    <DrillInModal
                        title={drillIn.title}
                        data={drillIn.data}
                        onClose={() => setDrillIn(null)}
                    />
                )}
            </>
        );
    }

    // Issue Analysis Scorecards (default)
    return (
        <>
            <style>{`
                .kpi-card:hover .kpi-drill-icon { opacity: 1 !important; }
                .kpi-drill-icon:hover { background: rgba(99,102,241,0.35) !important; }
            `}</style>
            <div className="kpi-row">
                {/* Total Number of Conversations */}
                <div className="kpi-card" style={{ position: 'relative' }}>
                    <DrillInIcon onClick={() => openDrillIn(`Total Conversations (${stats.totalConversations})`, drillData.totalConvData)} />
                    <div className="kpi-label">Total Conversations</div>
                    <div className="kpi-value">{stats.totalConversations.toLocaleString()}</div>
                    <div className={`kpi-trend ${stats.convTrend >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {stats.prevTotalConversations > 0 ? (
                            <>
                                {stats.convTrend > 0 ? '↑' : stats.convTrend < 0 ? '↓' : '→'} {Math.abs(stats.convTrend)}% <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>vs previous</span>
                            </>
                        ) : (
                            <span className="neutral" style={{ color: 'var(--text-muted)' }}>No previous data</span>
                        )}
                    </div>
                </div>

                {/* Total Number of Issues */}
                <div className="kpi-card" style={{ position: 'relative' }}>
                    <DrillInIcon onClick={() => openDrillIn(`Total Issues — Conversations with Issues (${drillData.issueConvData.length})`, drillData.issueConvData)} />
                    <div className="kpi-label">Total Issues</div>
                    <div className="kpi-value">{stats.totalIssues.toLocaleString()}</div>
                    <div className={`kpi-trend ${stats.issueTrend >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        {stats.prevTotalIssues > 0 ? (
                            <>
                                {stats.issueTrend > 0 ? '↑' : stats.issueTrend < 0 ? '↓' : '→'} {Math.abs(stats.issueTrend)}% <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>vs previous</span>
                            </>
                        ) : (
                            <span className="neutral" style={{ color: 'var(--text-muted)' }}>No previous data</span>
                        )}
                    </div>
                </div>

                {/* Conversation to Issue Ratio */}
                <div className="kpi-card" style={{ position: 'relative' }}>
                    <DrillInIcon onClick={() => openDrillIn(`Conversation to Issue Ratio — Conversations with Issues (${drillData.convToIssueData.length})`, drillData.convToIssueData)} />
                    <div className="kpi-label">Conversation to Issue Ratio</div>
                    <div className="kpi-value">
                        {stats.totalConversations > 0
                            ? ((drillData.convToIssueData.length / stats.totalConversations) * 100).toFixed(1)
                            : '0.0'
                        }%
                    </div>
                    <div className="kpi-trend neutral" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                            {stats.totalIssues} issues in {stats.totalConversations} conversations
                        </span>
                    </div>
                </div>

                {/* Issue to Query Ratio hidden */}
            </div>

            {drillIn && (
                <DrillInModal
                    title={drillIn.title}
                    data={drillIn.data}
                    onClose={() => setDrillIn(null)}
                />
            )}
        </>
    );
};

export default KPIStats;
