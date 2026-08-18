import React, { useState, useMemo } from 'react';
import ConversationViewer from './ConversationViewer';
import { AthenaTriggerBtn } from './AthenaPanel';
import { TOPIC_MAPPING, QUERY_TOPIC_MAPPING, normalizeApostrophe } from '../utils/topicMapping';

const findMapping = (topic, mapping) => {
    if (!topic) return null;
    if (mapping[topic]) return mapping[topic];
    const normalized = normalizeApostrophe(topic);
    if (mapping[normalized]) return mapping[normalized];
    for (const key of Object.keys(mapping)) {
        if (normalizeApostrophe(key) === normalized) return mapping[key];
    }
    return null;
};

const isQueryOnlySubTopic = (t) =>
    !!t && !!findMapping(t, QUERY_TOPIC_MAPPING) && !findMapping(t, TOPIC_MAPPING);

// Sentiment colors
const SENTIMENT_COLORS = {
    'positive': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' },
    'neutral': { bg: 'rgba(107, 114, 128, 0.15)', text: '#9CA3AF' },
    'negative': { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' }
};

// Sub-topics hidden from display pills (kept in sync with DashboardCharts' list).
const HIDDEN_SUB_TOPICS = new Set(['delay in receiving customer support']);
const isHiddenSubTopic = (t) => {
    if (!t) return false;
    const k = String(t).toLowerCase().replace(/[.!?\s]+$/g, '').trim();
    return HIDDEN_SUB_TOPICS.has(k);
};

const ConversationList = ({ conversations, title = "Conversations", onClose, filterMainTopic = null, filterSubTopic = null, mode = 'topic', subTab = 'issue', onAskAthena = null }) => {
    const getDisplaySubTopics = (topics) => {
        if (!Array.isArray(topics)) return [];
        let filtered = topics.filter(t => t && !isHiddenSubTopic(t));
        if (subTab === 'issue') filtered = filtered.filter(t => !isQueryOnlySubTopic(t));
        return filtered;
    };
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [sortField, setSortField] = useState('created_date_bd');
    const [sortDirection, setSortDirection] = useState('desc');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Sort and filter conversations
    const sortedConversations = useMemo(() => {
        let filtered = conversations;

        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(c => 
                c.conversation_id?.toLowerCase().includes(term) ||
                c.country?.toLowerCase().includes(term) ||
                c.product?.toLowerCase().includes(term) ||
                (Array.isArray(c.topic) && c.topic.some(t => t.toLowerCase().includes(term))) ||
                (Array.isArray(c.main_topic) && c.main_topic.some(t => t.toLowerCase().includes(term)))
            );
        }

        // Sort
        return [...filtered].sort((a, b) => {
            let aVal = a[sortField] || '';
            let bVal = b[sortField] || '';
            
            if (sortField === 'created_date_bd') {
                aVal = new Date(aVal).getTime() || 0;
                bVal = new Date(bVal).getTime() || 0;
            }

            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            }
            return aVal < bVal ? 1 : -1;
        });
    }, [conversations, sortField, sortDirection, searchTerm]);

    // Pagination removed — render full sorted list inside the scrollable container.
    const paginatedConversations = sortedConversations;

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const SortIcon = ({ field }) => (
        <span style={{ marginLeft: '4px', opacity: sortField === field ? 1 : 0.3 }}>
            {sortField === field && sortDirection === 'asc' ? '↑' : '↓'}
        </span>
    );

    // Export the currently-filtered + sorted drill-in rows to CSV.
    // Columns mirror the on-screen table so Sentiment drill-ins emit the sentiment
    // column instead of split Main/Sub columns.
    const handleExportCSV = () => {
        if (!sortedConversations || sortedConversations.length === 0) return;
        const baseCols = [
            { key: 'conversation_id', label: 'Conversation ID' },
            { key: 'created_date_bd',  label: 'Date' },
            { key: 'cx_score_rating',  label: 'CSAT' },
        ];
        const topicCols = mode === 'sentiment'
            ? [
                { key: 'sentiment', label: 'Sentiment' },
                { key: 'topic',     label: 'Topics' },
            ]
            : [
                { key: 'main_topic', label: 'Main Topic' },
                { key: 'topic',      label: 'Sub-Topic' },
            ];
        const tailCols = [
            { key: 'country', label: 'Country' },
            { key: 'product', label: 'Product' },
        ];
        const columns = [...baseCols, ...topicCols, ...tailCols];
        const escape = (v) => {
            if (v == null) return '';
            const s = Array.isArray(v) ? v.join(' | ') : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const headerLine = columns.map(c => c.label).join(',');
        const rows = sortedConversations.map(c => columns.map(col => escape(c[col.key])).join(','));
        const csv = '﻿' + [headerLine, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 10);
        const slug = String(title || 'drill-in').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
        a.download = `${slug || 'drill-in'}_${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998,
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: '#0D1117',
                borderRadius: '12px',
                border: '1px solid #30363D',
                width: '100%',
                maxWidth: '1200px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #30363D',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h2 style={{ 
                            margin: 0, 
                            fontSize: '1.125rem', 
                            fontWeight: '600', 
                            color: '#F0F6FC',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                            {title}
                        </h2>
                        <span style={{
                            padding: '4px 10px',
                            backgroundColor: 'rgba(88, 166, 255, 0.15)',
                            color: '#C084FC',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                        }}>
                            {sortedConversations.length} conversations
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {onAskAthena && (
                            <AthenaTriggerBtn onClick={() => onAskAthena(title, sortedConversations.length, sortedConversations)} />
                        )}
                        <button
                            onClick={handleExportCSV}
                            disabled={!sortedConversations.length}
                            title={sortedConversations.length ? `Export ${sortedConversations.length} conversations to CSV` : 'Nothing to export'}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '7px 12px',
                                background: sortedConversations.length ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${sortedConversations.length ? 'rgba(34, 197, 94, 0.35)' : '#30363D'}`,
                                color: sortedConversations.length ? '#4ADE80' : '#475569',
                                borderRadius: 6,
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: sortedConversations.length ? 'pointer' : 'not-allowed',
                                transition: 'background-color 0.15s, border-color 0.15s',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Export
                        </button>
                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                style={{
                                    padding: '8px 12px 8px 32px',
                                    backgroundColor: '#21262D',
                                    border: '1px solid #30363D',
                                    borderRadius: '6px',
                                    color: '#C9D1D9',
                                    fontSize: '0.875rem',
                                    width: '200px',
                                    outline: 'none'
                                }}
                            />
                            <svg 
                                width="14" height="14" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="#8B949E" 
                                strokeWidth="2" 
                                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
                            >
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#8B949E',
                                cursor: 'pointer',
                                padding: '8px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#161B22', position: 'sticky', top: 0 }}>
                                <th 
                                    onClick={() => handleSort('conversation_id')}
                                    style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        color: '#8B949E',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #30363D',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    Conversation ID <SortIcon field="conversation_id" />
                                </th>
                                <th 
                                    onClick={() => handleSort('created_date_bd')}
                                    style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        color: '#8B949E',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #30363D',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    Date <SortIcon field="created_date_bd" />
                                </th>
                                <th
                                    onClick={() => handleSort('cx_score_rating')}
                                    style={{
                                        padding: '12px 16px',
                                        textAlign: 'center',
                                        color: '#8B949E',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #30363D',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    CSAT <SortIcon field="cx_score_rating" />
                                </th>
                                {mode === 'sentiment' ? (
                                    <>
                                        <th 
                                            onClick={() => handleSort('sentiment')}
                                            style={{
                                                padding: '12px 16px',
                                                textAlign: 'left',
                                                color: '#8B949E',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                cursor: 'pointer',
                                                borderBottom: '1px solid #30363D'
                                            }}
                                        >
                                            Sentiment <SortIcon field="sentiment" />
                                        </th>
                                        <th style={{
                                            padding: '12px 16px',
                                            textAlign: 'left',
                                            color: '#8B949E',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            borderBottom: '1px solid #30363D'
                                        }}>
                                            Topics
                                        </th>
                                    </>
                                ) : (
                                    <>
                                        <th style={{
                                            padding: '12px 16px',
                                            textAlign: 'left',
                                            color: '#8B949E',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            borderBottom: '1px solid #30363D'
                                        }}>
                                            Main Topic
                                        </th>
                                        <th style={{
                                            padding: '12px 16px',
                                            textAlign: 'left',
                                            color: '#8B949E',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            borderBottom: '1px solid #30363D'
                                        }}>
                                            Sub-Topic
                                        </th>
                                    </>
                                )}
                                <th 
                                    onClick={() => handleSort('country')}
                                    style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        color: '#8B949E',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #30363D'
                                    }}
                                >
                                    Country <SortIcon field="country" />
                                </th>
                                <th style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    color: '#8B949E',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    borderBottom: '1px solid #30363D'
                                }}>
                                    Product
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedConversations.map((conv, index) => (
                                <tr 
                                    key={conv.conversation_id || index}
                                    style={{
                                        backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(22, 27, 34, 0.5)',
                                        transition: 'background-color 0.15s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(88, 166, 255, 0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'transparent' : 'rgba(22, 27, 34, 0.5)'}
                                >
                                    <td
                                        onClick={() => conv.conversation_id && setSelectedConversation(conv.conversation_id)}
                                        onMouseEnter={e => { if (conv.conversation_id) e.currentTarget.style.textDecoration = 'underline'; }}
                                        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                                        style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid #21262D',
                                            color: '#C084FC',
                                            fontSize: '0.875rem',
                                            fontFamily: 'monospace',
                                            cursor: conv.conversation_id ? 'pointer' : 'default'
                                        }}
                                    >
                                        {conv.conversation_id}
                                    </td>
                                    <td style={{
                                        padding: '12px 16px',
                                        borderBottom: '1px solid #21262D',
                                        color: '#C9D1D9',
                                        fontSize: '0.875rem',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {conv.created_date_bd}
                                    </td>
                                    <td style={{ padding: '12px 16px', borderBottom: '1px solid #21262D', textAlign: 'center' }}>
                                        {conv.cx_score_rating > 0 ? (
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '2px 8px',
                                                borderRadius: 10,
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                background: conv.cx_score_rating >= 4 ? 'rgba(16,185,129,0.15)' : conv.cx_score_rating >= 3 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                                color: conv.cx_score_rating >= 4 ? '#10B981' : conv.cx_score_rating >= 3 ? '#F59E0B' : '#EF4444'
                                            }}>
                                                {'★'.repeat(conv.cx_score_rating)}{'☆'.repeat(5 - conv.cx_score_rating)}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#4B5563', fontSize: '0.75rem' }}>—</span>
                                        )}
                                    </td>
                                    {mode === 'sentiment' ? (
                                        <>
                                            {/* Sentiment Column */}
                                            <td style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #21262D'
                                            }}>
                                                {(() => {
                                                    const sentiment = conv.sentiment?.toLowerCase() || 'neutral';
                                                    const colors = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.neutral;
                                                    const emoji = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😞' : '😐';
                                                    return (
                                                        <span style={{
                                                            padding: '4px 10px',
                                                            backgroundColor: colors.bg,
                                                            color: colors.text,
                                                            borderRadius: '12px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            {emoji} {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            {/* Combined Topics Column */}
                                            <td style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #21262D'
                                            }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {(() => {
                                                        const displayTopics = getDisplaySubTopics(conv.topic);
                                                        return (
                                                            <>
                                                                {displayTopics.slice(0, 3).map((t, i) => (
                                                                    <span key={i} style={{
                                                                        padding: '2px 8px',
                                                                        backgroundColor: 'rgba(88, 166, 255, 0.15)',
                                                                        color: '#C084FC',
                                                                        borderRadius: '10px',
                                                                        fontSize: '0.75rem'
                                                                    }}>
                                                                        {t.length > 20 ? t.substring(0, 20) + '...' : t}
                                                                    </span>
                                                                ))}
                                                                {displayTopics.length > 3 && (
                                                                    <span style={{
                                                                        padding: '2px 8px',
                                                                        backgroundColor: 'rgba(139, 148, 158, 0.15)',
                                                                        color: '#8B949E',
                                                                        borderRadius: '10px',
                                                                        fontSize: '0.75rem'
                                                                    }}>
                                                                        +{displayTopics.length - 3}
                                                                    </span>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            {/* Main Topic Column */}
                                            <td style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #21262D'
                                            }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {filterMainTopic ? (
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            backgroundColor: 'rgba(163, 113, 247, 0.15)',
                                                            color: '#A371F7',
                                                            borderRadius: '10px',
                                                            fontSize: '0.75rem'
                                                        }}>
                                                            {filterMainTopic}
                                                        </span>
                                                    ) : (
                                                        Array.isArray(conv.main_topic) && conv.main_topic.slice(0, 2).map((t, i) => (
                                                            <span key={i} style={{
                                                                padding: '2px 8px',
                                                                backgroundColor: 'rgba(163, 113, 247, 0.15)',
                                                                color: '#A371F7',
                                                                borderRadius: '10px',
                                                                fontSize: '0.75rem'
                                                            }}>
                                                                {t}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </td>
                                            {/* Sub-Topic Column */}
                                            <td style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid #21262D'
                                            }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {filterSubTopic ? (
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            backgroundColor: 'rgba(88, 166, 255, 0.15)',
                                                            color: '#C084FC',
                                                            borderRadius: '10px',
                                                            fontSize: '0.75rem'
                                                        }}>
                                                            {filterSubTopic.length > 25 ? filterSubTopic.substring(0, 25) + '...' : filterSubTopic}
                                                        </span>
                                                    ) : (
                                                        getDisplaySubTopics(conv.topic).slice(0, 2).map((t, i) => (
                                                            <span key={i} style={{
                                                                padding: '2px 8px',
                                                                backgroundColor: 'rgba(88, 166, 255, 0.15)',
                                                                color: '#C084FC',
                                                                borderRadius: '10px',
                                                                fontSize: '0.75rem'
                                                            }}>
                                                                {t.length > 25 ? t.substring(0, 25) + '...' : t}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </td>
                                        </>
                                    )}
                                    <td style={{
                                        padding: '12px 16px',
                                        borderBottom: '1px solid #21262D',
                                        color: '#C9D1D9',
                                        fontSize: '0.875rem'
                                    }}>
                                        {conv.country}
                                    </td>
                                    <td style={{
                                        padding: '12px 16px',
                                        borderBottom: '1px solid #21262D',
                                        color: '#C9D1D9',
                                        fontSize: '0.875rem'
                                    }}>
                                        {conv.product}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            </div>

            {/* Shared chat-bubble viewer (same as CSAT page) */}
            <ConversationViewer
                conversationId={selectedConversation}
                onClose={() => setSelectedConversation(null)}
            />
        </div>
    );
};

export default ConversationList;

