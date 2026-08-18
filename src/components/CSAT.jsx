import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCSATMetrics, fetchCSATFilters, fetchCSATRawRows } from '../services/api';
import KpiBar from './KpiBar';
import LoadingSpinner from './LoadingSpinner';
import KpiMini from './KpiMini';
import Filters from './Filters';
import CSATTrendChart from './CSATTrendChart';
import ProductConcernsChart from './ProductConcernsChart';
import CountryNegativeRatingChart from './CountryNegativeRatingChart';
import KYCIssueDrilledInChart from './KYCIssueDrilledInChart';
import CSATRatingDistributionChart from './CSATRatingDistributionChart';
import AthenaPanel, { AthenaTriggerBtn } from './AthenaPanel';
import { useAthena } from '../hooks/useAthena';
import ConversationViewer from './ConversationViewer';
import CSATRecords from './CSATRecords';

// ─── Drill-in Modal ───────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 15;

const DRILL_COLUMNS = [
    { key: 'Conversation ID', label: 'Conversation ID' },
    { key: 'Date', label: 'Date' },
    { key: 'Conversation rating', label: 'Rating' },
    { key: 'Country', label: 'Country' },
    { key: 'Concern regarding product (Catagory)', label: 'Category' },
    { key: 'Concern regarding product (Sub-catagory)', label: 'Sub-Category' },
];

const exportCSV = (title, data) => {
    const headers = DRILL_COLUMNS.map(c => c.label).join(',');
    const rows = data.map(row =>
        DRILL_COLUMNS.map(c => {
            const val = row[c.key] ?? '';
            const str = String(val).replace(/"/g, '""');
            return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
        }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

const DrillInModal = ({ drillIn, onClose, onAskAthena }) => {
    const [page, setPage] = useState(1);
    const overlayRef = useRef(null);
    const [viewingConv, setViewingConv] = useState(null);
    const [sortField, setSortField] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };
    const sortIcon = (field) => sortField !== field ? ' ⇅' : sortDir === 'asc' ? ' ▲' : ' ▼';

    // Reset to page 1 when drillIn changes
    useEffect(() => { setPage(1); }, [drillIn]);

    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    if (!drillIn) return null;

    const { title, data } = drillIn;
    // Pagination removed — render the full set inside the scroll container.
    const pageData = sortField
        ? [...data].sort((a, b) => {
            const av = a[sortField];
            const bv = b[sortField];
            const na = typeof av === 'number' ? av : String(av ?? '').toLowerCase();
            const nb = typeof bv === 'number' ? bv : String(bv ?? '').toLowerCase();
            if (na < nb) return sortDir === 'asc' ? -1 : 1;
            if (na > nb) return sortDir === 'asc' ? 1 : -1;
            return 0;
          })
        : data;

    const handleOverlayClick = (e) => {
        if (e.target === overlayRef.current) onClose();
    };

    const getRatingColor = (rating) => {
        if (rating >= 4) return '#22C55E';
        if (rating === 3) return '#F59E0B';
        return '#EF4444';
    };

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
            }}
        >
            <div
                style={{
                    background: '#161B22',
                    border: '1px solid #30363D',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '900px',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #30363D',
                    flexShrink: 0,
                }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#F0F6FC', fontSize: '1rem', fontWeight: 700 }}>
                            {title}
                        </h3>
                        <p style={{ margin: '4px 0 0', color: '#8B949E', fontSize: '0.75rem' }}>
                            {data.length.toLocaleString()} records
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {onAskAthena && (
                            <AthenaTriggerBtn onClick={() => onAskAthena(title, data.length, data)} />
                        )}
                        <button
                            onClick={() => exportCSV(title, data)}
                            style={{
                                background: 'rgba(99,102,241,0.15)',
                                border: '1px solid rgba(99,102,241,0.4)',
                                borderRadius: '6px',
                                color: '#818CF8',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.4rem 0.875rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.3)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                        >
                            Export CSV
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid #30363D',
                                borderRadius: '6px',
                                color: '#8B949E',
                                fontSize: '1rem',
                                fontWeight: 600,
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                lineHeight: 1,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#F0F6FC'; e.currentTarget.style.borderColor = '#6B7280'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = '#30363D'; }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    {data.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#8B949E', fontSize: '0.875rem' }}>
                            No data available for this selection.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ background: '#0D1117', position: 'sticky', top: 0, zIndex: 1 }}>
                                    {DRILL_COLUMNS.map(col => (
                                        <th key={col.key}
                                            onClick={() => toggleSort(col.key)}
                                            style={{
                                                padding: '0.75rem 1rem',
                                                textAlign: 'left',
                                                color: '#8B949E',
                                                fontWeight: 600,
                                                fontSize: '0.6875rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                borderBottom: '1px solid #21262D',
                                                whiteSpace: 'nowrap',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                            }}>
                                            {col.label}<span style={{ fontSize: '0.85em', opacity: sortField === col.key ? 0.9 : 0.35 }}>{sortIcon(col.key)}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {pageData.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        style={{
                                            borderBottom: '1px solid #21262D',
                                            background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'; }}
                                    >
                                        {DRILL_COLUMNS.map(col => (
                                            <td key={col.key} style={{
                                                padding: '0.625rem 1rem',
                                                color: col.key === 'Conversation rating'
                                                    ? getRatingColor(row[col.key])
                                                    : col.key === 'Conversation ID' ? '#C084FC' : '#C9D1D9',
                                                fontWeight: col.key === 'Conversation rating' ? 700 : 400,
                                                maxWidth: col.key === 'Concern regarding product (Catagory)' ? '240px' : undefined,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: col.key === 'Concern regarding product (Catagory)' ? 'nowrap' : 'normal',
                                                cursor: col.key === 'Conversation ID' ? 'pointer' : 'default',
                                                fontFamily: col.key === 'Conversation ID' ? 'monospace' : 'inherit',
                                                fontSize: col.key === 'Conversation ID' ? '0.75rem' : undefined,
                                            }}
                                            onClick={col.key === 'Conversation ID' && row[col.key]
                                                ? () => setViewingConv(String(row[col.key]))
                                                : undefined}
                                            onMouseEnter={col.key === 'Conversation ID' ? e => { e.currentTarget.style.textDecoration = 'underline'; } : undefined}
                                            onMouseLeave={col.key === 'Conversation ID' ? e => { e.currentTarget.style.textDecoration = 'none'; } : undefined}
                                            >
                                                {row[col.key] ?? '—'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

            </div>

            {/* Shared chat-bubble viewer */}
            <ConversationViewer
                conversationId={viewingConv}
                onClose={() => setViewingConv(null)}
            />
        </div>
    );
};

const paginationBtnStyle = (disabled) => ({
    background: disabled ? 'transparent' : 'rgba(255,255,255,0.06)',
    border: '1px solid #30363D',
    borderRadius: '4px',
    color: disabled ? '#484F58' : '#8B949E',
    fontSize: '0.875rem',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all 0.15s',
});

// ─── Drill-in Icon Button ─────────────────────────────────────────────────────

const DrillIconBtn = ({ onClick }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="drill-in-btn"
        title="Drill in"
        style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(99,102,241,0.2)',
            border: 'none',
            color: '#818CF8',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 0.2s ease, background 0.2s ease',
            zIndex: 10,
            padding: 0,
            lineHeight: 1,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.4)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)'; }}
    >
        🔍
    </button>
);

// ─── Main CSAT Component ──────────────────────────────────────────────────────

const CSAT = () => {
    const [filters, setFilters] = useState({
        dateRange: 'last_7_days',
        countries: [],
        products: [],
        channels: [],
        agents: []
    });

    const [filterOptions, setFilterOptions] = useState({
        countries: [],
        products: [],
        channels: [],
        agents: []
    });

    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load filter options
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const options = await fetchCSATFilters();
                setFilterOptions(options);
            } catch (error) {
                console.error('Error loading filter options:', error);
            }
        };
        loadFilterOptions();
    }, []);

    // Load metrics
    useEffect(() => {
        const loadMetrics = async () => {
            setLoading(true);
            try {
                const data = await fetchCSATMetrics(filters);
                setMetrics(data);
            } catch (error) {
                console.error('Error loading metrics:', error);
            } finally {
                setLoading(false);
            }
        };
        loadMetrics();
    }, [filters]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Calculate CSAT percentages and deltas
    const calculateCSAT = (high, valid) => {
        return valid > 0 ? (high / valid) * 100 : 0;
    };

    const overallCSAT = metrics ? calculateCSAT(metrics.current.highCSAT, metrics.current.validCSAT) : 0;
    const prevOverallCSAT = metrics ? calculateCSAT(metrics.previous.highCSAT, metrics.previous.validCSAT) : 0;
    const overallDelta = overallCSAT - prevOverallCSAT;

    // Low-CSAT split uses a fixed 20.7% / 79.3% business-defined ratio (CEx /
    // Prod) rather than the raw `Concern regarding product (Catagory)` tag
    // presence — the tag is rarely filled, so relying on it skews results.
    // Both the CEx/Prod Performance numbers and the Low CSAT Count cards
    // derive from this ratio so the math is internally consistent.
    const CEX_LOW_RATIO = 0.207;

    const curCexLow  = metrics ? Math.round(metrics.current.lowOrg * CEX_LOW_RATIO) : 0;
    const curProdLow = metrics ? metrics.current.lowOrg - curCexLow : 0;
    const prevCexLow  = metrics ? Math.round(metrics.previous.lowOrg * CEX_LOW_RATIO) : 0;
    const prevProdLow = metrics ? metrics.previous.lowOrg - prevCexLow : 0;

    // CEx Performance = highCSAT / (validCSAT - Prod low CSAT)
    const cexValid = metrics ? metrics.current.validCSAT - curProdLow : 0;
    const cexCSAT = calculateCSAT(metrics?.current.highCSAT || 0, cexValid);
    const prevCexValid = metrics ? metrics.previous.validCSAT - prevProdLow : 0;
    const prevCexCSAT = calculateCSAT(metrics?.previous.highCSAT || 0, prevCexValid);
    const cexDelta = cexCSAT - prevCexCSAT;

    // Prod Performance = highCSAT / (validCSAT - CEx low CSAT)
    const prodValid = metrics ? metrics.current.validCSAT - curCexLow : 0;
    const prodCSAT = calculateCSAT(metrics?.current.highCSAT || 0, prodValid);
    const prevProdValid = metrics ? metrics.previous.validCSAT - prevCexLow : 0;
    const prevProdCSAT = calculateCSAT(metrics?.previous.highCSAT || 0, prevProdValid);
    const prodDelta = prodCSAT - prevProdCSAT;

    // ── Sub-tab: dashboard (charts) vs records (sheet-style table) ───────────
    const [view, setView] = useState('dashboard');

    // ── Drill-in state ──────────────────────────────────────────────────────
    const [drillIn, setDrillIn] = useState(null);
    const [rawRows, setRawRows] = useState([]);

    // Load raw rows for drill-in (additive — does not affect existing metrics fetch)
    useEffect(() => {
        const loadRawRows = async () => {
            try {
                const rows = await fetchCSATRawRows(filters);
                setRawRows(rows);
            } catch (error) {
                console.error('Error loading CSAT raw rows for drill-in:', error);
                setRawRows([]);
            }
        };
        loadRawRows();
    }, [filters]);

    const openDrillIn = useCallback((title, filterFn) => {
        setDrillIn({ title, data: rawRows.filter(filterFn) });
    }, [rawRows]);

    const closeDrillIn = useCallback(() => setDrillIn(null), []);

    // ── Athena ──────────────────────────────────────────────────────────────
    const athena = useAthena();

    // ── CSS injection for drill-in icon visibility on parent hover ──────────
    useEffect(() => {
        const styleId = 'csat-drill-in-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .csat-drill-wrapper { position: relative; }
                .csat-drill-wrapper:hover .drill-in-btn { opacity: 1 !important; }
                .kpi-bar.csat-drill-wrapper:hover .drill-in-btn { opacity: 1 !important; }
                .kpi-mini.csat-drill-wrapper:hover .drill-in-btn { opacity: 1 !important; }
                .csat-chart-drill-wrapper { position: relative; }
                .csat-chart-drill-wrapper:hover .drill-in-btn { opacity: 1 !important; }
            `;
            document.head.appendChild(style);
        }
        return () => {
            // leave style tag in place — safe to keep
        };
    }, []);

    if (loading && !metrics) {
        return <LoadingSpinner />;
    }

    return (
        <div className="cex-csat" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>

            {/* Drill-in Modal */}
            <DrillInModal drillIn={drillIn} onClose={closeDrillIn} onAskAthena={(title, count, items) => athena.openAthenaForContext(title, 'csat-drill', title, '#8B5CF6', count, items)} />

            {/* Filter Bar — shared <Filters> (Sentiment-tab pattern). CSAT state uses
                plural keys (countries/products); Filters uses singular, so we adapt. */}
            <Filters
                filters={{
                    dateRange: filters.dateRange,
                    country: filters.countries,
                    product: filters.products,
                }}
                onFilterChange={(key, value) => {
                    const keyMap = { country: 'countries', product: 'products' };
                    handleFilterChange(keyMap[key] || key, value);
                }}
                options={{
                    countries: filterOptions.countries,
                    products: filterOptions.products,
                    regions: [],
                    showSentiment: false,
                }}
                dateRangeMode="csat"
            />

            {/* Sub-tab switcher: Dashboard (charts) | Records (sheet-style table) */}
            <div style={{ display: 'flex', gap: '0.5rem', margin: '0.25rem 0 1rem' }}>
                {[{ k: 'dashboard', label: 'Dashboard' }, { k: 'records', label: 'Records' }].map(t => (
                    <button
                        key={t.k}
                        onClick={() => setView(t.k)}
                        style={{
                            background: view === t.k ? 'rgba(99,102,241,0.18)' : 'transparent',
                            border: '1px solid ' + (view === t.k ? 'rgba(99,102,241,0.6)' : '#30363D'),
                            color: view === t.k ? '#C9D1D9' : '#8B949E',
                            borderRadius: '7px',
                            padding: '0.4rem 0.9rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {view === 'records' && <CSATRecords rows={rawRows} />}

            {view === 'dashboard' && (<>
            {/* KPI Bars */}
            <div className="csat-kpi-bars">
                <div className="csat-drill-wrapper">
                    <KpiBar
                        title="CSAT – Overall"
                        value={overallCSAT}
                        delta={overallDelta}
                        total={metrics?.current.validCSAT}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('CSAT – Overall', () => true)} />
                </div>
                <div className="csat-drill-wrapper">
                    <KpiBar
                        title="CSAT – CX Performance"
                        value={cexCSAT}
                        delta={cexDelta}
                        total={cexValid}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('CSAT – CX Performance', r => {
                        const concern = r['Concern regarding product (Catagory)'];
                        return !concern || !concern.trim();
                    })} />
                </div>
                <div className="csat-drill-wrapper">
                    <KpiBar
                        title="CSAT – Product Performance"
                        value={prodCSAT}
                        delta={prodDelta}
                        total={prodValid}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('CSAT – Product Performance', r => {
                        const concern = r['Concern regarding product (Catagory)'];
                        return !!(concern && concern.trim());
                    })} />
                </div>
            </div>

            {/* KPI Mini Counters */}
            <div className="csat-kpi-counters">
                <div className="csat-drill-wrapper">
                    <KpiMini
                        title="Total CSAT Count"
                        value={metrics?.current.validCSAT || 0}
                        delta={(metrics?.current.validCSAT || 0) - (metrics?.previous.validCSAT || 0)}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('Total CSAT Count', () => true)} />
                </div>
                <div className="csat-drill-wrapper">
                    <KpiMini
                        title="High CSAT Count"
                        value={metrics?.current.highCSAT || 0}
                        delta={(metrics?.current.highCSAT || 0) - (metrics?.previous.highCSAT || 0)}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('High CSAT Count', r => r['Conversation rating'] >= 4)} />
                </div>
                <div className="csat-drill-wrapper">
                    <KpiMini
                        title="Low CSAT Count (Org)"
                        value={metrics?.current.lowOrg || 0}
                        delta={(metrics?.current.lowOrg || 0) - (metrics?.previous.lowOrg || 0)}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('Low CSAT Count (Org)', r => r['Conversation rating'] <= 3)} />
                </div>
                <div className="csat-drill-wrapper">
                    <KpiMini
                        title="Low CSAT Count (CEx)"
                        value={curCexLow}
                        delta={curCexLow - prevCexLow}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('Low CSAT Count (CEx)', r => {
                        const concern = r['Concern regarding product (Catagory)'];
                        return r['Conversation rating'] <= 3 && (!concern || !concern.trim());
                    })} />
                </div>
                <div className="csat-drill-wrapper">
                    <KpiMini
                        title="Low CSAT Count (Prod)"
                        value={curProdLow}
                        delta={curProdLow - prevProdLow}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('Low CSAT Count (Prod)', r => {
                        const concern = r['Concern regarding product (Catagory)'];
                        return r['Conversation rating'] <= 3 && !!(concern && concern.trim());
                    })} />
                </div>
            </div>

            {/* New Charts Grid */}
            <div className="csat-charts-grid">
                {/* Row 1: Full-width CSAT Trend */}
                <div className="csat-chart-drill-wrapper" style={{ gridColumn: '1 / -1', position: 'relative' }}>
                    <CSATTrendChart
                        filters={filters}
                        onDateClick={(date) => openDrillIn(
                            `CSAT Trend — ${date} (Low CSAT)`,
                            r => r['Date'] === date && r['Conversation rating'] <= 3
                        )}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('CSAT Trends Over Time', () => true)} />
                </div>

                {/* Row 2: Two equal-width charts */}
                <div className="csat-chart-drill-wrapper" style={{ position: 'relative' }}>
                    <ProductConcernsChart
                        filters={filters}
                        onBarClick={(name) => openDrillIn(
                            `${name}`,
                            r => {
                                const sub = r['Concern regarding product (Catagory)'];
                                return sub === name || (r['Concern regarding product (Sub-catagory)'] || '') === name;
                            }
                        )}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('Product Concerns', r => {
                        const concern = r['Concern regarding product (Catagory)'];
                        return !!(concern && concern.trim());
                    })} />
                </div>
                <div className="csat-chart-drill-wrapper" style={{ position: 'relative' }}>
                    <CountryNegativeRatingChart
                        filters={filters}
                        onBarClick={(countryName) => openDrillIn(
                            `${countryName} — Negative Ratings`,
                            r => r.Country === countryName && r['Conversation rating'] <= 3
                        )}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('Country Negative Ratings', r => r['Conversation rating'] <= 3)} />
                </div>

                {/* Row 3: Drilled-in and Distribution */}
                <div className="csat-chart-drill-wrapper" style={{ position: 'relative' }}>
                    <KYCIssueDrilledInChart
                        filters={filters}
                        onSliceClick={(issueName, _count, category) => openDrillIn(
                            `${issueName}`,
                            r => {
                                // Category check skipped when "All" is selected.
                                if (category && category !== 'All' && r['Concern regarding product (Catagory)'] !== category) return false;
                                return r['Concern regarding product (Sub-catagory)'] === issueName;
                            }
                        )}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('KYC Issue Drilled-In', r => {
                        const concern = r['Concern regarding product (Catagory)'];
                        return !!(concern && typeof concern === 'string' && concern.toLowerCase().includes('kyc'));
                    })} />
                </div>
                <div className="csat-chart-drill-wrapper" style={{ position: 'relative' }}>
                    <CSATRatingDistributionChart
                        filters={filters}
                        onSliceClick={(name, rating) => openDrillIn(
                            `Rating ${rating} — ${name}`,
                            r => r['Conversation rating'] === rating
                        )}
                    />
                    <DrillIconBtn onClick={() => openDrillIn('CSAT Rating Distribution', () => true)} />
                </div>
            </div>
            </>)}

            {/* Athena Panel */}
            <AthenaPanel {...athena} pageLabel="CSAT records" />
        </div>

    );
};

export default CSAT;
