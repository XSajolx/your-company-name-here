import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import SearchableSelect from './SearchableSelect';
import DateRangePicker from './DateRangePicker';
import { getDateRange } from '../services/servicePerformanceApi';

// ── Palette (matches the dark glass theme used across the app) ─────────────
const C = {
    panel: 'rgba(15,20,35,0.5)',
    panelSolid: '#0D1117',
    border: 'rgba(255,255,255,0.08)',
    input: '#161B22',
    inputBorder: '#30363D',
    text: '#F0F6FC',
    subtle: '#8B949E',
    faint: '#6E7681',
    accent: '#10B981',
    accentSoft: 'rgba(16,185,129,0.12)',
    danger: '#F87171',
};

// Guidelines (LC) — the rubric, verbatim from the workbook
const GUIDELINES = {
    Efficiency: [
        ['Poor', 'FRT ART missed.', 2],
        ['Below Average', 'More than average ARTs missed [out of 6 messages, 4 are ART breached; if FRT is also missed, then Poor].', 4],
        ['Average', 'Some of the ARTs missed [4-5 out of 6 messages are ART breached; if FRT is missed, then below average].', 6],
        ['Good', 'None ARTs missed, but AHT is above 20 minutes [Exception of 1 ART missed].', 8],
        ['Excellent', 'FRT ART AHT maintained all throughout the chat.', 10],
    ],
    Quality: [
        ['Poor', 'Incorrect information provided.', 2],
        ['Below Average', 'No incorrect info provided, grammatical/branding error.', 4],
        ['Average', 'No incorrect info provided, no grammatical/branding error, but robotic responses.', 6],
        ['Good', 'No incorrect info provided, no grammatical/branding error, personalized responses.', 8],
        ['Excellent', 'No issues regarding quality found [e.g. proper tool/API check, and also meets the attributes of Good].', 10],
    ],
    Complexity: [
        ['Poor', 'Shared the review link with a likely frustrated client.', 2],
        ['Below Average', 'Did not cater the client in an efficient manner (unnecessarily lengthened the conversation but a proper resolution was given; if not then Poor).', 4],
        ['Average', 'Efficiency was maintained but did not share a review link with a satisfied client / did not take a review approach to a dissatisfied client.', 6],
        ['Good', 'Did not complicate the conversation at all, and review approach was on point.', 8],
        ['Excellent', 'Went above and beyond for solving an issue / turned a frustrated client into a satisfied one. If client was not frustrated, then Good becomes Excellent.', 10],
    ],
};

// Guidelines (L2) — used for agents who are NOT live-chat (channel email / PSTF).
// SLA / AHT / task-complexity framing rather than the live-agent FRT/ART rubric.
const GUIDELINES_L2 = {
    Efficiency: [
        ['Poor', 'Failed to meet both SLA and AHT targets without valid justification.', 2],
        ['Below Average', 'Met SLA, but exceeded expected AHT relative to task complexity.', 4],
        ['Average', 'Met baseline expectations for both SLA and AHT.', 6],
        ['Good', 'Met SLA while achieving above-average AHT efficiency.', 8],
        ['Excellent', 'Met SLA while demonstrating exceptional AHT efficiency relative to task complexity.', 10],
    ],
    Quality: [
        ['Poor', 'Incorrect resolution / information provided.', 2],
        ['Below Average', 'No incorrect resolution / info provided, grammatical/branding error.', 4],
        ['Average', 'No incorrect resolution / info provided, no grammatical/branding error, but robotic responses.', 6],
        ['Good', 'No incorrect resolution / info provided, no grammatical/branding error, personalized responses.', 8],
        ['Excellent', 'No issues regarding quality found [e.g. proper tool/API check, and also meets the attributes of Good].', 10],
    ],
    Complexity: [
        ['Poor', 'Shared the review link with a likely frustrated client.', 2],
        ['Below Average', 'Did not cater the client in an efficient manner (unnecessarily lengthened the conversation but a proper resolution was given; if not then Poor).', 4],
        ['Average', 'Efficiency was maintained but did not share a review link with a satisfied client when there was opportunity / did not take a review approach to a dissatisfied client.', 6],
        ['Good', 'Did not complicate the conversation at all, and review approach was on point.', 8],
        ['Excellent', 'Went above and beyond by turning a frustrated client into a satisfied one. If client was not frustrated, then Good becomes Excellent.', 10],
    ],
};

const monthLabel = (dateStr) => {
    if (!dateStr) return 'Unassigned';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return 'Unassigned';
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const computeFinal = (q, e, c) => {
    // Count any scored dimension incl. 0; skip only blanks/nulls (unscored).
    const vals = [q, e, c]
        .filter(v => v !== '' && v !== null && v !== undefined)
        .map(Number)
        .filter(v => !isNaN(v));
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
};

const scoreColor = (s) => {
    if (s == null) return C.subtle;
    if (s >= 8) return '#34D399';
    if (s >= 6) return '#FBBF24';
    if (s >= 4) return '#FB923C';
    return '#F87171';
};

const inputStyle = {
    width: '100%', padding: '0.4rem 0.5rem', boxSizing: 'border-box',
    background: C.input, border: `1px solid ${C.inputBorder}`, borderRadius: 6,
    color: C.text, fontSize: '0.8rem', outline: 'none',
};

const emptyDraft = () => ({ eval_date: '', conversation_id: '', quality: '', efficiency: '', complexity: '', comments: '' });

// ── Access control ─────────────────────────────────────────────────────────
// Emails are matched by LOCAL-PART only (the bit before "@"), because people log
// in with @nextventures.io while some records list @wearenext.io — same local-part.
const emailKey = (e) => String(e || '').split('@')[0].trim().toLowerCase();

// Admins see ALL agents. (Kept in sync with App.jsx SUPERVISOR_EVAL_EMAILS.)
const ADMIN_KEYS = new Set([
    'sajol', 'sazzad', 'salmanwahid', 'dhrubo', 'sajolmk999',
    'afsana', 'sudipta', 'walliullah', 'mirza.shizan',
].map(k => k.toLowerCase()));

// Team leads / managers → the exact team_lead name they own in agent_name_mapping.
// Keyed by email local-part. A lead sees the full subtree beneath that name.
const LEAD_BY_KEY = {
    'jerin': 'Jerin Tasneem Prova',
    'manish': 'Manish Sarkar',
    'faiyaz': 'Faiyaz Muhtasim Ahmed',
    'shameem': 'Md. M Z Mahiuddin Shameem',
    'preya': 'Nasrin Hossain Preya',
    'izaz': 'Izaz Ahmed Fuad',
    'afsana': 'Kazi Afsana Rayhan Mim',
    'fahim.sarower': 'Fahim Sarower',
    'junaina.hoque': 'Junaina Haque',
    'rizny': 'Rizny Azmy',
    'seleena': 'Seleena Leard',
    'shahariar.shohag': 'Sheikh Shahariar Shohag',
    'salmanwahid': 'Salman Wahid',
    'dhrubo': 'Sakib Akhter Dhrubo',
    'sudipta': 'Sudipta Saha',
};

// Normalize a person name for tolerant matching across spelling variants.
const normName = (s) => String(s || '')
    .toLowerCase().replace(/[^a-z ]/g, ' ')
    .split(/\s+/).filter(t => t && !['md', 'mohammad', 'mohammed'].includes(t)).join(' ');

// Every agent_name (normalized) in a lead's subtree — transitive over team_lead.
// Used both to scope a lead's view and to decide who they may edit.
const subtreeNames = (leadName, all) => {
    const childrenOf = new Map(); // normalized parent -> [rows]
    for (const r of all) {
        const p = normName(r.team_lead);
        if (!p) continue;
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p).push(r);
    }
    const wanted = new Set();
    const seen = new Set();
    const queue = [normName(leadName)];
    while (queue.length) {
        const node = queue.shift();
        if (!node || seen.has(node)) continue;
        seen.add(node);
        for (const r of (childrenOf.get(node) || [])) {
            wanted.add(normName(r.agent_name));
            queue.push(normName(r.agent_name)); // descend (sub-leads → their agents)
        }
    }
    return wanted;
};

export default function SupervisorEvaluation({ userEmail }) {
    const [agents, setAgents] = useState([]);          // [{ display, intercom, real }]
    const [agentDisplay, setAgentDisplay] = useState(''); // selected display string
    const [rows, setRows] = useState([]);              // saved evaluations for the agent
    const [draft, setDraft] = useState(emptyDraft());
    const [dateRange, setDateRange] = useState(''); // '' = all dates; else a DateRangePicker preset / custom_ string
    const [loadingAgents, setLoadingAgents] = useState(true);
    const [loadingRows, setLoadingRows] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [role, setRole] = useState({ kind: 'loading' }); // { kind, leadName?, myName? }
    // Agents the signed-in user may edit = their own team-lead subtree (empty for non-leads,
    // incl. pure admins). Editing is strictly lead-scoped; there is no admin override.
    const [editableNames, setEditableNames] = useState(new Set());
    const [myName, setMyName] = useState(null); // signed-in lead's canonical name (stamped as editor)

    const selectedAgent = useMemo(
        () => agents.find(a => a.display === agentDisplay) || null,
        [agents, agentDisplay]
    );

    // A signed-in lead may edit only the agents inside their own subtree.
    const canEdit = !!selectedAgent && editableNames.has(normName(selectedAgent.real));

    // Live-chat agent = role 'Live chat' (falls back to the legacy channel === 'chat' when role
    // is unset). Anything else customer-facing (Email / PSTF + Email / Ad-Hoc / AI Support) is L2.
    const isLcAgent = (a) => a ? (a.role ? a.role === 'Live chat' : a.channel === 'chat') : false;
    const selectedIsLc = isLcAgent(selectedAgent);

    // Load the mapping, resolve the caller's role, and scope the agent dropdown.
    useEffect(() => {
        (async () => {
            setLoadingAgents(true);
            const { data, error } = await supabase
                .from('agent_name_mapping')
                .select('intercom_name, agent_name, channel, team_lead, email, role')
                .order('agent_name');
            if (error) {
                setError('Could not load agent list: ' + error.message);
                setLoadingAgents(false);
                return;
            }
            const all = data || [];
            // Evaluatable agents = customer-facing channels (LC + email + PSTF), so email/PSTF
            // team leads see their own people too — internal ops/R&D/CQC rows are excluded.
            const EVAL_CHANNELS = new Set(['chat', 'email', 'PSTF']);
            const chat = all.filter(r => EVAL_CHANNELS.has(r.channel));
            // channel is carried through so the rubric can switch: 'chat' = live-chat agent
            // (LC guidelines); anything else (email / PSTF) is an L2 agent (L2 guidelines).
            const opt = (r) => ({ intercom: r.intercom_name, real: r.agent_name, display: `${r.agent_name} (${r.intercom_name})`, channel: r.channel, role: r.role });

            const key = emailKey(userEmail);
            const isAdmin = ADMIN_KEYS.has(key);
            const leadName = LEAD_BY_KEY[key] || null;

            let scoped, resolved;
            if (isAdmin) {
                scoped = chat;
                resolved = { kind: 'admin' };
            } else if (leadName) {
                const wanted = subtreeNames(leadName, all);
                scoped = chat.filter(r => wanted.has(normName(r.agent_name)));
                resolved = { kind: 'lead', leadName };
            } else {
                // Everyone else: only themselves (matched by email local-part). Read-only.
                const mine = all.filter(r => r.email && emailKey(r.email) === key);
                if (mine.length) {
                    const chatMine = mine.filter(r => r.channel === 'chat');
                    scoped = (chatMine.length ? chatMine : [mine[0]]);
                    resolved = { kind: 'self', myName: mine[0].agent_name };
                } else {
                    scoped = [];
                    resolved = { kind: 'none' };
                }
            }

            // Edit rights are strictly lead-scoped: the signed-in user may edit only their own
            // subtree, regardless of admin status. Non-leads (incl. pure admins) get an empty set.
            setEditableNames(leadName ? subtreeNames(leadName, all) : new Set());
            setMyName(leadName);

            const list = scoped
                .map(opt)
                .sort((a, b) => a.real.localeCompare(b.real));
            setAgents(list);
            setRole(resolved);
            // Auto-select when the caller has exactly one agent to look at (self-view).
            if (list.length === 1) setAgentDisplay(list[0].display);
            setLoadingAgents(false);
        })();
    }, [userEmail]);

    const loadRows = useCallback(async (intercom) => {
        if (!intercom) { setRows([]); return; }
        setLoadingRows(true);
        const { data, error } = await supabase
            .from('supervisor_evaluations')
            .select('*')
            .eq('agent_intercom_name', intercom)
            .order('eval_date', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: true });
        if (error) {
            setError('Could not load evaluations: ' + error.message);
            setRows([]);
        } else {
            setRows((data || []).map(r => ({ ...r, _dirty: false })));
            setError('');
        }
        setLoadingRows(false);
    }, []);

    useEffect(() => {
        if (selectedAgent) loadRows(selectedAgent.intercom);
        else setRows([]);
        setDraft(emptyDraft());
        setDateRange('');
    }, [selectedAgent, loadRows]);

    // ── Date filter: resolve the preset/custom string to a YYYY-MM-DD range ─
    const range = useMemo(() => {
        if (!dateRange) return null;
        const { startDate, endDate } = getDateRange(dateRange, 6); // GMT+6 (Dhaka)
        return { from: startDate.slice(0, 10), to: endDate.slice(0, 10) };
    }, [dateRange]);

    const filteredRows = useMemo(() => {
        if (!range) return rows;
        return rows.filter(r => {
            if (!r.eval_date) return false;               // undated rows can't match a range
            return r.eval_date >= range.from && r.eval_date <= range.to;
        });
    }, [rows, range]);

    const filterActive = !!range;

    // ── Individual Dashboard: group by month ───────────────────────────────
    const dashboard = useMemo(() => {
        const groups = new Map();
        for (const r of filteredRows) {
            const key = monthLabel(r.eval_date);
            if (!groups.has(key)) groups.set(key, { audited: 0, scoreSum: 0, scoreCount: 0 });
            const g = groups.get(key);
            if (r.conversation_id && String(r.conversation_id).trim()) g.audited += 1;
            if (r.final_score != null) { g.scoreSum += Number(r.final_score); g.scoreCount += 1; }
        }
        const order = (label) => {
            const d = new Date(label + ' 1');
            return isNaN(d) ? Infinity : d.getTime();
        };
        const months = [...groups.entries()]
            .sort((a, b) => order(a[0]) - order(b[0]))
            .map(([label, g]) => ({
                label,
                audited: g.audited,
                avg: g.scoreCount ? Math.round((g.scoreSum / g.scoreCount) * 100) / 100 : 0,
            }));
        const totalAudited = months.reduce((a, m) => a + m.audited, 0);
        const allScores = filteredRows.filter(r => r.final_score != null).map(r => Number(r.final_score));
        const totalAvg = allScores.length
            ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100
            : 0;
        return { months, totalAudited, totalAvg };
    }, [filteredRows]);

    const draftFinal = computeFinal(draft.quality, draft.efficiency, draft.complexity);

    const addEvaluation = async () => {
        if (!selectedAgent) return;
        setSaving(true); setError('');
        const payload = {
            agent_intercom_name: selectedAgent.intercom,
            agent_real_name: selectedAgent.real,
            eval_date: draft.eval_date || null,
            eval_month: monthLabel(draft.eval_date),
            conversation_id: draft.conversation_id || null,
            quality: draft.quality === '' || draft.quality == null ? null : Number(draft.quality),
            efficiency: draft.efficiency === '' || draft.efficiency == null ? null : Number(draft.efficiency),
            complexity: draft.complexity === '' || draft.complexity == null ? null : Number(draft.complexity),
            final_score: computeFinal(draft.quality, draft.efficiency, draft.complexity),
            comments: draft.comments || null,
            evaluated_by: myName || userEmail || null,
        };
        const { data, error } = await supabase
            .from('supervisor_evaluations')
            .insert(payload)
            .select()
            .single();
        if (error) setError('Save failed: ' + error.message);
        else {
            setRows(prev => [...prev, { ...data, _dirty: false }]);
            setDraft(emptyDraft());
        }
        setSaving(false);
    };

    const updateRowField = (id, field, value) => {
        setRows(prev => prev.map(r => {
            if (r.id !== id) return r;
            const next = { ...r, [field]: value, _dirty: true };
            if (['quality', 'efficiency', 'complexity'].includes(field)) {
                next.final_score = computeFinal(next.quality, next.efficiency, next.complexity);
            }
            return next;
        }));
    };

    const saveRow = async (row) => {
        setSaving(true); setError('');
        const payload = {
            eval_date: row.eval_date || null,
            eval_month: monthLabel(row.eval_date),
            conversation_id: row.conversation_id || null,
            quality: row.quality === '' || row.quality == null ? null : Number(row.quality),
            efficiency: row.efficiency === '' || row.efficiency == null ? null : Number(row.efficiency),
            complexity: row.complexity === '' || row.complexity == null ? null : Number(row.complexity),
            final_score: computeFinal(row.quality, row.efficiency, row.complexity),
            comments: row.comments || null,
            evaluated_by: myName || row.evaluated_by || userEmail || null,
        };
        const { error } = await supabase
            .from('supervisor_evaluations')
            .update(payload)
            .eq('id', row.id);
        if (error) setError('Update failed: ' + error.message);
        else setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...payload, _dirty: false } : r));
        setSaving(false);
    };

    const deleteRow = async (id) => {
        setSaving(true); setError('');
        const { error } = await supabase.from('supervisor_evaluations').delete().eq('id', id);
        if (error) setError('Delete failed: ' + error.message);
        else setRows(prev => prev.filter(r => r.id !== id));
        setSaving(false);
    };

    const scoreOpts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // ── Shared cell / header styles ────────────────────────────────────────
    const th = { padding: '0.6rem 0.6rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: C.subtle, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
    const td = { padding: '0.4rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' };

    const panel = { background: C.panel, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' };
    const sectionTitle = { margin: '0 0 1rem', color: C.text, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 };

    // Scoring rubric panel. LC set = live-chat agent (FRT/ART/AHT); L2 set = supervisor
    // evaluation shown when no agent is selected (SLA / task-complexity framing).
    const renderGuidelines = (data, title) => (
        <div style={panel}>
            <h3 style={sectionTitle}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
                {title}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                {Object.entries(data).map(([dim, rowsG]) => (
                    <div key={dim} style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '0.6rem 0.9rem', background: C.accentSoft, color: C.accent, fontWeight: 700, fontSize: '0.82rem' }}>{dim}</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                {rowsG.map(([level, def, mark]) => (
                                    <tr key={level}>
                                        <td style={{ padding: '0.5rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: C.text, fontWeight: 600, fontSize: '0.76rem', whiteSpace: 'nowrap', verticalAlign: 'top', width: 110 }}>{level}</td>
                                        <td style={{ padding: '0.5rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: C.subtle, fontSize: '0.74rem', lineHeight: 1.45 }}>{def}</td>
                                        <td style={{ padding: '0.5rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: scoreColor(mark), fontWeight: 700, fontSize: '0.8rem', textAlign: 'right', verticalAlign: 'top' }}>{mark}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
        </div>
    );

    // Comment cell: a wider textarea capped to a compact height that grows a little as
    // you type, plus an expand (⤢) toggle that reveals the whole comment on click.
    const COMMENT_CAP = 96; // px collapsed height
    const autoSize = (el) => {
        if (!el) return;
        const expanded = el.dataset.expanded === '1';
        el.style.height = 'auto';
        const cap = expanded ? Infinity : COMMENT_CAP;
        el.style.height = Math.min(el.scrollHeight, cap) + 'px';
        el.style.overflowY = (!expanded && el.scrollHeight > cap) ? 'auto' : 'hidden';
    };
    const toggleExpand = (e) => {
        const ta = e.currentTarget.parentElement.querySelector('textarea');
        const nowExpanded = ta.dataset.expanded !== '1';
        ta.dataset.expanded = nowExpanded ? '1' : '0';
        ta.style.maxHeight = nowExpanded ? 'none' : COMMENT_CAP + 'px';
        autoSize(ta);
        e.currentTarget.textContent = nowExpanded ? '⤡' : '⤢';
    };
    const commentCell = (value, onChange) => (
        <div style={{ position: 'relative' }}>
            <textarea
                value={value || ''}
                onChange={e => { onChange(e.target.value); autoSize(e.target); }}
                ref={autoSize}
                readOnly={!canEdit}
                rows={1}
                data-expanded="0"
                placeholder={canEdit ? 'Comments' : ''}
                style={{
                    ...inputStyle, minHeight: 34, maxHeight: COMMENT_CAP, resize: 'none', overflowY: 'auto',
                    lineHeight: 1.45, whiteSpace: 'pre-wrap', fontFamily: 'inherit', display: 'block', paddingRight: 26,
                }}
            />
            <button
                type="button"
                onClick={toggleExpand}
                title="Expand / collapse comment"
                style={{
                    position: 'absolute', top: 4, right: 4, width: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${C.inputBorder}`, borderRadius: 4, background: C.panelSolid,
                    color: C.subtle, cursor: 'pointer', fontSize: '0.72rem', lineHeight: 1, padding: 0,
                }}
            >⤢</button>
        </div>
    );

    // Export the current agent's evaluations to a print-ready page (Save as PDF).
    const exportPDF = () => {
        if (!selectedAgent) return;
        const name = selectedAgent.real || selectedAgent.display;
        const esc = (s) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        const fmt = (s) => s != null ? Number(s).toFixed(2) : '—';
        const cell = (v) => (v === 0 || v ? v : '—');
        const rangeLabel = filterActive ? `${range.from} to ${range.to}` : 'All dates';
        const monthsHtml = dashboard.months.length
            ? dashboard.months.map(m => `<tr><td>${esc(m.label)}</td><td class="c">${m.audited}</td><td class="c b">${m.avg.toFixed(2)}</td></tr>`).join('')
            : `<tr><td colspan="3" class="empty">No evaluations yet.</td></tr>`;
        const rowsHtml = filteredRows.length
            ? filteredRows.map((r, i) => `<tr>
                <td class="c">${i + 1}</td>
                <td>${esc(monthLabel(r.eval_date))}</td>
                <td>${esc(r.eval_date || '—')}</td>
                <td>${esc(r.conversation_id || '—')}</td>
                <td class="c">${cell(r.quality)}</td>
                <td class="c">${cell(r.efficiency)}</td>
                <td class="c">${cell(r.complexity)}</td>
                <td class="c b">${fmt(r.final_score)}</td>
                <td>${esc(r.comments || '')}</td>
            </tr>`).join('')
            : `<tr><td colspan="9" class="empty">No evaluations in the selected range.</td></tr>`;

        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Evaluation for ${esc(name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; color: #065F46; text-transform: uppercase; letter-spacing: .04em; }
  .meta { color: #6B7280; font-size: 12px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #D1D5DB; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #ECFDF5; color: #065F46; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  td.c, th.c { text-align: center; }
  td.b { font-weight: 700; }
  td.empty { text-align: center; color: #9CA3AF; }
  tr:nth-child(even) td { background: #F9FAFB; }
  .total td { font-weight: 700; background: #F3F4F6; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>Evaluation for ${esc(name)}</h1>
  <div class="meta">Date range: ${esc(rangeLabel)} &middot; ${filteredRows.length} evaluation${filteredRows.length === 1 ? '' : 's'}</div>
  <h2>Individual Dashboard</h2>
  <table>
    <thead><tr><th>Month</th><th class="c">Total Chats Audited</th><th class="c">Average Score</th></tr></thead>
    <tbody>${monthsHtml}
      <tr class="total"><td>Total / Average</td><td class="c">${dashboard.totalAudited}</td><td class="c">${dashboard.totalAvg.toFixed(2)}</td></tr>
    </tbody>
  </table>
  <h2>Evaluation Tracker</h2>
  <table>
    <thead><tr><th class="c">#</th><th>Month</th><th>Date</th><th>Conversation ID</th><th class="c">Quality</th><th class="c">Efficiency</th><th class="c">Complexity</th><th class="c">Final Score</th><th>Comments</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <script>window.onload=function(){setTimeout(function(){window.print();},200);};</script>
</body></html>`;

        const w = window.open('', '_blank');
        if (!w) { setError('Pop-up blocked — allow pop-ups for this site to export the PDF.'); return; }
        w.document.write(html);
        w.document.close();
    };

    return (
        <div style={{ padding: '0 0 2rem' }}>
            {/* Header banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(15,20,35,0.8) 0%, rgba(16,64,50,0.4) 50%, rgba(15,20,35,0.8) 100%)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16, padding: '1.25rem 2rem', marginBottom: '1.5rem',
                border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`,
                display: 'flex', alignItems: 'center', gap: '0.75rem'
            }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <div>
                    <h1 style={{ color: C.text, fontSize: '1.25rem', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg,#F8FAFC 0%,#94A3B8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        Supervisors Evaluation
                    </h1>
                    <p style={{ margin: '2px 0 0', color: C.faint, fontSize: '0.75rem' }}>
                        {selectedAgent
                            ? `${selectedIsLc ? 'Live-chat (LC)' : 'L2 (Email / PSTF)'} QA audit — ${selectedAgent.real}`
                            : 'QA audits — Quality, Efficiency & Complexity per agent'}
                        {role.kind === 'admin' && <span style={{ color: C.accent }}> · Admin view (all agents)</span>}
                        {role.kind === 'lead' && <span style={{ color: C.accent }}> · Team view — {role.leadName}</span>}
                        {role.kind === 'self' && <span style={{ color: C.subtle }}> · Your evaluations (read-only)</span>}
                    </p>
                </div>
            </div>

            {/* Agent picker — raised above sibling panels so its dropdown isn't clipped behind them */}
            <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', position: 'relative', zIndex: 50 }}>
                <span style={{ color: C.subtle, fontSize: '0.8rem', fontWeight: 600 }}>Agent</span>
                <div style={{ minWidth: 320 }}>
                    <SearchableSelect
                        label="Agent"
                        options={agents.map(a => a.display)}
                        value={agentDisplay || (loadingAgents ? 'Loading…' : 'Select an agent')}
                        onChange={setAgentDisplay}
                        showAllOption={false}
                        disabled={loadingAgents}
                    />
                </div>
                {selectedAgent && (
                    <>
                        <div style={{ width: 1, height: 24, background: C.border, margin: '0 0.25rem' }} />
                        <span style={{ color: C.subtle, fontSize: '0.8rem', fontWeight: 600 }}>Date</span>
                        <DateRangePicker
                            value={dateRange}
                            onChange={setDateRange}
                            compact
                            placeholder="All dates"
                        />
                        <span style={{ color: C.faint, fontSize: '0.75rem', marginLeft: 'auto' }}>
                            {filterActive
                                ? `${filteredRows.length} of ${rows.length} shown`
                                : `${rows.length} evaluation${rows.length === 1 ? '' : 's'} on record`}
                        </span>
                        <button
                            type="button"
                            onClick={exportPDF}
                            title="Export this agent's evaluations as PDF"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '0.45rem 0.8rem', border: `1px solid ${C.inputBorder}`, borderRadius: 8,
                                background: C.accentSoft, color: C.accent, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Export PDF
                        </button>
                    </>
                )}
            </div>

            {error && (
                <div style={{ ...panel, borderLeft: `3px solid ${C.danger}`, color: C.danger, fontSize: '0.82rem' }}>
                    {error}
                </div>
            )}

            {role.kind === 'none' ? (
                <div style={{ ...panel, textAlign: 'center', color: C.faint, fontSize: '0.85rem', padding: '3rem 1rem' }}>
                    No agent record is linked to your account yet, so there's nothing to show here.
                    <br />If you believe this is a mistake, ask an admin to map your email in the agent list.
                </div>
            ) : !selectedAgent ? (
                <div style={{ ...panel, textAlign: 'center', color: C.faint, fontSize: '0.85rem', padding: '3rem 1rem' }}>
                    {canEdit ? 'Select an agent to view and log their evaluations.' : 'Select an agent to view their evaluations.'}
                </div>
            ) : (
                <>
                    {/* Individual Dashboard */}
                    <div style={panel}>
                        <h3 style={sectionTitle}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
                            Individual Dashboard
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                                <thead>
                                    <tr>
                                        <th style={th}>Month</th>
                                        <th style={{ ...th, textAlign: 'right' }}>Total Chats Audited</th>
                                        <th style={{ ...th, textAlign: 'right' }}>Average Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.months.length === 0 && (
                                        <tr><td style={{ ...td, color: C.faint }} colSpan={3}>No evaluations yet.</td></tr>
                                    )}
                                    {dashboard.months.map(m => (
                                        <tr key={m.label}>
                                            <td style={{ ...td, color: C.text }}>{m.label}</td>
                                            <td style={{ ...td, textAlign: 'right', color: C.text }}>{m.audited}</td>
                                            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: scoreColor(m.avg) }}>{m.avg.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td style={{ ...td, fontWeight: 700, color: C.text, borderTop: `1px solid ${C.border}` }}>Total / Average</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: C.text, borderTop: `1px solid ${C.border}` }}>{dashboard.totalAudited}</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: scoreColor(dashboard.totalAvg), borderTop: `1px solid ${C.border}` }}>{dashboard.totalAvg.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Evaluation Tracker */}
                    <div style={panel}>
                        <h3 style={sectionTitle}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
                            Evaluation Tracker
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...th, width: 40 }}>#</th>
                                        <th style={{ ...th, minWidth: 100 }}>Month</th>
                                        <th style={{ ...th, minWidth: 140 }}>Date</th>
                                        <th style={{ ...th, minWidth: 150 }}>Conversation ID</th>
                                        <th style={{ ...th, width: 80 }}>Quality</th>
                                        <th style={{ ...th, width: 90 }}>Efficiency</th>
                                        <th style={{ ...th, width: 95 }}>Complexity</th>
                                        <th style={{ ...th, width: 90 }}>Final Score</th>
                                        <th style={{ ...th, minWidth: 320 }}>Comments</th>
                                        <th style={{ ...th, minWidth: 150 }}>Evaluation Added by</th>
                                        <th style={{ ...th, width: 110 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingRows && (
                                        <tr><td style={{ ...td, color: C.faint }} colSpan={11}>Loading…</td></tr>
                                    )}
                                    {!loadingRows && filterActive && filteredRows.length === 0 && (
                                        <tr><td style={{ ...td, color: C.faint }} colSpan={11}>No evaluations in the selected date range.</td></tr>
                                    )}
                                    {!loadingRows && filteredRows.map((r, i) => (
                                        <tr key={r.id}>
                                            <td style={{ ...td, color: C.faint, fontSize: '0.75rem' }}>{i + 1}</td>
                                            <td style={{ ...td, color: C.subtle, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{monthLabel(r.eval_date)}</td>
                                            <td style={td}><input type="date" value={r.eval_date || ''} onChange={e => updateRowField(r.id, 'eval_date', e.target.value)} style={inputStyle} disabled={!canEdit} /></td>
                                            <td style={td}><input type="text" value={r.conversation_id || ''} onChange={e => updateRowField(r.id, 'conversation_id', e.target.value)} style={inputStyle} placeholder="ID" disabled={!canEdit} /></td>
                                            {['quality', 'efficiency', 'complexity'].map(f => (
                                                <td style={td} key={f}>
                                                    <select value={r[f] ?? ''} onChange={e => updateRowField(r.id, f, e.target.value)} style={inputStyle} disabled={!canEdit}>
                                                        <option value="">—</option>
                                                        {scoreOpts.map(o => <option key={o} value={o}>{o}</option>)}
                                                    </select>
                                                </td>
                                            ))}
                                            <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: scoreColor(r.final_score) }}>
                                                {r.final_score != null ? Number(r.final_score).toFixed(2) : '—'}
                                            </td>
                                            <td style={{ ...td, verticalAlign: 'top' }}>{commentCell(r.comments, (val) => updateRowField(r.id, 'comments', val))}</td>
                                            <td style={{ ...td, color: C.subtle, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{r.evaluated_by || '—'}</td>
                                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                                                {canEdit && (
                                                    <>
                                                        <button
                                                            onClick={() => saveRow(r)}
                                                            disabled={!r._dirty || saving}
                                                            style={{ ...btn, background: r._dirty ? C.accentSoft : 'transparent', color: r._dirty ? C.accent : C.faint, cursor: r._dirty ? 'pointer' : 'default' }}
                                                            title="Save changes"
                                                        >Save</button>
                                                        <button
                                                            onClick={() => deleteRow(r.id)}
                                                            disabled={saving}
                                                            style={{ ...btn, background: 'transparent', color: C.danger }}
                                                            title="Delete"
                                                        >✕</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Add-new draft row — editors only */}
                                    {canEdit && (
                                    <tr style={{ background: 'rgba(16,185,129,0.04)' }}>
                                        <td style={{ ...td, color: C.accent, fontSize: '0.9rem' }}>＋</td>
                                        <td style={{ ...td, color: C.subtle, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{monthLabel(draft.eval_date)}</td>
                                        <td style={td}><input type="date" value={draft.eval_date} onChange={e => setDraft(d => ({ ...d, eval_date: e.target.value }))} style={inputStyle} /></td>
                                        <td style={td}><input type="text" value={draft.conversation_id} onChange={e => setDraft(d => ({ ...d, conversation_id: e.target.value }))} style={inputStyle} placeholder="ID" /></td>
                                        {['quality', 'efficiency', 'complexity'].map(f => (
                                            <td style={td} key={f}>
                                                <select value={draft[f]} onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))} style={inputStyle}>
                                                    <option value="">—</option>
                                                    {scoreOpts.map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            </td>
                                        ))}
                                        <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: scoreColor(draftFinal) }}>
                                            {draftFinal != null ? draftFinal.toFixed(2) : '—'}
                                        </td>
                                        <td style={{ ...td, verticalAlign: 'top' }}>{commentCell(draft.comments, (val) => setDraft(d => ({ ...d, comments: val })))}</td>
                                        <td style={{ ...td, color: C.subtle, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{myName || '—'}</td>
                                        <td style={td}>
                                            <button
                                                onClick={addEvaluation}
                                                disabled={saving}
                                                style={{ ...btn, background: C.accent, color: '#04140D', fontWeight: 700 }}
                                            >{saving ? '…' : 'Add'}</button>
                                        </td>
                                    </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Rubric depends on the selected agent's channel: live-chat agents get the
                        LC (FRT/ART/AHT) rubric; non-chat agents (email/PSTF) are L2. */}
                    {selectedIsLc
                        ? renderGuidelines(GUIDELINES, 'Guidelines (LC)')
                        : renderGuidelines(GUIDELINES_L2, 'Guidelines (L2)')}
                </>
            )}
        </div>
    );
}

const btn = {
    padding: '0.35rem 0.6rem', border: 'none', borderRadius: 6,
    fontSize: '0.75rem', marginRight: 4, cursor: 'pointer', transition: 'all 0.15s ease',
};
