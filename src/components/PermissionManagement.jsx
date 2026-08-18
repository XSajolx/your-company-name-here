import React, { useState } from 'react';
import { useAthenaPermission } from '../contexts/AthenaPermissionContext';

export default function PermissionManagement() {
  const {
    loading, allowedEmails, adminEmails,
    addEmail, removeEmail, refresh,
  } = useAthenaPermission();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const notify = (text, tone = 'info') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const email = input.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notify('Please enter a valid email address.', 'error');
      return;
    }
    if (adminEmails.includes(email)) {
      notify('That email is already an admin — no need to add.', 'info');
      return;
    }
    if (allowedEmails.some(r => r.email.toLowerCase() === email)) {
      notify('Already in the access list.', 'info');
      return;
    }
    setBusy(true);
    const { error } = await addEmail(email);
    setBusy(false);
    if (error) notify(`Add failed: ${error}`, 'error');
    else {
      setInput('');
      notify(`Granted Athena access to ${email}`, 'success');
    }
  };

  const handleRemove = async (email) => {
    if (!confirm(`Revoke Athena access for ${email}?`)) return;
    setBusy(true);
    const { error } = await removeEmail(email);
    setBusy(false);
    if (error) notify(`Remove failed: ${error}`, 'error');
    else notify(`Revoked access for ${email}`, 'success');
  };

  const card = {
    background: 'rgba(15,20,30,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '1.25rem 1.5rem',
    marginBottom: '1rem',
  };

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: '0.75rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(0,210,255,0.18), rgba(191,95,255,0.22))',
            border: '1px solid rgba(191,95,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BF5FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <h3 style={{ color: '#F0F6FC', margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 700 }}>
              Athena Access Control
            </h3>
            <p style={{ color: '#94A3B8', margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
              The Athena button is visible to every user, but only admins and the emails below
              can actually open it. Others will see a "Contact CX R&D" prompt.
            </p>
          </div>
        </div>
      </div>

      <div style={card}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="user@nextventures.io"
            disabled={busy}
            style={{
              flex: 1,
              padding: '10px 14px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              color: '#F0F6FC',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, rgba(0,210,255,0.2), rgba(191,95,255,0.25))',
              border: '1px solid rgba(191,95,255,0.4)',
              color: '#F0F6FC',
              borderRadius: 10,
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy || !input.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {busy ? 'Saving…' : 'Grant Access'}
          </button>
        </form>
        {msg && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            fontSize: '0.8rem',
            background: msg.tone === 'error' ? 'rgba(239,68,68,0.12)'
                      : msg.tone === 'success' ? 'rgba(34,197,94,0.12)'
                      : 'rgba(59,130,246,0.12)',
            color:     msg.tone === 'error' ? '#FCA5A5'
                      : msg.tone === 'success' ? '#86EFAC'
                      : '#93C5FD',
            border: `1px solid ${msg.tone === 'error' ? 'rgba(239,68,68,0.25)' : msg.tone === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(59,130,246,0.25)'}`,
          }}>
            {msg.text}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ color: '#F0F6FC', margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
            Permanent Admins
          </h4>
          <span style={{ color: '#64748B', fontSize: '0.75rem' }}>
            Hard-coded in code — always have access
          </span>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {adminEmails.map(e => (
            <li key={e} style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(191,95,255,0.08)',
              border: '1px solid rgba(191,95,255,0.18)',
              color: '#E9D5FF', fontSize: '0.85rem',
              marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ opacity: 0.7 }}>👑</span>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{e}</span>
              <span style={{
                marginLeft: 'auto', fontSize: '0.7rem',
                color: '#A78BFA', opacity: 0.8,
              }}>Admin</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ color: '#F0F6FC', margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
            Granted Access ({allowedEmails.length})
          </h4>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              padding: '4px 10px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94A3B8', borderRadius: 6,
              fontSize: '0.75rem', cursor: 'pointer',
            }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {loading ? (
          <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>Loading…</p>
        ) : allowedEmails.length === 0 ? (
          <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
            No additional emails yet. Add one above to grant Athena access.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {allowedEmails.map(row => (
              <li key={row.email} style={{
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#E2E8F0', fontSize: '0.85rem',
                marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontFamily: 'ui-monospace, monospace' }}>{row.email}</span>
                {row.added_by && (
                  <span style={{ color: '#64748B', fontSize: '0.7rem' }}>
                    · added by {row.added_by}
                  </span>
                )}
                <button
                  onClick={() => handleRemove(row.email)}
                  disabled={busy}
                  style={{
                    marginLeft: 'auto',
                    padding: '4px 10px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#FCA5A5',
                    borderRadius: 6,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
