import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import DateRangePicker from './DateRangePicker';

// ============ HELPERS ============

const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return '-';
  const secs = Math.round(seconds);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
};

const toGMT6Start = (dateStr) => {
  // dateStr is YYYY-MM-DD, interpret as start of day in GMT+6
  // GMT+6 00:00 = UTC previous day 18:00
  return `${dateStr}T00:00:00+06:00`;
};

const toGMT6End = (dateStr) => {
  // End of day in GMT+6
  return `${dateStr}T23:59:59+06:00`;
};

const formatDhakaTime = (isoStr) => {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getDefaultDates = () => {
  const now = new Date();
  // Today in Dhaka (GMT+6)
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const toStr = dhaka.toISOString().slice(0, 10);
  // 7 days ago
  const from = new Date(dhaka.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().slice(0, 10);
  return { fromStr, toStr };
};

// ============ SCORECARD ============

const Scorecard = ({ title, value, subtitle }) => (
  <div style={{
    background: 'rgba(15, 20, 35, 0.5)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '1.25rem',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    minWidth: '160px',
    flex: 1,
  }}>
    <div style={{ color: '#94A3B8', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {title}
    </div>
    <div style={{ color: '#F8FAFC', fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.25rem' }}>
      {value}
    </div>
    {subtitle && (
      <div style={{ color: '#64748B', fontSize: '0.7rem' }}>{subtitle}</div>
    )}
  </div>
);

// ============ SORTABLE TABLE ============

const SortableTable = ({ data, channel = 'chat' }) => {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortCol) return 0;
    let aVal = a[sortCol];
    let bVal = b[sortCol];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const columns = channel === 'email' ? [
    { key: 'conversation_id', label: 'Conversation ID' },
    { key: 'created_at', label: 'Created At (Dhaka)' },
    { key: 'assignee_name', label: 'Agent Name' },
    { key: 'art_seconds', label: 'ART' },
    { key: 'response_count', label: 'Responses' },
    { key: 'sla_hit', label: 'SLA Hit' },
    { key: 'art_hit', label: 'ART Hit' },
  ] : [
    { key: 'conversation_id', label: 'Conversation ID' },
    { key: 'created_at', label: 'Created At (Dhaka)' },
    { key: 'assignee_name', label: 'Agent Name' },
    { key: 'frt_seconds', label: 'FRT' },
    { key: 'art_seconds', label: 'ART' },
    { key: 'frt_hit', label: 'FRT Hit' },
    { key: 'art_hit', label: 'ART Hit' },
  ];

  const thStyle = {
    padding: '12px 14px',
    textAlign: 'left',
    color: '#94A3B8',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
    whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '10px 14px',
    color: '#E2E8F0',
    fontSize: '0.82rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  };

  const sortIndicator = (col) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={thStyle} onClick={() => handleSort(c.key)}>
                {c.label}{sortIndicator(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ ...tdStyle, textAlign: 'center', color: '#64748B', padding: '2rem' }}>
                No data
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={row.conversation_id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)' }}>
                {channel === 'email' ? (
                  <>
                    <td style={tdStyle}>{row.conversation_id || '-'}</td>
                    <td style={tdStyle}>{formatDhakaTime(row.created_at)}</td>
                    <td style={tdStyle}>{row.real_name || row.assignee_name || '-'}</td>
                    <td style={tdStyle}>{formatTime(row.art_seconds)}</td>
                    <td style={tdStyle}>{row.response_count || '-'}</td>
                    <td style={{
                      ...tdStyle,
                      color: row.sla_hit_rate != null ? (row.sla_hit_rate >= 80 ? '#10B981' : '#EF4444') : '#64748B',
                      fontWeight: '600',
                    }}>{row.sla_hit_rate != null ? `${row.sla_hit_rate}%` : '-'}</td>
                    <td style={{
                      ...tdStyle,
                      color: row.art_hit_rate != null ? (row.art_hit_rate >= 80 ? '#10B981' : '#EF4444') : '#64748B',
                      fontWeight: '600',
                    }}>{row.art_hit_rate != null ? `${row.art_hit_rate}%` : '-'}</td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>{row.conversation_id || '-'}</td>
                    <td style={tdStyle}>{formatDhakaTime(row.created_at)}</td>
                    <td style={tdStyle}>{row.real_name || row.assignee_name || '-'}</td>
                    <td style={tdStyle}>{formatTime(row.frt_seconds)}</td>
                    <td style={tdStyle}>{formatTime(row.art_seconds)}</td>
                    <td style={{
                      ...tdStyle,
                      color: row.frt_hit_rate === 0 ? '#10B981' : row.frt_hit_rate === 1 ? '#EF4444' : '#64748B',
                      fontWeight: '600',
                    }}>{row.frt_hit_rate === 0 ? 'Hit' : row.frt_hit_rate === 1 ? 'Miss' : '-'}</td>
                    <td style={{
                      ...tdStyle,
                      color: row.art_hit_rate != null ? (row.art_hit_rate === 0 ? '#10B981' : '#EF4444') : '#64748B',
                      fontWeight: '600',
                    }}>{row.art_hit_rate != null ? `${100 - row.art_hit_rate}%` : '-'}</td>
                  </>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

// ============ MAIN COMPONENT ============

function parseDateRange(dateRange) {
  const DHAKA_MS = 6 * 3600000;
  const now = new Date(Date.now() + DHAKA_MS);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (dateRange?.startsWith('custom_')) { const p = dateRange.split('_'); return { from: p[1], to: p[2] }; }
  if (dateRange === 'today') { const d = fmt(today); return { from: d, to: d }; }
  if (dateRange === 'yesterday') { const y = new Date(today); y.setDate(y.getDate()-1); return { from: fmt(y), to: fmt(y) }; }
  if (dateRange === 'this_month') { return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) }; }
  if (dateRange === 'last_month') { const f = new Date(today.getFullYear(), today.getMonth(), 1); const e = new Date(f.getTime()-86400000); return { from: fmt(new Date(e.getFullYear(), e.getMonth(), 1)), to: fmt(e) }; }
  const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90 }[dateRange] || 30;
  const s = new Date(today); s.setDate(s.getDate() - days);
  return { from: fmt(s), to: fmt(today) };
}

const SPOTest = () => {
  // Channel toggle
  const [channel, setChannel] = useState('chat'); // 'chat' or 'email'

  // Filters
  const [dateRange, setDateRange] = useState('last_7_days');
  const { from: dateFrom, to: dateTo } = useMemo(() => parseDateRange(dateRange), [dateRange]);
  const [agentName, setAgentName] = useState('All');
  const [limit, setLimit] = useState(50);
  const [conversationId, setConversationId] = useState('');

  // Data
  const [agents, setAgents] = useState([]); // [{ agent_name, intercom_name }]
  const [nameMap, setNameMap] = useState({}); // intercom_name → agent_name
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasPulled, setHasPulled] = useState(false);

  // Load agent list from agent_name_mapping
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const { data, error: err } = await supabase
          .from('agent_name_mapping')
          .select('agent_name, intercom_name, exclude_from_metrics')
          .eq('exclude_from_metrics', false)
          .eq('channel', channel)
          .order('agent_name');
        if (err) throw err;
        if (data) {
          setAgents(data);
          const map = {};
          data.forEach(d => {
            if (d.intercom_name) map[d.intercom_name.toLowerCase()] = d.agent_name;
          });
          setNameMap(map);
        }
      } catch (e) {
        console.error('Failed to load agents:', e);
      }
    };
    setAgentName('All');
    setConversations([]);
    setHasPulled(false);
    fetchAgents();
  }, [channel]);

  // Pull data directly from Intercom
  const handlePull = async () => {
    setLoading(true);
    setError(null);
    try {
      // Find the Intercom name for the selected agent
      let intercomAgentName = agentName;
      if (agentName !== 'All') {
        const match = agents.find(a => a.agent_name === agentName);
        if (match && match.intercom_name) intercomAgentName = match.intercom_name;
      }

      const trimmedConvId = (conversationId || '').trim();
      const resp = await fetch('/api/analyze-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: channel === 'email' ? 'spo-test-email' : 'spo-test',
          dateFrom,
          dateTo,
          agentName: intercomAgentName,
          limit,
          conversationId: trimmedConvId || undefined,
        })
      });

      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch from Intercom');

      // Map Intercom names → real agent names
      const mapped = (result.data || []).map(row => ({
        ...row,
        real_name: row.assignee_name ? (nameMap[row.assignee_name.toLowerCase()] || row.assignee_name) : null,
      }));

      setConversations(mapped);
      setHasPulled(true);
    } catch (e) {
      console.error('Pull failed:', e);
      setError(e.message || 'Failed to pull data');
    } finally {
      setLoading(false);
    }
  };

  // Compute summary
  const summary = (() => {
    if (!conversations.length) return null;
    const total = conversations.length;

    if (channel === 'email') {
      // Email: no FRT, ART = all responses, SLA = ART ≤ 30min
      const artWithData = conversations.filter(c => c.art_seconds != null);
      const avgArt = artWithData.length > 0 ? Math.round(artWithData.reduce((s, c) => s + c.art_seconds, 0) / artWithData.length) : null;
      const slaWithData = conversations.filter(c => c.sla_hit_rate != null);
      const slaHitRate = slaWithData.length > 0
        ? (slaWithData.reduce((s, c) => s + c.sla_hit_rate, 0) / slaWithData.length).toFixed(1)
        : null;
      const artHitWithData = conversations.filter(c => c.art_hit_rate != null);
      const artHitRate = artHitWithData.length > 0
        ? (artHitWithData.reduce((s, c) => s + c.art_hit_rate, 0) / artHitWithData.length).toFixed(1)
        : null;
      return { total, avgArt, slaHitRate, artHitRate, artRows: artWithData.length };
    }

    // Chat: FRT + ART
    const frtRows = conversations.filter(c => c.frt_seconds != null);
    const artRows = conversations.filter(c => c.art_hit_rate != null);
    const avgFrt = frtRows.length > 0 ? Math.round(frtRows.reduce((s, c) => s + c.frt_seconds, 0) / frtRows.length) : null;
    const avgArt = artRows.length > 0 ? Math.round(conversations.filter(c => c.art_seconds != null).reduce((s, c) => s + c.art_seconds, 0) / conversations.filter(c => c.art_seconds != null).length) : null;
    const frtWithData = conversations.filter(c => c.frt_hit_rate != null);
    const frtHitRate = frtWithData.length > 0
      ? ((frtWithData.filter(c => c.frt_hit_rate === 0).length / frtWithData.length) * 100).toFixed(1)
      : null;
    const artWithData = conversations.filter(c => c.art_hit_rate != null);
    const artHitRate = artWithData.length > 0
      ? (100 - (artWithData.reduce((s, c) => s + c.art_hit_rate, 0) / artWithData.length)).toFixed(1)
      : null;

    return { total, avgFrt, avgArt, frtHitRate, artHitRate, frtRows: frtWithData.length, artRows: artWithData.length };
  })();

  // Shared input styles
  const inputStyle = {
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#E2E8F0',
    padding: '8px 12px',
    fontSize: '0.85rem',
    outline: 'none',
  };

  const labelStyle = {
    color: '#94A3B8',
    fontSize: '0.75rem',
    fontWeight: '500',
    marginBottom: '4px',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header + Channel Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#F8FAFC', fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>
          SPO Test
        </h2>
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '10px' }}>
          {[{ id: 'chat', label: '💬 Live Chat' }, { id: 'email', label: '📧 Email' }].map(ch => (
            <button
              key={ch.id}
              onClick={() => setChannel(ch.id)}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: channel === ch.id ? 'linear-gradient(135deg, #8B5CF6 0%, #8B5CF6 100%)' : 'transparent',
                color: channel === ch.id ? '#fff' : '#94A3B8',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Row */}
      <div className="sticky-filter-bar" style={{
        background: 'rgba(15, 20, 35, 0.5)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '16px',
        padding: '1.25rem',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-end',
      }}>
        {/* Date Range (GMT+6) */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Date Range (GMT+6)</label>
          <DateRangePicker value={dateRange} onChange={setDateRange} mode="csat" />
        </div>

        {/* Agent Name */}
        <div style={{ flex: '1 1 180px', minWidth: '180px' }}>
          <label style={labelStyle}>Agent Name</label>
          <select
            value={agentName}
            onChange={e => setAgentName(e.target.value)}
            style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
          >
            <option value="All">All Agents</option>
            {agents.map(a => (
              <option key={a.agent_name} value={a.agent_name}>{a.agent_name}</option>
            ))}
          </select>
        </div>

        {/* Conversation ID (overrides date/agent/limit when set) */}
        <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
          <label style={labelStyle}>Conversation ID</label>
          <input
            type="text"
            value={conversationId}
            onChange={e => setConversationId(e.target.value)}
            placeholder="Optional — overrides other filters"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        {/* Limit */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Conversations</label>
          <input
            type="text"
            value={limit}
            onChange={e => {
              const v = e.target.value;
              if (v === '') { setLimit(''); return; }
              const n = parseInt(v);
              if (!isNaN(n)) setLimit(Math.min(1000, n));
            }}
            onBlur={() => { if (!limit || limit < 1) setLimit(50); }}
            disabled={!!(conversationId || '').trim()}
            style={{ ...inputStyle, width: '80px', opacity: (conversationId || '').trim() ? 0.5 : 1 }}
          />
        </div>

        {/* Pull Button */}
        <div style={{ flex: '0 0 auto' }}>
          <button
            onClick={handlePull}
            disabled={loading}
            style={{
              background: loading
                ? 'rgba(56, 189, 248, 0.3)'
                : 'linear-gradient(135deg, #C084FC 0%, #818CF8 100%)',
              color: '#0F172A',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 24px',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Pulling...' : 'Pull Data'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          color: '#FCA5A5',
          fontSize: '0.85rem',
          marginBottom: '1.5rem',
        }}>
          {error}
        </div>
      )}

      {/* Summary Scorecards */}
      {hasPulled && summary && (
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}>
          <Scorecard title="Total Conversations" value={summary.total} />
          {channel === 'chat' && (
            <Scorecard
              title="Avg FRT"
              value={summary.avgFrt != null ? formatTime(summary.avgFrt) : '-'}
              subtitle={summary.frtRows > 0 ? `from ${summary.frtRows} conversations` : undefined}
            />
          )}
          <Scorecard
            title="Avg ART"
            value={summary.avgArt != null ? formatTime(summary.avgArt) : '-'}
            subtitle={summary.artRows > 0 ? `from ${summary.artRows} conversations` : undefined}
          />
          {channel === 'chat' && (
            <Scorecard
              title="FRT Hit Rate"
              value={summary.frtHitRate != null ? `${summary.frtHitRate}%` : '-'}
              subtitle="FRT <= 30s = Hit"
            />
          )}
          {channel === 'chat' && (
            <Scorecard
              title="ART Hit Rate"
              value={summary.artHitRate != null ? `${summary.artHitRate}%` : '-'}
              subtitle="Response <= 60s = Hit"
            />
          )}
          {channel === 'email' && (
            <Scorecard
              title="SLA Hit Rate"
              value={summary.slaHitRate != null ? `${summary.slaHitRate}%` : '-'}
              subtitle="ART <= 30min = Hit"
            />
          )}
          {channel === 'email' && (
            <Scorecard
              title="ART Hit Rate"
              value={summary.artHitRate != null ? `${summary.artHitRate}%` : '-'}
              subtitle="Response <= 30min = Hit"
            />
          )}
        </div>
      )}

      {/* Conversation Table */}
      {hasPulled && (
        <div style={{
          background: 'rgba(15, 20, 35, 0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '16px',
          padding: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <h3 style={{ color: '#F8FAFC', fontSize: '1rem', fontWeight: '600', margin: '0 0 1rem 0' }}>
            Conversations ({conversations.length})
          </h3>
          <SortableTable data={conversations} channel={channel} />
        </div>
      )}

      {/* Empty state before first pull */}
      {!hasPulled && !loading && (
        <div style={{
          textAlign: 'center',
          color: '#64748B',
          padding: '4rem 2rem',
          fontSize: '0.9rem',
        }}>
          Set your filters and click "Pull Data" to load conversations.
        </div>
      )}
    </div>
  );
};

export default SPOTest;
