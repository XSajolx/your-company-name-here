import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ConversationViewer from './ConversationViewer';
import { supabase } from '../services/supabaseClient';
import { updateCsatAgentFault, updateCsatNotes, updateCsatAgent } from '../services/api';

// Sheet-style CSAT records tab. Reproduces the "CSAT Analysis" Google Sheet:
// Created At · Conversation ID · Agent · Rating · Comment · Category, plus an
// editable "Agent's Fault" (Yes/No) dropdown that persists to CSAT New."Agent Fault".
const PAGE_SIZE = 25;

const COLUMNS = [
    { key: 'Created at', label: 'Created At' },
    { key: 'Conversation ID', label: 'Conversation ID' },
    { key: 'Agent Name', label: 'Agent' },
    { key: 'Conversation rating', label: 'Rating' },
    { key: 'Conversation rating remark', label: 'Comment' },
    { key: 'Concern regarding product (Catagory)', label: 'Category' },
    { key: 'Agent Fault', label: "Agent's Fault" },
    { key: 'Notes', label: 'Notes' },
];

const ratingColor = (r) => {
    const n = Number(r);
    if (n <= 2) return '#F87171';
    if (n === 3) return '#FBBF24';
    return '#34D399';
};

const CSATRecords = ({ rows = [] }) => {
    const [localRows, setLocalRows] = useState(rows);
    const [ratingFilter, setRatingFilter] = useState('low'); // all | low | high
    const [faultFilter, setFaultFilter] = useState('all');   // all | yes | no | unset
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sortField, setSortField] = useState('Created at');
    const [sortDir, setSortDir] = useState('desc');
    const [viewingConv, setViewingConv] = useState(null);
    const [saving, setSaving] = useState({});
    const [agentOpts, setAgentOpts] = useState([]); // [{ intercom, real, label }] for the editable Agent column

    // Load the agent roster (real name + Intercom alias) for the Agent dropdown.
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase
                .from('agent_name_mapping')
                .select('intercom_name, agent_name')
                .order('agent_name');
            if (error) { console.error('agent roster load failed', error.message); return; }
            setAgentOpts((data || []).map(r => ({
                intercom: r.intercom_name,
                real: r.agent_name,
                label: r.agent_name ? `${r.agent_name} (${r.intercom_name})` : r.intercom_name,
            })));
        })();
    }, []);

    useEffect(() => { setLocalRows(rows); }, [rows]);
    useEffect(() => { setPage(1); }, [ratingFilter, faultFilter, search, sortField, sortDir]);

    const filtered = useMemo(() => {
        let out = localRows;
        if (ratingFilter === 'low') out = out.filter(r => Number(r['Conversation rating']) <= 3);
        else if (ratingFilter === 'high') out = out.filter(r => Number(r['Conversation rating']) >= 4);
        if (faultFilter !== 'all') {
            out = out.filter(r => {
                const v = String(r['Agent Fault'] || '').toUpperCase();
                if (faultFilter === 'yes') return v === 'YES';
                if (faultFilter === 'no') return v === 'NO';
                if (faultFilter === 'unset') return !v;
                return true;
            });
        }
        const term = search.trim().toLowerCase();
        if (term) {
            out = out.filter(r =>
                String(r['Conversation ID'] || '').includes(term) ||
                String(r['Agent Name'] || '').toLowerCase().includes(term) ||
                String(r['Agent Intercom Name'] || '').toLowerCase().includes(term) ||
                String(r['Conversation rating remark'] || '').toLowerCase().includes(term) ||
                String(r['Notes'] || '').toLowerCase().includes(term) ||
                String(r['Concern regarding product (Catagory)'] || '').toLowerCase().includes(term));
        }
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...out].sort((a, b) => {
            const av = a[sortField], bv = b[sortField];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
        });
    }, [localRows, ratingFilter, faultFilter, search, sortField, sortDir]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const toggleSort = (k) => {
        if (sortField === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortField(k); setSortDir('asc'); }
    };
    const sortIcon = (k) => (sortField === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕');

    const setFault = useCallback(async (convId, value) => {
        const prev = localRows.find(r => String(r['Conversation ID']) === String(convId))?.['Agent Fault'] ?? null;
        setSaving(s => ({ ...s, [convId]: true }));
        setLocalRows(rs => rs.map(r => String(r['Conversation ID']) === String(convId) ? { ...r, 'Agent Fault': value || null } : r));
        const ok = await updateCsatAgentFault(convId, value || null);
        setSaving(s => { const c = { ...s }; delete c[convId]; return c; });
        if (!ok) {
            setLocalRows(rs => rs.map(r => String(r['Conversation ID']) === String(convId) ? { ...r, 'Agent Fault': prev } : r));
            alert('Failed to save Agent’s Fault. Please try again.');
        }
    }, [localRows]);

    // Persist the internal Notes entry on blur (optimistic, with rollback on failure).
    const saveNotes = useCallback(async (convId, value) => {
        const cur = localRows.find(r => String(r['Conversation ID']) === String(convId));
        const prev = cur ? (cur['Notes'] ?? null) : null;
        if ((prev ?? '') === (value ?? '')) return; // no change
        setSaving(s => ({ ...s, [`n_${convId}`]: true }));
        const ok = await updateCsatNotes(convId, value);
        setSaving(s => { const c = { ...s }; delete c[`n_${convId}`]; return c; });
        if (!ok) {
            setLocalRows(rs => rs.map(r => String(r['Conversation ID']) === String(convId) ? { ...r, 'Notes': prev } : r));
            alert('Failed to save note. Please try again.');
        }
    }, [localRows]);

    // Track typing locally without a round-trip per keystroke.
    const onNotesInput = useCallback((convId, value) => {
        setLocalRows(rs => rs.map(r => String(r['Conversation ID']) === String(convId) ? { ...r, 'Notes': value } : r));
    }, []);

    // Override the rated agent on a row (optimistic, with rollback on failure).
    const setAgent = useCallback(async (convId, intercom) => {
        const opt = agentOpts.find(a => a.intercom === intercom);
        const real = opt ? opt.real : null;
        const cur = localRows.find(r => String(r['Conversation ID']) === String(convId));
        const prevReal = cur ? (cur['Agent Name'] ?? null) : null;
        const prevIntercom = cur ? (cur['Agent Intercom Name'] ?? null) : null;
        setSaving(s => ({ ...s, [`a_${convId}`]: true }));
        setLocalRows(rs => rs.map(r => String(r['Conversation ID']) === String(convId)
            ? { ...r, 'Agent Name': real, 'Agent Intercom Name': intercom || null } : r));
        const ok = await updateCsatAgent(convId, real, intercom || null);
        setSaving(s => { const c = { ...s }; delete c[`a_${convId}`]; return c; });
        if (!ok) {
            setLocalRows(rs => rs.map(r => String(r['Conversation ID']) === String(convId)
                ? { ...r, 'Agent Name': prevReal, 'Agent Intercom Name': prevIntercom } : r));
            alert('Failed to save agent. Please try again.');
        }
    }, [agentOpts, localRows]);

    const exportCSV = () => {
        const headers = COLUMNS.map(c => c.label);
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [headers.join(',')];
        for (const r of filtered) lines.push(COLUMNS.map(c => escape(r[c.key])).join(','));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'csat-records.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const faultPillStyle = (v) => {
        const up = String(v || '').toUpperCase();
        const base = { padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #30363D', background: '#0D1117', cursor: 'pointer', outline: 'none' };
        if (up === 'YES') return { ...base, color: '#F87171', borderColor: 'rgba(248,113,113,0.5)' };
        if (up === 'NO') return { ...base, color: '#34D399', borderColor: 'rgba(52,211,153,0.5)' };
        return { ...base, color: '#8B949E' };
    };

    return (
        <div style={{ background: '#0D1117', border: '1px solid #21262D', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.85rem 1rem', borderBottom: '1px solid #21262D' }}>
                <span style={{ color: '#C9D1D9', fontWeight: 600, fontSize: '0.9rem' }}>CSAT Records</span>
                <span style={{ color: '#8B949E', fontSize: '0.8rem' }}>{filtered.length.toLocaleString()} rows</span>
                <div style={{ flex: 1 }} />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search ID / agent / comment…"
                    style={{ background: '#161B22', border: '1px solid #30363D', borderRadius: '6px', color: '#C9D1D9', padding: '0.4rem 0.6rem', fontSize: '0.8rem', minWidth: '220px' }}
                />
                <select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)} style={selStyle}>
                    <option value="low">Low (≤3)</option>
                    <option value="high">High (≥4)</option>
                    <option value="all">All ratings</option>
                </select>
                <select value={faultFilter} onChange={e => setFaultFilter(e.target.value)} style={selStyle}>
                    <option value="all">Fault: All</option>
                    <option value="yes">Fault: Yes</option>
                    <option value="no">Fault: No</option>
                    <option value="unset">Fault: Unset</option>
                </select>
                <button onClick={exportCSV} style={{ ...selStyle, cursor: 'pointer' }}>⬇ CSV</button>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                {filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#8B949E', fontSize: '0.875rem' }}>
                        No CSAT records for this selection.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                            <tr style={{ background: '#161B22' }}>
                                {COLUMNS.map(col => (
                                    <th key={col.key} onClick={() => toggleSort(col.key)}
                                        style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#8B949E', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #21262D', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                                        {col.label}<span style={{ opacity: sortField === col.key ? 0.9 : 0.35 }}>{sortIcon(col.key)}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pageData.map((row, idx) => {
                                const convId = row['Conversation ID'];
                                return (
                                    <tr key={convId ?? idx} style={{ borderBottom: '1px solid #21262D', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                        {COLUMNS.map(col => {
                                            if (col.key === 'Agent Fault') {
                                                return (
                                                    <td key={col.key} style={{ padding: '0.5rem 1rem' }}>
                                                        <select
                                                            value={String(row['Agent Fault'] || '').toUpperCase()}
                                                            disabled={!!saving[convId]}
                                                            onChange={e => setFault(convId, e.target.value)}
                                                            style={faultPillStyle(row['Agent Fault'])}
                                                        >
                                                            <option value="">—</option>
                                                            <option value="YES">YES</option>
                                                            <option value="NO">NO</option>
                                                        </select>
                                                    </td>
                                                );
                                            }
                                            if (col.key === 'Agent Name') {
                                                const curIntercom = row['Agent Intercom Name'] || '';
                                                const inRoster = !curIntercom || agentOpts.some(a => a.intercom === curIntercom);
                                                return (
                                                    <td key={col.key} style={{ padding: '0.4rem 0.6rem', minWidth: '210px' }}>
                                                        <select
                                                            value={curIntercom}
                                                            disabled={!!saving[`a_${convId}`]}
                                                            onChange={e => setAgent(convId, e.target.value)}
                                                            title={row['Agent Name'] ? `${row['Agent Name']} (${curIntercom})` : (curIntercom || 'Unassigned')}
                                                            style={{ width: '100%', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: curIntercom ? '#C9D1D9' : '#8B949E', padding: '0.35rem 0.5rem', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                                                        >
                                                            <option value="">— Unassigned —</option>
                                                            {/* Keep the current value selectable even if it isn't in the roster (e.g. unmapped alias) */}
                                                            {!inRoster && (
                                                                <option value={curIntercom}>
                                                                    {row['Agent Name'] ? `${row['Agent Name']} (${curIntercom})` : curIntercom}
                                                                </option>
                                                            )}
                                                            {agentOpts.map(a => (
                                                                <option key={a.intercom} value={a.intercom}>{a.label}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                );
                                            }
                                            if (col.key === 'Notes') {
                                                return (
                                                    <td key={col.key} style={{ padding: '0.4rem 0.6rem', minWidth: '220px' }}>
                                                        <input
                                                            type="text"
                                                            value={row['Notes'] ?? ''}
                                                            disabled={!!saving[`n_${convId}`]}
                                                            placeholder="Type a note…"
                                                            onChange={e => onNotesInput(convId, e.target.value)}
                                                            onBlur={e => saveNotes(convId, e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                                            style={{ width: '100%', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#C9D1D9', padding: '0.35rem 0.5rem', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                                                        />
                                                    </td>
                                                );
                                            }
                                            if (col.key === 'Conversation rating') {
                                                return (
                                                    <td key={col.key} style={{ padding: '0.6rem 1rem', color: ratingColor(row[col.key]), fontWeight: 700 }}>
                                                        {row[col.key] ?? '—'}
                                                    </td>
                                                );
                                            }
                                            if (col.key === 'Conversation ID') {
                                                return (
                                                    <td key={col.key}
                                                        onClick={() => convId && setViewingConv(String(convId))}
                                                        style={{ padding: '0.6rem 1rem', color: '#C084FC', fontFamily: 'monospace', fontSize: '0.75rem', cursor: convId ? 'pointer' : 'default' }}
                                                        onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}>
                                                        {convId ?? '—'}
                                                    </td>
                                                );
                                            }
                                            const wide = col.key === 'Conversation rating remark';
                                            return (
                                                <td key={col.key} title={wide ? String(row[col.key] ?? '') : undefined}
                                                    style={{ padding: '0.6rem 1rem', color: '#C9D1D9', maxWidth: wide ? '320px' : (col.key === 'Concern regarding product (Catagory)' ? '200px' : undefined), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {row[col.key] ?? '—'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {filtered.length > PAGE_SIZE && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #21262D', color: '#8B949E', fontSize: '0.8rem' }}>
                    <span>Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pgBtn(page === 1)}>‹</button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pgBtn(page === totalPages)}>›</button>
                </div>
            )}

            <ConversationViewer conversationId={viewingConv} onClose={() => setViewingConv(null)} />
        </div>
    );
};

const selStyle = { background: '#161B22', border: '1px solid #30363D', borderRadius: '6px', color: '#C9D1D9', padding: '0.4rem 0.6rem', fontSize: '0.8rem' };
const pgBtn = (disabled) => ({ background: disabled ? 'transparent' : 'rgba(255,255,255,0.06)', border: '1px solid #30363D', borderRadius: '4px', color: disabled ? '#484F58' : '#C9D1D9', width: '28px', height: '28px', cursor: disabled ? 'default' : 'pointer' });

export default CSATRecords;
