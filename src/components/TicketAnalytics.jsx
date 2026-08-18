import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// createClient no longer needed — using shared supabaseClient
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
  PieChart, Pie, Cell
} from 'recharts';
import DateRangePicker from './DateRangePicker';
import PillDropdown from './PillDropdown';

// ─── Supabase client (CEx Insights project) ───
import { supabase as ticketSupabase } from '../services/supabaseClient';

// Main 6 teams pinned in the Teams filter dropdown for one-click select-all.
// Order matters — they render in this order at the top of the dropdown.
const MAIN_TEAMS = [
  'Business Operations',
  'Case Resolution',
  'Platform Operations',
  'Pro Solutions Task Force',
  'Tech Team',
  'Payments and Treasury',
];

// ─── Date Range Helper (GMT+6 Dhaka) ───
function parseDateRange(dateRange) {
  const DHAKA_MS = 6 * 3600000;
  const now = new Date(Date.now() + DHAKA_MS);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  if (dateRange && dateRange.startsWith('custom_')) {
    const parts = dateRange.split('_');
    if (parts.length === 3) return { fromStr: parts[1], toStr: parts[2] };
  }

  const daysMap = { today: 0, yesterday: 1, last_7_days: 7, last_30_days: 30, last_90_days: 90, last_3_months: 90 };

  if (dateRange === 'today') {
    const d = fmt(today);
    return { fromStr: d, toStr: d };
  }
  if (dateRange === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const d = fmt(y);
    return { fromStr: d, toStr: d };
  }
  if (dateRange === 'this_month') {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { fromStr: fmt(f), toStr: fmt(today) };
  }
  if (dateRange === 'last_month') {
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfPrev = new Date(firstOfThisMonth.getTime() - 86400000);
    const startOfPrev = new Date(endOfPrev.getFullYear(), endOfPrev.getMonth(), 1);
    return { fromStr: fmt(startOfPrev), toStr: fmt(endOfPrev) };
  }

  const days = daysMap[dateRange] ?? 30;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { fromStr: fmt(from), toStr: fmt(today) };
}

// ─── Helpers ───
function formatDurationHours(seconds) {
  if (!seconds && seconds !== 0) return '-';
  const hrs = seconds / 3600;
  return `${hrs.toFixed(2)} hr`;
}

function formatDurationFull(seconds) {
  if (!seconds && seconds !== 0) return '-';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function isWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

// ─── Shared Styles ───
const cardStyle = {
  background: 'rgba(15, 20, 35, 0.5)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  padding: '1.25rem',
};

const chartCardStyle = {
  ...cardStyle,
  padding: '1.5rem',
};

const tooltipStyle = {
  background: '#1C2128',
  border: '1px solid #30363D',
  borderRadius: '8px',
  color: '#F0F6FC',
};

const selectStyle = {
  background: 'rgba(15, 23, 42, 0.8)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '0.45rem 0.7rem',
  color: '#E2E8F0',
  fontSize: '0.8rem',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  minWidth: '120px',
};

const thStyle = {
  color: '#94A3B8',
  fontSize: '0.75rem',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  padding: '0.6rem 0.75rem',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};

const tdStyle = {
  color: '#E2E8F0',
  fontSize: '0.8rem',
  padding: '0.6rem 0.75rem',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  verticalAlign: 'middle',
};

// ─── Drill-in icon style (CSS-in-JS) ───
const drillInBtnStyle = {
  position: 'absolute',
  top: '8px',
  right: '8px',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  background: 'rgba(99,102,241,0.2)',
  color: '#818CF8',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  opacity: 0,
  transition: 'opacity 0.2s ease',
  zIndex: 2,
  padding: 0,
  lineHeight: 1,
};

// ─── TicketViewerOverlay ───
const TicketViewerOverlay = ({ row, conversation, loading, onClose }) => {
  if (!row) return null;

  const intercomUrl = row.intercom_id
    ? `https://app.intercom.com/a/apps/aphmhtyj/inbox/inbox/conversation/${row.intercom_id}`
    : row.ticket_url || null;

  // Parse transcript into bubbles
  const parseBubbles = (transcript) => {
    if (!transcript) return [];
    return transcript.split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const customerMatch = trimmed.match(/^(USER|Customer|user):\s*([\s\S]*)/i);
        const agentMatch = trimmed.match(/^(AGENT|Agent|Admin|admin):\s*([\s\S]*)/i);
        if (customerMatch) return { role: 'customer', text: customerMatch[2] };
        if (agentMatch) return { role: 'agent', text: agentMatch[2] };
        return null;
      })
      .filter(Boolean);
  };

  const bubbles = conversation ? parseBubbles(conversation) : [];

  const slaColor = row.sla === 'Met' ? '#22C55E' : row.sla === 'Missed' ? '#EF4444' : '#64748B';
  const slaBg = row.sla === 'Met' ? 'rgba(34,197,94,0.15)' : row.sla === 'Missed' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0D1117',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          width: '600px',
          maxWidth: '94vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <span style={{ color: '#F8FAFC', fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
              Ticket #{row.ticket_id || '—'}
            </span>
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
              background: slaBg, color: slaColor, whiteSpace: 'nowrap',
            }}>
              {row.sla || row.status || '—'}
            </span>
            {row.status && row.sla && (
              <span style={{ color: '#64748B', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                {row.status}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {intercomUrl && (
              <a
                href={intercomUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 8, padding: '0.3rem 0.7rem', color: '#818CF8',
                  fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 9H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/><path d="M9 4.5a3 3 0 0 0-2.83 4h.005A2 2 0 0 1 9 7h3a2 2 0 1 1 0 4h-1.535a4.02 4.02 0 0 1-.82 1H12a3 3 0 1 0 0-6H9z"/></svg>
                Open in Intercom
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, width: 30, height: 30, color: '#94A3B8',
                cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>
          </div>
        </div>

        {/* Info Row */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '1.25rem',
          padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          {[
            { label: 'Team', value: row.current_team },
            { label: 'Agent', value: row.ticket_handler_agent_name || row.ticket_creator_agent_name },
            { label: 'Category', value: row.issue_category },
            { label: 'Duration', value: row.ticket_sla_duration_seconds > 0 ? (() => { const s = Math.round(row.ticket_sla_duration_seconds); if (s < 3600) return `${Math.floor(s/60)}m`; if (s < 86400) { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return m > 0 ? `${h}h ${m}m` : `${h}h`; } const d = Math.floor(s/86400); const h = Math.floor((s%86400)/3600); return h > 0 ? `${d}d ${h}h` : `${d}d`; })() : null },
            { label: 'Country', value: row.country },
          ].filter(f => f.value).map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
              <span style={{ color: '#E2E8F0', fontSize: '0.82rem', fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Conversation Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {loading ? (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
              Loading conversation…
            </div>
          ) : bubbles.length > 0 ? (
            bubbles.map((b, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: b.role === 'agent' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '78%',
                  background: b.role === 'agent'
                    ? 'rgba(99,102,241,0.18)'
                    : 'rgba(255,255,255,0.06)',
                  border: b.role === 'agent'
                    ? '1px solid rgba(99,102,241,0.25)'
                    : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: b.role === 'agent' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '0.5rem 0.75rem',
                  color: '#E2E8F0',
                  fontSize: '0.8rem',
                  lineHeight: '1.45',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  <div style={{
                    fontSize: '0.68rem', fontWeight: 600, marginBottom: '0.25rem',
                    color: b.role === 'agent' ? '#818CF8' : '#94A3B8',
                  }}>
                    {b.role === 'agent' ? 'Agent' : 'Customer'}
                  </div>
                  {b.text}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '0.5rem 0' }}>
              <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginBottom: '1rem', textAlign: 'center', fontStyle: 'italic' }}>
                Ticket conversation details
              </div>
              {[
                { label: 'Ticket ID', value: row.ticket_id },
                { label: 'Status', value: row.ticket_status },
                { label: 'Team', value: row.current_team },
                { label: 'Created By', value: row.ticket_creator_agent_name },
                { label: 'Resolved By', value: row.ticket_handler_agent_name },
                { label: 'Category', value: row.issue_category },
                { label: 'SLA', value: row.sla },
                { label: 'SLA Limit', value: row.sla_limit_hours ? `${row.sla_limit_hours}h` : null },
                { label: 'Duration', value: row.ticket_sla_duration_seconds > 0 ? `${(row.ticket_sla_duration_seconds / 3600).toFixed(2)}h` : null },
                { label: 'Office Hours', value: row.resolved_during_office_hours != null ? (row.resolved_during_office_hours ? 'During' : 'After') : null },
                { label: 'Product', value: row.product_type },
                { label: 'Country', value: row.country },
                { label: 'Created At', value: row.created_at ? new Date(row.created_at).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }) : null },
                { label: 'Resolved At', value: row.resolved_at ? new Date(row.resolved_at).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }) : null },
                { label: 'Description', value: row.description_last_ticket_note },
              ].filter(f => f.value && f.value !== '-' && f.value !== 'Unassigned').map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', padding: '0.5rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ width: 140, flexShrink: 0, color: '#64748B', fontSize: '0.78rem', fontWeight: 600 }}>{label}</span>
                  <span style={{ color: '#E2E8F0', fontSize: '0.82rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── DrillInModal ───
const DrillInModal = ({ drillIn, onClose }) => {
  const [viewingTicket, setViewingTicket] = useState(null); // { row, conversation }
  const [ticketLoading, setTicketLoading] = useState(false);

  const handleTicketClick = async (row) => {
    setViewingTicket({ row, conversation: undefined }); // open overlay immediately
    setTicketLoading(true);

    if (row.intercom_id) {
      try {
        const res = await fetch('/api/analyze-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch-single', conversationId: row.intercom_id }),
        });
        if (res.ok) {
          const json = await res.json();
          const transcript = json?.data?.Transcript || null;
          setViewingTicket({ row, conversation: transcript });
        } else {
          setViewingTicket({ row, conversation: null });
        }
      } catch {
        setViewingTicket({ row, conversation: null });
      }
    } else {
      // No intercom_id — try to extract from ticket_url
      const urlMatch = row.ticket_url ? row.ticket_url.match(/conversation[s]?\/(\d+)/i) : null;
      if (urlMatch) {
        try {
          const res = await fetch('/api/analyze-topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch-single', conversationId: urlMatch[1] }),
          });
          if (res.ok) {
            const json = await res.json();
            const transcript = json?.data?.Transcript || null;
            setViewingTicket({ row, conversation: transcript });
          } else {
            setViewingTicket({ row, conversation: null });
          }
        } catch {
          setViewingTicket({ row, conversation: null });
        }
      } else {
        setViewingTicket({ row, conversation: null });
      }
    }
    setTicketLoading(false);
  };

  if (!drillIn) return null;

  const { title, data } = drillIn;
  // Pending SLA tickets aren't yet resolved, so SLA / Duration / Resolved At
  // columns are meaningless ("-") for every row — hide them.
  const hideSlaCols = title === 'Pending SLA';

  const exportCSV = () => {
    const headers = hideSlaCols
      ? ['Ticket ID', 'Team', 'Resolved By', 'Category', 'Country', 'Status']
      : ['Ticket ID', 'Team', 'Resolved By', 'Category', 'SLA', 'Duration', 'Resolved At', 'Country', 'Status'];
    const rows = data.map(r => {
      const dur = r.ticket_sla_duration_seconds > 0 ? (() => { const s = Math.round(r.ticket_sla_duration_seconds); if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s/60)}m`; const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return m > 0 ? `${h}h ${m}m` : `${h}h`; })() : '';
      const resolvedAt = r.created_at && r.ticket_sla_duration_seconds > 0 ? new Date(new Date(r.created_at).getTime() + r.ticket_sla_duration_seconds * 1000).toLocaleString('en-US', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
      return hideSlaCols
        ? [r.ticket_id || '', r.current_team || '', r.ticket_handler_agent_name || '', r.issue_category || '', r.country || '', r.ticket_status || '']
        : [r.ticket_id || '', r.current_team || '', r.ticket_handler_agent_name || '', r.issue_category || '', r.sla || '', dur, resolvedAt, r.country || '', r.ticket_status || ''];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(15, 20, 35, 0.98)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          width: '90vw',
          maxWidth: '1200px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h3 style={{ color: '#F8FAFC', fontSize: '1rem', fontWeight: '700', margin: 0 }}>
              {title} — {data.length.toLocaleString()} ticket{data.length !== 1 ? 's' : ''}
            </h3>
            <button
              onClick={exportCSV}
              style={{
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 8, padding: '0.35rem 0.8rem', color: '#818CF8', fontSize: '0.75rem',
                cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4-4h2.5V3h3v5H12L8 12z"/><path d="M14 14H2v-2h12v2z"/></svg>
              Export CSV
            </button>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', width: '32px', height: '32px', color: '#94A3B8',
              cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 20, 35, 0.98)', zIndex: 1 }}>
              <tr>
                <th style={thStyle}>Ticket ID</th>
                <th style={thStyle}>Team</th>
                <th style={thStyle}>Resolved By</th>
                <th style={thStyle}>Category</th>
                {!hideSlaCols && <th style={thStyle}>SLA</th>}
                {!hideSlaCols && <th style={thStyle}>Duration</th>}
                {!hideSlaCols && <th style={thStyle}>Resolved At</th>}
                <th style={thStyle}>Country</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={`${r.ticket_id || i}-${i}`}>
                  <td style={{ ...tdStyle, fontSize: '0.75rem' }}>
                    {r.ticket_id ? (
                      <span
                        onClick={() => handleTicketClick(r)}
                        style={{
                          color: '#C084FC',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                        title="Click to view ticket conversation"
                      >
                        {r.ticket_id}
                      </span>
                    ) : '-'}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r.current_team || '-'}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.ticket_handler_agent_name || '-'}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.issue_category || '-'}</td>
                  {!hideSlaCols && (
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600,
                        background: r.sla === 'Met' ? 'rgba(34,197,94,0.15)' : r.sla === 'Missed' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                        color: r.sla === 'Met' ? '#22C55E' : r.sla === 'Missed' ? '#EF4444' : '#64748B',
                      }}>
                        {r.sla || '-'}
                      </span>
                    </td>
                  )}
                  {!hideSlaCols && (
                    <td style={{ ...tdStyle, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                      {r.ticket_sla_duration_seconds > 0 ? (() => {
                        const s = Math.round(r.ticket_sla_duration_seconds);
                        if (s < 60) return `${s}s`;
                        if (s < 3600) return `${Math.floor(s/60)}m`;
                        const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60);
                        return m > 0 ? `${h}h ${m}m` : `${h}h`;
                      })() : '-'}
                    </td>
                  )}
                  {!hideSlaCols && (
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: '0.75rem', color: '#94A3B8' }}>
                      {r.created_at && r.ticket_sla_duration_seconds > 0 ? (() => {
                        const created = new Date(r.created_at);
                        const resolved = new Date(created.getTime() + r.ticket_sla_duration_seconds * 1000);
                        return resolved.toLocaleString('en-US', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                      })() : '-'}
                    </td>
                  )}
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r.country || '-'}</td>
                  <td style={tdStyle}>{r.ticket_status || '-'}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={hideSlaCols ? 6 : 9} style={{ ...tdStyle, textAlign: 'center', color: '#64748B', padding: '2rem' }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>

    {/* Ticket Viewer Overlay */}
    {viewingTicket && (
      <TicketViewerOverlay
        row={viewingTicket.row}
        conversation={viewingTicket.conversation !== undefined ? viewingTicket.conversation : null}
        loading={ticketLoading}
        onClose={() => setViewingTicket(null)}
      />
    )}
  </>
  );
};

// ─── Scorecard ───
const Scorecard = ({ title, value, subtitle, onDrillIn }) => (
  <div
    style={{ ...cardStyle, minWidth: '160px', position: 'relative' }}
    onMouseEnter={e => { const btn = e.currentTarget.querySelector('.drill-in-btn'); if (btn) btn.style.opacity = '1'; }}
    onMouseLeave={e => { const btn = e.currentTarget.querySelector('.drill-in-btn'); if (btn) btn.style.opacity = '0'; }}
  >
    {onDrillIn && (
      <button
        className="drill-in-btn"
        onClick={e => { e.stopPropagation(); onDrillIn(); }}
        style={drillInBtnStyle}
        title="Drill in to see ticket details"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
      </button>
    )}
    <div style={{
      color: '#94A3B8', fontSize: '0.75rem', fontWeight: '500',
      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem'
    }}>
      {title}
    </div>
    <div style={{ color: '#F8FAFC', fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.25rem' }}>
      {value}
    </div>
    {subtitle && <div style={{ color: '#64748B', fontSize: '0.7rem' }}>{subtitle}</div>}
  </div>
);

// ─── ChartCard ───
const ChartCard = ({ title, children, style: extraStyle, isLoading, onDrillIn }) => (
  <div
    style={{ ...chartCardStyle, ...extraStyle, position: 'relative' }}
    onMouseEnter={e => { const btn = e.currentTarget.querySelector('.drill-in-btn'); if (btn) btn.style.opacity = '1'; }}
    onMouseLeave={e => { const btn = e.currentTarget.querySelector('.drill-in-btn'); if (btn) btn.style.opacity = '0'; }}
  >
    {onDrillIn && (
      <button
        className="drill-in-btn"
        onClick={e => { e.stopPropagation(); onDrillIn(); }}
        style={drillInBtnStyle}
        title="Drill in to see ticket details"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
      </button>
    )}
    <h3 style={{ color: '#F8FAFC', fontSize: '1rem', fontWeight: '600', margin: '0 0 1rem 0' }}>{title}</h3>
    {isLoading ? (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '150px', color: '#64748B' }}>Loading...</div>
    ) : children}
  </div>
);

// ─── Progress Bar (inline) ───
const ProgressBar = ({ value }) => {
  const clamped = Math.min(100, Math.max(0, value || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ minWidth: '45px', color: '#E2E8F0', fontSize: '0.8rem' }}>{value.toFixed(1)}%</span>
      <div style={{
        position: 'relative', width: '70px', height: '8px',
        background: 'rgba(99,102,241,0.2)', borderRadius: '3px'
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${clamped}%`, background: '#8B5CF6', borderRadius: '3px'
        }} />
      </div>
    </div>
  );
};

// ─── Pagination ───
const Pagination = ({ page, totalRows, pageSize, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: '0.75rem', padding: '0.5rem 0'
    }}>
      <span style={{ color: '#64748B', fontSize: '0.75rem' }}>
        {totalRows > 0 ? `Rows ${start}-${end} of ${totalRows}` : 'No data'}
      </span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={{
            background: page <= 1 ? 'rgba(15,23,42,0.4)' : 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '0.3rem 0.7rem',
            color: page <= 1 ? '#475569' : '#94A3B8',
            fontSize: '0.75rem', cursor: page <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          Prev
        </button>
        <span style={{ color: '#94A3B8', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={{
            background: page >= totalPages ? 'rgba(15,23,42,0.4)' : 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '0.3rem 0.7rem',
            color: page >= totalPages ? '#475569' : '#94A3B8',
            fontSize: '0.75rem', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
};

// ─── SearchableDropdown (single-select with search, dark theme) ───
const FilterDropdown = ({ label, options, value, onChange, multi = false }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return options;
    const s = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(s));
  }, [options, search]);

  // Multi-select: value is an array; single-select: value is a string
  const isAll = multi ? (!value || value.length === 0) : value === 'All';
  const selected = multi ? new Set(value || []) : null;
  const displayText = isAll ? `All ${label}` : multi ? `${value.length} selected` : value;

  const handleSelect = (opt) => {
    if (!multi) { onChange(opt); setOpen(false); setSearch(''); return; }
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt); else next.add(opt);
    onChange(next.size === 0 ? [] : [...next]);
  };

  const handleAll = () => {
    if (!multi) { onChange('All'); setOpen(false); setSearch(''); return; }
    onChange([]); setOpen(false); setSearch('');
  };

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 130 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          ...selectStyle,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: !isAll ? '#F8FAFC' : '#94A3B8',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayText}
        </span>
        <span style={{ color: '#64748B', fontSize: '0.6rem', marginLeft: 6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          &#9662;
        </span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'rgba(15, 23, 42, 0.98)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, zIndex: 1000, maxHeight: 280, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 180,
        }}>
          <div style={{ padding: '0.4rem' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%', boxSizing: 'border-box', background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                padding: '0.35rem 0.5rem', color: '#F8FAFC', fontSize: '0.78rem', outline: 'none',
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 0.3rem 0.3rem' }}>
            <div
              onClick={handleAll}
              style={{
                padding: '0.35rem 0.5rem', borderRadius: 6, cursor: 'pointer',
                fontSize: '0.78rem', color: isAll ? '#818CF8' : '#E2E8F0',
                background: isAll ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (!isAll) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (!isAll) e.currentTarget.style.background = 'transparent'; }}
            >
              {multi && <span style={{ width: 14, height: 14, border: '1.5px solid ' + (isAll ? '#818CF8' : '#64748B'), borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#818CF8', flexShrink: 0 }}>{isAll ? '✓' : ''}</span>}
              All {label}
            </div>
            {filtered.map(opt => {
              const isSelected = multi ? selected.has(opt) : value === opt;
              return (
              <div
                key={opt}
                onClick={() => handleSelect(opt)}
                style={{
                  padding: '0.35rem 0.5rem', borderRadius: 6, cursor: 'pointer',
                  fontSize: '0.78rem', color: isSelected ? '#818CF8' : '#E2E8F0',
                  background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                {multi && <span style={{ width: 14, height: 14, border: '1.5px solid ' + (isSelected ? '#818CF8' : '#64748B'), borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#818CF8', flexShrink: 0 }}>{isSelected ? '✓' : ''}</span>}
                {opt}
              </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '0.5rem', color: '#64748B', fontSize: '0.75rem', textAlign: 'center' }}>No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Custom Tooltip ───
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ ...tooltipStyle, padding: '0.6rem 0.8rem' }}>
      <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#F8FAFC', fontSize: '0.8rem' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
        </div>
      ))}
    </div>
  );
};



// ═══════════════════════════════════════════════════
// ─── MAIN COMPONENT ──────────────────────────────
// ═══════════════════════════════════════════════════
const TicketAnalytics = ({ dateRange }) => {
  // ─── State ───
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Date filter states (using DateRangePicker presets)
  const [createdDateRange, setCreatedDateRange] = useState('');
  const [resolvedDateRange, setResolvedDateRange] = useState('');

  // Sync Unresolved button state
  const [syncingUnresolved, setSyncingUnresolved] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  // Filter states
  const [teamFilter, setTeamFilter] = useState([]);
  // Heatmap dropdown: single team or '' for all
  const [heatmapTeam, setHeatmapTeam] = useState('');
  const [agentFilter, setAgentFilter] = useState([]);
  const [ticketTypeFilter, setTicketTypeFilter] = useState([]);
  const [slaFilter, setSlaFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [countryFilter, setCountryFilter] = useState([]);
  const [weekdayFilter, setWeekdayFilter] = useState('All');
  const [officeFilter, setOfficeFilter] = useState('All');

  // Drill-in modal state
  const [drillIn, setDrillIn] = useState(null);

  // Knock count (from Service Performance Overview + Email SPO) for ratio metric
  const [knockCount, setKnockCount] = useState(null);

  // ─── Date range computation ───
  const { fromStr, toStr } = useMemo(() => parseDateRange(dateRange || 'last_30_days'), [dateRange]);

  // ─── Fetch data ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch ALL ticket data (no date limit — filters are client-side)
      const PAGE = 10000;
      const { count } = await ticketSupabase
        .from('ticket_logs')
        .select('*', { count: 'exact', head: true });

      const totalRows = count || 0;
      const pages = Math.ceil(totalRows / PAGE);

      let allRows = [];
      if (pages <= 1) {
        const { data } = await ticketSupabase
          .from('ticket_logs')
          .select('*')
          .order('date', { ascending: false })
          .limit(PAGE);
        allRows = data || [];
      } else {
        // Fetch pages in parallel
        const promises = [];
        for (let i = 0; i < pages; i++) {
          promises.push(
            ticketSupabase
              .from('ticket_logs')
              .select('*')
              .order('date', { ascending: false })
              .range(i * PAGE, (i + 1) * PAGE - 1)
              .then(r => r.data || [])
          );
        }
        const results = await Promise.all(promises);
        allRows = results.flat();
      }

      setRawData(allRows);

      // Determine last update time from created_at
      if (allRows.length > 0) {
        const maxCreated = allRows.reduce((max, r) => {
          if (r.created_at && r.created_at > max) return r.created_at;
          return max;
        }, '');
        setLastUpdate(maxCreated);
      } else {
        setLastUpdate(null);
      }
    } catch (err) {
      console.error('[TicketAnalytics] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch knock count (chat/socials + email) for ratio metric — respects Created At date range and country filter
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const KNOCK_CHANNELS = ['Chat', 'Instagram', 'Facebook'];
        let startDate = null, endDate = null;
        if (createdDateRange) {
          const { fromStr: cf, toStr: ct } = parseDateRange(createdDateRange);
          if (cf) startDate = `${cf}T00:00:00+06:00`;
          if (ct) endDate = `${ct}T23:59:59+06:00`;
        }
        const apply = (q) => {
          if (startDate) q = q.gte('created_at', startDate);
          if (endDate) q = q.lte('created_at', endDate);
          if (countryFilter.length > 0) q = q.in('country', countryFilter);
          return q;
        };
        const [spo, email] = await Promise.all([
          apply(ticketSupabase.from('Service Performance Overview').select('*', { count: 'exact', head: true }).in('channel', KNOCK_CHANNELS)),
          apply(ticketSupabase.from('Email - Service Performance Overview').select('*', { count: 'exact', head: true })),
        ]);
        if (!cancelled) setKnockCount((spo.count || 0) + (email.count || 0));
      } catch {
        if (!cancelled) setKnockCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [createdDateRange, countryFilter]);

  // Reset pagination when filters change

  // ─── Unique filter options (from raw data) ───
  const filterOptions = useMemo(() => {
    const teams = new Set();
    const agents = new Set(); // resolvers — drives the "Resolved By" filter
    const categories = new Set();
    const countries = new Set();

    rawData.forEach(r => {
      if (r.current_team) teams.add(r.current_team);
      if (r.ticket_handler_agent_name) agents.add(r.ticket_handler_agent_name);
      if (r.issue_category) categories.add(r.issue_category);
      if (r.country) countries.add(r.country);
    });

    return {
      teams: [...teams].sort(),
      agents: [...agents].sort(),
      categories: [...categories].sort(),
      countries: [...countries].sort(),
    };
  }, [rawData]);

  // ─── Filtered data ───
  const filteredData = useMemo(() => {
    return rawData.filter(r => {
      // Date filters (Created At = date column in Dhaka tz, Resolved At = resolved_at column)
      if (createdDateRange) {
        const { fromStr: cf, toStr: ct } = parseDateRange(createdDateRange);
        // Use r.date (Dhaka calendar date) to match Intercom's Dataset Export timezone.
        const dk = r.date || r.created_at?.slice(0, 10);
        if (cf && dk && dk < cf) return false;
        if (ct && dk && dk > ct) return false;
      }
      if (resolvedDateRange) {
        const { fromStr: rf, toStr: rt } = parseDateRange(resolvedDateRange);
        // Strict: setting Resolved At means "actually resolved in this window".
        // Tickets with NULL resolved_at (still open) are excluded.
        if (!r.resolved_at) return false;
        if (rf && r.resolved_at.slice(0, 10) < rf) return false;
        if (rt && r.resolved_at.slice(0, 10) > rt) return false;
      }
      if (teamFilter.length > 0 && !teamFilter.includes(r.current_team)) return false;
      if (agentFilter.length > 0 && !agentFilter.includes(r.ticket_handler_agent_name)) return false;
      if (ticketTypeFilter.length > 0 && !ticketTypeFilter.includes(r.issue_category)) return false;
      if (slaFilter !== 'All' && r.sla !== slaFilter) return false;
      if (productFilter !== 'All' && r.product_type !== productFilter) return false;
      if (countryFilter.length > 0 && !countryFilter.includes(r.country)) return false;
      if (weekdayFilter !== 'All') {
        const wd = isWeekday(r.date);
        if (weekdayFilter === 'Weekday' && !wd) return false;
        if (weekdayFilter === 'Weekend' && wd) return false;
      }
      if (officeFilter !== 'All') {
        if (officeFilter === 'During' && !r.resolved_during_office_hours) return false;
        if (officeFilter === 'After' && r.resolved_during_office_hours) return false;
      }
      return true;
    });
  }, [rawData, createdDateRange, resolvedDateRange, teamFilter, agentFilter, ticketTypeFilter, slaFilter, productFilter, countryFilter, weekdayFilter, officeFilter]);

  // ─── Row 1: Scorecards ───
  const scorecards = useMemo(() => {
    // Multi-Dept tickets = forwarded across multiple teams. The boolean `forwarded`
    // is the authoritative signal (set by ticket-sync only when teams_visited > 1).
    // Don't use `sla === 'N/A'` — that also fires when no SLA rule is found, which
    // is a different case.
    const multiDept = filteredData.filter(r => r.forwarded === true).length;
    const total = filteredData.length - multiDept;
    // SLA Met / Not Met require ticket_status === 'Resolved'. An open ticket
    // (Submitted / Waiting on customer / etc.) with a stale sla='Met' from a
    // prior resolution that got re-opened doesn't belong in these counts —
    // it falls into Pending until the next sync gives it a fresh verdict.
    const slaMet = filteredData.filter(r =>
      !r.forwarded && r.ticket_status === 'Resolved' && r.sla === 'Met'
    ).length;
    const slaMissed = filteredData.filter(r =>
      !r.forwarded && r.ticket_status === 'Resolved' && r.sla === 'Missed'
    ).length;

    const durRows = filteredData.filter(r =>
      !r.forwarded && r.ticket_sla_duration_seconds != null && r.ticket_sla_duration_seconds > 0
    );
    const avgDurationSec = durRows.length > 0
      ? durRows.reduce((s, r) => s + r.ticket_sla_duration_seconds, 0) / durRows.length
      : 0;
    const avgDurationHr = avgDurationSec / 3600;

    const slaPct = total > 0 ? (slaMet / total) * 100 : 0;

    // Pending = single-dept tickets that don't qualify for Met or Not Met:
    //   - still open (any non-Resolved status), OR
    //   - Resolved but sla is null / 'N/A' / anything other than Met/Missed
    // So Total === slaMet + slaMissed + pending + multiDept always holds.
    const pending = filteredData.filter(r =>
      !r.forwarded && (
        r.ticket_status !== 'Resolved' ||
        (r.sla !== 'Met' && r.sla !== 'Missed')
      )
    ).length;

    // Grand total including multi-dept tickets (i.e. every row in scope).
    const totalWithMultiDept = filteredData.length;

    return { total, slaMet, slaMissed, avgDurationHr, slaPct, multiDept, pending, totalWithMultiDept };
  }, [filteredData]);

  // ─── Row 2: Team Wise Ticket Count (Bar Chart) ───
  // Excludes Multi-Dept Tickets (sla='N/A') — those bounced across teams so
  // they shouldn't be attributed to any single team's count.
  const teamBarData = useMemo(() => {
    const map = {};
    filteredData.forEach(r => {
      if (r.forwarded === true) return; // multi-dept — skip per-team count
      const t = r.current_team || 'Unknown';
      map[t] = (map[t] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  // ─── Row 2: Avg Resolve During/After Office Hours (Horizontal Bar) ───
  const officeHoursAvg = useMemo(() => {
    const during = filteredData.filter(r => r.resolved_during_office_hours && r.ticket_sla_duration_seconds > 0);
    const after = filteredData.filter(r => !r.resolved_during_office_hours && r.ticket_sla_duration_seconds > 0);
    const avgDuring = during.length > 0
      ? during.reduce((s, r) => s + r.ticket_sla_duration_seconds, 0) / during.length / 3600
      : 0;
    const avgAfter = after.length > 0
      ? after.reduce((s, r) => s + r.ticket_sla_duration_seconds, 0) / after.length / 3600
      : 0;
    return [
      { name: 'After Office Hours', hours: parseFloat(avgAfter.toFixed(2)) },
      { name: 'During Office Hours', hours: parseFloat(avgDuring.toFixed(2)) },
    ];
  }, [filteredData]);

  // ─── Row 2: Ticket Count by Office Hours ───
  const officeHoursCounts = useMemo(() => {
    const during = filteredData.filter(r => r.resolved_during_office_hours).length;
    const after = filteredData.filter(r => !r.resolved_during_office_hours).length;
    return { during, after };
  }, [filteredData]);

  // ─── Top 10 Ticket Categories (horizontal bar) ───
  // Pulls issue_category counts from the filtered set so the date / team /
  // SLA filters above the dashboard apply. Caps at 10 categories so the bar
  // chart stays readable; everything below position 10 rolls into "Other"
  // only if there's anything left after the cap.
  const topCategoriesData = useMemo(() => {
    const map = {};
    filteredData.forEach((r) => {
      const c = (r.issue_category || '').trim() || 'Uncategorized';
      map[c] = (map[c] || 0) + 1;
    });
    const sorted = Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return sorted.slice(0, 10);
  }, [filteredData]);

  // ─── Row 3: Product Type Wise Ticket Count ───
  const productTypeData = useMemo(() => {
    const map = {};
    filteredData.forEach(r => {
      const p = r.product_type || 'Unknown';
      map[p] = (map[p] || 0) + 1;
    });
    const COLORS = { 'CFD': '#8B5CF6', 'Futures': '#A78BFA', 'Unknown': '#6B7280' };
    const total = filteredData.length;
    return Object.entries(map)
      .map(([name, count]) => ({
        name,
        value: count,
        count,
        color: COLORS[name] || '#F59E0B',
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  // ─── Team Performance (with Ticket Count, lt24/gt24) ───
  // Multi-Dept Tickets (sla='N/A') are excluded — they bounced across teams
  // so they don't belong to any single team's tally. They appear separately
  // in the "Multi-Dept Tickets" scorecard.
  const teamSlaData = useMemo(() => {
    const map = {};
    filteredData.forEach(r => {
      if (r.forwarded === true) return; // skip multi-dept tickets
      const t = r.current_team || 'Unknown';
      if (!map[t]) map[t] = { count: 0, met: 0, missed: 0, durSum: 0, durCount: 0, lt24: 0, gt24: 0 };
      map[t].count++;
      if (r.sla === 'Met') map[t].met++;
      if (r.sla === 'Missed') map[t].missed++;
      if (r.ticket_sla_duration_seconds > 0) {
        map[t].durSum += r.ticket_sla_duration_seconds;
        map[t].durCount++;
        if (r.ticket_sla_duration_seconds < 86400) map[t].lt24++;
        else map[t].gt24++;
      }
    });
    return Object.entries(map)
      .map(([team, d]) => {
        const slaPct = d.count > 0 ? (d.met / d.count) * 100 : 0;
        const avgHr = d.durCount > 0 ? d.durSum / d.durCount / 3600 : 0;
        return { team, count: d.count, avgHr, slaPct, lt24: d.lt24, gt24: d.gt24 };
      })
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  // ─── Heatmap: day-of-week × hour-of-day, for a selected team ───
  // Uses `created_at` (full timestamptz, Asia/Dhaka offset baked in) so a chat
  // at "23:52" stays in Saturday-23 rather than rolling into Sunday UTC.
  // Mon=0 … Sun=6 to match how managers actually plan shifts.
  const heatmapData = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    let counted = 0;
    filteredData.forEach((r) => {
      if (heatmapTeam && r.current_team !== heatmapTeam) return;
      const t = r.created_at;
      if (!t) return;
      const d = new Date(t);
      if (Number.isNaN(d.getTime())) return;
      const dayMonFirst = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      grid[dayMonFirst][hour]++;
      counted++;
      if (grid[dayMonFirst][hour] > max) max = grid[dayMonFirst][hour];
    });
    return { grid, max, total: counted };
  }, [filteredData, heatmapTeam]);

  // ─── Row 3: Agent Report ───
  const agentReportData = useMemo(() => {
    const map = {};
    filteredData.forEach(r => {
      const a = r.ticket_handler_agent_name || 'Unknown';
      if (!map[a]) map[a] = { count: 0, met: 0, missed: 0 };
      map[a].count++;
      if (r.sla === 'Met') map[a].met++;
      if (r.sla === 'Missed') map[a].missed++;
    });
    return Object.entries(map)
      .map(([agent, d]) => {
        const slaPct = d.count > 0 ? (d.met / d.count) * 100 : 0;
        return { agent, count: d.count, slaPct };
      })
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  // ─── Row 4: Ticket SLA Table (detail) ───
  // Sorted ascending by country (rows without a country sink to the bottom).
  const detailTableData = useMemo(() => {
    const rows = filteredData.map(r => ({
      country: r.country || '-',
      agent: r.ticket_handler_agent_name || '-',
      ticket_id: r.ticket_id || '-',
      ticket_type: r.issue_category || '-',
      duration_hr: r.ticket_sla_duration_seconds > 0 ? (r.ticket_sla_duration_seconds / 3600).toFixed(2) : '-',
      intercom_id: r.intercom_id,
      _raw: r,
    }));
    rows.sort((a, b) => {
      const aMissing = !a.country || a.country === '-';
      const bMissing = !b.country || b.country === '-';
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      return a.country.localeCompare(b.country);
    });
    return rows;
  }, [filteredData]);

  // ─── Sync Unresolved tickets — re-pulls current state from Intercom ───
  const handleSyncUnresolved = async () => {
    if (syncingUnresolved) return;
    const ids = unresolvedTickets.map(r => r.intercom_id).filter(Boolean);
    if (ids.length === 0) {
      setSyncStatus('No unresolved tickets to sync.');
      setTimeout(() => setSyncStatus(''), 4000);
      return;
    }
    setSyncingUnresolved(true);
    setSyncStatus(`Syncing ${ids.length} unresolved ticket${ids.length === 1 ? '' : 's'}...`);
    try {
      const res = await fetch('/api/analyze-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ticket-sync', intercomIds: ids }),
      });
      const result = await res.json();
      if (result.success) {
        setSyncStatus(`Synced ${result.imported ?? 0} of ${ids.length}. Reloading...`);
        // Trigger a refetch by waiting then reloading the page (the component
        // reads from Supabase on mount; simplest refresh path).
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setSyncStatus(`Failed: ${result.error || 'unknown error'}`);
        setTimeout(() => setSyncStatus(''), 6000);
      }
    } catch (e) {
      setSyncStatus(`Error: ${e.message || String(e)}`);
      setTimeout(() => setSyncStatus(''), 6000);
    } finally {
      setSyncingUnresolved(false);
    }
  };

  // ─── Ticket viewer state for SLA table click-through ───
  const [slaViewing, setSlaViewing] = useState(null); // { row, conversation }
  const [slaLoading, setSlaLoading] = useState(false);

  const openSlaTicket = async (row) => {
    setSlaViewing({ row, conversation: undefined });
    setSlaLoading(true);
    const idToFetch = row.intercom_id || (row.ticket_url ? row.ticket_url.match(/conversation[s]?\/(\d+)/i)?.[1] : null);
    if (idToFetch) {
      try {
        const res = await fetch('/api/analyze-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetch-single', conversationId: idToFetch }),
        });
        if (res.ok) {
          const json = await res.json();
          setSlaViewing({ row, conversation: json?.data?.Transcript || null });
        } else {
          setSlaViewing({ row, conversation: null });
        }
      } catch {
        setSlaViewing({ row, conversation: null });
      }
    } else {
      setSlaViewing({ row, conversation: null });
    }
    setSlaLoading(false);
  };

  // ─── Last data update ───
  const lastUpdateFormatted = useMemo(() => {
    if (!lastUpdate) return '-';
    try {
      const d = new Date(lastUpdate);
      if (isNaN(d.getTime())) return lastUpdate;
      // Convert to GMT+6
      const dhaka = new Date(d.getTime() + 6 * 3600000);
      const year = dhaka.getUTCFullYear();
      const month = String(dhaka.getUTCMonth() + 1).padStart(2, '0');
      const day = String(dhaka.getUTCDate()).padStart(2, '0');
      const hours = String(dhaka.getUTCHours()).padStart(2, '0');
      const mins = String(dhaka.getUTCMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${mins} (GMT+6)`;
    } catch {
      return lastUpdate;
    }
  }, [lastUpdate]);

  // ─── Reset all filters ───
  const handleReset = () => {
    setCreatedDateRange('');
    setResolvedDateRange('');
    setTeamFilter([]);
    setAgentFilter([]);
    setTicketTypeFilter([]);
    setSlaFilter('All');
    setProductFilter('All');
    setCountryFilter([]);
    setWeekdayFilter('All');
    setOfficeFilter('All');
  };

  // ─── Drill-in handlers ───
  const openDrillIn = (title, data) => setDrillIn({ title, data });
  const closeDrillIn = () => setDrillIn(null);

  // Tickets the Sync Unresolved button re-pulls from Intercom. Two buckets:
  //   1. Anything not resolved (ticket_status !== 'Resolved') — covers
  //      single-dept open + multi-dept open + SLA-Missed open. Source of truth
  //      is ticket_status, NOT resolved_at, because multi-dept tickets often
  //      get a non-null resolved_at populated when they bounce between teams
  //      even though they're still open.
  //   2. Pending-SLA — single-dept rows whose sla is neither 'Met' nor
  //      'Missed' (typically null / 'N/A'). These can be flagged 'Resolved'
  //      in Intercom but never received an SLA verdict in our DB; a re-sync
  //      may fix them. Multi-dept tickets always have sla='N/A' by design and
  //      don't need this re-sync.
  const unresolvedTickets = useMemo(
    () => filteredData.filter(r =>
      r.ticket_status !== 'Resolved' ||
      (!r.forwarded && r.sla !== 'Met' && r.sla !== 'Missed')
    ),
    [filteredData]
  );

  // ═══════════════════════════════════════════════════
  // ─── RENDER (no blocking spinner — show "..." like Live Chat) ──
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ─── Filters: wraps to multiple rows on narrow screens, no scroll ─── */}
      <div className="sticky-filter-bar" style={{ marginBottom: '1rem' }}>
        <div style={{
          ...cardStyle,
          padding: '0.5rem 0.7rem',
          display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center',
          overflow: 'visible',
          position: 'relative', zIndex: 20,
        }}>
          <DateRangePicker value={createdDateRange || ''} onChange={setCreatedDateRange} mode="csat" compact placeholder="Created At" />
          <DateRangePicker value={resolvedDateRange || ''} onChange={setResolvedDateRange} mode="csat" compact placeholder="Resolved At" />
          <PillDropdown compact label="Ticket Types" options={filterOptions.categories.map(o => ({ value: o, label: o }))} value={ticketTypeFilter} onChange={setTicketTypeFilter} multi />
          <PillDropdown
            compact
            label="Teams"
            options={filterOptions.teams.map(o => ({ value: o, label: o }))}
            value={teamFilter}
            onChange={setTeamFilter}
            multi
            pinnedValues={MAIN_TEAMS}
            pinnedLabel="Select main 6"
          />
          <PillDropdown compact label="Resolved By" options={filterOptions.agents.map(o => ({ value: o, label: o }))} value={agentFilter} onChange={setAgentFilter} multi />
          <PillDropdown compact label="SLA Status" options={[{ value: 'All', label: 'SLA Status' }, { value: 'Met', label: 'Met' }, { value: 'Missed', label: 'Not Met' }, { value: 'N/A', label: 'N/A' }]} value={slaFilter} onChange={setSlaFilter} searchable={false} />
          <PillDropdown compact label="Days" options={[{ value: 'All', label: 'Days' }, { value: 'Weekday', label: 'Weekday' }, { value: 'Weekend', label: 'Weekend' }]} value={weekdayFilter} onChange={setWeekdayFilter} searchable={false} />
          <PillDropdown compact label="Hours" options={[{ value: 'All', label: 'Hours' }, { value: 'During', label: 'During Office Hours' }, { value: 'After', label: 'After Office Hours' }]} value={officeFilter} onChange={setOfficeFilter} searchable={false} />
          <PillDropdown compact label="Products" options={[{ value: 'All', label: 'Products' }, { value: 'CFD', label: 'CFD' }, { value: 'Futures', label: 'Futures' }]} value={productFilter} onChange={setProductFilter} searchable={false} />
          <PillDropdown compact label="Countries" options={filterOptions.countries.map(o => ({ value: o, label: o }))} value={countryFilter} onChange={setCountryFilter} multi />
          <button
            onClick={handleSyncUnresolved}
            disabled={syncingUnresolved}
            title="Re-sync the unresolved tickets in the current view to pull their latest state from Intercom"
            style={{
              background: syncingUnresolved ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 8, padding: '0.3rem 0.7rem', color: '#8B5CF6', fontSize: '0.72rem',
              cursor: syncingUnresolved ? 'wait' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
              flexShrink: 0, height: 30, marginLeft: 'auto',
              opacity: syncingUnresolved ? 0.6 : 1,
            }}
          >
            {syncingUnresolved ? 'Syncing…' : 'Sync Unresolved'}
          </button>
          <button
            onClick={handleReset}
            style={{
              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '0.3rem 0.7rem', color: '#EF4444', fontSize: '0.72rem',
              cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, height: 30,
            }}
          >
            Reset
          </button>
        </div>
        {syncStatus && (
          <div style={{
            marginTop: '0.5rem',
            color: syncStatus.startsWith('Failed') || syncStatus.startsWith('Error') ? '#EF4444' : '#94A3B8',
            fontSize: '0.72rem',
          }}>
            {syncStatus}
          </div>
        )}
      </div>

      {/* ─── Row 1: Scorecards ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.8rem',
        marginBottom: '1.25rem',
      }}>
        <Scorecard title="Total Ticket Count (with Multi-Dept)" value={loading ? '...' : scorecards.totalWithMultiDept.toLocaleString()}
          onDrillIn={() => openDrillIn('Total Ticket Count (with Multi-Dept)', filteredData)} />
        <Scorecard title="Total Ticket Count" value={loading ? '...' : scorecards.total.toLocaleString()}
          onDrillIn={() => openDrillIn('Total Ticket Count', filteredData.filter(r => !r.forwarded))} />
        <Scorecard title="Total SLA Met" value={loading ? '...' : scorecards.slaMet.toLocaleString()}
          onDrillIn={() => openDrillIn('Total SLA Met', filteredData.filter(r => !r.forwarded && r.ticket_status === 'Resolved' && r.sla === 'Met'))} />
        <Scorecard title="Total SLA Not Met" value={loading ? '...' : scorecards.slaMissed.toLocaleString()}
          onDrillIn={() => openDrillIn('Total SLA Not Met', filteredData.filter(r => !r.forwarded && r.ticket_status === 'Resolved' && r.sla === 'Missed'))} />
        <Scorecard title="Pending SLA" value={loading ? '...' : scorecards.pending.toLocaleString()}
          onDrillIn={() => openDrillIn('Pending SLA', filteredData.filter(r => !r.forwarded && (r.ticket_status !== 'Resolved' || (r.sla !== 'Met' && r.sla !== 'Missed'))))} />
        <Scorecard
          title="Avg Resolving Duration"
          value={loading ? '...' : (scorecards.avgDurationHr > 0 ? `${scorecards.avgDurationHr.toFixed(2)} hr` : '-')}
          onDrillIn={() => openDrillIn('Avg Resolving Duration', filteredData.filter(r => r.sla !== 'N/A' && r.ticket_sla_duration_seconds > 0))}
        />
        <Scorecard
          title="SLA Achieved Percent"
          value={loading ? '...' : (scorecards.slaPct > 0 ? `${scorecards.slaPct.toFixed(2)}%` : '0.00%')}
          onDrillIn={() => openDrillIn('SLA Achieved Percent', filteredData.filter(r => r.sla === 'Met' || r.sla === 'Missed'))}
        />
        <Scorecard title="Multi-Dept Tickets" value={loading ? '...' : scorecards.multiDept.toLocaleString()}
          onDrillIn={() => openDrillIn('Multi-Dept Tickets', filteredData.filter(r => r.forwarded === true))} />
        <Scorecard title="Total Knock Count" value={knockCount == null ? '...' : knockCount.toLocaleString()} />
        <Scorecard
          title="Ticket / Knock Ratio"
          value={
            (knockCount == null || loading) ? '...'
              : (knockCount > 0
                  ? `${((scorecards.total / knockCount) * 100).toFixed(2)}%`
                  : '-')
          }
        />
      </div>

      {/* ─── Row 2: Team Performance + Agent Report (moved up) ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: '0.8rem',
        marginBottom: '1.25rem',
      }}>
        {/* Team Performance — with Ticket Count column */}
        <ChartCard title="Team Performance" isLoading={loading}
          onDrillIn={() => openDrillIn('Team Performance', filteredData)}>
          <div style={{ maxHeight: '320px', overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Team</th>
                  <th style={{ ...thStyle, textAlign: 'center', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Tickets</th>
                  <th style={{ ...thStyle, textAlign: 'center', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Avg (hr)</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>SLA Achieved (%)</th>
                </tr>
              </thead>
              <tbody>
                {teamSlaData.map(d => (
                  <tr key={d.team}>
                    <td style={tdStyle}>{d.team}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{d.count.toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>{d.avgHr > 0 ? d.avgHr.toFixed(2) : '-'}</td>
                    <td style={tdStyle}><ProgressBar value={d.slaPct} /></td>
                  </tr>
                ))}
                {teamSlaData.length === 0 && (
                  <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#64748B' }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        {/* Agent Report (scrollable) */}
        <ChartCard title="Agent Report" isLoading={loading}
          onDrillIn={() => openDrillIn('Agent Report', filteredData)}>
          <div style={{ maxHeight: '320px', overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Agent Name</th>
                  <th style={{ ...thStyle, textAlign: 'center', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Ticket Count</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>SLA Achieved (%)</th>
                </tr>
              </thead>
              <tbody>
                {agentReportData.map(d => (
                  <tr key={d.agent}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{d.agent}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{d.count.toLocaleString()}</td>
                    <td style={tdStyle}><ProgressBar value={d.slaPct} /></td>
                  </tr>
                ))}
                {agentReportData.length === 0 && (
                  <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#64748B' }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* ─── Heatmap: tickets by day-of-week × hour-of-day for selected team ─── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ChartCard
          title="Ticket Volume Heatmap"
          isLoading={loading}
          onDrillIn={() => openDrillIn(`Heatmap · ${heatmapTeam || 'All teams'}`, filteredData.filter(r => !heatmapTeam || r.current_team === heatmapTeam))}
        >
          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: '#94A3B8', letterSpacing: '0.04em' }}>Team:</label>
            <select
              value={heatmapTeam}
              onChange={(e) => setHeatmapTeam(e.target.value)}
              style={{
                background: 'rgba(15,20,35,0.85)',
                color: '#E2E8F0',
                border: '1px solid rgba(148,163,184,0.25)',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: 'pointer',
                minWidth: 200,
              }}
            >
              <option value="">All teams</option>
              {filterOptions.teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: '#64748B' }}>
              {heatmapData.total.toLocaleString()} tickets · peak hour: <strong style={{ color: '#C084FC' }}>{heatmapData.max}</strong>
            </span>
          </div>

          {/* Grid: 50px label column + 24 hour columns, 7 day rows. Matches
              the Performance Overview heatmap palette (sky-blue, 5 stepped
              bands) and proportions. */}
          <div style={{ width: '100%' }}>
            {/* Hour-header row */}
            <div style={{ display: 'flex', gap: '3px', marginBottom: '6px', width: '100%' }}>
              <div style={{ width: '50px', flexShrink: 0 }}></div>
              <div style={{ display: 'flex', flex: 1, gap: '3px' }}>
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: '0.65rem',
                    color: '#64748B',
                    minWidth: 0,
                  }}>
                    {i % 4 === 0 ? `${i}h` : ''}
                  </div>
                ))}
              </div>
            </div>

            {/* 7 day rows */}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayLabel, di) => (
              <div key={dayLabel} style={{ display: 'flex', gap: '3px', marginBottom: '3px', width: '100%' }}>
                <div style={{
                  width: '50px',
                  flexShrink: 0,
                  fontSize: '0.75rem',
                  color: '#94A3B8',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {dayLabel}
                </div>
                <div style={{ display: 'flex', flex: 1, gap: '3px' }}>
                  {heatmapData.grid[di].map((count, hi) => {
                    const intensity = heatmapData.max > 0 ? count / heatmapData.max : 0;
                    let bg;
                    if (intensity < 0.2) bg = 'rgba(56, 189, 248, 0.1)';
                    else if (intensity < 0.4) bg = 'rgba(56, 189, 248, 0.3)';
                    else if (intensity < 0.6) bg = 'rgba(56, 189, 248, 0.5)';
                    else if (intensity < 0.8) bg = 'rgba(56, 189, 248, 0.7)';
                    else bg = 'rgba(56, 189, 248, 0.9)';
                    const clickable = count > 0;
                    return (
                      <div
                        key={hi}
                        title={`${dayLabel} ${hi}:00 — ${count} ticket${count === 1 ? '' : 's'}${clickable ? ' · click to drill in' : ''}`}
                        onClick={() => {
                          if (!clickable) return;
                          const rows = filteredData.filter((r) => {
                            if (heatmapTeam && r.current_team !== heatmapTeam) return false;
                            if (!r.created_at) return false;
                            const d = new Date(r.created_at);
                            if (Number.isNaN(d.getTime())) return false;
                            return ((d.getDay() + 6) % 7) === di && d.getHours() === hi;
                          });
                          const scope = heatmapTeam || 'All teams';
                          openDrillIn(`Heatmap · ${scope} · ${dayLabel} ${String(hi).padStart(2, '0')}:00`, rows);
                        }}
                        onMouseEnter={(e) => { if (clickable) { e.currentTarget.style.transform = 'scale(1.12)'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(56,189,248,0.85)'; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                        style={{
                          flex: 1,
                          aspectRatio: '1',
                          minHeight: '28px',
                          borderRadius: '4px',
                          background: bg,
                          cursor: clickable ? 'pointer' : 'default',
                          transition: 'transform 0.1s, box-shadow 0.1s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.65rem',
                          fontWeight: '600',
                          color: count > 0 ? '#fff' : 'transparent',
                        }}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Legend: 5 stepped swatches centered below the grid */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Low</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map((intensity, i) => (
                  <div key={i} style={{
                    width: '24px',
                    height: '14px',
                    borderRadius: '3px',
                    background: `rgba(56, 189, 248, ${intensity})`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#64748B' }}>High</span>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* ─── Top 10 Ticket Categories (full-width horizontal bar) ─── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ChartCard
          title="Top 10 Ticket Categories"
          isLoading={loading}
          onDrillIn={() => openDrillIn('Top 10 Ticket Categories', filteredData.filter(r => topCategoriesData.some(t => t.name === ((r.issue_category || '').trim() || 'Uncategorized'))))}
        >
          {topCategoriesData.length > 0 ? (
            <div style={{ height: Math.max(topCategoriesData.length * 32, 240), padding: '4px 4px 0' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topCategoriesData}
                  layout="vertical"
                  margin={{ top: 8, right: 28, bottom: 0, left: 0 }}
                  barSize={20}
                >
                  <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={200}
                    tick={{ fontSize: 11, fill: '#CBD5E1' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                    contentStyle={{ backgroundColor: '#1C2128', borderColor: '#30363D', borderRadius: 8, color: '#F0F6FC' }}
                    itemStyle={{ color: '#F0F6FC' }}
                    formatter={(value) => [value.toLocaleString(), 'Tickets']}
                  />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" fill="#E2E8F0" fontSize={10} formatter={(v) => v.toLocaleString()} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>No data</div>
          )}
        </ChartCard>
      </div>

      {/* ─── Row 3: Product Type donut + Office Hours table (moved down) ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.5fr',
        gap: '0.8rem',
        marginBottom: '1.25rem',
      }}>
        {/* Product Type donut */}
        <ChartCard title="Product Type Wise Ticket Count" isLoading={loading}
          onDrillIn={() => openDrillIn('Product Type Wise Ticket Count', filteredData)}>
          {productTypeData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 4px' }}>
              <div style={{ height: 130, display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: '200px', height: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={productTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={62}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {productTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="#1C2128" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ backgroundColor: '#1C2128', borderColor: '#30363D', borderRadius: '8px', color: '#F0F6FC' }}
                        itemStyle={{ color: '#F0F6FC' }}
                        formatter={(value, name, props) => [
                          `${value.toLocaleString()} (${props.payload.percentage}%)`,
                          props.payload.name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem', padding: '0 0.25rem' }}>
                {productTypeData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      <span style={{ color: '#E2E8F0', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    </div>
                    <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      {d.count.toLocaleString()} <span style={{ color: '#64748B', fontWeight: '400' }}>({d.percentage}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>No data</div>
          )}
        </ChartCard>

        {/* Ticket Count by Office Hours */}
        <ChartCard title="Ticket Count by Office Hours" isLoading={loading}
          onDrillIn={() => openDrillIn('Ticket Count by Office Hours', filteredData)}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Office Hours</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Avg Hours</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>After Office Hours</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>{officeHoursCounts.after.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#94A3B8' }}>
                  {officeHoursAvg[0]?.hours > 0 ? `${officeHoursAvg[0].hours.toFixed(2)} hr` : '-'}
                </td>
              </tr>
              <tr>
                <td style={tdStyle}>During Office Hours</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>{officeHoursCounts.during.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#94A3B8' }}>
                  {officeHoursAvg[1]?.hours > 0 ? `${officeHoursAvg[1].hours.toFixed(2)} hr` : '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </ChartCard>
      </div>

      {/* ─── Row 4: Ticket SLA Table (full width) ─── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ChartCard title="Ticket SLA Table" isLoading={loading}>
          <div style={{ maxHeight: '360px', overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Country</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Agent</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Ticket ID</th>
                  <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Ticket Type</th>
                  <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Duration (hr)</th>
                </tr>
              </thead>
              <tbody>
                {detailTableData.map((d, i) => (
                  <tr key={`${d.ticket_id}-${i}`}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{d.country}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.agent}</td>
                    <td style={{ ...tdStyle, fontSize: '0.75rem' }}>
                      {d.ticket_id !== '-' ? (
                        <span
                          onClick={() => openSlaTicket(d._raw)}
                          style={{ color: '#C084FC', fontFamily: 'monospace', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                          title="Click to view ticket conversation"
                        >
                          {d.ticket_id}
                        </span>
                      ) : <span style={{ color: '#94A3B8' }}>-</span>}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.ticket_type}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#94A3B8' }}>{d.duration_hr}</td>
                  </tr>
                ))}
                {detailTableData.length === 0 && (
                  <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#64748B' }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* ─── External Ticket Report (live data, by team) ─── */}
      {(() => {
        const drillTeam = (teamName) => {
          const teamData = filteredData.filter(r =>
            r.forwarded !== true && (r.current_team || 'Unknown') === teamName
          );
          openDrillIn(teamName, teamData);
        };
        const cellClick = { cursor: 'pointer' };

        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ color: '#F0F6FC', fontWeight: '600', fontSize: '0.95rem' }}>External Ticket Report</span>
            </div>

            <div style={cardStyle}>
              <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Team</th>
                      <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Tickets</th>
                      <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>Avg Duration</th>
                      <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>SLA%</th>
                      <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>&lt;24hr</th>
                      <th style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(15,20,35,0.95)', zIndex: 1 }}>&gt;24hr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamSlaData.map(d => {
                      const slaColor = d.slaPct >= 70 ? '#22C55E' : d.slaPct >= 40 ? '#F59E0B' : '#EF4444';
                      const durBase = d.lt24 + d.gt24;
                      const lt24Pct = durBase > 0 ? (d.lt24 / durBase) * 100 : 0;
                      const gt24Pct = durBase > 0 ? (d.gt24 / durBase) * 100 : 0;
                      const onCellClick = () => drillTeam(d.team);
                      return (
                        <tr key={d.team} style={{ transition: 'background 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontWeight: '600', ...cellClick }} onClick={onCellClick}>{d.team}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600', ...cellClick }} onClick={onCellClick}>{d.count.toLocaleString()}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#94A3B8', ...cellClick }} onClick={onCellClick}>{d.avgHr > 0 ? `${d.avgHr.toFixed(2)} hr` : '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: slaColor, fontWeight: '600', ...cellClick }} onClick={onCellClick}>{d.slaPct.toFixed(1)}%</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#22C55E', ...cellClick }} onClick={onCellClick}>
                            {d.lt24.toLocaleString()} <span style={{ color: '#64748B', fontWeight: 400 }}>({lt24Pct.toFixed(1)}%)</span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: d.gt24 > 0 ? '#F59E0B' : '#64748B', ...cellClick }} onClick={onCellClick}>
                            {d.gt24.toLocaleString()} <span style={{ color: '#64748B', fontWeight: 400 }}>({gt24Pct.toFixed(1)}%)</span>
                          </td>
                        </tr>
                      );
                    })}
                    {teamSlaData.length === 0 && (
                      <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#64748B' }}>No data</td></tr>
                    )}
                    {teamSlaData.length > 0 && (() => {
                      // Totals: sum tickets/lt24/gt24 for the count display.
                      // For percentages (SLA%, <24hr%, >24hr%): unweighted average of each
                      // team's percentage (so the Total matches the column's per-row semantic).
                      const tot = teamSlaData.reduce((acc, d) => {
                        acc.count += d.count;
                        acc.lt24  += d.lt24;
                        acc.gt24  += d.gt24;
                        if (d.avgHr > 0) { acc.avgSum += d.avgHr; acc.avgN += 1; }
                        acc.slaSum += d.slaPct; acc.slaN += 1;
                        const base = d.lt24 + d.gt24;
                        if (base > 0) {
                          acc.lt24PctSum += (d.lt24 / base) * 100;
                          acc.gt24PctSum += (d.gt24 / base) * 100;
                          acc.pctN += 1;
                        }
                        return acc;
                      }, { count: 0, lt24: 0, gt24: 0, avgSum: 0, avgN: 0, slaSum: 0, slaN: 0, lt24PctSum: 0, gt24PctSum: 0, pctN: 0 });
                      const avgHr   = tot.avgN > 0 ? tot.avgSum / tot.avgN : 0;
                      const avgSla  = tot.slaN > 0 ? tot.slaSum / tot.slaN : 0;
                      const lt24Pct = tot.pctN > 0 ? tot.lt24PctSum / tot.pctN : 0;
                      const gt24Pct = tot.pctN > 0 ? tot.gt24PctSum / tot.pctN : 0;
                      const slaColor = avgSla >= 70 ? '#22C55E' : avgSla >= 40 ? '#F59E0B' : '#EF4444';
                      const totalRowStyle = {
                        ...tdStyle,
                        borderTop: '2px solid rgba(255,255,255,0.15)',
                        background: 'rgba(99,102,241,0.06)',
                        fontWeight: 700,
                        cursor: 'pointer',
                      };
                      const onAllTeamsClick = () => openDrillIn('All Teams', filteredData.filter(r => r.forwarded !== true));
                      return (
                        <tr style={{ transition: 'background 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                          <td style={{ ...totalRowStyle, whiteSpace: 'nowrap' }} onClick={onAllTeamsClick}>All Teams</td>
                          <td style={{ ...totalRowStyle, textAlign: 'right' }} onClick={onAllTeamsClick}>{tot.count.toLocaleString()}</td>
                          <td style={{ ...totalRowStyle, textAlign: 'right', color: '#94A3B8' }} onClick={onAllTeamsClick}>{avgHr > 0 ? `${avgHr.toFixed(2)} hr` : '-'}</td>
                          <td style={{ ...totalRowStyle, textAlign: 'right', color: slaColor }} onClick={onAllTeamsClick}>{avgSla.toFixed(1)}%</td>
                          <td style={{ ...totalRowStyle, textAlign: 'right', color: '#22C55E' }} onClick={onAllTeamsClick}>
                            {tot.lt24.toLocaleString()} <span style={{ color: '#64748B', fontWeight: 400 }}>({lt24Pct.toFixed(1)}%)</span>
                          </td>
                          <td style={{ ...totalRowStyle, textAlign: 'right', color: tot.gt24 > 0 ? '#F59E0B' : '#64748B' }} onClick={onAllTeamsClick}>
                            {tot.gt24.toLocaleString()} <span style={{ color: '#64748B', fontWeight: 400 }}>({gt24Pct.toFixed(1)}%)</span>
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Drill-In Modal ─── */}
      {drillIn && <DrillInModal drillIn={drillIn} onClose={closeDrillIn} />}

      {/* ─── Ticket viewer (Ticket SLA Table click-through) ─── */}
      {slaViewing && (
        <TicketViewerOverlay
          row={slaViewing.row}
          conversation={slaViewing.conversation !== undefined ? slaViewing.conversation : null}
          loading={slaLoading}
          onClose={() => setSlaViewing(null)}
        />
      )}
    </div>
  );
};

export default TicketAnalytics;
