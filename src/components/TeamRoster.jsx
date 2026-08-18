import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';

// Role vocabulary — mirrors the "CEx Team" planning sheet exactly.
const ROLES = ['Live chat', 'Email', 'PSTF + Email', 'PSTF + Email + AI Support', 'Ad-Hoc', 'Operation'];

// role -> canonical channel enum kept for KPI joins. Live chat stays in the live-chat scope;
// everything else leaves it. Keep in sync with the reconciliation script + SupervisorEvaluation.
const ROLE_CHANNEL = {
    'Live chat': 'chat',
    'Email': 'email',
    'PSTF + Email': 'PSTF',
    'PSTF + Email + AI Support': 'PSTF',
    'Ad-Hoc': 'PSTF',
    'Operation': 'ops',
};

const C = {
    card: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.08)',
    text: '#E2E8F0',
    faint: '#94A3B8',
    accent: '#C084FC',
    danger: '#F87171',
    input: 'rgba(15,20,35,0.6)',
};

const inputStyle = {
    background: C.input, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', width: '100%',
};

const ROLE_COLORS = {
    'Live chat': '#34D399',
    'Email': '#FB7185',
    'PSTF + Email': '#60A5FA',
    'PSTF + Email + AI Support': '#A78BFA',
    'Ad-Hoc': '#FBBF24',
    'Operation': '#94A3B8',
};

export default function TeamRoster() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [savingId, setSavingId] = useState(null);
    const [q, setQ] = useState('');
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState({ agent_name: '', role: 'Live chat', team_lead: '', intercom_name: '', email: '' });

    const load = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('agent_name_mapping')
            .select('id, agent_name, intercom_name, email, team_lead, role, channel')
            .order('team_lead', { ascending: true })
            .order('agent_name', { ascending: true });
        if (error) { setError('Could not load roster: ' + error.message); setLoading(false); return; }
        setRows(data || []);
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const leads = useMemo(() => {
        const s = new Set();
        rows.forEach(r => { if (r.team_lead) s.add(r.team_lead); });
        return Array.from(s).sort();
    }, [rows]);

    const flash = (msg, isErr = false) => {
        if (isErr) { setError(msg); setNotice(''); } else { setNotice(msg); setError(''); }
        setTimeout(() => { setNotice(''); setError(''); }, 4000);
    };

    // Persist a partial change to one row; role changes also re-derive channel.
    const patchRow = async (row, patch) => {
        if (patch.role && ROLE_CHANNEL[patch.role]) patch.channel = ROLE_CHANNEL[patch.role];
        setSavingId(row.id);
        // optimistic
        setRows(rs => rs.map(r => r.id === row.id ? { ...r, ...patch } : r));
        const { error } = await supabase.from('agent_name_mapping').update(patch).eq('id', row.id);
        setSavingId(null);
        if (error) { flash(`Save failed for ${row.agent_name}: ${error.message}`, true); load(); }
        else flash(`Saved ${row.agent_name}`);
    };

    const addAgent = async () => {
        const name = draft.agent_name.trim();
        if (!name) { flash('Name is required.', true); return; }
        if (!draft.team_lead.trim()) { flash('Team lead is required.', true); return; }
        const payload = {
            agent_name: name,
            intercom_name: draft.intercom_name.trim() || name, // placeholder until real alias known
            email: draft.email.trim() || null,
            team_lead: draft.team_lead.trim(),
            role: draft.role,
            channel: ROLE_CHANNEL[draft.role] || null,
        };
        const { error } = await supabase.from('agent_name_mapping').insert(payload);
        if (error) { flash('Add failed: ' + error.message, true); return; }
        setDraft({ agent_name: '', role: 'Live chat', team_lead: draft.team_lead, intercom_name: '', email: '' });
        setAdding(false);
        flash(`Added ${name}`);
        load();
    };

    const removeAgent = async (row) => {
        if (!window.confirm(`Remove ${row.agent_name} from the roster? This deletes their agent_name_mapping row.`)) return;
        const { error } = await supabase.from('agent_name_mapping').delete().eq('id', row.id);
        if (error) { flash('Delete failed: ' + error.message, true); return; }
        flash(`Removed ${row.agent_name}`);
        load();
    };

    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t) return rows;
        return rows.filter(r =>
            (r.agent_name || '').toLowerCase().includes(t) ||
            (r.intercom_name || '').toLowerCase().includes(t) ||
            (r.team_lead || '').toLowerCase().includes(t) ||
            (r.role || '').toLowerCase().includes(t));
    }, [rows, q]);

    // Group by team lead; put unassigned / no-role rows last.
    const groups = useMemo(() => {
        const m = new Map();
        filtered.forEach(r => {
            const k = r.team_lead || '— No team lead —';
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
        });
        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filtered]);

    const roleBadge = (role) => (
        <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600,
            color: '#0B1220', background: ROLE_COLORS[role] || '#64748B',
        }}>{role || 'unset'}</span>
    );

    return (
        <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <input placeholder="Search name / alias / lead / role…" value={q} onChange={e => setQ(e.target.value)}
                    style={{ ...inputStyle, maxWidth: 320 }} />
                <button onClick={() => setAdding(a => !a)} style={{
                    background: 'rgba(56,189,248,0.15)', color: C.accent, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '7px 16px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                }}>{adding ? 'Close' : '+ Add agent'}</button>
                <button onClick={load} style={{
                    background: 'transparent', color: C.faint, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '7px 14px', fontSize: '0.8rem', cursor: 'pointer',
                }}>Refresh</button>
                <span style={{ color: C.faint, fontSize: '0.78rem' }}>{rows.length} agents · {leads.length} team leads</span>
            </div>

            {notice && <div style={{ color: '#34D399', fontSize: '0.8rem', marginBottom: 10 }}>{notice}</div>}
            {error && <div style={{ color: C.danger, fontSize: '0.8rem', marginBottom: 10 }}>{error}</div>}

            {adding && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 18,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, alignItems: 'end' }}>
                    <label style={{ fontSize: '0.72rem', color: C.faint }}>Name*
                        <input value={draft.agent_name} onChange={e => setDraft(d => ({ ...d, agent_name: e.target.value }))} style={inputStyle} />
                    </label>
                    <label style={{ fontSize: '0.72rem', color: C.faint }}>Role
                        <select value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))} style={inputStyle}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </label>
                    <label style={{ fontSize: '0.72rem', color: C.faint }}>Team lead*
                        <input list="roster-leads" value={draft.team_lead} onChange={e => setDraft(d => ({ ...d, team_lead: e.target.value }))} style={inputStyle} />
                    </label>
                    <label style={{ fontSize: '0.72rem', color: C.faint }}>Intercom alias
                        <input value={draft.intercom_name} onChange={e => setDraft(d => ({ ...d, intercom_name: e.target.value }))} placeholder="(optional)" style={inputStyle} />
                    </label>
                    <label style={{ fontSize: '0.72rem', color: C.faint }}>Email
                        <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} placeholder="(optional)" style={inputStyle} />
                    </label>
                    <button onClick={addAgent} style={{
                        background: C.accent, color: '#0B1220', border: 'none', borderRadius: 8,
                        padding: '9px 16px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', height: 'fit-content',
                    }}>Add</button>
                </div>
            )}

            <datalist id="roster-leads">
                {leads.map(l => <option key={l} value={l} />)}
            </datalist>

            {loading ? (
                <div style={{ color: C.faint, padding: 20 }}>Loading roster…</div>
            ) : groups.map(([lead, members]) => (
                <div key={lead} style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <h3 style={{ margin: 0, color: C.text, fontSize: '0.95rem', fontWeight: 700 }}>{lead}</h3>
                        <span style={{ color: C.faint, fontSize: '0.75rem' }}>{members.length}</span>
                    </div>
                    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 720 }}>
                            <thead>
                                <tr style={{ color: C.faint, textAlign: 'left' }}>
                                    <th style={{ padding: '8px 12px', fontWeight: 500 }}>Agent</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 500, width: 200 }}>Role</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 500, width: 200 }}>Team lead</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 500 }}>Intercom alias</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 500, width: 44 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map(row => (
                                    <tr key={row.id} style={{ borderTop: `1px solid ${C.border}`, opacity: savingId === row.id ? 0.5 : 1 }}>
                                        <td style={{ padding: '6px 12px' }}>
                                            <input defaultValue={row.agent_name}
                                                onBlur={e => { const v = e.target.value.trim(); if (v && v !== row.agent_name) patchRow(row, { agent_name: v }); }}
                                                style={{ ...inputStyle, minWidth: 160 }} />
                                        </td>
                                        <td style={{ padding: '6px 12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <select value={row.role || ''} onChange={e => patchRow(row, { role: e.target.value })} style={{ ...inputStyle, width: 150 }}>
                                                    <option value="" disabled>— set role —</option>
                                                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                                {roleBadge(row.role)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '6px 12px' }}>
                                            <input list="roster-leads" defaultValue={row.team_lead || ''}
                                                onBlur={e => { const v = e.target.value.trim(); if (v !== (row.team_lead || '')) patchRow(row, { team_lead: v }); }}
                                                style={inputStyle} />
                                        </td>
                                        <td style={{ padding: '6px 12px' }}>
                                            <input defaultValue={row.intercom_name || ''}
                                                onBlur={e => { const v = e.target.value.trim(); if (v !== (row.intercom_name || '')) patchRow(row, { intercom_name: v }); }}
                                                style={inputStyle} />
                                        </td>
                                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                            <button onClick={() => removeAgent(row)} title="Remove agent" style={{
                                                background: 'transparent', color: C.danger, border: 'none', cursor: 'pointer', fontSize: '1rem',
                                            }}>×</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
